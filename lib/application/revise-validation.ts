export const MAX_REVISE_INSTRUCTION_LENGTH = 500;
export const MAX_REVISE_CONTENT_LENGTH = 20000;
export const MAX_REVISE_SUBJECT_LENGTH = 500;

export type ReviseKind = 'cover-letter' | 'email';

export type ReviseValidationError =
  | 'BAD_KIND'
  | 'EMPTY_INSTRUCTION'
  | 'INSTRUCTION_TOO_LONG'
  | 'EMPTY_CONTENT'
  | 'CONTENT_TOO_LONG';

export type ValidatedReviseRequest =
  | { ok: true; value: { kind: 'cover-letter'; instruction: string; content: string } }
  | { ok: true; value: { kind: 'email'; instruction: string; subject: string; body: string } }
  | { ok: false; error: ReviseValidationError };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateReviseRequest(input: {
  kind: unknown;
  instruction: unknown;
  content?: unknown;
  subject?: unknown;
  body?: unknown;
}): ValidatedReviseRequest {
  if (input.kind !== 'cover-letter' && input.kind !== 'email') {
    return { ok: false, error: 'BAD_KIND' };
  }

  if (!isNonEmptyString(input.instruction)) {
    return { ok: false, error: 'EMPTY_INSTRUCTION' };
  }
  const instruction = input.instruction.trim();
  if (instruction.length > MAX_REVISE_INSTRUCTION_LENGTH) {
    return { ok: false, error: 'INSTRUCTION_TOO_LONG' };
  }

  if (input.kind === 'cover-letter') {
    if (!isNonEmptyString(input.content)) {
      return { ok: false, error: 'EMPTY_CONTENT' };
    }
    const content = input.content.trim();
    if (content.length > MAX_REVISE_CONTENT_LENGTH) {
      return { ok: false, error: 'CONTENT_TOO_LONG' };
    }
    return { ok: true, value: { kind: 'cover-letter', instruction, content } };
  }

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  if (subject.length > MAX_REVISE_SUBJECT_LENGTH) {
    return { ok: false, error: 'CONTENT_TOO_LONG' };
  }
  if (!isNonEmptyString(input.body)) {
    return { ok: false, error: 'EMPTY_CONTENT' };
  }
  const body = (input.body as string).trim();
  if (body.length > MAX_REVISE_CONTENT_LENGTH) {
    return { ok: false, error: 'CONTENT_TOO_LONG' };
  }
  return { ok: true, value: { kind: 'email', instruction, subject, body } };
}
