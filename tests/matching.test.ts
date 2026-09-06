import { describe, it, expect } from 'vitest';
import { calculateDeterministicMatch } from '../lib/matching/engine';

describe('Deterministic Matching Engine', () => {
  const profile = {
    id: 'test',
    currentTitle: 'Senior Full-Stack Engineer',
    yearsExperience: 5,
    skills: JSON.stringify(['TypeScript', 'React', 'Next.js', 'Node.js', 'PostgreSQL']),
    technologies: JSON.stringify(['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL']),
    languages: JSON.stringify(['English']),
  } as any;

  const preferences = {
    id: 'test',
    desiredTitles: JSON.stringify(['Senior Full-Stack Engineer', 'Frontend Engineer']),
    remotePreference: 'remote',
    minSalary: 80000,
    preferredSalary: 100000,
    preferredTechnologies: JSON.stringify(['TypeScript', 'Next.js']),
    technologiesToAvoid: JSON.stringify(['WordPress']),
    excludedKeywords: JSON.stringify(['WordPress']),
    additionalInstructions: 'Avoid WordPress jobs',
  } as any;

  it('calculates high match for well-aligned role', () => {
    const job = {
      title: 'Senior Full-Stack Engineer',
      company: 'TechCorp',
      remoteType: 'remote',
      salaryMin: 95000,
      salaryMax: 120000,
      technologies: JSON.stringify(['TypeScript', 'React', 'Next.js', 'PostgreSQL']),
      seniority: 'Senior',
      languageRequirements: JSON.stringify(['English']),
      description: 'We are looking for a Senior Full-Stack Engineer working in TypeScript and React.',
    } as any;

    const result = calculateDeterministicMatch(job, profile, preferences);
    expect(result.matchScore).toBeGreaterThanOrEqual(85);
    expect(result.strongMatches).toContain('Remote allowed');
    expect(result.breakdown.skillsScore).toBeGreaterThanOrEqual(25);
  });

  it('penalizes jobs containing avoided technologies', () => {
    const wpJob = {
      title: 'WordPress Web Developer',
      company: 'OldAgency',
      remoteType: 'onsite',
      salaryMin: 40000,
      salaryMax: 50000,
      technologies: JSON.stringify(['WordPress', 'PHP']),
      seniority: 'Mid',
      description: 'Building WordPress themes 5 days in office.',
    } as any;

    const result = calculateDeterministicMatch(wpJob, profile, preferences);
    expect(result.matchScore).toBeLessThan(45);
    expect(result.possibleIssues.some((issue) => issue.toLowerCase().includes('wordpress'))).toBe(true);
    expect(result.possibleIssues.some((issue) => issue.toLowerCase().includes('onsite'))).toBe(true);
  });
});
