'use client';

import { cn } from '@/lib/utils';

interface ScoreRingProps {
  score?: number | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
  calibrated?: boolean;
}

export interface MatchScores {
  matchScore?: number | null;
  aiMatchScore?: number | null;
}

/**
 * Prefers the AI-calibrated triage score when present, otherwise the
 * deterministic engine score.
 */
export function displayMatchScore(match?: MatchScores | null): number {
  if (typeof match?.aiMatchScore === 'number') return match.aiMatchScore;
  return match?.matchScore ?? 0;
}

export function isAiCalibrated(match?: MatchScores | null): boolean {
  return typeof match?.aiMatchScore === 'number';
}

function ringTone(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-500 dark:text-amber-400';
  return 'text-neutral-300 dark:text-neutral-600';
}

export function ScoreRing({ score, size = 48, strokeWidth = 4.5, className, calibrated = false }: ScoreRingProps) {
  const normalized = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div
      role="img"
      aria-label={`${normalized} percent match${calibrated ? ' (AI calibrated)' : ''}`}
      title={calibrated ? `${normalized}% match — set by AI triage` : `${normalized}% match`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-neutral-200 dark:stroke-neutral-700/60"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-all', ringTone(normalized))}
        />
      </svg>
      <span
        className={cn(
          'absolute font-bold tabular-nums text-neutral-900 dark:text-neutral-100',
          size >= 56 ? 'text-sm' : 'text-xs'
        )}
      >
        {normalized}
      </span>
    </div>
  );
}
