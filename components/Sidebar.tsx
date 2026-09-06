'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Sparkles, Layers, User, Settings, ListChecks, ChevronsLeft, ChevronsRight, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from './I18nProvider';
import type { TranslationKey } from '@/lib/i18n';

const SIDEBAR_COLLAPSED_KEY = 'rorilo-sidebar-collapsed';

const NAV_ITEMS = [
  { href: '/', labelKey: 'nav.discover', icon: Briefcase },
  { href: '/prepared', labelKey: 'nav.drafts', icon: Sparkles },
  { href: '/applications', labelKey: 'nav.tracker', icon: Layers },
  { href: '/profile', labelKey: 'nav.profile', icon: User },
  { href: '/setup', labelKey: 'nav.setup', icon: ListChecks },
] satisfies Array<{ href: string; labelKey: TranslationKey; icon: React.ElementType }>;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) {
        setCollapsed(stored === '1');
      } else if (window.matchMedia('(max-width: 767px)').matches) {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, current ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !current;
    });
  };

  const setCollapsedPersistent = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // On mobile the sidebar is a drawer: navigating closes it again.
  const closeDrawerOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setCollapsedPersistent(true);
    }
  };

  return (
    <>
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsedPersistent(false)}
          aria-label="Open navigation"
          title="Open navigation"
          className="md:hidden fixed bottom-4 left-4 z-40 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg cursor-pointer"
        >
          <Menu className="size-5" />
        </button>
      )}
      {!collapsed && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setCollapsedPersistent(true)}
          aria-hidden="true"
        />
      )}
    <aside
      className={cn(
        'relative bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col shrink-0 h-screen sticky top-0 select-none z-20 transition-[width] duration-200 ease-in-out max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl',
        collapsed ? 'w-[68px] max-md:hidden' : 'w-56'
      )}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-10 flex size-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground transition-colors hover:text-sidebar-primary cursor-pointer"
      >
        {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
      </button>

      {/* Brand */}
      <div className={cn('h-14 flex items-center border-b border-sidebar-border shrink-0', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Link href="/" onClick={closeDrawerOnMobile} className="flex items-center gap-2.5 group" title="Rorilo">
          <img
            src="/logos/logo-light.svg"
            alt="Rorilo"
            className="size-6 object-contain transition-transform group-hover:scale-95 dark:hidden"
          />
          <img
            src="/logos/logo-dark.svg"
            alt="Rorilo"
            className="hidden size-6 object-contain transition-transform group-hover:scale-95 dark:block"
          />
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-primary tracking-tight">Rorilo</span>
          )}
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {!collapsed && (
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-neutral-600">
            {t('app.workspace')}
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const label = t(item.labelKey);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeDrawerOnMobile}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent/70'
              )}
            >
              <Icon className={cn('size-4 shrink-0', isActive ? 'text-sidebar-accent-foreground' : 'text-neutral-500')} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Settings Navigation with safe padding */}
      <div className={cn('border-t border-sidebar-border pb-6 shrink-0 space-y-2', collapsed ? 'px-3' : 'p-3')}>
        <LanguageToggle compact={collapsed} />
        <ThemeToggle iconOnly={collapsed} />
        <Link
          href="/settings"
          onClick={closeDrawerOnMobile}
          title={collapsed ? t('nav.settings') : undefined}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            collapsed && 'justify-center px-0',
            pathname === '/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
              : 'text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent/70'
          )}
        >
          <Settings className={cn('size-4 shrink-0', pathname === '/settings' ? 'text-sidebar-accent-foreground' : 'text-neutral-500')} />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </Link>
      </div>
    </aside>
    </>
  );
}
