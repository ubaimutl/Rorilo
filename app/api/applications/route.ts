import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withStoredLogo } from '@/lib/logo';
import { z } from 'zod';

export async function GET() {
  try {
    const applications = await prisma.application.findMany({
      include: {
        job: {
          include: {
            match: true,
            analysis: true,
          },
        },
        documents: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      applications: applications.map((item) => ({
        ...item,
        job: item.job ? withStoredLogo(item.job) : item.job,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}

const UpdateApplicationSchema = z.object({
  jobId: z.string(),
  status: z.enum([
    'NEW', 'SAVED', 'IGNORED', 'PREPARING', 'READY',
    'DRAFT_CREATED', 'APPLIED', 'INTERVIEW', 'REJECTED', 'OFFER', 'WITHDRAWN',
  ]),
  notes: z.string().optional(),
  method: z.enum(['EMAIL', 'EXTERNAL_URL', 'UNKNOWN']).optional(),
  followUpAt: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = UpdateApplicationSchema.parse(body);

    const existingApp = await prisma.application.findUnique({
      where: { jobId: parsed.jobId },
      include: { job: true },
    });

    let app;
    const oldStatus = existingApp ? existingApp.status : 'NEW';

    if (existingApp) {
      app = await prisma.application.update({
        where: { id: existingApp.id },
        data: {
          status: parsed.status,
          notes: parsed.notes !== undefined ? parsed.notes : existingApp.notes,
          method: parsed.method || existingApp.method,
          appliedAt: parsed.status === 'APPLIED' && !existingApp.appliedAt ? new Date() : existingApp.appliedAt,
          followUpAt: parsed.followUpAt !== undefined ? (parsed.followUpAt ? new Date(parsed.followUpAt) : null) : existingApp.followUpAt,
        },
      });
    } else {
      const job = await prisma.job.findUnique({ where: { id: parsed.jobId } });
      const detectedMethod = job?.contactEmail ? 'EMAIL' : (job?.applicationUrl ? 'EXTERNAL_URL' : 'UNKNOWN');

      app = await prisma.application.create({
        data: {
          jobId: parsed.jobId,
          status: parsed.status,
          notes: parsed.notes || '',
          method: parsed.method || detectedMethod,
          appliedAt: parsed.status === 'APPLIED' ? new Date() : null,
          followUpAt: parsed.followUpAt ? new Date(parsed.followUpAt) : null,
        },
      });
    }

    // Log status change event if status changed
    if (oldStatus !== parsed.status) {
      await prisma.applicationEvent.create({
        data: {
          applicationId: app.id,
          eventType: 'STATUS_CHANGED',
          description: `Status changed from ${oldStatus} to ${parsed.status}`,
          metadata: JSON.stringify({ from: oldStatus, to: parsed.status }),
        },
      });
    }

    return NextResponse.json({ success: true, application: app });
  } catch (error) {
    console.error('Update application error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update application' },
      { status: 500 }
    );
  }
}
