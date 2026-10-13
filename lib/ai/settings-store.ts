import { prisma } from '../prisma';

export type AISettingsRow = {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  providerName: string;
  fallbackProviders: string;
  structuredOutput: boolean;
  disableReasoning: boolean;
  providerOptions: string;
  isConfigured: boolean;
};

type DbAISettingsRow = Omit<AISettingsRow, 'isConfigured'> & {
  isConfigured: boolean | number;
  structuredOutput: boolean | number;
  disableReasoning: boolean | number;
};

export type SaveAISettingsInput = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackProviders: string;
  structuredOutput: boolean;
  disableReasoning: boolean;
  providerOptions: string;
  temperature: number;
  maxTokens: number;
  isConfigured: boolean;
};

const AI_SETTING_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'providerName', ddl: 'ALTER TABLE "AIProviderSettings" ADD COLUMN "providerName" TEXT NOT NULL DEFAULT \'Primary\'' },
  { name: 'fallbackProviders', ddl: 'ALTER TABLE "AIProviderSettings" ADD COLUMN "fallbackProviders" TEXT NOT NULL DEFAULT \'[]\'' },
  { name: 'structuredOutput', ddl: 'ALTER TABLE "AIProviderSettings" ADD COLUMN "structuredOutput" BOOLEAN NOT NULL DEFAULT true' },
  { name: 'disableReasoning', ddl: 'ALTER TABLE "AIProviderSettings" ADD COLUMN "disableReasoning" BOOLEAN NOT NULL DEFAULT true' },
  { name: 'providerOptions', ddl: 'ALTER TABLE "AIProviderSettings" ADD COLUMN "providerOptions" TEXT NOT NULL DEFAULT \'{}\'' },
];

let columnsReady = false;

export async function ensureAISettingsColumns(): Promise<void> {
  if (columnsReady) return;
  // SQLite has no ADD COLUMN IF NOT EXISTS, so check first instead of
  // firing blind ALTERs that fail loudly on every boot.
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'AIProviderSettings'
  `;
  if (tables.length > 0) {
    const existing = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM pragma_table_info('AIProviderSettings')
    `;
    const have = new Set(existing.map((col) => col.name));
    for (const column of AI_SETTING_COLUMNS) {
      if (!have.has(column.name)) {
        await prisma.$executeRawUnsafe(column.ddl);
      }
    }
  }
  columnsReady = true;
}

export async function getAISettingsRow(): Promise<AISettingsRow | null> {
  await ensureAISettingsColumns();
  const rows = await prisma.$queryRaw<DbAISettingsRow[]>`
    SELECT
      id,
      baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens,
      providerName,
      fallbackProviders,
      structuredOutput,
      disableReasoning,
      providerOptions,
      isConfigured
    FROM AIProviderSettings
    WHERE id = 'default'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    isConfigured: Boolean(row.isConfigured),
    structuredOutput: Boolean(row.structuredOutput),
    disableReasoning: Boolean(row.disableReasoning),
  };
}

export async function saveAISettings(input: SaveAISettingsInput): Promise<void> {
  await ensureAISettingsColumns();
  await prisma.$executeRaw`
    INSERT INTO AIProviderSettings (
      id,
      providerName,
      baseUrl,
      apiKey,
      model,
      fallbackProviders,
      structuredOutput,
      disableReasoning,
      providerOptions,
      temperature,
      maxTokens,
      isConfigured,
      createdAt,
      updatedAt
    )
    VALUES (
      'default',
      ${input.providerName},
      ${input.baseUrl},
      ${input.apiKey},
      ${input.model},
      ${input.fallbackProviders},
      ${input.structuredOutput},
      ${input.disableReasoning},
      ${input.providerOptions},
      ${input.temperature},
      ${input.maxTokens},
      ${input.isConfigured},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      providerName = excluded.providerName,
      baseUrl = excluded.baseUrl,
      apiKey = excluded.apiKey,
      model = excluded.model,
      fallbackProviders = excluded.fallbackProviders,
      structuredOutput = excluded.structuredOutput,
      disableReasoning = excluded.disableReasoning,
      providerOptions = excluded.providerOptions,
      temperature = excluded.temperature,
      maxTokens = excluded.maxTokens,
      isConfigured = excluded.isConfigured,
      updatedAt = CURRENT_TIMESTAMP
  `;
}
