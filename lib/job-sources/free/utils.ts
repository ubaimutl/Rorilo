import {
  COUNTRY_OPTIONS,
  GLOBAL_REMOTE_ALIASES,
  REGION_ALIASES,
  countryAliases,
  countryRegion,
  normalizeCountryCode,
} from '../countries';

export async function fetchJson(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<unknown> {
  const { timeoutMs = 15000, headers } = options;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${new URL(url).hostname}`);
  }
  return (await response.json()) as unknown;
}

const STOPWORDS = new Set([
  'and', 'der', 'die', 'das', 'und', 'for', 'mit', 'des', 'den', 'the', 'eine', 'einer',
]);

export function keywordTokens(title?: string, keywords?: string[]): string[] {
  const words = [title || '', ...(keywords || [])]
    .join(' ')
    .toLowerCase()
    .split(/[^a-zäöüß0-9+#.]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return Array.from(new Set(words));
}

/**
 * Permissive keyword pre-filter for feeds without server-side search.
 * Keeps a job when any search token appears in its title or department text.
 */
export function matchesKeywords(haystack: string, title?: string, keywords?: string[]): boolean {
  const tokens = keywordTokens(title, keywords);
  if (tokens.length === 0) return true;
  const text = haystack.toLowerCase();
  return tokens.some((token) => text.includes(token));
}

export function isRemoteText(value: string): boolean {
  return /remote|home[\s-]?office|telecommute|distributed|anywhere/i.test(value);
}

const sourceCache = new Map<string, { expiresAt: number; data: unknown }>();

/**
 * Polite in-memory cache for keyless feeds (Remotive asks for ≤4 fetches/day).
 * Caches raw responses, never filtered results.
 */
export async function cachedFetchJson(
  key: string,
  ttlMs: number,
  loader: () => Promise<unknown>
): Promise<unknown> {
  const hit = sourceCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await loader();
  sourceCache.set(key, { expiresAt: Date.now() + ttlMs, data });
  return data;
}

export function clearSourceCache(): void {
  sourceCache.clear();
}

function hasAlias(text: string, aliases: string[]): boolean {
  return aliases.some((alias) => new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text));
}

/**
 * Keeps remote-feed jobs relevant for the selected search country without
 * assuming Germany. Country-fenced remote jobs are dropped when they clearly
 * point at a different market.
 */
export function remoteLocationKeeps(
  country: string | undefined,
  paramsLocation: string | undefined,
  locationText: string
): boolean {
  const text = (locationText || '').trim();
  if (!text) return true;
  const want = (paramsLocation || '').trim().toLowerCase();
  const lower = text.toLowerCase();
  if (want && lower.includes(want)) return true;
  if (hasAlias(lower, GLOBAL_REMOTE_ALIASES)) return true;

  const code = normalizeCountryCode(country);
  if (hasAlias(lower, countryAliases(code))) return true;

  const region = countryRegion(code);
  const regionAliases = region ? REGION_ALIASES[region] || [] : [];
  if (hasAlias(lower, regionAliases)) return true;

  const otherCountryMentioned = COUNTRY_OPTIONS.some(
    (option) => option.code !== code && hasAlias(lower, option.aliases)
  );
  if (otherCountryMentioned) return false;

  if (isRemoteText(lower)) return true;
  return false;
}
