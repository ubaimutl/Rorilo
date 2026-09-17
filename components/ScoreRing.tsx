'use client';

import { cn } from '@/lib/utils';

interface ScoreRingProps {
  score?: number | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
  calibrated?: boolean;
  /** Light-on-dark rendering for use inside filled (primary) surfaces. */
  inverted?: boolean;
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
  if (score >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground/60';
}

export function ScoreRing({ score, size = 48, strokeWidth = 5, className, calibrated = false, inverted = false }: ScoreRingProps) {
  const normalized = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div
      role="img"
      aria-label={`${normalized} percent match${calibrated ? ' (AI calibrated)' : ''}`}
      title={calibrated ? `${normalized}% match — set by AI triage` : `${normalized}% match`}
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={inverted ? 'stroke-white/25 dark:stroke-black/10' : 'stroke-border'}
        />
        <g style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
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
            className={cn('motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500 motion-safe:ease-out', ringTone(normalized))}
          />
        </g>
      </svg>
      <span
        className={cn(
          'absolute font-mono font-semibold tabular-nums',
          inverted ? 'text-white dark:text-neutral-900' : 'text-foreground',
          size >= 56 ? 'text-sm' : 'text-[11px]'
        )}
      >
        {normalized}
      </span>
    </div>
  );
}
