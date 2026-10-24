import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, type Prisma } from '@prisma/client';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveActiveCv } from '@/lib/cv/store';
import { parsePortableBackup } from '@/lib/data/portable-backup';

let client: PrismaClient;
let directory: string;

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'rorilo-cv-storage-'));
  const file = path.join(directory, 'test.db').split(path.sep).join('/');
  client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const legacy = readFileSync(new URL('./fixtures/database-v0.1.0.sql', import.meta.url), 'utf8');
  const definition = legacy.match(/CREATE TABLE "CV" \([\s\S]*?\);/)?.[0];
  if (!definition) throw new Error('The v0.1.0 CV fixture is missing');
  await client.$executeRawUnsafe(definition);
  await client.$executeRawUnsafe('ALTER TABLE "CV" ADD COLUMN "fileData" BLOB');
  await client.$executeRawUnsafe('ALTER TABLE "CV" ADD COLUMN "mimeType" TEXT');
  await client.$executeRawUnsafe('ALTER TABLE "CV" ADD COLUMN "fileSize" INTEGER');
  await client.cV.create({ data: { id: 'original', originalFilename: 'original.txt', extractedText: 'Original CV', isActive: true } });
});

afterEach(async () => {
  await client?.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('CV storage transactions', () => {
  it('imports JSON-exported CV files through the real Prisma createMany path', async () => {
    const bytes = Uint8Array.from([37, 80, 68, 70, 0, 255]);
    const backup = parsePortableBackup(JSON.parse(JSON.stringify({
      app: 'rorilo', version: 1, tables: { cV: [{ id: 'restored', originalFilename: 'restored.pdf', extractedText: 'Restored CV', fileData: bytes }] },
    })));
    await client.$transaction(async tx => {
      await tx.cV.deleteMany();
      await tx.cV.createMany({ data: backup.tables.cV as Prisma.CVCreateManyInput[] });
    });
    const cv = await client.cV.findUniqueOrThrow({ where: { id: 'restored' } });
    expect(cv.fileData).toEqual(bytes);
    expect(cv.extractedText).toBe('Restored CV');
  });

  it('keeps the old CV active when saving the replacement fails', async () => {
    await client.$executeRawUnsafe(`CREATE TRIGGER fail_cv_insert BEFORE INSERT ON "CV" BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END`);
    await expect(saveActiveCv({ originalFilename: 'new.txt', extractedText: 'New CV' }, client)).rejects.toThrow();
    expect(await client.cV.count()).toBe(1);
    expect((await client.cV.findUniqueOrThrow({ where: { id: 'original' } })).isActive).toBe(true);
  });

  it('rolls back the new CV when deactivating the old one fails', async () => {
    await client.$executeRawUnsafe(`CREATE TRIGGER fail_cv_update BEFORE UPDATE ON "CV" BEGIN SELECT RAISE(ABORT, 'simulated update failure'); END`);
    await expect(saveActiveCv({ originalFilename: 'new.txt', extractedText: 'New CV' }, client)).rejects.toThrow();
    expect(await client.cV.count()).toBe(1);
    expect((await client.cV.findUniqueOrThrow({ where: { id: 'original' } })).isActive).toBe(true);
  });

  it('stores original file bytes and activates only the successfully saved replacement', async () => {
    const bytes = Uint8Array.from([37, 80, 68, 70, 0, 255]);
    const cv = await saveActiveCv({ originalFilename: 'new.pdf', extractedText: 'New CV', fileData: bytes, fileSize: bytes.length, mimeType: 'application/pdf' }, client);
    expect(cv).not.toHaveProperty('fileData');
    expect(await client.cV.count({ where: { isActive: true } })).toBe(1);
    expect((await client.cV.findUniqueOrThrow({ where: { id: 'original' } })).isActive).toBe(false);
    expect((await client.cV.findUniqueOrThrow({ where: { id: cv.id } })).fileData).toEqual(bytes);
  });
});
