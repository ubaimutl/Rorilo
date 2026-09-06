import { describe, it, expect } from 'vitest';
import { fallbackTriageJobs, normalizeTriageStatus, JobTriageResponseSchema } from '../lib/jobs/triage';
import { displayMatchScore, isAiCalibrated } from '../components/ScoreRing';

describe('Triage status normalization', () => {
  it('accepts exact enum values', () => {
    expect(normalizeTriageStatus('WORTH_APPLYING')).toBe('WORTH_APPLYING');
    expect(normalizeTriageStatus('MAYBE')).toBe('MAYBE');
    expect(normalizeTriageStatus('SKIP')).toBe('SKIP');
  });

  it('normalizes free-form model output', () => {
    expect(normalizeTriageStatus('worth applying')).toBe('WORTH_APPLYING');
    expect(normalizeTriageStatus('SKIP ')).toBe('SKIP');
    expect(normalizeTriageStatus('maybe.')).toBe('MAYBE');
    expect(normalizeTriageStatus(' worth-applying ')).toBe('WORTH_APPLYING');
    expect(normalizeTriageStatus('reject')).toBe('SKIP');
  });

  it('falls back to MAYBE for unknown values', () => {
    expect(normalizeTriageStatus('???')).toBe('MAYBE');
    expect(normalizeTriageStatus(null)).toBe('MAYBE');
    expect(normalizeTriageStatus(undefined)).toBe('MAYBE');
  });

  it('parses sloppy AI responses without throwing', () => {
    const parsed = JobTriageResponseSchema.safeParse({
      results: [
        { jobId: 'a', status: 'worth applying', reason: 'Good fit.' },
        { jobId: 'b', status: 'SKIP ', reason: 'x'.repeat(500) },
        { jobId: 'c', status: 'something unexpected', reason: null },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.results[0].status).toBe('WORTH_APPLYING');
      expect(parsed.data.results[1].status).toBe('SKIP');
      expect(parsed.data.results[1].reason.length).toBeLessThanOrEqual(180);
      expect(parsed.data.results[2].status).toBe('MAYBE');
    }
  });

  it('tolerates missing results arrays', () => {
    const parsed = JobTriageResponseSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.results).toEqual([]);
    }
  });

  it('parses calibrated scores tolerantly', () => {
    const parsed = JobTriageResponseSchema.safeParse({
      results: [
        { jobId: 'a', status: 'SKIP', reason: 'No fit.', score: 22 },
        { jobId: 'b', status: 'MAYBE', reason: '', score: '71%' },
        { jobId: 'c', status: 'WORTH_APPLYING', reason: '', score: 150 },
        { jobId: 'd', status: 'SKIP', reason: '', score: 'high' },
        { jobId: 'e', status: 'SKIP', reason: '' },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const scores = parsed.data.results.map((item) => item.score);
      expect(scores).toEqual([22, 71, 100, null, null]);
    }
  });

  it('prefers the AI score for display when present', () => {
    expect(displayMatchScore({ matchScore: 71, aiMatchScore: 45 })).toBe(45);
    expect(displayMatchScore({ matchScore: 71, aiMatchScore: null })).toBe(71);
    expect(displayMatchScore({ matchScore: 71 })).toBe(71);
    expect(displayMatchScore(null)).toBe(0);
    expect(isAiCalibrated({ matchScore: 71, aiMatchScore: 45 })).toBe(true);
    expect(isAiCalibrated({ matchScore: 71 })).toBe(false);
  });

  it('falls back to deterministic scores when model triage is unavailable', () => {
    const triage = fallbackTriageJobs([
      { id: 'a', title: 'Frontend', company: 'A', location: null, remoteType: 'remote', employmentType: null, description: '', technologies: '[]', requirements: '[]', languageRequirements: '[]', match: { matchScore: 82, strongMatches: '[]', possibleIssues: '[]', missingSkills: '[]' } },
      { id: 'b', title: 'Office', company: 'B', location: null, remoteType: 'onsite', employmentType: null, description: '', technologies: '[]', requirements: '[]', languageRequirements: '[]', match: { matchScore: 58, strongMatches: '[]', possibleIssues: '[]', missingSkills: '[]' } },
      { id: 'c', title: 'Electrician', company: 'C', location: null, remoteType: 'onsite', employmentType: null, description: '', technologies: '[]', requirements: '[]', languageRequirements: '[]', match: { matchScore: 22, strongMatches: '[]', possibleIssues: '[]', missingSkills: '[]' } },
    ]);

    expect(triage.map((item) => item.status)).toEqual(['WORTH_APPLYING', 'MAYBE', 'SKIP']);
    expect(triage[0].reason).toContain('deterministic match score');
  });
});
