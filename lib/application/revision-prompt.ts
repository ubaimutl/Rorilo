/**
 * Pure helpers for building targeted-revision prompts.
 * Kept free of server dependencies so the logic is unit-testable.
 */

export const REVISION_DESCRIPTION_SLICE = 3000;
export const REVISION_TEXT_SLICE = 20000;
export const REVISION_STYLE_SLICE = 500;

export const REVISION_MIN_TOKENS = 2500;
export const REVISION_MAX_TOKENS = 12000;

/** Below this fraction of the input length, an (unrequested) result counts as truncated. */
export const REVISION_COMPLETENESS_FLOOR = 0.4;

export const COMPLETION_NUDGE =
  'Your previous response was cut off or incomplete. Return the COMPLETE revised text now — the full document, not a summary and not only the changed part. Nothing else.';

const SHORTEN_SIGNALS = [
  'shorten',
  'shorter',
  'concise',
  'compress',
  'summar',
  'brief',
  'kürz',
  'knapp',
  'kompakt',
  'straff',
  'zusammenfass',
  'verkürz',
];

export interface RevisionJobContext {
  title: string;
  company: string;
  description?: string | null;
}

export interface RevisionCandidateContext {
  firstName?: string | null;
  lastName?: string | null;
  currentTitle?: string | null;
  skills?: string | null;
  technologies?: string | null;
}

export interface RevisionStyleContext {
  writingTone?: string | null;
  writingStyle?: string | null;
  aiNotes?: string | null;
}

function candidateBlock(candidate: RevisionCandidateContext | null): string {
  if (!candidate) return 'No candidate profile on file.';
  const name = `${candidate.firstName || 'Candidate'} ${candidate.lastName || ''}`.trim();
  return [
    `Name: ${name}`,
    `Current Title: ${candidate.currentTitle || 'Not specified'}`,
    `Verified Skills: ${candidate.skills || '[]'}`,
    `Verified Technologies: ${candidate.technologies || '[]'}`,
  ].join('\n');
}

function voiceBlock(style: RevisionStyleContext | null): string {
  const tone = style?.writingTone?.trim() || 'professional';
  const notes = [style?.writingStyle?.trim(), style?.aiNotes?.trim()].filter(Boolean).join('\n');
  return [
    `Tone: ${tone}`,
    `Style notes: ${notes ? notes.slice(0, REVISION_STYLE_SLICE) : 'None provided'}`,
  ].join('\n');
}

function descriptionBlock(job: RevisionJobContext): string {
  const text = (job.description || '').trim();
  return text ? text.slice(0, REVISION_DESCRIPTION_SLICE) : '(no description on file)';
}

const SHARED_RULES = `RULES:
- Apply the requested change and nothing else. If the request is broad (e.g. "improve", "make it better"), use your best judgment on wording, flow, and impact while keeping every fact and roughly the overall length.
- Keep the same language as the current text.
- NEVER invent qualifications, employers, degrees, certifications, years of experience, or skills that are not in the candidate grounding or the current text.
- Return the COMPLETE revised document — never only the changed paragraph, never a summary, never an explanation of what you changed.
- No preambles ("Here is..."), no markdown fences, no quotation wrapping.`;

export function buildCoverLetterPrompt(input: {
  job: RevisionJobContext;
  candidate: RevisionCandidateContext | null;
  style: RevisionStyleContext | null;
  currentText: string;
  instruction: string;
}): string {
  return `You are an expert application writer doing a targeted edit to an existing cover letter.

ROLE: ${input.job.title} at ${input.job.company}

JOB POSTING (grounding for role-specific requests):
${descriptionBlock(input.job)}

CANDIDATE (grounding only — never add new facts):
${candidateBlock(input.candidate)}

VOICE (follow unless the request says otherwise):
${voiceBlock(input.style)}

REQUESTED CHANGE:
${input.instruction}

CURRENT COVER LETTER (edit THIS text):
${input.currentText.slice(0, REVISION_TEXT_SLICE)}

${SHARED_RULES}

Return the full revised cover letter text in the "revisedText" field.`;
}

export function buildEmailPrompt(input: {
  job: RevisionJobContext;
  candidate: RevisionCandidateContext | null;
  style: RevisionStyleContext | null;
  subject: string;
  body: string;
  instruction: string;
}): string {
  return `You are an expert application writer doing a targeted edit to an existing application email draft.

ROLE: ${input.job.title} at ${input.job.company}

JOB POSTING (grounding for role-specific requests):
${descriptionBlock(input.job)}

CANDIDATE (grounding only — never add new facts):
${candidateBlock(input.candidate)}

VOICE (follow unless the request says otherwise):
${voiceBlock(input.style)}

REQUESTED CHANGE:
${input.instruction}

CURRENT SUBJECT:
${input.subject.slice(0, 500) || '(empty)'}

CURRENT BODY (edit THIS text):
${input.body.slice(0, REVISION_TEXT_SLICE)}

${SHARED_RULES}
Keep the subject line unchanged unless the requested change concerns the subject.

Return the full revised "subject" and "body".`;
}

/**
 * Output budget grows with the input so long documents are not cut off.
 * Roughly: output tokens ~= input chars / 3, plus headroom for JSON overhead.
 */
export function estimateRevisionMaxTokens(inputChars: number): number {
  const estimated = Math.ceil(inputChars / 3) + 600;
  return Math.min(REVISION_MAX_TOKENS, Math.max(REVISION_MIN_TOKENS, estimated));
}

export function instructionImpliesShortening(instruction: string): boolean {
  const lower = instruction.toLowerCase();
  return SHORTEN_SIGNALS.some((signal) => lower.includes(signal));
}

/**
 * Guards against truncated or degenerate outputs. When the user explicitly
 * asked for a shorter text, small outputs are legitimate and pass.
 */
export function isRevisionComplete(input: {
  inputChars: number;
  outputChars: number;
  instruction: string;
}): boolean {
  if (input.outputChars < 1) return false;
  if (instructionImpliesShortening(input.instruction)) return true;
  const floor = Math.max(100, Math.floor(input.inputChars * REVISION_COMPLETENESS_FLOOR));
  return input.outputChars >= floor;
}
