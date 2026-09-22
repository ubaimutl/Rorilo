/**
 * Removes characters that corrupt downstream rendering (notably jsPDF's
 * standard-font metrics, where they show up as spaced-out junk glyphs and
 * break line wrapping): control codes, zero-width/format markers, bidi
 * controls, variation selectors, private-use characters, and lone surrogates.
 *
 * Uses an allowlist (letters, marks, numbers, punctuation, symbols, spaces)
 * so new junk classes are dropped by default instead of needing blocklist
 * updates. NFC normalization keeps umlauts/accents intact.
 */
export function cleanInvisibleText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .normalize('NFC')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S} \n\t]/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
