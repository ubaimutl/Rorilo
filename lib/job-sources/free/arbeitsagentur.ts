import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';
import { fetchJson } from './utils';
import { normalizeCountryCode } from '../countries';

/**
 * Bundesagentur für Arbeit (Jobsuche) — public endpoint, no registration.
 * Auth is a fixed header value per community docs; contact/application
 * endpoints are intentionally not used (CAPTCHA-protected).
 */
const AA_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const AA_HEADERS = { 'X-API-Key': 'jobboerse-jobsuche' };

export type AaSearchItem = {
  referenznummer?: string;
  stellenangebotsTitel?: string;
  hauptberuf?: string;
  firma?: string;
  stellenlokationen?: Array<{ adresse?: { plz?: string; ort?: string; region?: string } }>;
  veroeffentlichungszeitraum?: { von?: string };
  externeUrl?: string;
  arbeitgeberKundennummerHash?: string;
  arbeitszeitVollzeit?: boolean;
  arbeitszeitTeilzeit?: boolean;
};

export type AaDetails = {
  referenznummer?: string;
  stellenangebotsTitel?: string;
  hauptberuf?: string;
  firma?: string;
  stellenangebotsBeschreibung?: string;
  stellenlokationen?: Array<{ adresse?: { plz?: string; ort?: string; region?: string } }>;
  veroeffentlichungszeitraum?: { von?: string };
  externeUrl?: string;
  arbeitgeberKundennummerHash?: string;
  arbeitszeitVollzeit?: boolean;
  arbeitszeitTeilzeit?: boolean;
  festgehalt?: number;
};

function toBase64(value: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf-8').toString('base64');
  return btoa(unescape(encodeURIComponent(value)));
}

function freshnessDays(datePosted?: string): number | undefined {
  if (datePosted === '24h') return 1;
  if (datePosted === 'week') return 7;
  if (datePosted === 'month') return 30;
  return undefined;
}

function detectGermanRemote(title: string, location: string, description: string): NormalizedJobInput['remoteType'] {
  if (/home[\s-]?office|heim[\s-]?arbeit|telearbeit|mobiles arbeiten|fernarbeit/i.test(`${title} ${location} ${description}`)) {
    return 'remote';
  }
  return detectRemoteType(title, location, description);
}

export function normalizeAaJob(item: AaSearchItem, details: AaDetails | null): NormalizedJobInput {
  const title = (
    details?.stellenangebotsTitel ||
    details?.hauptberuf ||
    item.stellenangebotsTitel ||
    item.hauptberuf ||
    'Untitled Position'
  ).trim();
  const company = (details?.firma || item.firma || 'Unknown Company').trim();
  const adresse = details?.stellenlokationen?.[0]?.adresse || item.stellenlokationen?.[0]?.adresse;
  const location = [adresse?.plz, adresse?.ort].filter(Boolean).join(' ');
  const description = sanitizeDescription(details?.stellenangebotsBeschreibung || '');
  const externeUrl = details?.externeUrl || item.externeUrl;
  const logoHash = details?.arbeitgeberKundennummerHash || item.arbeitgeberKundennummerHash;
  const vollzeit = details?.arbeitszeitVollzeit ?? item.arbeitszeitVollzeit;
  const teilzeit = details?.arbeitszeitTeilzeit ?? item.arbeitszeitTeilzeit;
  const salary = details && typeof details.festgehalt === 'number' && details.festgehalt > 0
    ? { salaryMin: details.festgehalt, salaryMax: details.festgehalt, salaryCurrency: 'EUR' }
    : {};
  return {
    source: 'arbeitsagentur',
    sourceJobId: `aa:${item.referenznummer}`,
    title,
    company,
    companyLogo: logoHash ? `/api/logo?aaLogo=${encodeURIComponent(logoHash)}&size=128` : undefined,
    location: location.trim(),
    countryCode: 'DE',
    remoteType: detectGermanRemote(title, location, description),
    employmentType: vollzeit ? 'full-time' : teilzeit ? 'part-time' : 'full-time',
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${title} ${description}`),
    languageRequirements: [],
    applicationUrl: externeUrl,
    originalUrl: externeUrl,
    datePosted: item.veroeffentlichungszeitraum?.von
      ? new Date(item.veroeffentlichungszeitraum.von)
      : new Date(),
    rawData: {
      search: item as unknown as Record<string, unknown>,
      details: (details || {}) as unknown as Record<string, unknown>,
    },
  };
}

export async function searchArbeitsagentur(params: JobSearchParams): Promise<JobSourceSearchResult> {
  if (normalizeCountryCode(params.country) !== 'DE') {
    return { jobs: [], totalDiscovered: 0, source: 'Arbeitsagentur (Free)', rawPayload: undefined };
  }
  const limit = Math.max(1, Math.min(params.limit || 20, 50));
  const query = new URLSearchParams({
    was: [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler',
    wo: (params.location || 'Berlin').trim(),
    page: '1',
    size: String(limit),
    angebotsart: '1',
  });
  const fresh = freshnessDays(params.datePosted);
  if (fresh !== undefined) query.set('veroeffentlichtseit', String(fresh));
  if (params.remote === 'remote') query.set('arbeitszeit', 'ho');

  const search = (await fetchJson(`${AA_BASE}/pc/v6/jobs?${query.toString()}`, {
    headers: AA_HEADERS,
  })) as { ergebnisliste?: AaSearchItem[] };
  if (!search || !Array.isArray(search.ergebnisliste)) {
    throw new Error('Arbeitsagentur returned an unexpected response. Try again later.');
  }
  const items = search.ergebnisliste.slice(0, limit);

  const jobs: NormalizedJobInput[] = [];
  for (const item of items) {
    let details: AaDetails | null = null;
    if (item.referenznummer) {
      try {
        details = (await fetchJson(
          `${AA_BASE}/pc/v4/jobdetails/${encodeURIComponent(toBase64(item.referenznummer))}`,
          { headers: AA_HEADERS }
        )) as AaDetails;
      } catch {
        details = null;
      }
    }
    jobs.push(normalizeAaJob(item, details));
  }

  return {
    jobs,
    totalDiscovered: jobs.length,
    source: 'Arbeitsagentur (Free)',
    rawPayload: undefined,
  };
}
