import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [server, temp, schema, legacySchema] = process.argv.slice(2);
const bundledRequire = createRequire(path.join(server, 'server.js'));
const { PrismaClient, Prisma } = bundledRequire('@prisma/client');
const migration = path.join(server, 'migrate-desktop-database.mjs');

for (const scenario of ['fresh', 'upgraded']) {
  const database = path.join(temp, `${scenario}.db`);
  if (scenario === 'upgraded') {
    const legacy = new DatabaseSync(database);
    try {
      legacy.exec(readFileSync(legacySchema, 'utf8'));
      legacy.prepare('INSERT INTO "CV" (id, originalFilename, extractedText, updatedAt) VALUES (?, ?, ?, ?)')
        .run('legacy-cv', 'legacy.txt', 'Keep this existing CV', '2026-01-01T00:00:00.000Z');
    } finally {
      legacy.close();
    }
  }
  const prepared = spawnSync(process.execPath, [migration, database, schema], { encoding: 'utf8', timeout: 30_000 });
  assert.ifError(prepared.error);
  assert.equal(prepared.status, 0, prepared.stderr);

  const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + database.split(path.sep).join('/') } } });
  try {
    // Full selections deliberately include every scalar column, including CV bytes.
    for (const { name } of Prisma.dmmf.datamodel.models) {
      await prisma[name[0].toLowerCase() + name.slice(1)].findMany({ take: 1 });
    }
    if (scenario === 'upgraded') {
      const cv = await prisma.cV.findUniqueOrThrow({ where: { id: 'legacy-cv' } });
      assert.equal(cv.extractedText, 'Keep this existing CV');
      assert.equal(cv.fileData, null);
      assert.equal(readdirSync(temp).filter(name => name.startsWith('upgraded.db.before-upgrade-')).length, 1);
    }
    await prisma.userProfile.upsert({ where: { id: 'default' }, create: { firstName: 'Smoke test' }, update: { firstName: 'Smoke test' } });
    await prisma.jobPreference.upsert({ where: { id: 'default' }, create: {}, update: {} });
    for (const delegate of ['aIProviderSettings', 'apifySettings', 'emailSettings', 'logoSettings', 'freeSourceSettings']) {
      await prisma[delegate].upsert({ where: { id: 'default' }, create: {}, update: {} });
    }
    const bytes = new TextEncoder().encode('Stored CV file');
    const cv = await prisma.cV.create({ data: { originalFilename: 'smoke.txt', extractedText: 'Stored CV file', fileData: bytes, fileSize: bytes.length, mimeType: 'text/plain' } });
    assert.deepEqual(Array.from(cv.fileData), Array.from(bytes));
    const job = await prisma.job.create({ data: { deduplicationHash: 'desktop-smoke', title: 'Test role', company: 'Test company', description: 'Test description' } });
    await prisma.jobAnalysis.create({ data: { jobId: job.id } });
    await prisma.jobMatch.create({ data: { jobId: job.id } });
    const application = await prisma.application.create({ data: { jobId: job.id, status: 'INTERVIEW' } });
    await prisma.applicationDocument.create({ data: { applicationId: application.id, type: 'COVER_LETTER', title: 'Test letter', content: 'Test content' } });
    await prisma.applicationEvent.create({ data: { applicationId: application.id, eventType: 'STATUS_CHANGED', description: 'Test event' } });
    const tracker = await prisma.application.findUniqueOrThrow({ where: { id: application.id }, include: { job: { include: { match: true, analysis: true } }, documents: true, events: true } });
    assert.equal(tracker.documents.length, 1);
    assert.equal(tracker.events.length, 1);
    assert.ok(tracker.job.match && tracker.job.analysis);
    await prisma.searchRun.create({ data: { status: 'COMPLETED' } });
    await prisma.job.delete({ where: { id: job.id } });
    for (const delegate of ['application', 'jobMatch', 'jobAnalysis']) {
      assert.equal(await prisma[delegate].count({ where: { jobId: job.id } }), 0);
    }
    for (const delegate of ['applicationDocument', 'applicationEvent']) {
      assert.equal(await prisma[delegate].count({ where: { applicationId: application.id } }), 0);
    }
    console.log(`Packaged ${scenario} database: all ${Prisma.dmmf.datamodel.models.length} models, settings, CV files, tracker relations, and cascade deletion passed.`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
