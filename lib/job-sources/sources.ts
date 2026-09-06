import { countryName, normalizeCountryCode, sourceCoveragePriority, type SourceCoverage } from './countries';

export interface JobSourceDefinition {
  id: string;
  name: string;
  tagline: string;
  coverage: SourceCoverage;
  actorId: string;
  defaultEnabled: boolean;
  recommendedFor?: string[];
  buildInput: (params: {
    title?: string;
    keywords?: string[];
    country?: string;
    location?: string;
    remote?: 'remote' | 'hybrid' | 'onsite' | 'any';
    datePosted?: string;
    limit: number;
  }) => Record<string, unknown>;
}

export const KNOWN_JOB_SOURCES: Record<string, JobSourceDefinition> = {
  // --- German / DACH Specialized Sources ---
  stepstone: {
    id: 'stepstone',
    name: 'StepStone (Germany)',
    tagline: "Germany's leading job portal — structured salary, work model, full details on demand",
    coverage: { countries: ['DE'] },
    actorId: 'trakk/stepstone-jobs-scraper',
    defaultEnabled: true,
    recommendedFor: ['DE'],
    buildInput: ({ title, keywords, location, limit, datePosted }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler';
      return {
        mode: 'SEARCH',
        keywords: [kw],
        location: (location || 'Deutschland').trim().toLowerCase(),
        country: 'DE',
        postedWithin: datePosted === '24h' ? '1d' : datePosted === 'week' ? '7d' : datePosted === 'month' ? '14d' : 'all',
        maxItems: limit,
        maxPagesPerSearch: 3,
        includeDetails: false,
        excludeRecommended: true,
        outputMode: 'compact',
      };
    },
  },
  arbeitsagentur: {
    id: 'arbeitsagentur',
    name: 'Arbeitsagentur (Jobbörse)',
    tagline: 'German Federal Employment Agency — public, administrative & regional jobs',
    coverage: { countries: ['DE'] },
    actorId: 'fatihtahta/arbeitsagentur-scraper',
    defaultEnabled: true,
    recommendedFor: ['DE'],
    buildInput: ({ title, keywords, location, limit }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler';
      const loc = location || 'Berlin';
      const searchUrl = `https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=${encodeURIComponent(kw)}&wo=${encodeURIComponent(loc)}`;
      return {
        startUrls: [{ url: searchUrl }],
        queries: [`${kw} ${loc}`],
        keyword: kw,
        location: loc,
        maxItems: limit,
        maxJobs: limit,
      };
    },
  },
  xing: {
    id: 'xing',
    name: 'Xing Jobs (DACH)',
    tagline: 'Premier business network across Germany, Austria & Switzerland',
    coverage: { countries: ['DE', 'AT', 'CH'], regions: ['DACH'] },
    actorId: 'memo23/xing-scraper',
    defaultEnabled: true,
    recommendedFor: ['DE', 'AT', 'CH'],
    buildInput: ({ title, keywords, location, limit }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler';
      const loc = location || 'Deutschland';
      const searchUrl = `https://www.xing.com/jobs/search?keywords=${encodeURIComponent(kw)}&location=${encodeURIComponent(loc)}`;
      return {
        startUrls: [{ url: searchUrl }],
        keywords: kw,
        location: loc,
        maxItems: limit,
        limit,
      };
    },
  },
  arbeitnow: {
    id: 'arbeitnow',
    name: 'Arbeitnow (Germany)',
    tagline: 'English & German tech, office, and visa-sponsored jobs in Germany',
    coverage: { countries: ['DE'] },
    actorId: 'ninhothedev/arbeitnow-jobs-scraper',
    defaultEnabled: false,
    recommendedFor: ['DE'],
    buildInput: ({ title, keywords, location, limit }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler';
      return {
        query: kw,
        location: location || 'Germany',
        limit,
      };
    },
  },

  // --- Global Leading Job Boards ---
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    tagline: 'Professional corporate roles worldwide',
    coverage: { global: true },
    actorId: 'curious_coder/linkedin-jobs-scraper',
    defaultEnabled: true,
    buildInput: ({ title, keywords, country, location, limit }) => {
      const searchKeywords = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Software Engineer';
      return {
        keywords: searchKeywords,
        location: location || countryName(country) || 'Remote',
        limitPerSource: limit,
        scrapeCompany: false,
        splitByLocation: false,
        under10Applicants: false,
        autoConvertToAiSearch: true,
      };
    },
  },
  indeed: {
    id: 'indeed',
    name: 'Indeed',
    tagline: 'Direct postings & small/mid-size employers',
    coverage: { global: true },
    actorId: 'misceres/indeed-scraper',
    defaultEnabled: true,
    buildInput: ({ title, keywords, location, limit }) => {
      const position = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Software Engineer';
      return {
        position,
        location: location || '',
        maxRows: limit,
      };
    },
  },
  google: {
    id: 'google',
    name: 'Google Jobs',
    tagline: 'Aggregated listings across thousands of career sites',
    coverage: { global: true },
    actorId: 'apify/google-jobs-scraper',
    defaultEnabled: false,
    buildInput: ({ title, keywords, country, location, limit }) => {
      const q = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Software Engineer';
      const query = location ? `${q} in ${location}` : `${q} in ${countryName(country)}`;
      return {
        queries: query,
        maxItems: limit,
      };
    },
  },
  glassdoor: {
    id: 'glassdoor',
    name: 'Glassdoor',
    tagline: 'Employer-verified openings with salary transparency',
    coverage: { global: true },
    actorId: 'bebity/glassdoor-scraper',
    defaultEnabled: false,
    buildInput: ({ title, keywords, location, limit }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Software Engineer';
      return {
        keyword: kw,
        location: location || '',
        limit,
      };
    },
  },
};

/**
 * Resolves an identifier (either a known source id like "stepstone" or an Apify actor ID)
 * into an actorId and appropriate input payload builder.
 */
export function resolveSourceAdapter(sourceOrActor: string) {
  const lower = sourceOrActor.toLowerCase().trim();
  const known = KNOWN_JOB_SOURCES[lower];
  if (known) {
    return {
      sourceId: known.id,
      displayName: known.name,
      actorId: known.actorId,
      buildInput: known.buildInput,
    };
  }

  // Check if it matches an actorId in known sources
  const byActor = Object.values(KNOWN_JOB_SOURCES).find(
    (s) => s.actorId.toLowerCase() === lower
  );
  if (byActor) {
    return {
      sourceId: byActor.id,
      displayName: byActor.name,
      actorId: byActor.actorId,
      buildInput: byActor.buildInput,
    };
  }

  // Legacy StepStone actor kept working for previously saved settings
  if (lower === 'memo23/stepstone-search-cheerio-ppr') {
    return {
      sourceId: 'stepstone',
      displayName: 'StepStone (Legacy)',
      actorId: 'memo23/stepstone-search-cheerio-ppr',
      buildInput: ({ title, keywords, location, limit }: {
        title?: string;
        keywords?: string[];
        country?: string;
        location?: string;
        remote?: 'remote' | 'hybrid' | 'onsite' | 'any';
        limit: number;
      }) => {
        const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Softwareentwickler';
        const loc = location || 'Deutschland';
        return {
          keyword: kw,
          location: loc,
          country: 'de',
          maxItems: limit,
          includeRelatedJobs: false,
          startUrls: [
            {
              url: `https://www.stepstone.de/work/${encodeURIComponent(kw)}/in-${encodeURIComponent(loc)}`,
            },
          ],
        };
      },
    };
  }

  // Custom or arbitrary actor fallback
  return {
    sourceId: sourceOrActor,
    displayName: sourceOrActor.split('/')[1] || sourceOrActor,
    actorId: sourceOrActor,
    buildInput: ({ title, keywords, location, limit }: {
      title?: string;
      keywords?: string[];
      country?: string;
      location?: string;
      remote?: 'remote' | 'hybrid' | 'onsite' | 'any';
      limit: number;
    }) => {
      const kw = [title, ...(keywords || [])].filter(Boolean).join(' ').trim() || 'Software Engineer';
      return {
        keywords: kw,
        title: kw,
        position: kw,
        keyword: kw,
        location: location || '',
        limitPerSource: limit,
        maxRows: limit,
        maxItems: limit,
        rows: limit,
      };
    },
  };
}

/**
 * Built-in actors ordered for the source picker:
 * global boards first, then the selected country, then regional/other sources.
 */
export function orderApifyPicker(
  knownSources: Record<string, JobSourceDefinition> = KNOWN_JOB_SOURCES,
  country?: string
): JobSourceDefinition[] {
  return Object.values(knownSources).sort((a, b) => {
    const countryCode = normalizeCountryCode(country);
    const coverageOrder = sourceCoveragePriority(a.coverage, countryCode) - sourceCoveragePriority(b.coverage, countryCode);
    if (coverageOrder !== 0) return coverageOrder;
    const aRecommended = a.recommendedFor?.includes(countryCode) || false;
    const bRecommended = b.recommendedFor?.includes(countryCode) || false;
    if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;
    if (a.defaultEnabled !== b.defaultEnabled) return a.defaultEnabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Merges a user's saved actor IDs with the built-in source actors so the
 * discovery dialog always offers the app defaults alongside custom actors.
 * Saved actors keep their order and come first.
 */
export function mergeAvailableActors(
  savedActorIds: unknown,
  knownSources: Record<string, JobSourceDefinition> = KNOWN_JOB_SOURCES
): string[] {
  const saved = Array.isArray(savedActorIds)
    ? savedActorIds.map((actor) => String(actor).trim()).filter(Boolean)
    : [];
  const known = Object.values(knownSources).map((source) => source.actorId);
  return Array.from(new Set([...saved, ...known]));
}
