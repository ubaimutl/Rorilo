import type { JobSearchParams, NormalizedJobInput } from '../types';
import {
  detectRemoteType,
  extractTechnologies,
  sanitizeDescription,
} from '../../jobs/normalize';
import { matchesKeywords, remoteLocationKeeps } from './utils';
import { normalizeCountryCode } from '../countries';

export interface PersonioPosting {
  id: string;
  name: string;
  office: string;
  department: string;
  employmentType: string;
  seniority: string;
  schedule: string;
  keywords: string;
  createdAt: string;
  description: string;
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

/**
 * Purpose-built parser for the documented Personio career-site XML feed.
 * No dependency needed — the schema is small and stable.
 */
export function parsePersonioXml(xml: string): PersonioPosting[] {
  const postings: PersonioPosting[] = [];
  const blocks = xml.match(/<position[\s>][\s\S]*?<\/position>/gi) || [];
  for (const block of blocks) {
    const descriptions: string[] = [];
    const descBlocks =
      block.match(/<jobDescription>([\s\S]*?)<\/jobDescription>/gi) || [];
    for (const desc of descBlocks) {
      const value = stripCdata(extractTag(desc, 'value'));
      if (value) descriptions.push(value);
    }
    postings.push({
      id: stripCdata(extractTag(block, 'id')),
      name: stripCdata(extractTag(block, 'name')),
      office: stripCdata(extractTag(block, 'office')),
      department: stripCdata(extractTag(block, 'department')),
      employmentType: stripCdata(extractTag(block, 'employmentType')),
      seniority: stripCdata(extractTag(block, 'seniority')),
      schedule: stripCdata(extractTag(block, 'schedule')),
      keywords: stripCdata(extractTag(block, 'keywords')),
      createdAt: stripCdata(extractTag(block, 'createdAt')),
      description: descriptions.join('\n\n'),
    });
  }
  return postings;
}

export function personioBaseUrl(board: string): string {
  const trimmed = board.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '');
  return `https://${trimmed}.jobs.personio.de`;
}

function mapPersonioEmployment(posting: PersonioPosting): string | undefined {
  const text = `${posting.schedule} ${posting.employmentType}`.toLowerCase();
  if (text.includes('full')) return 'full-time';
  if (text.includes('part')) return 'part-time';
  if (text.includes('intern') || text.includes('student') || text.includes('trainee')) return 'internship';
  if (text.includes('freelance') || text.includes('contract')) return 'contract';
  return undefined;
}

export function normalizePersonio(
  posting: PersonioPosting,
  company: string,
  baseUrl: string,
  country?: string
): NormalizedJobInput {
  const description = sanitizeDescription(posting.description);
  return {
    source: 'personio',
    sourceJobId: `personio:${baseUrl}:${posting.id}`,
    title: (posting.name || 'Untitled Position').trim(),
    company,
    location: (posting.office || '').trim(),
    countryCode: country ? normalizeCountryCode(country) : undefined,
    remoteType: detectRemoteType(posting.name, posting.office, description),
    employmentType: mapPersonioEmployment(posting),
    seniority: posting.seniority || undefined,
    description,
    requirements: [],
    responsibilities: [],
    benefits: [],
    technologies: extractTechnologies(
      `${posting.name} ${posting.department} ${posting.keywords} ${description}`
    ),
    languageRequirements: [],
    applicationUrl: posting.id ? `${baseUrl}/job/${posting.id}?language=en` : undefined,
    originalUrl: posting.id ? `${baseUrl}/job/${posting.id}?language=en` : undefined,
    datePosted: posting.createdAt ? new Date(posting.createdAt) : new Date(),
    rawData: posting as unknown as Record<string, unknown>,
  };
}

async function fetchPersonioFeed(baseUrl: string): Promise<PersonioPosting[]> {
  let lastError: unknown = null;
  for (const language of ['en', 'de']) {
    try {
      const response = await fetch(`${baseUrl}/xml?language=${language}`, {
        headers: { Accept: 'application/xml' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = new Error(`Personio feed responded ${response.status}`);
        continue;
      }
      const xml = await response.text();
      const postings = parsePersonioXml(xml);
      if (postings.length > 0) return postings;
    } catch (error) {
      lastError = error;
      continue;
    }
  }
  if (lastError) {
    throw new Error(
      `Personio board "${baseUrl}" is unreachable. Check the board URL in Settings.`
    );
  }
  return [];
}

export async function fetchPersonioBoard(
  board: string,
  company: string,
  params: JobSearchParams
): Promise<NormalizedJobInput[]> {
  const baseUrl = personioBaseUrl(board);
  const postings = await fetchPersonioFeed(baseUrl);
  return postings
    .map((posting) => normalizePersonio(posting, company, baseUrl, params.country))
    .filter(
      (job) =>
        matchesKeywords(`${job.title} ${job.technologies.join(' ')}`, params.title, params.keywords) &&
        remoteLocationKeeps(params.country, params.location, job.location || '')
    );
}
