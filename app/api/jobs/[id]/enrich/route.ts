import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runApifyActor } from '@/lib/job-sources/apify';
import { normalizeJobPayload, resolveSourceUrl } from '@/lib/jobs/normalize';
import { calculateDeterministicMatch } from '@/lib/matching/engine';
import { withStoredLogo } from '@/lib/logo';
import { hasMatchProfile } from '@/lib/setup/readiness';

const STEPSTONE_DETAILS_ACTOR = 'trakk/stepstone-jobs-scraper';

function findDetailUrl(job: { applicationUrl?: string | null; originalUrl?: string | null; source?: string | null }): string | null {
  const candidates = [job.applicationUrl, job.originalUrl]
    .filter((url): url is string => Boolean(url))
    .map((url) => resolveSourceUrl(url as string, job.source || ''));
  return (
    candidates.find((url) => /stepstone\./i.test(url) && /stellenangebote/i.test(url)) ||
    candidates.find((url) => /stepstone\./i.test(url)) ||
    null
  );
}

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

    if ((job.description || '').trim().length >= 200) {
      return NextResponse.json({ success: true, enriched: false, job: withStoredLogo(job) });
    }

    const settings = await prisma.apifySettings
      .findFirst({ where: { id: 'default' } })
      .catch(() => null);
    const token = settings?.apiToken || process.env.APIFY_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Apify API token is not configured. Add it in Settings > Job Discovery first.' },
        { status: 400 }
      );
    }

    const detailUrl = findDetailUrl(job);
    if (!detailUrl) {
      return NextResponse.json(
        { error: 'No original StepStone posting URL stored for this job.' },
        { status: 400 }
      );
    }

    const items = await runApifyActor(
      token,
      STEPSTONE_DETAILS_ACTOR,
      {
        mode: 'DETAILS',
        startUrls: [{ url: detailUrl }],
        includeDetails: true,
        includeContacts: false,
        maxItems: 1,
        outputMode: 'full',
      },
      120
    );

    const row = items[0] as Record<string, unknown> | undefined;
    if (!row) {
      return NextResponse.json(
        { error: 'Detail fetch returned no data for this posting.' },
        { status: 502 }
      );
    }

    const normalized = normalizeJobPayload(row, 'StepStone (Details)');
    if (!normalized.description || normalized.description.trim().length === 0) {
      return NextResponse.json(
        { error: 'The detail page had no readable description.' },
        { status: 502 }
      );
    }

    let previousRaw: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(job.rawData || '{}');
      if (parsed && typeof parsed === 'object') previousRaw = parsed as Record<string, unknown>;
    } catch {
      previousRaw = {};
    }

    const updated = await prisma.job.update({
      where: { id },
      data: {
        description: normalized.description,
        requirements: JSON.stringify(normalized.requirements),
        responsibilities: JSON.stringify(normalized.responsibilities),
        benefits: JSON.stringify(normalized.benefits),
        technologies: JSON.stringify(normalized.technologies),
        employmentType: normalized.employmentType || job.employmentType,
        salaryMin: normalized.salaryMin ?? job.salaryMin,
        salaryMax: normalized.salaryMax ?? job.salaryMax,
        salaryCurrency: normalized.salaryCurrency || job.salaryCurrency,
        contactEmail: normalized.contactEmail || job.contactEmail,
        contactName: normalized.contactName || job.contactName,
        companyWebsite: normalized.companyWebsite || job.companyWebsite,
        companyLogo: normalized.companyLogo || job.companyLogo,
        applicationUrl: normalized.applicationUrl || job.applicationUrl,
        originalUrl: normalized.originalUrl || job.originalUrl,
        rawData: JSON.stringify({ ...previousRaw, _detail: row }),
      },
    });

    const [profile, preferences] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
    ]);
    if (hasMatchProfile(profile, preferences)) {
      const match = calculateDeterministicMatch(updated, profile, preferences);
      await prisma.jobMatch.upsert({
        where: { jobId: id },
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
          // Description changed, so previous AI calibration is stale.
          aiMatchScore: null,
          aiScoredAt: null,
        },
        create: {
          jobId: id,
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
        },
      });
    }

    return NextResponse.json({ success: true, enriched: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to enrich job details' },
      { status: 500 }
    );
  }
}
