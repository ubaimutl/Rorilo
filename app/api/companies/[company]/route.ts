import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withStoredLogo } from '@/lib/logo';
import { attachSourceSummary } from '@/lib/jobs/source-history';
import { cleanText } from '@/lib/jobs/deduplicate';

function decodeCompanyParam(value: string) {
  let decoded = value;
  for (let i = 0; i < 2; i++) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
  }
  return decoded.trim();
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company: rawCompany } = await params;
    const company = decodeCompanyParam(rawCompany || '');
    if (!company) {
      return NextResponse.json({ error: 'Company is required' }, { status: 400 });
    }

    const normalizedCompany = cleanText(company);
    const candidates = await prisma.job.findMany({
      where: { company: { contains: company } },
      include: {
        match: true,
        application: true,
      },
      orderBy: { discoveredAt: 'desc' },
      take: 100,
    });

    const jobs = candidates
      .filter((job) => cleanText(job.company) === normalizedCompany)
      .map((job) => attachSourceSummary(withStoredLogo(job)));

    if (jobs.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const sourceLabels = Array.from(new Set(jobs.flatMap((job) => job.sourceLabels || [])));
    const sourceLinks = Array.from(
      new Map(
        jobs
          .flatMap((job) => job.sourceLinks || [])
          .map((entry) => [`${entry.source}|${entry.url}`, entry])
      ).values()
    );
    const companyWebsite = jobs.find((job) => job.companyWebsite)?.companyWebsite || null;
    const companyLogo = jobs.find((job) => job.companyLogo)?.companyLogo || null;
    const scoredJobs = jobs.filter((job) => job.match);
    const averageScore = scoredJobs.length > 0
      ? Math.round(scoredJobs.reduce((total, job) => total + (job.match?.matchScore || 0), 0) / scoredJobs.length)
      : 0;

    return NextResponse.json({
      company: {
        name: jobs[0].company,
        website: companyWebsite,
        logo: companyLogo,
        sourceLabels,
        sourceLinks,
        stats: {
          totalJobs: jobs.length,
          saved: jobs.filter((job) => job.application?.status === 'SAVED').length,
          prepared: jobs.filter((job) => ['READY', 'DRAFT_CREATED'].includes(job.application?.status || '')).length,
          applied: jobs.filter((job) => ['APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'].includes(job.application?.status || '')).length,
          averageScore,
        },
      },
      jobs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to load company' },
      { status: 500 }
    );
  }
}
