import { describe, it, expect } from 'vitest';
import { normalizeAdzunaJob } from '../lib/job-sources/free/adzuna';
import { normalizeTechmapJob } from '../lib/job-sources/free/techmap';
import { resolveFreeSource, FREE_SOURCES, FREE_SOURCE_GROUPS, orderFreeSources } from '../lib/job-sources/free';
import { keywordTokens, matchesKeywords, remoteLocationKeeps } from '../lib/job-sources/free/utils';
import { sanitizeBoard, describeBoardsForSettings } from '../lib/job-sources/free/config';
import { summarizeSearchOutcome } from '../lib/jobs/search-summary';
import { normalizeAaJob } from '../lib/job-sources/free/arbeitsagentur';
import { normalizeArbeitnow, normalizeJobicy, normalizeRemoteOk, normalizeRemotive } from '../lib/job-sources/free/remote';
import { parsePersonioXml, personioBaseUrl, normalizePersonio } from '../lib/job-sources/free/personio';
import { resolveSourceAdapter } from '../lib/job-sources/sources';

describe('Free source registry', () => {
  it('exposes the eight free sources', () => {
    expect(Object.keys(FREE_SOURCES).sort()).toEqual(
      ['adzuna', 'arbeitnow', 'arbeitsagentur', 'ats', 'jobicy', 'remoteok', 'remotive', 'techmap']
    );
    expect(resolveFreeSource('ATS')?.name).toBe('Company boards');
    expect(resolveFreeSource('nope')).toBeNull();
  });
});

describe('Adzuna normalization', () => {
  it('maps aggregator rows with euro salaries', () => {
    const job = normalizeAdzunaJob({
      id: '4932517647',
      title: 'Data Coordinator',
      company: { display_name: 'Example Staffing Ltd' },
      location: { display_name: 'Sample City' },
      salary_min: 38000,
      salary_max: 42000,
      description: 'Data entry and <b>maintenance</b> of records.',
      redirect_url: 'https://www.adzuna.de/jobs/land/ad/1',
      created: '2026-08-30T10:00:00Z',
      contract_time: 'full_time',
      contract_type: 'permanent',
    });
    expect(job.source).toBe('adzuna');
    expect(job.sourceJobId).toBe('adzuna:4932517647');
    expect(job.salaryCurrency).toBe('EUR');
    expect(job.salaryMin).toBe(38000);
    expect(job.employmentType).toBe('full-time');
    expect(job.description).toContain('maintenance');
    expect(job.description).not.toContain('<b>');
  });
});

describe('Techmap normalization', () => {
  it('maps JSON-LD payloads with skills and salary bands', () => {
    const job = normalizeTechmapJob({
      title: 'Frontend Developer',
      company: 'Example Finance',
      city: 'Sample City',
      skills: ['React', 'TypeScript'],
      workPlace: ['Hybrid'],
      jsonLD: {
        description: 'Build banking UI with React and TypeScript.',
        datePosted: '2026-08-28',
        employmentType: 'FullTime',
        url: 'https://jobs.example.com/1',
        baseSalary: { currency: 'EUR', value: { minValue: 70000, maxValue: 90000 } },
      },
    });
    expect(job.source).toBe('techmap');
    expect(job.salaryMin).toBe(70000);
    expect(job.salaryCurrency).toBe('EUR');
    expect(job.employmentType).toBe('full-time');
    expect(job.technologies).toContain('React');
  });
});

describe('Remote aggregator normalization', () => {
  it('maps Arbeitnow rows with full descriptions', () => {
    const job = normalizeArbeitnow({
      slug: 'senior-frontend-sample-city-1',
      company_name: 'Example Cloud',
      title: 'Senior Frontend Engineer',
      description: '<p>Build UIs with React.</p>',
      remote: false,
      url: 'https://www.arbeitnow.com/jobs/1',
      tags: ['react'],
      job_types: ['full-time'],
      location: 'Sample City, Exampleland',
      created_at: '2026-08-30T10:00:00Z',
    });
    expect(job.source).toBe('arbeitnow');
    expect(job.description).toContain('Build UIs');
    expect(job.technologies).toContain('React');
  });

  it('maps Jobicy rows with logos', () => {
    const job = normalizeJobicy({
      id: 152149,
      url: 'https://jobicy.com/jobs/1',
      jobTitle: 'Frontend Engineer',
      companyName: 'Example Audio',
      companyLogo: 'https://jobicy.com/logo.png',
      jobDescription: '<p>Music streaming UI.</p>',
      jobGeo: 'Europe',
      pubDate: '2026-08-31T05:00:00Z',
    });
    expect(job.source).toBe('jobicy');
    expect(job.companyLogo).toBe('https://jobicy.com/logo.png');
  });

  it('maps Remote OK rows keeping attribution URLs', () => {
    const job = normalizeRemoteOk({
      id: '1137297',
      slug: 'x',
      company: 'Example Hospitality',
      position: 'Frontend Developer',
      location: 'Sample City, Exampleland',
      description: '<strong>About</strong> the role.',
      apply_url: 'https://example.com/apply',
      url: 'https://remoteok.com/jobs/1',
      salary_min: 60000,
      salary_max: 80000,
      date: '2026-09-02T22:00:00Z',
    });
    expect(job.source).toBe('remoteok');
    expect(job.originalUrl).toBe('https://remoteok.com/jobs/1');
    expect(job.applicationUrl).toBe('https://example.com/apply');
    expect(job.salaryMin).toBe(60000);
  });

  it('maps Remotive rows with salary text', () => {
    const job = normalizeRemotive({
      id: 7,
      title: 'Frontend Developer',
      company_name: 'Example Remote',
      candidate_required_location: 'Germany',
      job_type: 'full_time',
      salary: '$80,000 - $120,000',
      description: 'Remote frontend work.',
      url: 'https://remotive.com/jobs/7',
      publication_date: '2026-09-01T00:00:00Z',
    });
    expect(job.source).toBe('remotive');
    expect(job.employmentType).toBe('full-time');
    expect(job.salaryMin).toBe(80000);
  });

  it('filters remote locations for Germany relevance', () => {
    expect(remoteLocationKeeps('DE', 'Munich', 'Munich, Germany')).toBe(true);
    expect(remoteLocationKeeps('DE', 'Munich', 'Worldwide')).toBe(true);
    expect(remoteLocationKeeps('DE', 'Munich', 'Remote, USA only')).toBe(false);
    expect(remoteLocationKeeps('DE', 'Munich', 'Paris, France')).toBe(false);
    expect(remoteLocationKeeps('FR', undefined, 'Paris, France')).toBe(true);
    expect(remoteLocationKeeps('US', undefined, 'Remote, USA only')).toBe(true);
  });
});

describe('Personio XML feed', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><workzag-jobs><position><id>4103</id><name>Frontend Developer</name><office>Sample City</office><department>IT</department><employmentType>permanent</employmentType><schedule>full-time</schedule><keywords>react, typescript</keywords><createdAt>2026-08-01T10:00:00+0200</createdAt><jobDescriptions><jobDescription><name>Description</name><value><![CDATA[<p>Build React apps.</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>`;

  it('parses positions with CDATA descriptions', () => {
    const postings = parsePersonioXml(xml);
    expect(postings).toHaveLength(1);
    expect(postings[0].name).toBe('Frontend Developer');
    expect(postings[0].description).toContain('Build React apps.');
  });

  it('normalizes postings to jobs', () => {
    const [posting] = parsePersonioXml(xml);
    const job = normalizePersonio(posting, 'Example Product Ltd', 'https://example-product.jobs.personio.de');
    expect(job.source).toBe('personio');
    expect(job.location).toBe('Sample City');
    expect(job.employmentType).toBe('full-time');
    expect(job.technologies).toContain('React');
    expect(job.applicationUrl).toContain('https://example-product.jobs.personio.de/job/4103');
  });

  it('resolves subdomains and full career URLs', () => {
    expect(personioBaseUrl('example-product')).toBe('https://example-product.jobs.personio.de');
    expect(personioBaseUrl('https://example-product.jobs.personio.com/')).toBe('https://example-product.jobs.personio.com');
  });
});

describe('Search summary', () => {
  it('totals new and dismissed roles across sources', () => {
    const summary = summarizeSearchOutcome(
      [
        { source: 'Arbeitsagentur (Free)', discovered: 5, newJobs: 0, duplicates: 0, skippedDeleted: 5 },
        { source: 'Arbeitnow (Free)', discovered: 0, newJobs: 0, duplicates: 0 },
      ],
      []
    );
    expect(summary.newJobs).toBe(0);
    expect(summary.dismissed).toBe(5);
    expect(summary.allQuiet).toBe(true);
    expect(summary.lines).toHaveLength(2);
  });

  it('stays quiet only when nothing happened', () => {
    expect(summarizeSearchOutcome([{ source: 'X', newJobs: 2 }], []).allQuiet).toBe(false);
    expect(
      summarizeSearchOutcome([], [{ source: 'Y', error: 'boom' }]).allQuiet
    ).toBe(false);
  });
});

describe('Free source grouping', () => {
  it('covers every source in exactly one UI group', () => {
    const grouped = FREE_SOURCE_GROUPS.flatMap((group) =>
      Object.values(FREE_SOURCES)
        .filter((source) => source.group === group.id)
        .map((source) => source.id)
    );
    expect(grouped.sort()).toEqual(Object.keys(FREE_SOURCES).sort());
  });

  it('orders global free sources before selected-country sources', () => {
    const ordered = orderFreeSources('DE');
    const firstCountrySource = ordered.findIndex((source) => !source.coverage.global);
    expect(firstCountrySource).toBeGreaterThan(0);
    expect(ordered.slice(0, firstCountrySource).every((source) => source.coverage.global)).toBe(true);
  });
});
describe('Arbeitsagentur normalization', () => {
  it('maps v6 search rows with v4 details', () => {
    const job = normalizeAaJob(
      {
        referenznummer: '12016-10005218441-S',
        stellenangebotsTitel: 'Data Coordinator',
        firma: 'Example Staffing Ltd',
        stellenlokationen: [{ adresse: { plz: '12345', ort: 'Sample City' } }],
        veroeffentlichungszeitraum: { von: '2026-09-01' },
        arbeitgeberKundennummerHash: 'Z-Hash=',
        arbeitszeitVollzeit: true,
      },
      {
        stellenangebotsTitel: 'Data Coordinator',
        stellenangebotsBeschreibung: 'Data entry and record maintenance.',
        firma: 'Example Staffing Ltd',
      }
    );
    expect(job.source).toBe('arbeitsagentur');
    expect(job.sourceJobId).toBe('aa:12016-10005218441-S');
    expect(job.description).toContain('Data entry');
    expect(job.location).toBe('12345 Sample City');
    expect(job.employmentType).toBe('full-time');
    expect(job.companyLogo).toBe('/api/logo?aaLogo=Z-Hash%3D&size=128');
  });

  it('handles snippet-less rows without details', () => {
    const job = normalizeAaJob(
      { referenznummer: '1-2-S', stellenangebotsTitel: 'Assistant', firma: 'Example Shop Ltd' },
      null
    );
    expect(job.description).toBe('');
    expect(job.companyLogo).toBeUndefined();
  });
});

describe('Keyword pre-filter', () => {
  it('tokenizes titles into significant words', () => {
    expect(keywordTokens('Frontend Developer', ['React'])).toEqual(
      expect.arrayContaining(['frontend', 'developer', 'react'])
    );
  });

  it('matches ATS rows permissively', () => {
    expect(matchesKeywords('Senior Frontend Developer', 'Frontend Developer')).toBe(true);
    expect(matchesKeywords('Office Manager', 'Frontend Developer')).toBe(false);
    expect(matchesKeywords('Anything', undefined, undefined)).toBe(true);
  });
});

describe('Board helpers', () => {
  it('sanitizes custom boards strictly', () => {
    expect(sanitizeBoard({ provider: 'Greenhouse', board: '  acme ', company: 'Acme Inc' })).toEqual({
      provider: 'greenhouse',
      board: 'acme',
      company: 'Acme Inc',
      countries: undefined,
      regions: undefined,
      global: true,
    });
    expect(sanitizeBoard({ provider: 'nope', board: 'x', company: 'Y' })).toBeNull();
    expect(sanitizeBoard({ provider: 'lever', board: '', company: 'Y' })).toBeNull();
    expect(sanitizeBoard({ provider: 'personio', board: 'acme', company: 'Acme' })).toEqual({
      provider: 'personio',
      board: 'acme',
      company: 'Acme',
      countries: undefined,
      regions: undefined,
      global: true,
    });
    expect(sanitizeBoard(null)).toBeNull();
  });

  it('flags enabled and custom boards for settings', () => {
    const rows = describeBoardsForSettings(
      [
        { provider: 'greenhouse', board: 'acme', company: 'Acme' },
        { provider: 'lever', board: 'beta', company: 'Beta' },
      ],
      ['greenhouse:acme'],
      [{ provider: 'lever', board: 'beta', company: 'Beta' }]
    );
    expect(rows).toEqual([
      { provider: 'greenhouse', board: 'acme', company: 'Acme', custom: false, enabled: false },
      { provider: 'lever', board: 'beta', company: 'Beta', custom: true, enabled: true },
    ]);
  });

  it('maps posted-date filters to the StepStone actor facet', () => {
    const adapter = resolveSourceAdapter('stepstone');
    const week = adapter.buildInput({ title: 'Dev', limit: 5, datePosted: 'week' }) as Record<string, unknown>;
    expect(week['postedWithin']).toBe('7d');
    const any = adapter.buildInput({ title: 'Dev', limit: 5 }) as Record<string, unknown>;
    expect(any['postedWithin']).toBe('all');
  });
});
