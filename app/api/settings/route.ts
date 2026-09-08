import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLogoToken } from '@/lib/server-logo';
import { parseProviderOptions, parseSavedProviders, serializeFallbackProviders } from '@/lib/ai/openai-compatible';
import { getAISettingsRow, saveAISettings } from '@/lib/ai/settings-store';
import { publicSettingsError } from '@/lib/security/redact';
import {
  describeBoardsForSettings,
  getCustomAtsBoards,
  getEnabledFreeSources,
  getFreeSourceRow,
} from '@/lib/job-sources/free/config';
import { z } from 'zod';

const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

function maskSecret(secret?: string | null): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function parseStringArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function logoKeyType(token?: string | null): 'publishable' | 'secret' | 'unknown' | null {
  if (!token) return null;
  if (token.startsWith('pk_')) return 'publishable';
  if (token.startsWith('sk_')) return 'secret';
  return 'unknown';
}

function maskFallbackProviders(value?: string | null) {
  return parseSavedProviders(value).map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    enabled: provider.enabled,
    hasApiKey: Boolean(provider.apiKey),
    structuredOutput: provider.structuredOutput !== false,
    disableReasoning: provider.disableReasoning !== false,
    providerOptionsJson: JSON.stringify(provider.providerOptions ?? {}, null, 2),
  }));
}

function parseProviderOptionsJson(value?: string | null): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Provider options must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export async function GET() {
  try {
    const [ai, apify, email] = await Promise.all([
      getAISettingsRow(),
      prisma.apifySettings.findFirst({ where: { id: 'default' } }),
      prisma.emailSettings.findFirst({ where: { id: 'default' } }),
    ]);
    const logoToken = await getLogoToken();
    const logoType = logoKeyType(logoToken);
    const freeRow = await getFreeSourceRow();
    const enabledSources = await getEnabledFreeSources().catch(() => []);
    const customBoards = await getCustomAtsBoards().catch(() => []);
    const savedActorIds = parseStringArray(apify?.actorIds);
    const defaultActorId = apify?.actorId || process.env.APIFY_ACTOR_ID || 'curious_coder/linkedin-jobs-scraper';

    return NextResponse.json({
      ai: {
        baseUrl: ai?.baseUrl || 'https://api.openai.com/v1',
        apiKeyMasked: maskSecret(ai?.apiKey || process.env.AI_API_KEY),
        hasApiKey: Boolean(ai?.apiKey || process.env.AI_API_KEY),
        model: ai?.model || DEFAULT_AI_MODEL,
        providerName: ai?.providerName || 'Primary',
        fallbackProviders: maskFallbackProviders(ai?.fallbackProviders),
        structuredOutput: ai?.structuredOutput ?? true,
        disableReasoning: ai?.disableReasoning ?? true,
        providerOptionsJson: JSON.stringify(parseProviderOptions(ai?.providerOptions), null, 2),
        temperature: ai?.temperature ?? 0.3,
        maxTokens: ai?.maxTokens ?? 2000,
        isConfigured: Boolean(ai?.isConfigured || process.env.AI_API_KEY),
      },
      apify: {
        apiTokenMasked: maskSecret(apify?.apiToken || process.env.APIFY_TOKEN),
        hasToken: Boolean(apify?.apiToken || process.env.APIFY_TOKEN),
        actorId: defaultActorId,
        actorIds: savedActorIds.length > 0 ? savedActorIds : [defaultActorId],
        actorInputTemplate: apify?.actorInputTemplate || '',
        isConfigured: Boolean(apify?.isConfigured || process.env.APIFY_TOKEN),
      },
      email: {
        providerType: email?.providerType || 'gmail',
        userEmail: email?.userEmail || '',
        hasClientId: Boolean(email?.clientId || process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(email?.clientSecret || process.env.GOOGLE_CLIENT_SECRET),
        hasRefreshToken: Boolean(email?.refreshToken),
        isConfigured: Boolean(email?.isConfigured),
      },
      logo: {
        apiTokenMasked: maskSecret(logoToken),
        hasToken: Boolean(logoToken),
        keyType: logoType,
        isConfigured: logoType === 'publishable',
      },
      free: {
        hasSavedSettings: Boolean(freeRow),
        adzuna: {
          hasAppId: Boolean(freeRow?.adzunaAppId || process.env.ADZUNA_APP_ID),
          hasAppKey: Boolean(freeRow?.adzunaAppKey || process.env.ADZUNA_APP_KEY),
        },
        techmap: {
          hasKey: Boolean(freeRow?.techmapKey || process.env.TECHMAP_API_KEY),
        },
        arbeitsagentur: {
          ready: true,
        },
        enabledSources,
        boards: describeBoardsForSettings(
          customBoards,
          parseStringArray(freeRow?.disabledBoards),
          customBoards
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicSettingsError(error) || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

const UpdateAISettingsSchema = z.object({
  providerName: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  fallbackProviders: z
    .array(z.object({
      id: z.string(),
      name: z.string().optional(),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
      model: z.string(),
      enabled: z.boolean().optional(),
      structuredOutput: z.boolean().optional(),
      disableReasoning: z.boolean().optional(),
      providerOptionsJson: z.string().optional(),
    }))
    .optional(),
  structuredOutput: z.boolean().optional(),
  disableReasoning: z.boolean().optional(),
  providerOptionsJson: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

const UpdateApifySettingsSchema = z.object({
  apiToken: z.string().optional(),
  actorId: z.string().optional(),
  actorIds: z.array(z.string()).optional(),
  actorInputTemplate: z.string().optional(),
});

const UpdateEmailSettingsSchema = z.object({
  providerType: z.string().optional(),
  userEmail: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  refreshToken: z.string().optional(),
});

const UpdateLogoSettingsSchema = z.object({
  apiToken: z.string().optional(),
});

const UpdateFreeSettingsSchema = z.object({
  adzunaAppId: z.string().optional(),
  adzunaAppKey: z.string().optional(),
  techmapKey: z.string().optional(),
  enabledSources: z.array(z.string()).optional(),
  disabledBoards: z.array(z.string()).optional(),
  customBoards: z
    .array(z.object({ provider: z.string(), board: z.string(), company: z.string() }))
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { section, data } = body;

    if (section === 'ai') {
      const parsed = UpdateAISettingsSchema.parse(data);
      const existingAi = await getAISettingsRow();

      const nextProviderName = parsed.providerName !== undefined
        ? parsed.providerName.trim() || 'Primary'
        : existingAi?.providerName || 'Primary';
      const nextBaseUrl = parsed.baseUrl !== undefined
        ? parsed.baseUrl.trim() || 'https://api.openai.com/v1'
        : existingAi?.baseUrl || 'https://api.openai.com/v1';
      const nextApiKey = parsed.apiKey !== undefined && parsed.apiKey.trim() !== ''
        ? parsed.apiKey.trim()
        : existingAi?.apiKey || '';
      const nextModel = parsed.model !== undefined
        ? parsed.model.trim() || DEFAULT_AI_MODEL
        : existingAi?.model || DEFAULT_AI_MODEL;
      const nextTemperature = parsed.temperature ?? existingAi?.temperature ?? 0.3;
      const nextMaxTokens = parsed.maxTokens ?? existingAi?.maxTokens ?? 2000;
      const nextStructuredOutput = parsed.structuredOutput ?? existingAi?.structuredOutput ?? true;
      const nextDisableReasoning = parsed.disableReasoning ?? existingAi?.disableReasoning ?? true;
      const nextProviderOptions = parsed.providerOptionsJson !== undefined
        ? parseProviderOptionsJson(parsed.providerOptionsJson)
        : parseProviderOptions(existingAi?.providerOptions);

      let nextFallbackProviders = parseSavedProviders(existingAi?.fallbackProviders);
      if (parsed.fallbackProviders !== undefined) {
        const savedById = new Map(nextFallbackProviders.map((provider) => [provider.id, provider]));
        nextFallbackProviders = parsed.fallbackProviders.map((provider) => {
          const saved = savedById.get(provider.id);
          return {
            id: provider.id,
            name: provider.name || provider.model || 'Fallback',
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey?.trim() || saved?.apiKey || '',
            model: provider.model,
            enabled: provider.enabled !== false,
            structuredOutput: provider.structuredOutput ?? saved?.structuredOutput ?? true,
            disableReasoning: provider.disableReasoning ?? saved?.disableReasoning ?? true,
            providerOptions: provider.providerOptionsJson !== undefined
              ? parseProviderOptionsJson(provider.providerOptionsJson)
              : saved?.providerOptions ?? {},
          };
        });
      }
      const nextFallbackProvidersJson = serializeFallbackProviders(nextFallbackProviders);
      const nextIsConfigured = Boolean(
        nextApiKey ||
        nextFallbackProviders.some((provider) =>
          provider.enabled && provider.baseUrl.trim() && provider.model.trim()
        )
      );

      await saveAISettings({
        providerName: nextProviderName,
        baseUrl: nextBaseUrl,
        apiKey: nextApiKey,
        model: nextModel,
        fallbackProviders: nextFallbackProvidersJson,
        structuredOutput: nextStructuredOutput,
        disableReasoning: nextDisableReasoning,
        providerOptions: JSON.stringify(nextProviderOptions),
        temperature: nextTemperature,
        maxTokens: nextMaxTokens,
        isConfigured: nextIsConfigured,
      });
      return NextResponse.json({ success: true, message: 'AI settings updated successfully' });
    }

    if (section === 'apify') {
      const parsed = UpdateApifySettingsSchema.parse(data);
      const actorIds = parsed.actorIds
        ?.map((actor) => actor.trim())
        .filter(Boolean);
      const primaryActor = actorIds?.[0] || parsed.actorId || 'curious_coder/linkedin-jobs-scraper';
      const updateData: Record<string, unknown> = {};
      if (parsed.apiToken !== undefined && parsed.apiToken.trim() !== '') {
        updateData.apiToken = parsed.apiToken.trim();
        updateData.isConfigured = true;
      }
      if (parsed.actorId !== undefined || actorIds) updateData.actorId = primaryActor;
      if (actorIds) updateData.actorIds = JSON.stringify(Array.from(new Set(actorIds)));
      if (parsed.actorInputTemplate !== undefined) updateData.actorInputTemplate = parsed.actorInputTemplate;

      await prisma.apifySettings.upsert({
        where: { id: 'default' },
        update: updateData,
        create: {
          id: 'default',
          apiToken: parsed.apiToken || '',
          actorId: primaryActor,
          actorIds: JSON.stringify(actorIds && actorIds.length > 0 ? Array.from(new Set(actorIds)) : [primaryActor]),
          actorInputTemplate: parsed.actorInputTemplate || '',
          isConfigured: Boolean(parsed.apiToken),
        },
      });
      return NextResponse.json({ success: true, message: 'Apify settings updated successfully' });
    }

    if (section === 'email') {
      const parsed = UpdateEmailSettingsSchema.parse(data);
      const updateData: Record<string, unknown> = {};
      if (parsed.providerType !== undefined) updateData.providerType = parsed.providerType;
      if (parsed.userEmail !== undefined) updateData.userEmail = parsed.userEmail;
      if (parsed.clientId !== undefined && parsed.clientId.trim() !== '') updateData.clientId = parsed.clientId.trim();
      if (parsed.clientSecret !== undefined && parsed.clientSecret.trim() !== '') updateData.clientSecret = parsed.clientSecret.trim();
      if (parsed.refreshToken !== undefined && parsed.refreshToken.trim() !== '') {
        updateData.refreshToken = parsed.refreshToken.trim();
        updateData.isConfigured = true;
      }

      await prisma.emailSettings.upsert({
        where: { id: 'default' },
        update: updateData,
        create: {
          id: 'default',
          providerType: parsed.providerType || 'gmail',
          userEmail: parsed.userEmail || '',
          clientId: parsed.clientId || '',
          clientSecret: parsed.clientSecret || '',
          refreshToken: parsed.refreshToken || '',
          isConfigured: Boolean(parsed.refreshToken),
        },
      });
      return NextResponse.json({ success: true, message: 'Email settings updated successfully' });
    }

    if (section === 'logo') {
      const parsed = UpdateLogoSettingsSchema.parse(data);
      const updateData: Record<string, unknown> = {};
      if (parsed.apiToken !== undefined && parsed.apiToken.trim() !== '') {
        const apiToken = parsed.apiToken.trim();
        if (!apiToken.startsWith('pk_')) {
          return NextResponse.json(
            { error: 'Use a logo.dev publishable key that starts with pk_. The sk_ secret key is for server APIs, not image logos.' },
            { status: 400 }
          );
        }
        updateData.apiToken = apiToken;
        updateData.isConfigured = true;
      }

      await prisma.logoSettings.upsert({
        where: { id: 'default' },
        update: updateData,
        create: {
          id: 'default',
          apiToken: parsed.apiToken || '',
          isConfigured: Boolean(parsed.apiToken?.startsWith('pk_')),
        },
      });
      return NextResponse.json({ success: true, message: 'Logo settings updated successfully' });
    }

    if (section === 'free') {
      const parsed = UpdateFreeSettingsSchema.parse(data);
      const updateData: Record<string, unknown> = {};
      const keyFields = ['adzunaAppId', 'adzunaAppKey', 'techmapKey'] as const;
      let hasAnyKey = false;
      for (const field of keyFields) {
        const value = parsed[field];
        if (value !== undefined && value.trim() !== '') {
          updateData[field] = value.trim();
          hasAnyKey = true;
        }
      }
      if (parsed.enabledSources !== undefined) {
        updateData.enabledSources = JSON.stringify(
          parsed.enabledSources.map((source) => source.trim()).filter(Boolean)
        );
      }
      if (parsed.disabledBoards !== undefined) {
        updateData.disabledBoards = JSON.stringify(
          parsed.disabledBoards.map((board) => board.trim()).filter(Boolean)
        );
      }
      if (parsed.customBoards !== undefined) {
        const { sanitizeBoard } = await import('@/lib/job-sources/free/config');
        const boards = [];
        for (const entry of parsed.customBoards) {
          const board = sanitizeBoard(entry);
          if (board) boards.push(board);
        }
        updateData.customBoards = JSON.stringify(boards);
      }
      if (hasAnyKey) updateData.isConfigured = true;

      await prisma.freeSourceSettings.upsert({
        where: { id: 'default' },
        update: updateData,
        create: {
          id: 'default',
          adzunaAppId: parsed.adzunaAppId || '',
          adzunaAppKey: parsed.adzunaAppKey || '',
          techmapKey: parsed.techmapKey || '',
          enabledSources: JSON.stringify(parsed.enabledSources || []),
          disabledBoards: JSON.stringify(parsed.disabledBoards || []),
          customBoards: JSON.stringify(parsed.customBoards || []),
          isConfigured: hasAnyKey,
        },
      });
      return NextResponse.json({ success: true, message: 'Free source settings updated successfully' });
    }

    return NextResponse.json({ error: 'Unknown settings section' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: publicSettingsError(error) || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
