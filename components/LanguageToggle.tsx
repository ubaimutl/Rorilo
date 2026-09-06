'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-primary ${compact ? 'justify-center px-0' : ''}`}
      title={compact ? t('language.switchTo') : undefined}
    >
      <Languages className="size-4 shrink-0 text-neutral-500" />
      {!compact && <span className="sr-only">{t('language.label')}</span>}
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language.switchTo')}
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-medium outline-none"
      >
        {LOCALES.map((item) => (
          <option key={item.code} value={item.code}>
            {compact ? item.shortLabel : item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
