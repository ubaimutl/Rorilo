import type { TranslationKey } from '../i18n';

export type CountryOption = {
  code: string;
  name: string;
  aliases: string[];
  currency: string;
  remoteRegion?: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'DE', name: 'Germany', aliases: ['germany', 'deutschland', 'de', 'berlin', 'munich', 'münchen', 'hamburg', 'köln', 'cologne', 'frankfurt'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'AT', name: 'Austria', aliases: ['austria', 'österreich', 'at', 'vienna', 'wien'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'CH', name: 'Switzerland', aliases: ['switzerland', 'schweiz', 'suisse', 'ch', 'zurich', 'zürich', 'geneva'], currency: 'CHF', remoteRegion: 'europe' },
  { code: 'FR', name: 'France', aliases: ['france', 'fr', 'paris'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'NL', name: 'Netherlands', aliases: ['netherlands', 'holland', 'nl', 'amsterdam'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'GB', name: 'United Kingdom', aliases: ['united kingdom', 'uk', 'great britain', 'gb', 'england', 'london'], currency: 'GBP', remoteRegion: 'europe' },
  { code: 'US', name: 'United States', aliases: ['united states', 'usa', 'u.s.', 'us', 'new york', 'austin', 'san francisco'], currency: 'USD', remoteRegion: 'usa' },
  { code: 'CA', name: 'Canada', aliases: ['canada', 'ca', 'toronto', 'vancouver'], currency: 'CAD', remoteRegion: 'canada' },
  { code: 'AU', name: 'Australia', aliases: ['australia', 'au', 'sydney', 'melbourne'], currency: 'AUD' },
  { code: 'ES', name: 'Spain', aliases: ['spain', 'españa', 'es', 'madrid', 'barcelona'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'IT', name: 'Italy', aliases: ['italy', 'italia', 'it', 'rome', 'milan'], currency: 'EUR', remoteRegion: 'europe' },
  { code: 'PL', name: 'Poland', aliases: ['poland', 'polska', 'pl', 'warsaw', 'krakow'], currency: 'PLN', remoteRegion: 'europe' },
];

export const GLOBAL_REMOTE_ALIASES = ['worldwide', 'global', 'anywhere', 'distributed'];
export const REGION_ALIASES: Record<string, string[]> = {
  EU: ['europe', 'european', 'eu', 'emea'],
  DACH: ['dach', 'germany', 'deutschland', 'austria', 'österreich', 'switzerland', 'schweiz', 'suisse'],
};

export function normalizeCountryCode(value?: string | null): string {
  const raw = (value || '').trim();
  if (!raw) return 'DE';
  const upper = raw.toUpperCase();
  const byCode = COUNTRY_OPTIONS.find((country) => country.code === upper);
  if (byCode) return byCode.code;
  const lower = raw.toLowerCase();
  return COUNTRY_OPTIONS.find((country) => country.aliases.includes(lower))?.code || upper.slice(0, 2);
}

export function countryName(code?: string | null): string {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_OPTIONS.find((country) => country.code === normalized)?.name || normalized;
}

export function currencyForCountry(code?: string | null): string {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_OPTIONS.find((country) => country.code === normalized)?.currency || 'USD';
}

export function countryAliases(code?: string | null): string[] {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_OPTIONS.find((country) => country.code === normalized)?.aliases || [normalized.toLowerCase()];
}

export function countryRegion(code?: string | null): string | undefined {
  const normalized = normalizeCountryCode(code);
  if (['DE', 'AT', 'CH'].includes(normalized)) return 'DACH';
  if (['DE', 'AT', 'CH', 'FR', 'NL', 'GB', 'ES', 'IT', 'PL'].includes(normalized)) return 'EU';
  return undefined;
}

export type SourceCoverage = {
  global?: boolean;
  countries?: string[];
  regions?: string[];
};

export function sourceCoversCountry(coverage: SourceCoverage | undefined, country?: string | null): boolean {
  if (!coverage) return true;
  if (coverage.global) return true;
  const code = normalizeCountryCode(country);
  if (coverage.countries?.map((item) => normalizeCountryCode(item)).includes(code)) return true;
  const region = countryRegion(code);
  const countryRegions = new Set([region]);
  if (region === 'DACH') countryRegions.add('EU');
  return Boolean(coverage.regions?.some((item) => countryRegions.has(item)));
}

export function sourceCoveragePriority(coverage: SourceCoverage | undefined, country?: string | null): number {
  if (!coverage || coverage.global) return 0;
  const code = normalizeCountryCode(country);
  const countries = coverage.countries?.map((item) => normalizeCountryCode(item)) || [];
  if (countries.includes(code)) return 1;
  const region = countryRegion(code);
  const countryRegions = new Set([region]);
  if (region === 'DACH') countryRegions.add('EU');
  if (coverage.regions?.some((item) => countryRegions.has(item))) return 2;
  return 3;
}

export function sourceCoverageLabel(coverage: SourceCoverage | undefined, country?: string | null): string {
  const priority = sourceCoveragePriority(coverage, country);
  if (priority === 0) return 'global';
  if (priority === 1) return normalizeCountryCode(country);
  if (priority === 2) return countryRegion(country) || 'region';
  return 'other';
}

export function sourceCoverageGroupTitle(
  priority: number,
  country?: string | null,
  t: (key: TranslationKey) => string = (key) => key
): string {
  if (priority === 0) return t('sources.global');
  if (priority === 1) return countryName(country);
  if (priority === 2) return countryRegion(country) || t('sources.regional');
  return t('sources.otherCountries');
}
