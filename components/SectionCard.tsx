'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function SectionCard({
  icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-3xl border border-border bg-card shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-border/70">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-heading text-base text-foreground text-balance leading-snug">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-5 sm:px-6 py-5 sm:py-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-foreground"
      >
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
