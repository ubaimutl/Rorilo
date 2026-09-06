import crypto from 'crypto';
import { NormalizedJobInput } from '../job-sources/types';

/**
 * Normalizes text for comparison: lowercases, removes non-alphanumeric chars and extra spaces.
 */
export function cleanText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a URL by stripping tracking query params like utm_*, ref, etc.
 */
export function cleanUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function descriptionFingerprint(text: string | undefined | null): string {
  return cleanText(text).slice(0, 650);
}

/**
 * Location tokens for comparison: lowercased words without pure numbers,
 * so "10115 Berlin" and "Berlin, Berlin, Germany" share the same tokens.
 */
export function locationTokens(location: string | undefined | null): string[] {
  return cleanText(location)
    .split(' ')
    .filter((token) => token.length > 0 && !/^\d+$/.test(token));
}

/**
 * Matches locations when either side is empty or one token set is
 * contained in the other ("Berlin" vs "10115 Berlin").
 */
export function sameLocation(a: string | undefined | null, b: string | undefined | null): boolean {
  const tokensA = locationTokens(a);
  const tokensB = locationTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return true;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  return tokensA.every((token) => setB.has(token)) || tokensB.every((token) => setA.has(token));
}

/**
 * Host-normalized URL signature (strips www, lowercases, trims slashes)
 * for cross-source comparison.
 */
export function urlPathSignature(rawUrl: string | undefined | null): string {
  if (!rawUrl) return '';
  const lower = rawUrl.trim().toLowerCase();
  try {
    const url = new URL(lower);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return lower.split('?')[0].replace(/^\/+|\/+$/g, '');
  }
}

function pathKey(signature: string): string {
  const withSlash = signature.startsWith('/') ? signature : `/${signature}`;
  const segments = withSlash.split('/').filter(Boolean);
  if (segments.length > 1 && segments[0].includes('.')) segments.shift();
  return `/${segments.join('/')}`;
}

/**
 * Matches URLs across sources: exact normalized match, or same job path
 * with different hosts/schemes (relative vs absolute StepStone URLs).
 */
export function urlsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const cleanA = cleanUrl(a);
  const cleanB = cleanUrl(b);
  if (cleanA && cleanB && cleanA === cleanB) return true;
  const sigA = urlPathSignature(a);
  const sigB = urlPathSignature(b);
  if (!sigA || !sigB) return false;
  if (sigA === sigB) return true;
  const pathA = pathKey(sigA);
  const pathB = pathKey(sigB);
  return pathA.length > 1 && pathA === pathB;
}

/**
 * Computes a deterministic deduplication hash for a job.
 * Combines normalized company, title, remote/location, and stripped URL.
 * Source and actor IDs are intentionally excluded so the same role from
 * LinkedIn, Indeed, StepStone, etc. resolves to one saved job.
 */
export function computeJobHash(job: Partial<NormalizedJobInput>): string {
  const normCompany = cleanText(job.company || '');
  const normTitle = cleanText(job.title || '');
  const normLocation = cleanText(job.location || '');
  const normRemote = cleanText(job.remoteType || '');
  const normUrl = cleanUrl(job.applicationUrl || job.originalUrl || '');

  // Base identifier: company + title + (location or remote)
  const contentSignature = `${normCompany}:::${normTitle}:::${normRemote || normLocation}`;

  // If a URL is available, we combine signature with normalized host/path
  const combined = `${contentSignature}:::${normUrl}`;

  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Checks whether two jobs are identical based on titles, companies, locations, and descriptions.
 */
export function areJobsDuplicates(
  a: Partial<NormalizedJobInput>,
  b: Partial<NormalizedJobInput>
): boolean {
  if (computeJobHash(a) === computeJobHash(b)) return true;

  const compA = cleanText(a.company);
  const compB = cleanText(b.company);
  const titleA = cleanText(a.title);
  const titleB = cleanText(b.title);

  if (compA && compB && compA === compB && titleA && titleB && titleA === titleB) {
    // If companies and titles match, check location or description overlap
    if (sameLocation(a.location, b.location)) return true;

    // Check application URL host/path
    if (urlsMatch(a.applicationUrl || a.originalUrl, b.applicationUrl || b.originalUrl)) return true;
  }

  if (compA && compB && compA === compB) {
    if (urlsMatch(a.applicationUrl || a.originalUrl, b.applicationUrl || b.originalUrl)) return true;

    const descA = descriptionFingerprint(a.description);
    const descB = descriptionFingerprint(b.description);
    if (descA.length > 180 && descA === descB) return true;
  }

  return false;
}
