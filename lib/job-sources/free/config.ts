import { prisma } from '@/lib/prisma';
import type { AtsBoard } from './ats-types';
import { normalizeCountryCode } from '../countries';

export interface FreeSourceKeys {
  adzunaAppId: string;
  adzunaAppKey: string;
  techmapKey: string;
}

const DEFAULT_ENABLED_SOURCES: string[] = [];

function parseStringArray(value: unknown): string[] {
  const out: string[] = [];
  for (const item of parseJsonList(value)) {
    if (typeof item === 'string' && item.trim()) out.push(item);
  }
  return out;
}

function parseStringArrayOrNull(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return parseStringArray(value);
}

function parseJsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function loadRow() {
  try {
    return await prisma.freeSourceSettings.findFirst({ where: { id: 'default' } });
  } catch {
    return null;
  }
}

export type FreeSourceRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;

/** Tolerant row read for API responses (null on stale clients). */
export async function getFreeSourceRow(): Promise<FreeSourceRow | null> {
  return loadRow();
}

/**
 * Settings (DB) win over environment variables for every free-source key.
 */
export async function getFreeSourceKeys(): Promise<FreeSourceKeys> {
  const row = await loadRow();
  const pick = (db: string | undefined, env: string | undefined) =>
    (db || '').trim() || (env || '').trim();
  return {
    adzunaAppId: pick(row?.adzunaAppId, process.env.ADZUNA_APP_ID),
    adzunaAppKey: pick(row?.adzunaAppKey, process.env.ADZUNA_APP_KEY),
    techmapKey: pick(row?.techmapKey, process.env.TECHMAP_API_KEY),
  };
}

export async function getEnabledFreeSources(): Promise<string[]> {
  const row = await loadRow();
  return parseStringArrayOrNull(row?.enabledSources) ?? [...DEFAULT_ENABLED_SOURCES];
}

export function sanitizeBoard(entry: unknown): AtsBoard | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const provider = String(record.provider || '').toLowerCase();
  const board = String(record.board || '').trim();
  const company = String(record.company || '').trim();
  if ((provider !== 'greenhouse' && provider !== 'lever' && provider !== 'ashby' && provider !== 'personio') || !board || !company) {
    return null;
  }
  const countries = parseStringArray(record.countries).map((country) => normalizeCountryCode(country));
  const regions = parseStringArray(record.regions).map((region) => region.toUpperCase());
  const global = record.global === true || (countries.length === 0 && regions.length === 0);
  return {
    provider: provider as AtsBoard['provider'],
    board,
    company,
    countries: countries.length ? countries : undefined,
    regions: regions.length ? regions : undefined,
    global,
  };
}

export async function getCustomAtsBoards(): Promise<AtsBoard[]> {
  const row = await loadRow();
  const custom: AtsBoard[] = [];
  const seen = new Set<string>();
  for (const entry of parseJsonList(row?.customBoards)) {
    const board = sanitizeBoard(entry);
    if (board) {
      const key = `${board.provider}:${board.board.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        custom.push(board);
      }
    }
  }
  return custom;
}

/** User-added company boards, minus boards the user disabled. */
export async function getEffectiveAtsBoards(): Promise<AtsBoard[]> {
  const row = await loadRow();
  const disabled = new Set(
    parseStringArray(row?.disabledBoards).map((board) => board.toLowerCase())
  );
  const custom = await getCustomAtsBoards();
  return custom.filter(
    (entry) => !disabled.has(`${entry.provider}:${entry.board.toLowerCase()}`)
  );
}

export function describeBoardsForSettings(
  effective: AtsBoard[],
  disabledBoards: string[],
  customBoards: AtsBoard[]
): Array<AtsBoard & { custom: boolean; enabled: boolean }> {
  const disabled = new Set(disabledBoards.map((board) => board.toLowerCase()));
  const customs = new Set(customBoards.map((board) => `${board.provider}:${board.board.toLowerCase()}`));
  return effective.map((entry) => {
    const key = `${entry.provider}:${entry.board.toLowerCase()}`;
    return { ...entry, custom: customs.has(key), enabled: !disabled.has(key) };
  });
}
