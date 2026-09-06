import { describe, it, expect } from 'vitest';
import { cleanText, cleanUrl, computeJobHash, areJobsDuplicates, sameLocation, urlsMatch } from '../lib/jobs/deduplicate';

describe('Job Deduplication Engine', () => {
  it('cleans tracking parameters from URLs', () => {
    const dirty = 'https://jobs.example.com/posting/123?utm_source=linkedin&utm_medium=feed&ref=banner';
    const cleaned = cleanUrl(dirty);
    expect(cleaned).toBe('https://jobs.example.com/posting/123');
  });

  it('identifies identical jobs across different sources or runs', () => {
    const jobA = {
      title: 'Senior Frontend Developer',
      company: 'Acme Inc.',
      location: 'Sample City, Exampleland',
      remoteType: 'remote' as const,
      applicationUrl: 'https://acme.com/jobs/123?utm_source=google',
    };

    const jobB = {
      title: 'Senior Frontend Developer',
      company: 'Acme Inc.',
      location: 'Sample City, Exampleland',
      remoteType: 'remote' as const,
      applicationUrl: 'https://acme.com/jobs/123?utm_source=apify',
    };

    expect(computeJobHash(jobA)).toBe(computeJobHash(jobB));
    expect(areJobsDuplicates(jobA, jobB)).toBe(true);
  });

  it('keeps the same hash when the same job comes from different actor IDs', () => {
    const linkedInJob = {
      source: 'LinkedIn',
      sourceJobId: 'linkedin-123',
      title: 'Data Coordinator',
      company: 'Example Operations Ltd',
      location: 'Sample City',
      remoteType: 'onsite' as const,
      applicationUrl: 'https://example-operations.test/jobs/data-coordinator',
    };

    const indeedJob = {
      source: 'Indeed',
      sourceJobId: 'indeed-999',
      title: 'Data Coordinator',
      company: 'Example Operations Ltd',
      location: 'Sample City',
      remoteType: 'onsite' as const,
      applicationUrl: 'https://example-operations.test/jobs/data-coordinator',
    };

    expect(computeJobHash(linkedInJob)).toBe(computeJobHash(indeedJob));
  });

  it('distinguishes different roles at the same company', () => {
    const jobA = {
      title: 'Senior Frontend Developer',
      company: 'Acme Inc.',
      remoteType: 'remote' as const,
    };

    const jobB = {
      title: 'Backend Python Engineer',
      company: 'Acme Inc.',
      remoteType: 'remote' as const,
    };

    expect(computeJobHash(jobA)).not.toBe(computeJobHash(jobB));
    expect(areJobsDuplicates(jobA, jobB)).toBe(false);
  });

  it('matches the same role across locations with postal codes', () => {
    expect(sameLocation('12345 Sample City', 'Sample City')).toBe(true);
    expect(sameLocation('Sample City, Exampleland', '12345 Sample City')).toBe(true);
    expect(sameLocation('Sample City', 'Other Town')).toBe(false);
    expect(sameLocation('', 'Sample City')).toBe(true);
  });

  it('matches relative and absolute listing URLs across sources', () => {
    expect(
      urlsMatch(
        '/jobs--Office-Internship-Sample-City--12111350-inline.html',
        'https://www.stepstone.de/jobs--Office-Internship-Sample-City--12111350-inline.html?rltr=1'
      )
    ).toBe(true);
    expect(urlsMatch('https://stepstone.de/x', 'https://www.stepstone.de/x')).toBe(true);
    expect(urlsMatch('https://a.com/x', 'https://b.com/y')).toBe(false);
    expect(urlsMatch(null, 'https://a.com/x')).toBe(false);
  });

  it('catches the same StepStone role imported via aggregator and board', () => {
    const aggregatorJob = {
      title: 'Office Internship',
      company: 'Example Learning Center Ltd',
      location: 'Sample City',
      remoteType: 'unknown' as const,
      applicationUrl: 'https://www.adzuna.de/jobs/land/ad/999?v=abc',
    };

    const boardJob = {
      title: 'Office Internship',
      company: 'Example Learning Center Ltd',
      location: '12345 Sample City',
      remoteType: 'unknown' as const,
      applicationUrl: '/jobs--Office-Internship-Sample-City-Example-Learning-Center--12111350-inline.html',
    };

    expect(areJobsDuplicates(aggregatorJob, boardJob)).toBe(true);
  });

  it('keeps stored hashes stable for existing rows', () => {
    expect(
      computeJobHash({
        title: 'Data Coordinator',
        company: 'Example Operations Ltd',
        location: 'Sample City',
        remoteType: 'onsite' as const,
        applicationUrl: 'https://example-operations.test/jobs/data-coordinator',
      })
    ).toBe('780bed8cc34a7d3699bf9c0923c6024ba94d0118da72a86e15354433d57bcc00');
  });
});
