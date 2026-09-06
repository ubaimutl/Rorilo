'use client';

import React, { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, normalizeLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
  localStorage.setItem('rorilo-locale', locale);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = normalizeLocale(localStorage.getItem('rorilo-locale'));
    setLocaleState(saved);
    applyLocale(saved);
  }, []);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    applyLocale(nextLocale);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}

/**
 * Renders a translation containing {placeholders} with React nodes,
 * e.g. richText(t('key'), { gmail: <strong>...</strong> }).
 */
export function richText(
  template: string,
  parts: Record<string, React.ReactNode>
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /\{(\w+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) out.push(template.slice(lastIndex, match.index));
    out.push(<Fragment key={key++}>{parts[match[1]] ?? match[0]}</Fragment>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < template.length) out.push(template.slice(lastIndex));
  return out;
}
