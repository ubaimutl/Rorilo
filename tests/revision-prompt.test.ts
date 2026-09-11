import { describe, it, expect } from 'vitest';
import {
  REVISION_MAX_TOKENS,
  REVISION_MIN_TOKENS,
  buildCoverLetterPrompt,
  buildEmailPrompt,
  estimateRevisionMaxTokens,
  instructionImpliesShortening,
  isRevisionComplete,
} from '../lib/application/revision-prompt';

const job = {
  title: 'Frontend Developer',
  company: 'Acme Corp',
  description: 'We need React experience and clean testing habits.',
};

const candidate = {
  firstName: 'Jane',
  lastName: 'Doe',
  currentTitle: 'Working Student',
  skills: '["React"]',
  technologies: '["TypeScript"]',
};

const style = { writingTone: 'confident', writingStyle: 'Direct sentences.', aiNotes: '' };

describe('buildCoverLetterPrompt', () => {
  it('grounds the model with role, posting, candidate, voice, instruction, and full text', () => {
    const prompt = buildCoverLetterPrompt({
      job,
      candidate,
      style,
      currentText: 'Dear Hiring Team, I apply for this role.',
      instruction: 'Mention my React experience.',
    });
    expect(prompt).toContain('Frontend Developer at Acme Corp');
    expect(prompt).toContain('We need React experience');
    expect(prompt).toContain('Jane Doe');
    expect(prompt).toContain('Tone: confident');
    expect(prompt).toContain('Direct sentences.');
    expect(prompt).toContain('Mention my React experience.');
    expect(prompt).toContain('Dear Hiring Team, I apply for this role.');
  });

  it('degrades gracefully without profile, style, or description', () => {
    const prompt = buildCoverLetterPrompt({
      job: { title: 'Clerk', company: 'Büro GmbH', description: '' },
      candidate: null,
      style: null,
      currentText: 'Some text here.',
      instruction: 'Fix typos.',
    });
    expect(prompt).toContain('No candidate profile on file.');
    expect(prompt).toContain('no description on file');
    expect(prompt).toContain('Fix typos.');
  });
});

describe('buildEmailPrompt', () => {
  it('includes subject, body, and the instruction', () => {
    const prompt = buildEmailPrompt({
      job,
      candidate,
      style,
      subject: 'Application',
      body: 'Hello, please find my application attached.',
      instruction: 'Make the subject punchier.',
    });
    expect(prompt).toContain('Application');
    expect(prompt).toContain('please find my application attached');
    expect(prompt).toContain('Make the subject punchier.');
  });
});

describe('estimateRevisionMaxTokens', () => {
  it('floors small inputs at the minimum budget', () => {
    expect(estimateRevisionMaxTokens(500)).toBe(REVISION_MIN_TOKENS);
  });

  it('scales with long inputs', () => {
    const scaled = estimateRevisionMaxTokens(15000);
    expect(scaled).toBeGreaterThan(REVISION_MIN_TOKENS);
    expect(scaled).toBeLessThanOrEqual(REVISION_MAX_TOKENS);
  });

  it('caps very long inputs at the maximum budget', () => {
    expect(estimateRevisionMaxTokens(100000)).toBe(REVISION_MAX_TOKENS);
  });
});

describe('instructionImpliesShortening', () => {
  it('detects shortening intent in English and German', () => {
    expect(instructionImpliesShortening('Make it shorter please')).toBe(true);
    expect(instructionImpliesShortening('Kürze den Text etwas')).toBe(true);
  });

  it('does not flag ordinary edits', () => {
    expect(instructionImpliesShortening('Fix the typos in paragraph two')).toBe(false);
  });
});

describe('isRevisionComplete', () => {
  it('accepts full-length revisions', () => {
    expect(
      isRevisionComplete({ inputChars: 3000, outputChars: 2900, instruction: 'Fix typos.' })
    ).toBe(true);
  });

  it('rejects empty or truncated outputs', () => {
    expect(isRevisionComplete({ inputChars: 3000, outputChars: 0, instruction: 'Fix typos.' })).toBe(
      false
    );
    expect(
      isRevisionComplete({ inputChars: 3000, outputChars: 500, instruction: 'Fix typos.' })
    ).toBe(false);
  });

  it('accepts short outputs when shortening was requested', () => {
    expect(
      isRevisionComplete({ inputChars: 3000, outputChars: 500, instruction: 'Make it shorter.' })
    ).toBe(true);
  });
});
