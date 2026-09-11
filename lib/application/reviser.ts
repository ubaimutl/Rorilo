import { z } from 'zod';
import { getAIProvider } from '../ai/openai-compatible';
import { Job, UserProfile, JobPreference } from '@prisma/client';
import {
  COMPLETION_NUDGE,
  buildCoverLetterPrompt,
  buildEmailPrompt,
  estimateRevisionMaxTokens,
  isRevisionComplete,
} from './revision-prompt';

const RevisedCoverLetterSchema = z.object({
  revisedText: z.string().min(1).describe('The full cover letter text with the requested change applied'),
});

const RevisedEmailSchema = z.object({
  subject: z.string().describe('The revised email subject line'),
  body: z.string().min(1).describe('The full email body with the requested change applied'),
});

export type RevisedCoverLetter = z.infer<typeof RevisedCoverLetterSchema>;
export type RevisedEmail = z.infer<typeof RevisedEmailSchema>;

const REVISION_SYSTEM_PROMPT =
  'You perform precise, minimal edits to job application texts. Return ONLY valid JSON matching the schema. Do not wrap the JSON in markdown fences.';

function revisionError(kind: string, err: unknown): Error {
  return new Error(
    `Could not apply the requested change to the ${kind}. Check your AI provider settings and try again. ${(err as Error)?.message || ''}`.trim()
  );
}

async function runRevision<T>(
  prompt: string,
  schema: z.ZodType<T>,
  getOutputChars: (result: T) => number,
  inputChars: number,
  instruction: string
): Promise<T> {
  const ai = await getAIProvider();
  const maxTokens = estimateRevisionMaxTokens(inputChars);
  const options = {
    temperature: 0.3,
    maxTokens,
    systemPrompt: REVISION_SYSTEM_PROMPT,
  };

  const first = await ai.generateStructured(prompt, schema, options);
  if (isRevisionComplete({ inputChars, outputChars: getOutputChars(first), instruction })) {
    return first;
  }

  console.warn('Revision output failed completeness check, retrying with completion nudge.');
  const second = await ai.generateStructured(`${prompt}\n\n${COMPLETION_NUDGE}`, schema, options);
  if (
    isRevisionComplete({ inputChars, outputChars: getOutputChars(second), instruction }) ||
    getOutputChars(second) >= getOutputChars(first)
  ) {
    return second;
  }
  return first;
}

export async function reviseCoverLetter(
  job: Job,
  profile: UserProfile | null,
  preferences: JobPreference | null,
  currentText: string,
  instruction: string
): Promise<RevisedCoverLetter> {
  const prompt = buildCoverLetterPrompt({
    job,
    candidate: profile,
    style: preferences,
    currentText,
    instruction,
  });
  try {
    return await runRevision(
      prompt,
      RevisedCoverLetterSchema,
      (result) => result.revisedText.length,
      currentText.length,
      instruction
    );
  } catch (err) {
    console.error('AI cover letter revision failed:', err);
    throw revisionError('cover letter', err);
  }
}

export async function reviseEmailDraft(
  job: Job,
  profile: UserProfile | null,
  preferences: JobPreference | null,
  currentSubject: string,
  currentBody: string,
  instruction: string
): Promise<RevisedEmail> {
  const prompt = buildEmailPrompt({
    job,
    candidate: profile,
    style: preferences,
    subject: currentSubject,
    body: currentBody,
    instruction,
  });
  try {
    return await runRevision(
      prompt,
      RevisedEmailSchema,
      (result) => result.body.length,
      currentBody.length,
      instruction
    );
  } catch (err) {
    console.error('AI email revision failed:', err);
    throw revisionError('email draft', err);
  }
}
