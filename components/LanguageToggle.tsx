'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const currentIndex = Math.max(LOCALES.findIndex((item) => item.code === locale), 0);
  const currentLocale = LOCALES[currentIndex] || LOCALES[0];

  if (compact) {
    const nextLocale = LOCALES[(currentIndex + 1) % LOCALES.length];

    return (
      <button
        type="button"
        onClick={() => setLocale(nextLocale.code)}
        className="flex h-9 w-full items-center justify-center rounded-md text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-primary"
        aria-label={`${t('language.switchTo')}: ${nextLocale.label}`}
        title={`${t('language.switchTo')}: ${nextLocale.label}`}
      >
        <span className="relative flex size-5 items-center justify-center">
          <Languages className="size-4 text-neutral-500" />
          <span className="absolute -bottom-1 -right-1 rounded bg-sidebar px-0.5 text-[9px] leading-3 text-sidebar-foreground">
            {currentLocale.shortLabel}
          </span>
        </span>
      </button>
    );
  }

  return (
    <label
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-primary"
    >
      <Languages className="size-4 shrink-0 text-neutral-500" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language.switchTo')}
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm font-medium shadow-none outline-none"
      >
        {LOCALES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
