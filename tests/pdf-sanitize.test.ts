import { it, expect } from 'vitest';
import { sanitizePdfText } from '../lib/pdf/generatePdf';
it('strips invisible junk', () => {
  expect(sanitizePdfText('a b Silence')).toBe('a b Silence');
  expect(sanitizePdfText('ITSupport')).toBe('ITSupport');
  expect(sanitizePdfText('x y')).toBe('x y');
  expect(sanitizePdfText('a­b')).toBe('ab');
  expect(sanitizePdfText('one two three')).toBe('one two three');
  expect(sanitizePdfText('a⁠b⁣c⁤d')).toBe('abcd');
});