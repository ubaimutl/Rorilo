import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractJobAnalysisWithAI } from '@/lib/jobs/extractor';
import { calculateDeterministicMatch, synthesizeMatchWithAI } from '@/lib/matching/engine';
import { hasMatchProfile } from '@/lib/setup/readiness';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const [profile, preferences] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
    ]);

    if (!hasMatchProfile(profile, preferences)) {
      return NextResponse.json(
        { error: 'Set up your profile before analyzing job fit. Add a CV, skills, or target roles first.' },
        { status: 400 }
      );
    }

    // Perform AI analysis
    const analysis = await extractJobAnalysisWithAI(job);

    // Calculate deterministic match
    const match = calculateDeterministicMatch(
      { ...job, analysis },
      profile,
      preferences
    );

    // Synthesize AI explanation
    const aiExplanation = await synthesizeMatchWithAI(
      job,
      match,
      profile
    );

    const savedMatch = await prisma.jobMatch.upsert({
      where: { jobId: job.id },
      update: {
        matchScore: match.matchScore,
        skillsScore: match.breakdown.skillsScore,
        roleScore: match.breakdown.roleScore,
        experienceScore: match.breakdown.experienceScore,
        locationScore: match.breakdown.locationScore,
        languageScore: match.breakdown.languageScore,
        salaryScore: match.breakdown.salaryScore,
        preferencesScore: match.breakdown.preferencesScore,
        strongMatches: JSON.stringify(match.strongMatches),
        possibleIssues: JSON.stringify(match.possibleIssues),
        missingSkills: JSON.stringify(match.missingSkills),
        aiInterpretation: aiExplanation,
        lastCalculatedAt: new Date(),
      },
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
        strongMatches: JSON.stringify(match.strongMatches),
        possibleIssues: JSON.stringify(match.possibleIssues),
        missingSkills: JSON.stringify(match.missingSkills),
        aiInterpretation: aiExplanation,
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
      match: savedMatch,
    });
  } catch (error) {
    console.error('Job analyze error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to analyze job' },
      { status: 500 }
    );
  }
}
