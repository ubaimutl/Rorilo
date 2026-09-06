import { describe, expect, it } from 'vitest';
import { parsePortableBackup } from '@/lib/data/portable-backup';

describe('portable backup parsing', () => {
  it('rejects unrelated JSON files', () => {
    expect(() => parsePortableBackup({ app: 'other', version: 1, tables: {} })).toThrow(
      'Rorilo backup'
    );
  });

  it('normalizes missing tables and restores date fields', () => {
    const backup = parsePortableBackup({
      app: 'rorilo',
      version: 1,
      exportedAt: '2026-09-06T00:00:00.000Z',
      tables: {
        job: [
          {
            id: 'job_1',
            title: 'Frontend Developer',
            company: 'Example Labs',
            discoveredAt: '2026-09-05T12:00:00.000Z',
          },
        ],
      },
    });

    expect(backup.tables.job).toHaveLength(1);
    expect(backup.tables.job[0].discoveredAt).toBeInstanceOf(Date);
    expect(backup.tables.application).toEqual([]);
  });

  it('imports legacy Rolevia backups after the rename', () => {
    const backup = parsePortableBackup({
      app: 'rolevia',
      version: 1,
      exportedAt: '2026-09-06T00:00:00.000Z',
      tables: {},
    });

    expect(backup.app).toBe('rorilo');
  });
});
