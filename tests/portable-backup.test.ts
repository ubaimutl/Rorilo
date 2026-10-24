import { describe, expect, it } from 'vitest';
import { parsePortableBackup } from '@/lib/data/portable-backup';

describe('portable backup parsing', () => {
  it('restores CV bytes after an actual JSON export round trip', () => {
    const bytes = Uint8Array.from([0, 10, 37, 80, 68, 70, 255]);
    const input = JSON.parse(JSON.stringify({ app: 'rorilo', version: 1, tables: { cV: [{ id: 'cv', fileData: bytes }] } }));
    expect(parsePortableBackup(input).tables.cV[0].fileData).toEqual(bytes);
  });

  it('restores the older Node Buffer JSON representation', () => {
    const bytes = Buffer.from([0, 128, 255]);
    const input = JSON.parse(JSON.stringify({ app: 'rorilo', version: 1, tables: { cV: [{ id: 'cv', fileData: bytes }] } }));
    expect(parsePortableBackup(input).tables.cV[0].fileData).toEqual(Uint8Array.from(bytes));
  });

  it('rejects malformed CV bytes before backup import can replace data', () => {
    for (const fileData of [{ 0: 256 }, { 0: -1 }, { 0: 1, 2: 3 }, 'broken']) {
      expect(() => parsePortableBackup({ app: 'rorilo', version: 1, tables: { cV: [{ fileData }] } })).toThrow('invalid CV file data');
    }
  });

  it('preserves legacy text-only CV records without file bytes', () => {
    const result = parsePortableBackup({ app: 'rorilo', version: 1, tables: { cV: [{ extractedText: 'Keep original text', fileData: null }] } });
    expect(result.tables.cV[0]).toMatchObject({ extractedText: 'Keep original text', fileData: null });
  });

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
