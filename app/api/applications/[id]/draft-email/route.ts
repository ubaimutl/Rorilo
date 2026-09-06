import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailProvider } from '@/lib/email/gmail';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: true,
        documents: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // Find email draft document if not provided in body
    let subject = body.subject;
    let emailBody = body.body;
    const toEmail = body.to || application.job.contactEmail;

    if (!subject || !emailBody) {
      const emailDoc = application.documents.find((d) => d.type === 'EMAIL_DRAFT');
      if (emailDoc) {
        try {
          const parsed = JSON.parse(emailDoc.content);
          subject = subject || parsed.subject;
          emailBody = emailBody || parsed.body;
        } catch {
          emailBody = emailBody || emailDoc.content;
        }
      }
    }

    if (!toEmail) {
      return NextResponse.json(
        { error: 'No recipient email address available for this listing' },
        { status: 400 }
      );
    }

    subject = subject || `Application: ${application.job.title} - ${application.job.company}`;
    emailBody = emailBody || 'Please find attached my application materials.';

    const emailProvider = await getEmailProvider();
    const result = await emailProvider.createDraft({
      to: toEmail,
      subject,
      body: emailBody,
    });

    // Update status to DRAFT_CREATED
    await prisma.application.update({
      where: { id: application.id },
      data: { status: 'DRAFT_CREATED' },
    });

    // Log event
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        eventType: 'DRAFT_CREATED',
        description: `Created email draft to ${toEmail}: "${subject}"`,
        metadata: JSON.stringify({ draftId: result.draftId, provider: result.provider }),
      },
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      draftId: result.draftId,
      to: toEmail,
      subject,
    });
  } catch (error) {
    console.error('Draft email error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to create email draft' },
      { status: 500 }
    );
  }
}
