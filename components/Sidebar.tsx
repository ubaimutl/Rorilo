'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Sparkles, Layers, User, Settings, Command, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from './I18nProvider';
import type { TranslationKey } from '@/lib/i18n';

const NAV_ITEMS = [
  { href: '/', labelKey: 'nav.discover', icon: Briefcase },
  { href: '/prepared', labelKey: 'nav.drafts', icon: Sparkles },
  { href: '/applications', labelKey: 'nav.tracker', icon: Layers },
  { href: '/profile', labelKey: 'nav.profile', icon: User },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
] satisfies Array<{ href: string; labelKey: TranslationKey; icon: React.ElementType }>;

const SIDEBAR_COLLAPSED_KEY = 'rorilo-sidebar-collapsed';

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('rorilo:open-palette'));
}

function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount so server and client markup match.
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  }

  const toggleLabel = collapsed ? t('sidebar.expand') : t('sidebar.collapse');

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex relative bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex-col shrink-0 h-screen sticky top-0 select-none z-20 motion-safe:transition-[width] motion-safe:duration-200',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div
          className={cn(
            'h-16 flex items-center border-b border-sidebar-border shrink-0',
            collapsed ? 'justify-center px-0' : 'px-4'
          )}
        >
          <Link href="/" aria-label="Rorilo home" className="flex items-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:ring-sidebar-ring" title="Rorilo">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary">
              <img
                src="/logos/logo-dark.svg"
                alt=""
                width={18}
                height={18}
                className="size-[18px] object-contain dark:hidden"
              />
              <img
                src="/logos/logo-light.svg"
                alt=""
                width={18}
                height={18}
                className="hidden size-[18px] object-contain dark:block"
              />
            </span>
            {!collapsed && <span className="text-[15px] font-bold text-sidebar-primary tracking-tight">Rorilo</span>}
          </Link>
        </div>

        <nav
          aria-label="Primary"
          className={cn('flex-1 py-4 space-y-1 overflow-y-auto overscroll-contain', collapsed ? 'px-2' : 'px-3')}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, pathname);
            const label = t(item.labelKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center h-11 rounded-2xl text-sm motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none touch-manipulation',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground font-medium'
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={openCommandPalette}
            aria-label={collapsed ? 'Jump to…' : undefined}
            title={collapsed ? 'Jump to…' : undefined}
            className={cn(
              'mt-4 flex w-full items-center rounded-2xl border border-sidebar-border h-11 text-[13px] font-medium text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none touch-manipulation',
              collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            )}
          >
            <Command className="size-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">Jump to…</span>
                <kbd className="rounded-lg border border-sidebar-border px-1.5 py-0.5 font-mono text-[11px] tabular-nums">⌘K</kbd>
              </>
            )}
          </button>
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1 shrink-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:text-sidebar-primary hover:bg-sidebar-accent/70 cursor-pointer',
              collapsed && 'justify-center px-0'
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            )}
            {!collapsed && <span>{toggleLabel}</span>}
          </button>
          <LanguageToggle compact={collapsed} />
          <ThemeToggle iconOnly={collapsed} />
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-sidebar-border bg-sidebar/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, pathname);
            const label = t(item.labelKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className="flex flex-col items-center justify-center gap-1 min-h-[56px] touch-manipulation focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'flex items-center justify-center h-8 w-14 rounded-full motion-safe:transition-colors motion-safe:duration-150',
                    active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground'
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className={cn('text-[10.5px] leading-none', active ? 'font-semibold text-sidebar-primary' : 'font-medium text-sidebar-foreground')}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
