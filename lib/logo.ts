const DOMAIN_RE =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,}$/i;

const LOGO_PROXY_VERSION = '2';

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain.trim());
}

export function extractDomain(input?: string | null): string | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value || value.includes(' ')) return null;
  if (DOMAIN_RE.test(value)) return value.replace(/^www\./, '');
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '');
    return DOMAIN_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function logoProxyUrl(domain: string, size = 64): string {
  const clamped = Math.max(16, Math.min(512, Math.round(size) || 64));
  return `/api/logo?domain=${encodeURIComponent(domain)}&size=${clamped}&v=${LOGO_PROXY_VERSION}`;
}

const JOB_BOARD_DOMAINS = [
  'stepstone.de',
  'stepstone.at',
  'stepstone.be',
  'linkedin.com',
  'indeed.com',
  'arbeitsagentur.de',
  'xing.com',
  'glassdoor.com',
  'glassdoor.de',
  'kununu.com',
  'ziprecruiter.com',
  'monster.com',
  'monster.de',
  'careerbuilder.com',
  'totaljobs.com',
  'jobs.de',
];

export function isJobBoardDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, '');
  return JOB_BOARD_DOMAINS.some(
    (board) => normalized === board || normalized.endsWith(`.${board}`)
  );
}

/**
 * Returns a usable logo domain for a company website, or null when the
 * website is missing or just a job-board company page (which would resolve
 * to the board's own logo instead of the company's).
 */
export function logoDomainFor(website?: string | null): string | null {
  const domain = extractDomain(website);
  if (!domain || isJobBoardDomain(domain)) return null;
  return domain;
}

export function logoNameProxyUrl(company: string, size = 64): string {
  const clamped = Math.max(16, Math.min(512, Math.round(size) || 64));
  const name = company.trim().replace(/\s+/g, ' ').slice(0, 80);
  return `/api/logo?name=${encodeURIComponent(name)}&size=${clamped}&v=${LOGO_PROXY_VERSION}`;
}

export function compactCompanyName(company: string): string {
  return company
    .replace(/\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ug|ag|se|inc\.?|llc|ltd\.?|limited|corp\.?|corporation|kg|ohg)\b/gi, '')
    .replace(/\s*[|·-]\s*(karriere|jobs|career|careers)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asRawObject(rawData: unknown): Record<string, unknown> | null {
  if (!rawData) return null;
  if (typeof rawData === 'string') {
    try {
      const parsed: unknown = JSON.parse(rawData);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof rawData === 'object' ? (rawData as Record<string, unknown>) : null;
}

/**
 * Reads a company logo URL straight from a stored raw scraper payload.
 * Used at read time so older rows benefit without any database writes.
 */
export function storedLogoFromRaw(rawData: unknown): string | null {
  const raw = asRawObject(rawData);
  if (!raw) return null;
  for (const key of ['companyLogo', 'companyLogoUrl', 'logo', 'logoUrl']) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function withStoredLogo<T extends { companyLogo?: string | null; rawData?: unknown }>(
  job: T
): T {
  if (job.companyLogo) return job;
  const fallback = storedLogoFromRaw(job.rawData);
  return fallback ? { ...job, companyLogo: fallback } : job;
}
