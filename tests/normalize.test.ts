import { describe, it, expect } from 'vitest';
import { sanitizeDescription, detectRemoteType, parseSalary, extractContactEmail, extractTechnologies, normalizeJobPayload, resolveSourceUrl } from '../lib/jobs/normalize';

describe('Job Normalization Engine', () => {
  it('sanitizes HTML descriptions safely', () => {
    const rawHtml = '<p>We are hiring a <strong>Developer</strong>!</p><script>alert("xss")</script><ul><li>React</li><li>Node</li></ul>';
    const cleaned = sanitizeDescription(rawHtml);
    expect(cleaned).not.toContain('<script>');
    expect(cleaned).not.toContain('<strong>');
    expect(cleaned).toContain('Developer');
    expect(cleaned).toContain('• React');
  });

  it('detects remote types accurately', () => {
    expect(detectRemoteType('Senior React Dev', 'Remote', '')).toBe('remote');
    expect(detectRemoteType('Full-Stack Engineer (Remote)', 'Sample City', '')).toBe('remote');
    expect(detectRemoteType('Frontend Dev', 'London', 'This is a hybrid position requiring 2 days in office')).toBe('hybrid');
    expect(detectRemoteType('Backend Dev', 'Munich', 'Onsite presence required 5 days a week')).toBe('onsite');
    expect(detectRemoteType('Software Engineer', 'Stockholm', 'Flexible workplace')).toBe('unknown');
  });

  it('parses salary strings into numbers and currencies', () => {
    const res1 = parseSalary('$120,000 - $160,000 / year');
    expect(res1.salaryMin).toBe(120000);
    expect(res1.salaryMax).toBe(160000);
    expect(res1.salaryCurrency).toBe('USD');

    const res2 = parseSalary('€75k - €95k');
    expect(res2.salaryMin).toBe(75000);
    expect(res2.salaryMax).toBe(95000);
    expect(res2.salaryCurrency).toBe('EUR');

    const res3 = parseSalary('Competitive');
    expect(res3.salaryMin).toBeUndefined();
  });

  it('extracts contact emails accurately', () => {
    const text = 'Send your resume directly to careers@acme-corp.de for priority consideration.';
    expect(extractContactEmail(text)).toBe('careers@acme-corp.de');
  });

  it('extracts technologies accurately', () => {
    const text = 'Looking for an engineer proficient in React, TypeScript, Next.js, and Docker.';
    const techs = extractTechnologies(text);
    expect(techs).toContain('React');
    expect(techs).toContain('TypeScript');
    expect(techs).toContain('Next.js');
    expect(techs).toContain('Docker');
    expect(techs).not.toContain('Python');
  });

  it('falls back to snippet fields when no full description exists', () => {
    const job = normalizeJobPayload(
      { id: '1', title: 'Office Internship', companyName: 'Example Office Ltd', textSnippet: 'Tasks: data entry and filing.' },
      'StepStone (Germany)'
    );
    expect(job.description).toContain('data entry');
  });

  it('prefers full descriptions over snippets', () => {
    const job = normalizeJobPayload(
      { id: '1', title: 'Dev', companyName: 'Acme', description: 'Full text here.', textSnippet: 'Short snippet.' },
      'stepstone'
    );
    expect(job.description).toBe('Full text here.');
  });

  it('resolves relative listing URLs against the source domain', () => {
    expect(resolveSourceUrl('/jobs--x-123-inline.html', 'StepStone (Germany)')).toBe(
      'https://www.stepstone.de/jobs--x-123-inline.html'
    );
    expect(resolveSourceUrl('https://www.linkedin.com/jobs/view/1', 'linkedin')).toBe(
      'https://www.linkedin.com/jobs/view/1'
    );
    expect(resolveSourceUrl('/jobs--x-123-inline.html', 'unknown-source')).toBe(
      '/jobs--x-123-inline.html'
    );
  });

  it('stores absolute application URLs for snippet-only payloads', () => {
    const job = normalizeJobPayload(
      { id: '12111350', title: 'Office Internship', companyName: 'Example Office Ltd', url: '/jobs--x--12111350-inline.html', textSnippet: 'Tasks.' },
      'StepStone (Germany)'
    );
    expect(job.applicationUrl).toBe('https://www.stepstone.de/jobs--x--12111350-inline.html');
    expect(job.description).toContain('Tasks');
  });

  it('maps scraper logo URL variants to companyLogo', () => {
    const job = normalizeJobPayload(
      { id: '1', title: 'Dev', companyName: 'Acme', companyLogoUrl: 'https://example.com/logo.png' },
      'stepstone'
    );
    expect(job.companyLogo).toBe('https://example.com/logo.png');
  });

  it('maps trakk rows to absolute URLs, work models, and euro salaries', () => {
    const job = normalizeJobPayload(
      {
        id: 'DEMO-1',
        title: 'Data Coordinator',
        companyName: 'Example Operations Ltd',
        location: 'Sample City',
        workModel: 'Remote',
        salary: '€60,000-€72,000',
        salaryMin: 60000,
        salaryMax: 72000,
        jobUrl: 'https://www.stepstone.de/stellenangebote--x--1-inline.html',
        datePosted: '2026-08-30',
      },
      'StepStone (Germany)'
    );
    expect(job.applicationUrl).toBe('https://www.stepstone.de/stellenangebote--x--1-inline.html');
    expect(job.remoteType).toBe('remote');
    expect(job.salaryMin).toBe(60000);
    expect(job.salaryMax).toBe(72000);
    expect(job.salaryCurrency).toBe('EUR');
  });

  it('prefers full detail text and contact emails from enrichment rows', () => {
    const job = normalizeJobPayload(
      {
        id: 'DEMO-2',
        title: 'Dev',
        companyName: 'Acme',
        descriptionText: 'Full description here.',
        textSnippet: 'Short.',
        contacts: { emails: ['jobs@acme.de'] },
      },
      'StepStone (Details)'
    );
    expect(job.description).toBe('Full description here.');
    expect(job.contactEmail).toBe('jobs@acme.de');
  });
});
