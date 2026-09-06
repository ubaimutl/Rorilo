import crypto from 'crypto';
import { Job } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { NormalizedJobInput } from '@/lib/job-sources/types';
import { cleanText, cleanUrl, computeJobHash, descriptionFingerprint } from '@/lib/jobs/deduplicate';

type DeletedFingerprintInput = Pick<
  Job,
  'deduplicationHash' | 'title' | 'company' | 'applicationUrl' | 'originalUrl' | 'description' | 'source'
>;

function toFingerprintData(job: DeletedFingerprintInput) {
  return {
    deduplicationHash: job.deduplicationHash,
    title: job.title,
    company: job.company,
    normalizedTitle: cleanText(job.title),
    normalizedCompany: cleanText(job.company),
    normalizedUrl: cleanUrl(job.applicationUrl || job.originalUrl),
    descriptionSignature: descriptionFingerprint(job.description),
    source: job.source || '',
    deletedAt: new Date(),
  };
}

export async function rememberDeletedJobs(jobs: DeletedFingerprintInput[]) {
  for (const job of jobs) {
    const data = toFingerprintData(job);
    const now = data.deletedAt.toISOString();
    await prisma.$executeRaw`
      INSERT INTO DeletedJobFingerprint (
        id,
        deduplicationHash,
        title,
        company,
        normalizedTitle,
        normalizedCompany,
        normalizedUrl,
        descriptionSignature,
        source,
        deletedAt,
        createdAt
      )
      VALUES (
        ${crypto.randomUUID()},
        ${data.deduplicationHash},
        ${data.title},
        ${data.company},
        ${data.normalizedTitle},
        ${data.normalizedCompany},
        ${data.normalizedUrl},
        ${data.descriptionSignature},
        ${data.source},
        ${now},
        ${now}
      )
      ON CONFLICT(deduplicationHash) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        normalizedTitle = excluded.normalizedTitle,
        normalizedCompany = excluded.normalizedCompany,
        normalizedUrl = excluded.normalizedUrl,
        descriptionSignature = excluded.descriptionSignature,
        source = excluded.source,
        deletedAt = excluded.deletedAt
    `;
  }
}

export async function wasJobDeletedBefore(job: NormalizedJobInput, hash = computeJobHash(job)) {
  const exact = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM DeletedJobFingerprint WHERE deduplicationHash = ${hash} LIMIT 1
  `;
  if (exact.length > 0) return true;

  const normalizedCompany = cleanText(job.company);
  if (!normalizedCompany) return false;

  const normalizedTitle = cleanText(job.title);
  const normalizedUrl = cleanUrl(job.applicationUrl || job.originalUrl);
  const signature = descriptionFingerprint(job.description);

  const candidates = await prisma.$queryRaw<Array<{
    normalizedTitle: string;
    normalizedUrl: string;
    descriptionSignature: string;
  }>>`
    SELECT normalizedTitle, normalizedUrl, descriptionSignature
    FROM DeletedJobFingerprint
    WHERE normalizedCompany = ${normalizedCompany}
    LIMIT 50
  `;

  return candidates.some((candidate) => {
    if (normalizedUrl && candidate.normalizedUrl === normalizedUrl) return true;
    if (signature.length > 180 && candidate.descriptionSignature === signature) return true;
    return normalizedTitle.length > 0 && candidate.normalizedTitle === normalizedTitle;
  });
}
