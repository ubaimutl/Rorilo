'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
}

export function PageHeader({ title, description, back, badge, actions, sticky = true }: PageHeaderProps) {
  return (
    <header className={`min-h-16 px-4 sm:px-6 lg:px-10 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-background/90 backdrop-blur-md z-10 shrink-0 ${sticky ? 'md:sticky md:top-0' : ''}`}>
      <div className="min-w-0 flex-1">
        {back && (
          <Link
            href={back.href}
            className="text-sm font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md motion-safe:transition-colors motion-safe:duration-150 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>{back.label}</span>
          </Link>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="font-heading text-[22px] text-foreground text-balance leading-snug min-w-0">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed max-w-[62ch]">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
