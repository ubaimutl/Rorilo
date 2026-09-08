import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getJobSource } from '@/lib/job-sources/apify';
import { areJobsDuplicates, computeJobHash } from '@/lib/jobs/deduplicate';
import { rememberDeletedJobs, wasJobDeletedBefore } from '@/lib/jobs/deleted-fingerprints';
import { matchesExcludedCompany } from '@/lib/jobs/exclusions';
import { calculateDeterministicMatch } from '@/lib/matching/engine';
import { hasMatchProfile } from '@/lib/setup/readiness';
import type { JobSourceSearchResult, JobSearchParams, NormalizedJobInput } from '@/lib/job-sources/types';
import { resolveSourceAdapter } from '@/lib/job-sources/sources';
import { resolveFreeSource } from '@/lib/job-sources/free';
import { normalizeCountryCode } from '@/lib/job-sources/countries';
import { createSourceHistoryEntry, mergeSourceHistory } from '@/lib/jobs/source-history';

type SourceResult = {
  source: string;
  discovered: number;
  newJobs: number;
  duplicates: number;
  skippedDeleted: number;
  skippedExcluded: number;
  jobIds: string[];
};

type SourceFailure = {
  source: string;
  error: string;
};

const MAX_USER_LIMIT = 50;
const MAX_FETCH_DEPTH = 120;

function normalizeSearchLimit(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 20;
  return Math.min(MAX_USER_LIMIT, Math.max(1, Math.floor(numeric)));
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fetchDepthForRun(userLimit: number, previousRuns: number): number {
  const depth = userLimit * (3 + previousRuns * 2);
  return Math.min(MAX_FETCH_DEPTH, Math.max(userLimit, depth));
}

function existingJobToInput(job: {
  source: string;
  sourceJobId: string | null;
  title: string;
  company: string;
  location: string | null;
  countryCode?: string | null;
  remoteType: string;
  applicationUrl: string | null;
  originalUrl: string | null;
  description: string;
}): Partial<NormalizedJobInput> {
  return {
    source: job.source,
    sourceJobId: job.sourceJobId || undefined,
    title: job.title,
    company: job.company,
    location: job.location || undefined,
    countryCode: job.countryCode || undefined,
    remoteType: job.remoteType as NormalizedJobInput['remoteType'],
    applicationUrl: job.applicationUrl || undefined,
    originalUrl: job.originalUrl || undefined,
    description: job.description,
  };
}

async function findExistingDuplicate(jobItem: NormalizedJobInput, hash: string) {
  const exact = await prisma.job.findUnique({
    where: { deduplicationHash: hash },
  });
  if (exact) return exact;

  const candidates = await prisma.job.findMany({
    where: {
      OR: [
        { company: { contains: jobItem.company } },
        { title: { contains: jobItem.title } },
      ],
    },
    take: 50,
  });

  return candidates.find((candidate) =>
    areJobsDuplicates(jobItem, existingJobToInput(candidate))
  ) || null;
}

async function markDuplicateSource(
  existingJob: Awaited<ReturnType<typeof prisma.job.findFirst>>,
  sourceLabel: string,
  jobItem: NormalizedJobInput
) {
  if (!existingJob) return;

  const sourceParts = existingJob.source
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const nextSource = sourceParts.includes(sourceLabel)
    ? existingJob.source
    : [...sourceParts, sourceLabel].join(', ');

  await prisma.job.update({
    where: { id: existingJob.id },
    data: {
      source: nextSource,
      applicationUrl: existingJob.applicationUrl || jobItem.applicationUrl,
      originalUrl: existingJob.originalUrl || jobItem.originalUrl,
      contactEmail: existingJob.contactEmail || jobItem.contactEmail,
      companyWebsite: existingJob.companyWebsite || jobItem.companyWebsite,
      companyLogo: existingJob.companyLogo || jobItem.companyLogo,
      rawData: mergeSourceHistory(
        existingJob.rawData,
        existingJob.source,
        createSourceHistoryEntry(sourceLabel, jobItem)
      ),
    },
  });
}

async function saveDiscoveredJob(
  jobItem: NormalizedJobInput,
  fallbackSource: string,
  fallbackCountry: string,
  profile: Awaited<ReturnType<typeof prisma.userProfile.findFirst>>,
  preferences: Awaited<ReturnType<typeof prisma.jobPreference.findFirst>>,
  shouldScore: boolean
): Promise<{ created: boolean; jobId: string | null; skippedDeleted: boolean; skippedExcluded?: boolean }> {
  const hash = computeJobHash(jobItem);
  const excludedBy = matchesExcludedCompany(jobItem.company, preferences?.excludedCompanies);
  if (excludedBy) {
    await rememberDeletedJobs([
      {
        deduplicationHash: hash,
        title: jobItem.title,
        company: jobItem.company,
        applicationUrl: jobItem.applicationUrl || null,
        originalUrl: jobItem.originalUrl || null,
        description: jobItem.description,
        source: jobItem.source || fallbackSource,
      },
    ]);
    return { created: false, jobId: null, skippedDeleted: false, skippedExcluded: true };
  }
  const wasDeleted = await wasJobDeletedBefore(jobItem, hash);
  if (wasDeleted) {
    return { created: false, jobId: null, skippedDeleted: true };
  }

  const existing = await findExistingDuplicate(jobItem, hash);

  if (existing) {
    await markDuplicateSource(existing, fallbackSource, jobItem);
    return { created: false, jobId: existing.id, skippedDeleted: false };
  }

  const createdJob = await prisma.job.create({
    data: {
      source: jobItem.source || fallbackSource,
      sourceJobId: jobItem.sourceJobId,
      deduplicationHash: hash,
      title: jobItem.title,
      company: jobItem.company,
      companyWebsite: jobItem.companyWebsite,
      companyLogo: jobItem.companyLogo,
      location: jobItem.location,
      countryCode: jobItem.countryCode || fallbackCountry,
      remoteType: jobItem.remoteType,
      employmentType: jobItem.employmentType,
      salaryMin: jobItem.salaryMin,
      salaryMax: jobItem.salaryMax,
      salaryCurrency: jobItem.salaryCurrency,
      description: jobItem.description,
      requirements: JSON.stringify(jobItem.requirements),
      responsibilities: JSON.stringify(jobItem.responsibilities),
      benefits: JSON.stringify(jobItem.benefits),
      technologies: JSON.stringify(jobItem.technologies),
      seniority: jobItem.seniority,
      languageRequirements: JSON.stringify(jobItem.languageRequirements),
      contactName: jobItem.contactName,
      contactEmail: jobItem.contactEmail,
      applicationUrl: jobItem.applicationUrl,
      originalUrl: jobItem.originalUrl,
      datePosted: jobItem.datePosted,
      viewCount: 0,
      rawData: mergeSourceHistory(
        JSON.stringify(jobItem.rawData || {}),
        jobItem.source || fallbackSource,
        createSourceHistoryEntry(jobItem.source || fallbackSource, jobItem)
      ),
    },
  });

  if (shouldScore) {
    const match = calculateDeterministicMatch(createdJob, profile, preferences);

    await prisma.jobMatch.create({
      data: {
        jobId: createdJob.id,
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

  return { created: true, jobId: createdJob.id, skippedDeleted: false };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { title, keywords, location, remote, limit = 20 } = body;
    const userLimit = normalizeSearchLimit(limit);
    const normalizedTitle = normalizeOptionalText(title);
    const normalizedLocation = normalizeOptionalText(location);
    const normalizedKeywords = Array.isArray(keywords)
      ? keywords
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    const normalizedRemote =
      remote === 'remote' || remote === 'hybrid' || remote === 'onsite' || remote === 'any' ? remote : undefined;
    const datePosted =
      body.datePosted === '24h' || body.datePosted === 'week' || body.datePosted === 'month'
        ? body.datePosted
        : undefined;
    const rawCandidates = Array.isArray(body.sources) && body.sources.length > 0
      ? body.sources
      : (Array.isArray(body.actors) ? body.actors : []);

    const resolvedSources = Array.from(
      new Set(
        rawCandidates.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      )
    ).map((src) => resolveSourceAdapter(src));

    const freeIds = Array.isArray(body.freeSources)
      ? Array.from(
          new Set(
            body.freeSources.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
          )
        )
      : [];

    if (resolvedSources.length === 0 && freeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Select at least one Apify or free source to search.' },
        { status: 400 }
      );
    }

    const [profile, preferences] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
    ]);
    const shouldScore = hasMatchProfile(profile, preferences);

    const searchParams: JobSearchParams = {
      title: normalizedTitle,
      keywords: normalizedKeywords,
      country: normalizeCountryCode(typeof body.country === 'string' ? body.country : profile?.country),
      location: normalizedLocation,
      remote: normalizedRemote,
      datePosted,
      limit: userLimit,
    };

    const results: SourceResult[] = [];
    const failedSources: SourceFailure[] = [];
    const jobIdsForTriage: string[] = [];

    type SourceFetcher = {
      label: string;
      paramsJson: string;
      fetchJobs: (fetchLimit: number) => Promise<JobSourceSearchResult>;
    };
    const fetchers: SourceFetcher[] = resolvedSources.map((source) => ({
      label: source.displayName,
      paramsJson: JSON.stringify({
        title: normalizedTitle,
        keywords: normalizedKeywords,
        country: searchParams.country,
        location: normalizedLocation,
        remote: normalizedRemote,
        datePosted,
        limit: userLimit,
        sourceId: source.sourceId,
        actorId: source.actorId,
      }),
      fetchJobs: async (fetchLimit) => {
        const jobSource = await getJobSource('apify', source.actorId);
        return jobSource.searchJobs({ ...searchParams, limit: fetchLimit });
      },
    }));

    for (const freeId of freeIds) {
      const def = resolveFreeSource(freeId);
      if (!def) {
        failedSources.push({ source: String(freeId), error: `Unknown free source "${freeId}"` });
        continue;
      }
      fetchers.push({
        label: `${def.name} (Free)`,
        paramsJson: JSON.stringify({
          title: normalizedTitle,
          keywords: normalizedKeywords,
          country: searchParams.country,
          location: normalizedLocation,
          remote: normalizedRemote,
          datePosted,
          limit: userLimit,
          freeSource: def.id,
        }),
        fetchJobs: (fetchLimit) => def.run({ ...searchParams, limit: fetchLimit }),
      });
    }

    for (const fetcher of fetchers) {
      let searchRunId: string | null = null;
      const sourceLabel = fetcher.label;
      try {
        const previousRuns = await prisma.searchRun.count({
          where: {
            source: sourceLabel,
            searchParameters: fetcher.paramsJson,
            status: 'COMPLETED',
          },
        });
        const fetchLimit = fetchDepthForRun(userLimit, previousRuns);

        const run = await prisma.searchRun.create({
          data: {
            source: sourceLabel,
            searchParameters: fetcher.paramsJson,
            status: 'RUNNING',
          },
        });
        searchRunId = run.id;

        const searchResult = await fetcher.fetchJobs(fetchLimit);

        let newJobsCount = 0;
        let duplicateJobsCount = 0;
        let skippedDeletedCount = 0;
        let skippedExcludedCount = 0;
        let inspectedCount = 0;
        const sourceJobIds: string[] = [];

        for (const jobItem of searchResult.jobs) {
          inspectedCount++;
          const saved = await saveDiscoveredJob(jobItem, sourceLabel, searchParams.country || 'DE', profile, preferences, shouldScore);
          if (saved.skippedExcluded) {
            skippedExcludedCount++;
            continue;
          }
          if (saved.skippedDeleted) {
            skippedDeletedCount++;
            continue;
          }
          if (!saved.jobId) continue;
          sourceJobIds.push(saved.jobId);
          if (saved.created) {
            newJobsCount++;
            jobIdsForTriage.push(saved.jobId);
            if (newJobsCount >= userLimit) {
              break;
            }
          } else {
            duplicateJobsCount++;
          }
        }

        await prisma.searchRun.update({
          where: { id: searchRunId },
          data: {
            completedAt: new Date(),
            jobsDiscovered: Math.max(searchResult.totalDiscovered, inspectedCount),
            newJobs: newJobsCount,
            duplicateJobs: duplicateJobsCount,
            status: 'COMPLETED',
          },
        });

        results.push({
          source: sourceLabel,
          discovered: Math.max(searchResult.totalDiscovered, inspectedCount),
          newJobs: newJobsCount,
          duplicates: duplicateJobsCount,
          skippedDeleted: skippedDeletedCount,
          skippedExcluded: skippedExcludedCount,
          jobIds: Array.from(new Set(sourceJobIds)),
        });
      } catch (sourceError) {
        const errorMessage = (sourceError as Error).message || 'Search execution failed';
        failedSources.push({ source: sourceLabel, error: errorMessage });

        if (searchRunId) {
          await prisma.searchRun.update({
            where: { id: searchRunId },
            data: {
              completedAt: new Date(),
              status: 'FAILED',
              error: errorMessage,
            },
          });
        } else {
          await prisma.searchRun.create({
            data: {
              source: sourceLabel,
              searchParameters: fetcher.paramsJson,
              completedAt: new Date(),
              status: 'FAILED',
              error: errorMessage,
            },
          });
        }
      }
    }

    const discovered = results.reduce((total, item) => total + item.discovered, 0);
    const newJobs = results.reduce((total, item) => total + item.newJobs, 0);
    const duplicates = results.reduce((total, item) => total + item.duplicates, 0);
    const skippedDeleted = results.reduce((total, item) => total + item.skippedDeleted, 0);
    const skippedExcluded = results.reduce((total, item) => total + (item.skippedExcluded || 0), 0);

    if (results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: failedSources.map((failure) => `${failure.source}: ${failure.error}`).join('\n'),
          failedSources,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      discovered,
      newJobs,
      duplicates,
      skippedDeleted,
      skippedExcluded,
      results,
      failedSources,
      jobIds: shouldScore ? Array.from(new Set(jobIdsForTriage)) : [],
      needsProfileSetup: !shouldScore,
    });
  } catch (error) {
    console.error('Job search run failed:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Search execution failed' },
      { status: 500 }
    );
  }
}
