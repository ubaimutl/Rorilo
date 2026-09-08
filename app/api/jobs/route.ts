import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withStoredLogo } from '@/lib/logo';
import { rememberDeletedJobs } from '@/lib/jobs/deleted-fingerprints';
import { attachSourceSummary } from '@/lib/jobs/source-history';
import { hasMatchProfile } from '@/lib/setup/readiness';

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
    const jobsWithViews = jobs.map((job) =>
      attachSourceSummary(withStoredLogo({
        ...job,
        match: canShowMatches ? job.match : null,
        viewCount: viewCountById.get(job.id)?.viewCount || 0,
        lastViewedAt: viewCountById.get(job.id)?.lastViewedAt || null,
      }))
    );

    return NextResponse.json({
      jobs: jobsWithViews,
      total: jobsWithViews.length,
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
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No job ids provided' }, { status: 400 });
    }

    const jobsToDelete = await prisma.job.findMany({
      where: {
        id: { in: ids },
      },
    });

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
