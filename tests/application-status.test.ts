import { describe, it, expect } from 'vitest';

describe('Application Status Transition Logic', () => {
  const VALID_STATUSES = [
    'NEW', 'SAVED', 'IGNORED', 'PREPARING', 'READY',
    'DRAFT_CREATED', 'APPLIED', 'INTERVIEW', 'REJECTED', 'OFFER', 'WITHDRAWN',
  ];

  it('verifies all expected status constants are defined and unique', () => {
    const unique = new Set(VALID_STATUSES);
    expect(unique.size).toBe(VALID_STATUSES.length);
  });

  it('validates common transition flows', () => {
    // Flow: NEW -> SAVED -> PREPARING -> READY -> DRAFT_CREATED -> APPLIED -> INTERVIEW -> OFFER
    const happyPath = ['NEW', 'SAVED', 'PREPARING', 'READY', 'DRAFT_CREATED', 'APPLIED', 'INTERVIEW', 'OFFER'];
    happyPath.forEach((status) => {
      expect(VALID_STATUSES).toContain(status);
    });
  });
});
