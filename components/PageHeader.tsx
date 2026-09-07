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
}

export function PageHeader({ title, description, back, badge, actions }: PageHeaderProps) {
  return (
    <header className="min-h-16 px-4 sm:px-6 md:px-10 py-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 bg-background/95 backdrop-blur-xs z-10 shrink-0 md:sticky md:top-0">
      <div className="min-w-0 flex-1">
        {back && (
          <Link
            href={back.href}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5 transition-colors mb-0.5"
          >
            <ArrowLeft className="size-4" />
            <span>{back.label}</span>
          </Link>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-900 tracking-tight truncate">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-neutral-500 mt-0.5 truncate">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
