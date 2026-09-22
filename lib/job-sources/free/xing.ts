import type { JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Rorilo/1.0 (+local job search)';

/** Max detail pages fetched per search; bounds total time. */
const MAX_DETAILS = 12;
/** Parallel detail fetches; polite to the host. */
const CONCURRENCY = 3;

export function xingSearchUrl(keywords: string, location: string): string {
  const params = new URLSearchParams();
  if (keywords) params.set('keywords', keywords);
  if (location) params.set('location', location);
  const qs = params.toString();
  return `https://www.xing.com/jobs/search${qs ? `?${qs}` : ''}`;
}

function cleanText(html: string): string {
  return sanitizeDescription(html).replace(/\s+/g, ' ').trim();
}

export interface XingListItem {
  title: string;
  detailUrl: string;
  company: string;
  location: string;
  facts: string[];
}

/** Split the result list into raw article blocks using the stable test id. */
export function splitTeasers(html: string): string[] {
  const marker = 'data-testid="job-search-result"';
  const parts = html.split(marker);
  parts.shift();
  return parts.map((p) => marker + p.split('data-testid="job-search-result"')[0]);
}

function firstMatch(block: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = block.match(re);
    if (m?.[1]) return cleanText(m[1]);
  }
  return '';
}

export function parseTeaser(block: string): XingListItem | null {
  const linkMatch =
    block.match(/<a[^>]*href="(\/jobs\/[^"]+)"[^>]*aria-label="([^"]*)"/i) ||
    block.match(/aria-label="([^"]*)"[^>]*href="(\/jobs\/[^"]+)"/i);
  // Normalize to [href, label] regardless of attribute order.
  let href = '';
  let label = '';
  if (linkMatch) {
    if (linkMatch[1].startsWith('/jobs/')) {
      href = linkMatch[1];
      label = linkMatch[2] || '';
    } else {
      label = linkMatch[1] || '';
      href = linkMatch[2] || '';
    }
  }
  const title =
    firstMatch(block, [/>job-teaser-list-title"[^>]*>([\s\S]*?)<\/h2>/i]) ||
    cleanText(label.replace(/\..*$/, ''));
  if (!title || !href) return null;

  const company = firstMatch(block, [
    /job-teaser-list-item-styles__Company[^>]*>([\s\S]*?)<\/p>/i,
  ]);
  const locationRaw = firstMatch(block, [
    /multi-location-display-styles__Container[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i,
  ]);
  const location = locationRaw.replace(/\+\s*\d+\s*weitere.*$/i, '').trim();
  const facts = Array.from(
    block.matchAll(/data-xds="Marker"[^>]*>[\s\S]*?<span[^>]*>([^<>]+)<\/span>/gi)
  )
    .map((m) => cleanText(m[1]))
    .filter(Boolean)
    .slice(0, 6);

  return {
    title,
    detailUrl: `https://www.xing.com${href}`,
    company,
    location,
    facts,
  };
}

export interface XingDetail {
  descriptionHtml: string;
  company: string;
  salary: string;
}

export function parseDetail(html: string): XingDetail {
  const descMatch = html.match(/data-testid="expandable-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  const companyMatch = html.match(/job-details-company-info-name"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
  const salaryMatch = html.match(/job-details-salary-card"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  return {
    descriptionHtml: descMatch?.[1] || '',
    company: companyMatch ? cleanText(companyMatch[1]) : '',
    salary: salaryMatch ? cleanText(salaryMatch[1]) : '',
  };
}

function employmentFromFacts(facts: string[]): string | undefined {
  const joined = facts.join(' ').toLowerCase();
  if (/vollzeit|full[- ]?time/.test(joined)) return 'full-time';
  if (/teilzeit|part[- ]?time/.test(joined)) return 'part-time';
  if (/contract|befristet|freelance|freiberuflich/.test(joined)) return 'contract';
  if (/werkstudent|intern|praktik/.test(joined)) return 'internship';
  return undefined;
}

export function normalizeXingJob(item: XingListItem, detail: XingDetail | null): NormalizedJobInput {
  const description = detail ? sanitizeDescription(detail.descriptionHtml) : '';
  const company = detail?.company || item.company || 'Unknown Company';
  const idMatch = item.detailUrl.match(/(\d+)\/?$/);
  return {
    source: 'xing',
    sourceJobId: `xing:${idMatch?.[1] || item.detailUrl}`,
    title: item.title,
    company,
    location: item.location,
    countryCode: 'DE',
    remoteType: detectRemoteType(item.title, `${item.location} ${item.facts.join(' ')}`, description),
    employmentType: employmentFromFacts(item.facts),
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(`${item.title}\n${description}`),
    languageRequirements: [],
    applicationUrl: item.detailUrl,
    originalUrl: item.detailUrl,
    rawData: { facts: item.facts, salaryCard: detail?.salary || undefined },
  };
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Xing responded with status ${res.status}`);
    return await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Xing took too long to respond (timeout). Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** List fetch with one retry — search pages are heavy and occasionally stall. */
async function fetchListHtml(url: string): Promise<string> {
  try {
    return await fetchText(url, 30000);
  } catch (err) {
    if ((err as Error).message.includes('too long')) {
      await new Promise((r) => setTimeout(r, 1500));
      return await fetchText(url, 30000);
    }
    throw err;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function searchXing(params: JobSearchParams): Promise<JobSourceSearchResult> {
  const keywords = [params.title, ...(params.keywords || [])].filter(Boolean).join(' ').trim();
  if (!keywords) throw new Error('Xing needs a job title or keywords.');
  const location = (params.location || '').trim();
  const url = xingSearchUrl(keywords, location);

  const html = await fetchListHtml(url);
  const items = splitTeasers(html)
    .map(parseTeaser)
    .filter((x): x is XingListItem => x !== null)
    .slice(0, Math.max(1, Math.min(params.limit || 15, MAX_DETAILS)));

  if (items.length === 0) {
    return { jobs: [], totalDiscovered: 0, source: 'xing' };
  }

  const jobs = await mapLimit(items, CONCURRENCY, async (item) => {
    try {
      const detailHtml = await fetchText(item.detailUrl);
      return normalizeXingJob(item, parseDetail(detailHtml));
    } catch {
      return normalizeXingJob(item, null);
    }
  });

  return { jobs, totalDiscovered: jobs.length, source: 'xing' };
}
