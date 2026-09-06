import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateReviseRequest } from '@/lib/application/revise-validation';
import { reviseCoverLetter, reviseEmailDraft } from '@/lib/application/reviser';

const VALIDATION_MESSAGES: Record<string, string> = {
  BAD_KIND: 'Invalid revision kind.',
  EMPTY_INSTRUCTION: 'Please describe the change you want.',
  INSTRUCTION_TOO_LONG: 'Instruction too long (max 500 characters).',
  EMPTY_CONTENT: 'There is no text to revise yet.',
  CONTENT_TOO_LONG: 'Text too long to revise.',
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validation = validateReviseRequest(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: VALIDATION_MESSAGES[validation.error] || 'Invalid revision request.' },
        { status: 400 }
      );
    }

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const profile = await prisma.userProfile.findFirst({ where: { id: 'default' } });

    if (validation.value.kind === 'cover-letter') {
      const revised = await reviseCoverLetter(
        job,
        profile,
        validation.value.content,
        validation.value.instruction
      );
      return NextResponse.json({ success: true, revisedText: revised.revisedText });
    }

    const revised = await reviseEmailDraft(
      job,
      profile,
      validation.value.subject,
      validation.value.body,
      validation.value.instruction
    );
    return NextResponse.json({ success: true, subject: revised.subject, body: revised.body });
  } catch (error) {
    console.error('Revise application text error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to apply the requested change' },
      { status: 500 }
    );
  }
}
