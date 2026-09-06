export const MIN_MANUAL_DESCRIPTION_LENGTH = 50;
export const MAX_MANUAL_DESCRIPTION_LENGTH = 20000;

export type ManualDescriptionValidation =
  | { ok: true; value: string }
  | { ok: false; error: 'NOT_A_STRING' | 'TOO_SHORT' | 'TOO_LONG' };

export function validateManualDescription(input: unknown): ManualDescriptionValidation {
  if (typeof input !== 'string') {
    return { ok: false, error: 'NOT_A_STRING' };
  }
  const value = input.trim();
  if (value.length < MIN_MANUAL_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'TOO_SHORT' };
  }
  if (value.length > MAX_MANUAL_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'TOO_LONG' };
  }
  return { ok: true, value };
}
