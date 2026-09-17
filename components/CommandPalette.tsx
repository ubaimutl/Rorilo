'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Sparkles,
  Layers,
  User,
  ListChecks,
  Settings,
  Search,
  CornerDownLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  href: string;
  Icon: React.ElementType;
}

const ITEMS: PaletteItem[] = [
  { id: 'discover', label: 'Discover', hint: 'Find and triage roles', keywords: 'discover find roles jobs search', href: '/', Icon: Briefcase },
  { id: 'drafts', label: 'Drafts', hint: 'Review application materials', keywords: 'drafts cover letter email prepare', href: '/prepared', Icon: Sparkles },
  { id: 'tracker', label: 'Tracker', hint: 'Follow applications to offer', keywords: 'tracker board kanban applications status', href: '/applications', Icon: Layers },
  { id: 'profile', label: 'Profile', hint: 'Background and preferences', keywords: 'profile cv skills preferences', href: '/profile', Icon: User },
  { id: 'setup', label: 'Setup', hint: 'Guided configuration', keywords: 'setup wizard first run', href: '/setup', Icon: ListChecks },
  { id: 'settings', label: 'Settings', hint: 'AI, sources and email', keywords: 'settings ai sources keys', href: '/settings', Icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('rorilo:open-palette', onOpenEvent);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('rorilo:open-palette', onOpenEvent);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus the input on open (desktop command-palette justification).
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open ]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((item) =>
      `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 px-4 pt-[14vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to…"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-100"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = results[active];
                if (item) go(item.href);
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            aria-label="Jump to…"
            placeholder="Jump to…"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
            esc
          </kbd>
        </div>
        <div
          ref={listRef}
          id="palette-list"
          role="listbox"
          aria-label="Pages"
          className="max-h-72 overflow-y-auto overscroll-contain p-1.5"
        >
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches. Try “tracker” or “settings”.
            </p>
          )}
          {results.map((item, i) => {
            const Icon = item.Icon;
            const selected = i === active;
            return (
              <button
                key={item.id}
                id={`palette-${item.id}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left touch-manipulation',
                  selected ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>
                </span>
                {selected && (
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
