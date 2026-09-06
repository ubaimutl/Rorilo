export interface CompanyPattern {
  raw: string;
  regex: RegExp | null;
  text: string | null;
}

function parseJsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Parses one blocklist entry. Plain text matches case-insensitively by
 * substring; /pattern/flags entries compile to a RegExp. Invalid regex
 * safely degrades to literal substring matching. Overlong entries ignored.
 */
export function parseCompanyPattern(raw: unknown): CompanyPattern | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/);
  if (regexMatch) {
    try {
      return { raw: trimmed, regex: new RegExp(regexMatch[1], regexMatch[2] || 'i'), text: null };
    } catch {
      return { raw: trimmed, regex: null, text: trimmed.toLowerCase() };
    }
  }
  return { raw: trimmed, regex: null, text: trimmed.toLowerCase() };
}

/**
 * Returns the matched blocklist entry, or null when the company is allowed.
 */
export function matchesExcludedCompany(
  company: string | undefined | null,
  patterns: unknown
): string | null {
  const name = (company || '').trim();
  if (!name) return null;
  for (const entry of parseJsonList(patterns)) {
    const pattern = parseCompanyPattern(entry);
    if (!pattern) continue;
    if (pattern.regex) {
      try {
        if (pattern.regex.test(name)) return pattern.raw;
      } catch {
        continue;
      }
    } else if (pattern.text && name.toLowerCase().includes(pattern.text)) {
      return pattern.raw;
    }
  }
  return null;
}
