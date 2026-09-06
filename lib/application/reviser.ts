import { z } from 'zod';
import { getAIProvider } from '../ai/openai-compatible';
import { Job, UserProfile } from '@prisma/client';

const RevisedCoverLetterSchema = z.object({
  revisedText: z.string().describe('The full cover letter text with the requested change applied'),
});

const RevisedEmailSchema = z.object({
  subject: z.string().describe('The revised email subject line'),
  body: z.string().describe('The full email body with the requested change applied'),
});

export type RevisedCoverLetter = z.infer<typeof RevisedCoverLetterSchema>;
export type RevisedEmail = z.infer<typeof RevisedEmailSchema>;

function profileContext(profile: UserProfile | null): string {
  if (!profile) return 'No candidate profile on file.';
  return [
    `Name: ${profile.firstName || 'Candidate'} ${profile.lastName || ''}`.trim(),
    `Current Title: ${profile.currentTitle || 'Not specified'}`,
    `Verified Skills: ${profile.skills || '[]'}`,
    `Verified Technologies: ${profile.technologies || '[]'}`,
  ].join('\n');
}

const REVISION_SYSTEM_PROMPT =
  'You perform precise, minimal edits to job application texts. Return ONLY valid JSON matching the schema. Do not wrap the JSON in markdown fences.';

export async function reviseCoverLetter(
  job: Job,
  profile: UserProfile | null,
  currentText: string,
  instruction: string
): Promise<RevisedCoverLetter> {
  const prompt = `You are an expert application writer doing a targeted edit to an existing cover letter.

CRITICAL NON-FABRICATION RULE:
NEVER invent or fabricate qualifications, past employers, degrees, certifications, years of experience, or technical proficiencies that the candidate does not have.
Apply ONLY the requested change. Preserve the language, tone, structure, greeting, closing, and length of the current text unless the requested change explicitly says otherwise.
Do not regenerate the letter from scratch and do not add new claims about the candidate.

ROLE: ${job.title} at ${job.company}

CANDIDATE (for grounding only, do not add new facts):
${profileContext(profile)}

REQUESTED CHANGE:
${instruction}

CURRENT COVER LETTER:
${currentText.slice(0, 12000)}

Return the full revised cover letter text in the "revisedText" field.`;

  try {
    const ai = await getAIProvider();
    return await ai.generateStructured(prompt, RevisedCoverLetterSchema, {
      temperature: 0.4,
      maxTokens: 2500,
      systemPrompt: REVISION_SYSTEM_PROMPT,
    });
  } catch (err) {
    console.error('AI cover letter revision failed:', err);
    throw new Error(
      `Could not apply the requested change. Check your AI provider settings and try again. ${(err as Error).message || ''}`.trim()
    );
  }
}

export async function reviseEmailDraft(
  job: Job,
  profile: UserProfile | null,
  currentSubject: string,
  currentBody: string,
  instruction: string
): Promise<RevisedEmail> {
  const prompt = `You are an expert application writer doing a targeted edit to an existing application email draft.

CRITICAL NON-FABRICATION RULE:
NEVER invent or fabricate qualifications, past employers, degrees, certifications, years of experience, or technical proficiencies that the candidate does not have.
Apply ONLY the requested change. Preserve the language, tone, and structure of the current draft unless the requested change explicitly says otherwise.
Keep the subject line unchanged unless the requested change concerns the subject.
Do not regenerate the email from scratch and do not add new claims about the candidate.

ROLE: ${job.title} at ${job.company}

CANDIDATE (for grounding only, do not add new facts):
${profileContext(profile)}

REQUESTED CHANGE:
${instruction}

CURRENT SUBJECT:
${currentSubject.slice(0, 500) || '(empty)'}

CURRENT BODY:
${currentBody.slice(0, 12000)}

Return the full revised "subject" and "body".`;

  try {
    const ai = await getAIProvider();
    return await ai.generateStructured(prompt, RevisedEmailSchema, {
      temperature: 0.4,
      maxTokens: 2000,
      systemPrompt: REVISION_SYSTEM_PROMPT,
    });
  } catch (err) {
    console.error('AI email revision failed:', err);
    throw new Error(
      `Could not apply the requested change. Check your AI provider settings and try again. ${(err as Error).message || ''}`.trim()
    );
  }
}
