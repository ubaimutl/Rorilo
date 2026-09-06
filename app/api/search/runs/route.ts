import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type SourceHealth = {
  source: string;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  newJobs: number;
  duplicates: number;
  discovered: number;
  duplicateRate: number;
  averageNewJobs: number;
  lastStatus: string;
  lastRunAt: Date;
  lastError: string | null;
};

function summarizeSourceHealth(runs: Awaited<ReturnType<typeof prisma.searchRun.findMany>>): SourceHealth[] {
  const grouped = new Map<string, SourceHealth>();

  for (const run of runs) {
    const existing = grouped.get(run.source);
    const next = existing || {
      source: run.source,
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      newJobs: 0,
      duplicates: 0,
      discovered: 0,
      duplicateRate: 0,
      averageNewJobs: 0,
      lastStatus: run.status,
      lastRunAt: run.startedAt,
      lastError: null,
    };

    next.runs += 1;
    next.successfulRuns += run.status === 'COMPLETED' ? 1 : 0;
    next.failedRuns += run.status === 'FAILED' ? 1 : 0;
    next.newJobs += run.newJobs;
    next.duplicates += run.duplicateJobs;
    next.discovered += run.jobsDiscovered;

    if (run.startedAt >= next.lastRunAt) {
      next.lastStatus = run.status;
      next.lastRunAt = run.startedAt;
      next.lastError = run.error;
    }

    grouped.set(run.source, next);
  }

  return Array.from(grouped.values())
    .map((source) => ({
      ...source,
      duplicateRate: source.discovered > 0 ? Math.round((source.duplicates / source.discovered) * 100) : 0,
      averageNewJobs: source.runs > 0 ? Math.round((source.newJobs / source.runs) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.lastRunAt.getTime() - a.lastRunAt.getTime());
}

export async function GET() {
  try {
    const [runs, healthRuns] = await Promise.all([
      prisma.searchRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 30,
      }),
      prisma.searchRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 200,
      }),
    ]);
    return NextResponse.json({ runs, sourceHealth: summarizeSourceHealth(healthRuns) });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch search runs' },
      { status: 500 }
    );
  }
}
