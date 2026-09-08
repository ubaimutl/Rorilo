import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fallbackTriageJobs, triageJobsWithAI } from '@/lib/jobs/triage';
import { hasMatchProfile } from '@/lib/setup/readiness';
import { calculateDeterministicMatch } from '@/lib/matching/engine';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const rawIds = Array.isArray(body.jobIds)
      ? body.jobIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 40);

    const jobs = await prisma.job.findMany({
      where: rawIds.length > 0
        ? { id: { in: Array.from(new Set(rawIds)) } }
        : {
            match: { triageStatus: 'UNREVIEWED' },
            OR: [
              { application: null },
              { application: { status: { in: ['NEW', 'SAVED'] } } },
            ],
          },
      include: {
        match: true,
        analysis: true,
        application: true,
      },
      orderBy: { discoveredAt: 'desc' },
      take: limit,
    });

    const discoverJobs = jobs.filter((job) => !job.application || ['NEW', 'SAVED'].includes(job.application.status));
    if (discoverJobs.length === 0) {
      return NextResponse.json({ success: true, triaged: 0, results: [] });
    }

    const [profile, preferences, cv] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
      prisma.cV.findFirst({ where: { isActive: true }, orderBy: { uploadDate: 'desc' } }),
    ]);

    if (!hasMatchProfile(profile, preferences)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Set up your profile before sorting jobs. Add a CV, skills, or target roles first.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const deterministicMatches = new Map<string, {
      matchScore: number;
      strongMatches: string;
      possibleIssues: string;
      missingSkills: string;
    }>();

    for (const job of discoverJobs) {
      const match = calculateDeterministicMatch(job, profile, preferences);
      const serialized = {
        matchScore: match.matchScore,
        strongMatches: JSON.stringify(match.strongMatches),
        possibleIssues: JSON.stringify(match.possibleIssues),
        missingSkills: JSON.stringify(match.missingSkills),
      };
      deterministicMatches.set(job.id, serialized);
      await prisma.jobMatch.upsert({
        where: { jobId: job.id },
        create: {
          jobId: job.id,
          matchScore: match.matchScore,
          skillsScore: match.breakdown.skillsScore,
          roleScore: match.breakdown.roleScore,
          experienceScore: match.breakdown.experienceScore,
          locationScore: match.breakdown.locationScore,
          languageScore: match.breakdown.languageScore,
          salaryScore: match.breakdown.salaryScore,
          preferencesScore: match.breakdown.preferencesScore,
          strongMatches: serialized.strongMatches,
          possibleIssues: serialized.possibleIssues,
          missingSkills: serialized.missingSkills,
          aiMatchScore: null,
          aiScoredAt: null,
          lastCalculatedAt: now,
        },
        update: {
          matchScore: match.matchScore,
          skillsScore: match.breakdown.skillsScore,
          roleScore: match.breakdown.roleScore,
          experienceScore: match.breakdown.experienceScore,
          locationScore: match.breakdown.locationScore,
          languageScore: match.breakdown.languageScore,
          salaryScore: match.breakdown.salaryScore,
          preferencesScore: match.breakdown.preferencesScore,
          strongMatches: serialized.strongMatches,
          possibleIssues: serialized.possibleIssues,
          missingSkills: serialized.missingSkills,
          aiMatchScore: null,
          aiScoredAt: null,
          lastCalculatedAt: now,
        },
      });
    }

    const triageInput = discoverJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        employmentType: job.employmentType,
        description: job.description,
        technologies: job.technologies,
        requirements: job.requirements,
        languageRequirements: job.languageRequirements,
        match: deterministicMatches.get(job.id) || job.match,
      }));

    let triage;
    let warning: string | null = null;
    let usedFallback = false;
    try {
      triage = await triageJobsWithAI(
        triageInput,
        profile,
        preferences,
        cv?.extractedText || ''
      );
    } catch (error) {
      console.warn('Model triage failed; using deterministic fallback:', error);
      triage = fallbackTriageJobs(triageInput);
      warning = 'Model triage did not return valid JSON, so Rorilo used deterministic match scores instead.';
      usedFallback = true;
    }

    for (const item of triage) {
      await prisma.jobMatch.upsert({
        where: { jobId: item.jobId },
        create: {
          jobId: item.jobId,
          triageStatus: item.status,
          triageReason: item.reason,
          triagedAt: now,
          aiMatchScore: usedFallback ? null : item.score,
          aiScoredAt: usedFallback || item.score === null ? null : now,
        },
        update: {
          triageStatus: item.status,
          triageReason: item.reason,
          triagedAt: now,
          aiMatchScore: usedFallback ? null : item.score,
          aiScoredAt: usedFallback || item.score === null ? null : now,
        },
      });
    }

    return NextResponse.json({ success: true, triaged: triage.length, results: triage, warning });
  } catch (error) {
    console.error('Job triage failed:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Job triage failed' },
      { status: 500 }
    );
  }
}
