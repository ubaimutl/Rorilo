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

const AI_SETTING_COLUMNS = [
  'ALTER TABLE "AIProviderSettings" ADD COLUMN "providerName" TEXT NOT NULL DEFAULT \'Primary\'',
  'ALTER TABLE "AIProviderSettings" ADD COLUMN "fallbackProviders" TEXT NOT NULL DEFAULT \'[]\'',
  'ALTER TABLE "AIProviderSettings" ADD COLUMN "structuredOutput" BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE "AIProviderSettings" ADD COLUMN "disableReasoning" BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE "AIProviderSettings" ADD COLUMN "providerOptions" TEXT NOT NULL DEFAULT \'{}\'',
];

let columnsReady = false;

export async function ensureAISettingsColumns(): Promise<void> {
  if (columnsReady) return;
  for (const statement of AI_SETTING_COLUMNS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('duplicate column')) {
        throw error;
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
