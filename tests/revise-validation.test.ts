import { describe, it, expect } from 'vitest';
import {
  MAX_REVISE_CONTENT_LENGTH,
  MAX_REVISE_INSTRUCTION_LENGTH,
  validateReviseRequest,
} from '../lib/application/revise-validation';

describe('validateReviseRequest', () => {
  it('accepts a cover-letter revision and trims fields', () => {
    const result = validateReviseRequest({
      kind: 'cover-letter',
      instruction: '  Make it shorter  ',
      content: `  ${'a'.repeat(100)}  `,
    });
    expect(result).toEqual({
      ok: true,
      value: { kind: 'cover-letter', instruction: 'Make it shorter', content: 'a'.repeat(100) },
    });
  });

  it('accepts an email revision with optional subject', () => {
    const result = validateReviseRequest({
      kind: 'email',
      instruction: 'More formal tone',
      subject: '  Hello  ',
      body: 'Body text here, long enough to be valid content for revision.',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === 'email') {
      expect(result.value.subject).toBe('Hello');
    }
  });

  it('rejects unknown kinds', () => {
    expect(validateReviseRequest({ kind: 'cv', instruction: 'x'.repeat(10), content: 'y'.repeat(60) })).toEqual({
      ok: false,
      error: 'BAD_KIND',
    });
  });

  it('rejects blank or too-long instructions', () => {
    expect(
      validateReviseRequest({ kind: 'cover-letter', instruction: '   ', content: 'z'.repeat(60) })
    ).toEqual({ ok: false, error: 'EMPTY_INSTRUCTION' });
    expect(
      validateReviseRequest({
        kind: 'email',
        instruction: 'i'.repeat(MAX_REVISE_INSTRUCTION_LENGTH + 1),
        body: 'b'.repeat(60),
      })
    ).toEqual({ ok: false, error: 'INSTRUCTION_TOO_LONG' });
  });

  it('rejects missing or oversized content', () => {
    expect(
      validateReviseRequest({ kind: 'cover-letter', instruction: 'Fix this', content: '  ' })
    ).toEqual({ ok: false, error: 'EMPTY_CONTENT' });
    expect(
      validateReviseRequest({
        kind: 'cover-letter',
        instruction: 'Fix this',
        content: 'c'.repeat(MAX_REVISE_CONTENT_LENGTH + 1),
      })
    ).toEqual({ ok: false, error: 'CONTENT_TOO_LONG' });
    expect(
      validateReviseRequest({ kind: 'email', instruction: 'Fix this', body: '' })
    ).toEqual({ ok: false, error: 'EMPTY_CONTENT' });
  });
});
