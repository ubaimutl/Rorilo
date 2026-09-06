'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from './I18nProvider';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('rorilo-theme', theme);
}

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');
  const { t } = useI18n();

  useEffect(() => {
    const saved = localStorage.getItem('rorilo-theme');
    const initialTheme = saved === 'dark' || saved === 'light' ? saved : 'light';
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const currentLabel = theme === 'dark' ? t('theme.dark') : t('theme.light');
  const nextLabel = nextTheme === 'dark' ? t('theme.dark') : t('theme.light');

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground transition-colors hover:text-sidebar-primary hover:bg-sidebar-accent/70 cursor-pointer ${iconOnly ? 'justify-center px-0' : ''}`}
      aria-label={t('theme.switchTo', { theme: nextLabel })}
      title={t('theme.switchTo', { theme: nextLabel })}
    >
      {theme === 'dark' ? <Moon className="size-4 shrink-0 text-neutral-500" /> : <Sun className="size-4 shrink-0 text-neutral-500" />}
      {!iconOnly && <span>{currentLabel}</span>}
    </button>
  );
}
