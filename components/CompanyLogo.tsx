'use client';

import React, { useEffect, useState } from 'react';
import { compactCompanyName, logoDomainFor, logoNameProxyUrl, logoProxyUrl } from '@/lib/logo';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  company: string;
  website?: string | null;
  directLogoUrl?: string | null;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const words = name
    .replace(/[()]/g, ' ')
    .split(/[\s\-/&]+/)
    .filter((word) => word && /[a-zA-Z0-9]/.test(word[0]));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export function CompanyLogo({
  company,
  website,
  directLogoUrl,
  size = 32,
  className,
}: CompanyLogoProps) {
  const domain = logoDomainFor(website);
  const direct = directLogoUrl?.trim() || null;
  const cleanName = compactCompanyName(company);
  const candidates = [
    domain ? logoProxyUrl(domain, size * 2) : null,
    direct,
    company.trim().length >= 2 ? logoNameProxyUrl(company, size * 2) : null,
    cleanName && cleanName !== company.trim() ? logoNameProxyUrl(cleanName, size * 2) : null,
  ].filter((src): src is string => Boolean(src));

  const [attempt, setAttempt] = useState(0);
  const candidateKey = candidates.join('|');

  useEffect(() => {
    setAttempt(0);
  }, [candidateKey]);

  const src = candidates[attempt] ?? null;

  if (!src) {
    const hue = hueFor(company);
    return (
      <span
        aria-hidden="true"
        title={company}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * 0.34)),
          backgroundColor: `hsl(${hue} 70% 90%)`,
          color: `hsl(${hue} 45% 30%)`,
        }}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none',
          className
        )}
      >
        {initials(company)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`${company} logo`}
      title={company}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      onError={() => setAttempt((current) => current + 1)}
      className={cn('shrink-0 rounded-full bg-white object-contain', className)}
    />
  );
}
