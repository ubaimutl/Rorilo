import { describe, it, expect } from 'vitest';
import {
  MAX_MANUAL_DESCRIPTION_LENGTH,
  MIN_MANUAL_DESCRIPTION_LENGTH,
  validateManualDescription,
} from '../lib/jobs/manual-description';

describe('validateManualDescription', () => {
  it('accepts a normal description and trims it', () => {
    const result = validateManualDescription(`  ${'a'.repeat(60)}  `);
    expect(result).toEqual({ ok: true, value: 'a'.repeat(60) });
  });

  it('accepts exactly the minimum length', () => {
    const result = validateManualDescription('b'.repeat(MIN_MANUAL_DESCRIPTION_LENGTH));
    expect(result.ok).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(validateManualDescription(null)).toEqual({ ok: false, error: 'NOT_A_STRING' });
    expect(validateManualDescription(undefined)).toEqual({ ok: false, error: 'NOT_A_STRING' });
    expect(validateManualDescription(123)).toEqual({ ok: false, error: 'NOT_A_STRING' });
  });

  it('rejects blank or too-short text', () => {
    expect(validateManualDescription('   ')).toEqual({ ok: false, error: 'TOO_SHORT' });
    expect(validateManualDescription('x'.repeat(MIN_MANUAL_DESCRIPTION_LENGTH - 1))).toEqual({
      ok: false,
      error: 'TOO_SHORT',
    });
  });

  it('rejects text beyond the maximum length', () => {
    expect(validateManualDescription('y'.repeat(MAX_MANUAL_DESCRIPTION_LENGTH + 1))).toEqual({
      ok: false,
      error: 'TOO_LONG',
    });
  });
});
