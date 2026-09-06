import { describe, it, expect } from 'vitest';
import { LOCALES, TRANSLATIONS, normalizeLocale, translate } from '../lib/i18n';

function placeholders(text: string): string[] {
  const found = text.match(/\{[a-zA-Z]+\}/g) || [];
  return [...new Set(found)].sort();
}

describe('i18n dictionaries', () => {
  const enKeys = Object.keys(TRANSLATIONS.en).sort();

  it('registers every locale in the switcher', () => {
    expect(LOCALES.map((item) => item.code).sort()).toEqual(
      Object.keys(TRANSLATIONS).sort()
    );
  });

  it.each(Object.keys(TRANSLATIONS))('locale %s covers exactly the English keys', (code) => {
    const locale = code as keyof typeof TRANSLATIONS;
    expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(enKeys);
  });

  it.each(Object.keys(TRANSLATIONS))('locale %s has no empty values', (code) => {
    const locale = code as keyof typeof TRANSLATIONS;
    const empties = Object.entries(TRANSLATIONS[locale])
      .filter(([, value]) => !(value as string).trim())
      .map(([key]) => key);
    expect(empties).toEqual([]);
  });

  it.each(Object.keys(TRANSLATIONS))('locale %s keeps the same placeholders', (code) => {
    const locale = code as keyof typeof TRANSLATIONS;
    if (locale === 'en') return;
    const mismatched = (Object.keys(TRANSLATIONS.en) as Array<keyof typeof TRANSLATIONS.en>)
      .filter(
        (key) =>
          placeholders(TRANSLATIONS.en[key]).join(',') !==
          placeholders(TRANSLATIONS[locale][key] as string).join(',')
      );
    expect(mismatched).toEqual([]);
  });

  it('normalizes unknown locales to English', () => {
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('nl')).toBe('nl');
    expect(normalizeLocale('de')).toBe('de');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
  });

  it('falls back to English and interpolates values', () => {
    expect(translate('es', 'discover.selected', { count: 3 })).toBe('3 seleccionados');
    expect(translate('nl', 'common.saveFailed', { error: 'x' })).toBe('Opslaan mislukt: x');
  });
});
