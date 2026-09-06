import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withStoredLogo } from '@/lib/logo';
import { rememberDeletedJobs } from '@/lib/jobs/deleted-fingerprints';
import { attachSourceSummary } from '@/lib/jobs/source-history';
import { validateManualDescription } from '@/lib/jobs/manual-description';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const shouldTrackView = searchParams.get('trackView') === '1';

    if (shouldTrackView) {
      await prisma.$executeRaw`
        UPDATE Job
        SET viewCount = viewCount + 1, lastViewedAt = ${new Date().toISOString()}
        WHERE id = ${id}
      `;
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        analysis: true,
        match: true,
        application: {
          include: {
            documents: { orderBy: { updatedAt: 'desc' } },
            events: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const viewRows = await prisma.$queryRaw<Array<{ viewCount: number; lastViewedAt: string | null }>>`
      SELECT viewCount, lastViewedAt
      FROM Job
      WHERE id = ${id}
      LIMIT 1
    `;
    const viewData = viewRows[0];

    return NextResponse.json({
      job: attachSourceSummary(withStoredLogo({
        ...job,
        viewCount: viewData?.viewCount || 0,
        lastViewedAt: viewData?.lastViewedAt || null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validation = validateManualDescription(body?.description);
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'Please provide a job description between 50 and 20000 characters.' },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { description: validation.value },
    });

    return NextResponse.json({
      success: true,
      job: { id: updated.id, description: updated.description },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    await rememberDeletedJobs([job]);

    await prisma.job.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to delete job' },
      { status: 500 }
    );
  }
}
