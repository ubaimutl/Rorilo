import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withStoredLogo } from '@/lib/logo';
import { rememberDeletedJobs } from '@/lib/jobs/deleted-fingerprints';
import { attachSourceSummary } from '@/lib/jobs/source-history';
import { hasMatchProfile } from '@/lib/setup/readiness';
import { computeJobHash } from '@/lib/jobs/deduplicate';
import { validateManualDescription } from '@/lib/jobs/manual-description';

const REMOTE_TYPES = new Set(['remote', 'hybrid', 'onsite', 'unknown']);

function cleanStr(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

/** POST /api/jobs — save a job found elsewhere so documents can be prepared for it. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const title = cleanStr(body.title, 200);
    const company = cleanStr(body.company, 200);
    if (!title || !company) {
      return NextResponse.json(
        { error: 'Job title and company are required' },
        { status: 400 }
      );
    }

    const location = cleanStr(body.location, 200) || null;
    const remoteType =
      typeof body.remoteType === 'string' && REMOTE_TYPES.has(body.remoteType)
        ? body.remoteType
        : 'unknown';
    const employmentType = cleanStr(body.employmentType, 50) || null;

    const toNum = (v: unknown): number | null => {
      const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const salaryMin = toNum(body.salaryMin);
    const salaryMax = toNum(body.salaryMax);
    const salaryCurrency =
      salaryMin !== null || salaryMax !== null
        ? cleanStr(body.salaryCurrency, 3).toUpperCase() || 'USD'
        : null;

    const descValidation = validateManualDescription(
      typeof body.description === 'string' ? body.description : ''
    );
    if (!descValidation.ok) {
      return NextResponse.json(
        {
          error:
            descValidation.error === 'TOO_LONG'
              ? 'Description is too long (max 20,000 characters)'
              : 'Please paste at least a short description (min 50 characters) so matching and documents have something to work with',
        },
        { status: 422 }
      );
    }

    const url = cleanUrl(body.url ?? body.applicationUrl);
    if (body.url !== undefined && body.url !== null && String(body.url).trim() !== '' && !url) {
      return NextResponse.json({ error: 'Posting URL does not look valid' }, { status: 400 });
    }

    const hash = computeJobHash({
      title,
      company,
      location: location ?? undefined,
      remoteType: remoteType as 'remote' | 'hybrid' | 'onsite' | 'unknown',
      applicationUrl: url ?? undefined,
    });
    const existing = await prisma.job.findUnique({
      where: { deduplicationHash: hash },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, duplicate: true, job: { id: existing.id } });
    }

    const job = await prisma.job.create({
      data: {
        source: 'manual',
        deduplicationHash: hash,
        title,
        company,
        location,
        remoteType,
        employmentType,
        salaryMin,
        salaryMax,
        salaryCurrency,
        description: descValidation.value,
        applicationUrl: url,
        originalUrl: url,
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, duplicate: false, job: { id: job.id } });
  } catch (error) {
    // Unique-hash race: another request created the same job concurrently.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: true, duplicate: true, job: { id: null } });
    }
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to save job' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const location = searchParams.get('location')?.toLowerCase() || '';
    const minScore = parseInt(searchParams.get('minScore') || '0', 10);
    const remoteType = searchParams.get('remote') || '';
    const status = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'best'; // best, newest, salary
    const discoverStatuses = new Set(['NEW', 'SAVED']);

    const [profile, preferences] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
    ]);
    const canShowMatches = hasMatchProfile(profile, preferences);

    // Fetch jobs with relations
    let jobs = await prisma.job.findMany({
      include: {
        match: true,
        analysis: true,
        application: true,
      },
      orderBy: { discoveredAt: 'desc' },
    });

    const allDiscoverJobs = jobs.filter((j) => !j.application || discoverStatuses.has(j.application.status));
    const scoredJobs = allDiscoverJobs.filter((j) => j.match);
    const globalStats = {
      visible: allDiscoverJobs.length,
      saved: allDiscoverJobs.filter((j) => j.application?.status === 'SAVED').length,
      worthApplying: allDiscoverJobs.filter((j) => j.match?.triageStatus === 'WORTH_APPLYING').length,
      avgScore: scoredJobs.length > 0
        ? Math.round(scoredJobs.reduce((sum, j) => sum + (j.match?.matchScore ?? 0), 0) / scoredJobs.length)
        : null,
      skipped: allDiscoverJobs.filter((j) => j.match?.triageStatus === 'SKIP').length,
    };

    // In-memory / SQL filtering
    if (search) {
      jobs = jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(search) ||
          j.company.toLowerCase().includes(search) ||
          j.description.toLowerCase().includes(search) ||
          (j.location && j.location.toLowerCase().includes(search))
      );
    }

    if (minScore > 0) {
      jobs = jobs.filter((j) => (j.match?.matchScore ?? 0) >= minScore);
    }

    if (remoteType && remoteType !== 'all') {
      jobs = jobs.filter((j) => j.remoteType === remoteType);
    }

    if (location) {
      jobs = jobs.filter((j) => (j.location || '').toLowerCase().includes(location));
    }

    if (status && status !== 'all') {
      if (status === 'unapplied') {
        jobs = jobs.filter((j) => !j.application || j.application.status === 'NEW');
      } else {
        jobs = jobs.filter((j) => j.application?.status === status);
      }
    } else {
      jobs = jobs.filter((j) => !j.application || discoverStatuses.has(j.application.status));
    }


    // Sorting
    if (sort === 'best' && canShowMatches) {
      jobs.sort((a, b) => (b.match?.matchScore ?? 0) - (a.match?.matchScore ?? 0));
    } else if (sort === 'newest' || !canShowMatches) {
      jobs.sort((a, b) => {
        const timeA = a.datePosted ? new Date(a.datePosted).getTime() : new Date(a.discoveredAt).getTime();
        const timeB = b.datePosted ? new Date(b.datePosted).getTime() : new Date(b.discoveredAt).getTime();
        return timeB - timeA;
      });
    } else if (sort === 'salary') {
      jobs.sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
    }

    const viewCounts = jobs.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; viewCount: number; lastViewedAt: string | null }>>`
          SELECT id, viewCount, lastViewedAt
          FROM Job
          WHERE id IN (${Prisma.join(jobs.map((job) => job.id))})
        `
      : [];
    const viewCountById = new Map(viewCounts.map((item) => [item.id, item]));
    const jobsWithViews = jobs.map((job) => {
      // When the profile isn't ready for scoring, hide score-related fields but
      // preserve triageStatus/triageReason so badges still render on the discover
      // page for jobs that have already been triaged.
      let matchPayload: typeof job.match | null = null;
      if (canShowMatches) {
        matchPayload = job.match;
      } else if (job.match && job.match.triageStatus && job.match.triageStatus !== 'UNREVIEWED') {
        matchPayload = {
          ...job.match,
          matchScore: 0,
          skillsScore: 0,
          roleScore: 0,
          experienceScore: 0,
          locationScore: 0,
          languageScore: 0,
          salaryScore: 0,
          preferencesScore: 0,
          strongMatches: '[]',
          possibleIssues: '[]',
          missingSkills: '[]',
          aiInterpretation: null,
          aiMatchScore: null,
          aiScoredAt: null,
          lastCalculatedAt: job.match.lastCalculatedAt,
        };
      }
      return attachSourceSummary(withStoredLogo({
        ...job,
        match: matchPayload,
        viewCount: viewCountById.get(job.id)?.viewCount || 0,
        lastViewedAt: viewCountById.get(job.id)?.lastViewedAt || null,
      }));
    });

    const totalJobsInDb = await prisma.job.count();

    return NextResponse.json({
      jobs: jobsWithViews,
      total: jobsWithViews.length,
      totalJobsInDb,
      globalStats,
      profileReady: canShowMatches,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    
    let jobsToDelete: any[] = [];
    
    if (body.deleteSkipped === true) {
      jobsToDelete = await prisma.job.findMany({
        where: {
          match: { triageStatus: 'SKIP' },
          OR: [
            { application: null },
            { application: { status: { in: ['NEW', 'SAVED'] } } }
          ]
        },
      });
    } else {
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];

      if (ids.length === 0) {
        return NextResponse.json({ error: 'No job ids provided' }, { status: 400 });
      }

      jobsToDelete = await prisma.job.findMany({
        where: {
          id: { in: ids },
        },
      });
    }

    if (jobsToDelete.length > 0) {
      await rememberDeletedJobs(jobsToDelete);
    }

    const result = await prisma.job.deleteMany({
      where: {
        id: { in: jobsToDelete.map((job) => job.id) },
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to delete jobs' },
      { status: 500 }
    );
  }
}
