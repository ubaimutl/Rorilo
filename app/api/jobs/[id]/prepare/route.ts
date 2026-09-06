import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApplicationMaterials } from '@/lib/application/generator';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: { analysis: true },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const [profile, preferences, activeCv] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
      prisma.cV.findFirst({ where: { isActive: true }, orderBy: { uploadDate: 'desc' } }),
    ]);

    // Generate tailored materials
    const materials = await generateApplicationMaterials(
      job,
      profile,
      preferences,
      activeCv
    );

    // Determine application method
    const method = job.contactEmail
      ? 'EMAIL'
      : job.applicationUrl
      ? 'EXTERNAL_URL'
      : 'UNKNOWN';

    // Upsert Application
    const application = await prisma.application.upsert({
      where: { jobId: job.id },
      update: {
        status: 'READY',
        method,
      },
      create: {
        jobId: job.id,
        status: 'READY',
        method,
        notes: `Application prepared on ${new Date().toLocaleDateString()}`,
      },
    });

    // Save Cover Letter Document
    await prisma.applicationDocument.upsert({
      where: { id: `doc-${application.id}-cl` },
      update: {
        content: materials.coverLetter,
        title: `Cover Letter - ${job.company}`,
      },
      create: {
        id: `doc-${application.id}-cl`,
        applicationId: application.id,
        type: 'COVER_LETTER',
        title: `Cover Letter - ${job.company}`,
        content: materials.coverLetter,
      },
    });

    // Save Email Draft Document
    await prisma.applicationDocument.upsert({
      where: { id: `doc-${application.id}-email` },
      update: {
        content: JSON.stringify({
          subject: materials.emailSubject,
          body: materials.emailBody,
        }),
        title: `Email Draft - ${job.company}`,
      },
      create: {
        id: `doc-${application.id}-email`,
        applicationId: application.id,
        type: 'EMAIL_DRAFT',
        title: `Email Draft - ${job.company}`,
        content: JSON.stringify({
          subject: materials.emailSubject,
          body: materials.emailBody,
        }),
      },
    });

    // Save Answers Document
    await prisma.applicationDocument.upsert({
      where: { id: `doc-${application.id}-answers` },
      update: {
        content: JSON.stringify({
          introduction: materials.shortIntroduction,
          answers: materials.answersToCommonQuestions,
          skillsSummary: materials.relevantSkillsSummary,
          gapsNoted: materials.missingOrGapsNoted,
        }),
        title: `Application Q&A - ${job.company}`,
      },
      create: {
        id: `doc-${application.id}-answers`,
        applicationId: application.id,
        type: 'ANSWERS',
        title: `Application Q&A - ${job.company}`,
        content: JSON.stringify({
          introduction: materials.shortIntroduction,
          answers: materials.answersToCommonQuestions,
          skillsSummary: materials.relevantSkillsSummary,
          gapsNoted: materials.missingOrGapsNoted,
        }),
      },
    });

    // Log Event
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        eventType: 'PREPARED',
        description: `Generated tailored cover letter, email draft, and Q&A package for ${job.company}`,
      },
    });

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      materials,
    });
  } catch (error) {
    console.error('Prepare application error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to prepare application' },
      { status: 500 }
    );
  }
}
