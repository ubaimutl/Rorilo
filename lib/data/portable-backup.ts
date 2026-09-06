import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const BACKUP_VERSION = 1;

const EXPORT_MODELS = [
  'userProfile',
  'cV',
  'jobPreference',
  'aIProviderSettings',
  'apifySettings',
  'emailSettings',
  'logoSettings',
  'freeSourceSettings',
  'job',
  'deletedJobFingerprint',
  'jobAnalysis',
  'jobMatch',
  'application',
  'applicationDocument',
  'applicationEvent',
  'searchRun',
] as const;

const CREATE_ORDER = [
  'userProfile',
  'cV',
  'jobPreference',
  'aIProviderSettings',
  'apifySettings',
  'emailSettings',
  'logoSettings',
  'freeSourceSettings',
  'job',
  'deletedJobFingerprint',
  'jobAnalysis',
  'jobMatch',
  'application',
  'applicationDocument',
  'applicationEvent',
  'searchRun',
] as const;

const DELETE_ORDER = [...CREATE_ORDER].reverse();

const DATE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'uploadDate',
  'datePosted',
  'discoveredAt',
  'lastViewedAt',
  'deletedAt',
  'aiScoredAt',
  'triagedAt',
  'lastCalculatedAt',
  'appliedAt',
  'followUpAt',
  'startedAt',
  'completedAt',
  'tokenExpiry',
]);

export type BackupModelName = (typeof EXPORT_MODELS)[number];

export type PortableBackup = {
  app: 'rorilo';
  version: number;
  exportedAt: string;
  tables: Record<BackupModelName, Array<Record<string, unknown>>>;
};

type PrismaDelegate = {
  findMany: (args?: unknown) => Promise<Array<Record<string, unknown>>>;
  deleteMany: () => Promise<unknown>;
  createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>;
};

type BackupClient = PrismaClient | Prisma.TransactionClient;

function delegateFor(client: BackupClient, model: BackupModelName): PrismaDelegate {
  return (client as unknown as Record<BackupModelName, PrismaDelegate>)[model];
}

function reviveDates(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value === null || value === undefined || !DATE_FIELDS.has(key)) return [key, value];
      if (typeof value !== 'string') return [key, value];
      const date = new Date(value);
      return [key, Number.isNaN(date.getTime()) ? value : date];
    })
  );
}

function normalizeRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

export async function exportPortableBackup(): Promise<PortableBackup> {
  const tables = {} as PortableBackup['tables'];
  for (const model of EXPORT_MODELS) {
    tables[model] = await delegateFor(prisma, model).findMany();
  }
  return {
    app: 'rorilo',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function parsePortableBackup(input: unknown): PortableBackup {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Backup file is not valid JSON.');
  }
  const record = input as Partial<PortableBackup>;
  if ((record.app !== 'rorilo' && record.app !== 'rolevia') || typeof record.version !== 'number' || !record.tables) {
    throw new Error('This is not a Rorilo backup file.');
  }
  const tables = {} as PortableBackup['tables'];
  for (const model of EXPORT_MODELS) {
    tables[model] = normalizeRows((record.tables as Record<string, unknown>)[model]).map(reviveDates);
  }
  return {
    app: 'rorilo',
    version: record.version,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    tables,
  };
}

export async function importPortableBackup(backup: PortableBackup): Promise<Record<BackupModelName, number>> {
  const counts = {} as Record<BackupModelName, number>;

  await prisma.$transaction(async (tx) => {
    for (const model of DELETE_ORDER) {
      await delegateFor(tx, model).deleteMany();
    }
    for (const model of CREATE_ORDER) {
      const rows = backup.tables[model] || [];
      if (rows.length === 0) {
        counts[model] = 0;
        continue;
      }
      const result = await delegateFor(tx, model).createMany({ data: rows });
      counts[model] = result.count;
    }
  });

  return counts;
}
