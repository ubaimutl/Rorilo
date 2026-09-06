'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark, BookmarkCheck, ArrowRight, Trash2, MapPin, Check, Clock, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScoreRing, displayMatchScore, isAiCalibrated } from '@/components/ScoreRing';
import { CompanyLogo } from '@/components/CompanyLogo';

export interface JobCardProps {
  job: {
    id: string;
    title: string;
    company: string;
    companyWebsite?: string | null;
    companyLogo?: string | null;
    location?: string | null;
    remoteType: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    technologies?: string | null;
    postedAt?: string | Date | null;
    viewCount?: number | null;
    source?: string | null;
    sourceLabels?: string[];
    match?: {
      matchScore: number;
      strongMatches: string;
      possibleIssues: string;
      missingSkills: string;
      aiInterpretation?: string | null;
      triageStatus?: string | null;
      triageReason?: string | null;
    } | null;
    application?: {
      status: string;
    } | null;
  };
  onSaveToggle?: (jobId: string, isSaved: boolean) => void;
  onDelete?: (jobId: string) => void;
  selected?: boolean;
  onSelectToggle?: (jobId: string) => void;
}

function parseJsonArray(str?: string | null): string[] {
  if (!str) return [];
  try {
    return JSON.parse(str);
  } catch {
    return [];
  }
}

function companyHref(company: string) {
  return `/companies/${encodeURIComponent(encodeURIComponent(company))}`;
}

export function JobCard({ job, onSaveToggle, onDelete, selected = false, onSelectToggle }: JobCardProps) {
  const isSaved = job.application?.status === 'SAVED';

  const strongMatches = parseJsonArray(job.match?.strongMatches);
  const missingSkills = parseJsonArray(job.match?.missingSkills);
  const possibleIssues = parseJsonArray(job.match?.possibleIssues);
  const techs = parseJsonArray(job.technologies);
  const sourceLabels = job.sourceLabels?.length
    ? job.sourceLabels
    : (job.source || '').split(',').map((source) => source.trim()).filter(Boolean);

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newStatus = isSaved ? 'NEW' : 'SAVED';
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, status: newStatus }),
      });
      if (res.ok && onSaveToggle) {
        onSaveToggle(job.id, !isSaved);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const shouldDelete = window.confirm(`Delete "${job.title}" at ${job.company}?`);
    if (!shouldDelete) return;

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
      });
      if (res.ok && onDelete) {
        onDelete(job.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelectToggle?.(job.id);
  };

  const score = displayMatchScore(job.match);
  const calibrated = isAiCalibrated(job.match);
  const triageStatus = job.match?.triageStatus || 'UNREVIEWED';
  const triageConfig =
    triageStatus === 'WORTH_APPLYING'
      ? { label: 'Worth applying', Icon: Check, className: 'border-neutral-800 bg-neutral-900 text-emerald-400' }
      : triageStatus === 'MAYBE'
      ? { label: 'Maybe', Icon: Clock, className: 'border-neutral-800 bg-neutral-900 text-amber-400' }
      : triageStatus === 'SKIP'
      ? { label: 'Skip', Icon: X, className: 'border-neutral-800 bg-neutral-900 text-red-400' }
      : null;

  let salaryStr = '';
  if (job.salaryMin || job.salaryMax) {
    const curr = job.salaryCurrency || 'USD';
    if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
      salaryStr = `${formatCurrency(job.salaryMin, curr)} – ${formatCurrency(job.salaryMax, curr)}`;
    } else {
      salaryStr = formatCurrency(job.salaryMax || job.salaryMin, curr);
    }
  }

  const metaParts = [
    job.location,
    job.remoteType !== 'unknown'
      ? job.remoteType === 'remote'
        ? 'Remote'
        : job.remoteType === 'hybrid'
        ? 'Hybrid'
        : 'Onsite'
      : null,
  ].filter(Boolean);

  const primarySource = sourceLabels[0];
  const extraSourceCount = Math.max(0, sourceLabels.length - 1);
  const hasMatchExplanation = Boolean(
    job.match?.aiInterpretation ||
    strongMatches.length > 0 ||
    missingSkills.length > 0 ||
    possibleIssues.length > 0
  );

  return (
    <article className="flex flex-col rounded-2xl border border-neutral-200 bg-white px-5 py-5 shadow-xs transition-colors hover:border-neutral-300 group">
      {/* Row Header: Title and Score */}
      <div className="flex items-start justify-between gap-3">
        {onSelectToggle && (
          <div className="pt-1 shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={handleSelect}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${job.title}`}
              className="size-4 rounded-md border-neutral-300 cursor-pointer"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <CompanyLogo
              company={job.company}
              website={job.companyWebsite}
              directLogoUrl={job.companyLogo}
              size={36}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <Link href={`/jobs/${job.id}`} className="group/link flex min-w-0 items-center gap-1.5">
                <h2 className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-neutral-900 transition-colors line-clamp-2 group-hover/link:text-neutral-700">
                  {job.title}
                </h2>
              </Link>
              <Link
                href={companyHref(job.company)}
                className="mt-0.5 inline-flex max-w-full text-sm font-medium text-neutral-800 hover:text-neutral-950 hover:underline"
              >
                <span className="break-words">{job.company}</span>
              </Link>
              <div className="mt-0.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                {metaParts.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-x-1">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{metaParts.join(' · ')}</span>
                  </span>
                )}
                {primarySource && (
                  <Badge variant="outline" className="h-5 max-w-40 truncate px-2 text-[11px] font-normal text-neutral-500">
                    {primarySource}{extraSourceCount > 0 ? ` +${extraSourceCount}` : ''}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Match score ring */}
        <div className="flex items-center shrink-0">
          <ScoreRing score={score} size={46} calibrated={calibrated} />
        </div>
      </div>

      {(salaryStr || techs.length > 0) && (
      <div className="mt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {salaryStr && <span className="text-sm font-semibold text-neutral-900 mr-1">{salaryStr}</span>}
          {techs.slice(0, 3).map((tech) => (
            <Badge key={tech} variant="outline">
              {tech}
            </Badge>
          ))}
          {techs.length > 3 && (
            <span className="text-xs text-neutral-400">+{techs.length - 3} more</span>
          )}
        </div>
      </div>
      )}

      {triageConfig && (
        <div className="mt-3 flex items-center gap-2">
          <Badge variant="outline" className={`triage-badge shrink-0 font-semibold ${triageConfig.className}`}>
            <triageConfig.Icon />
            {triageConfig.label}
          </Badge>
          {job.match?.triageReason && (
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-500 line-clamp-1">
              {job.match.triageReason}
            </span>
          )}
        </div>
      )}

      {/* Match Explanation */}
      {hasMatchExplanation && (
      <div className="mt-3 text-sm text-neutral-600 leading-relaxed">
        {job.match?.aiInterpretation ? (
          <p className="font-normal text-neutral-700 line-clamp-2">
            {job.match.aiInterpretation}
          </p>
        ) : (
          <div className="space-y-1">
            {strongMatches.length > 0 && (
              <p className="line-clamp-1">
                <span className="text-neutral-500 font-medium">Strong match for </span>
                <span className="text-neutral-800 font-medium">{strongMatches.slice(0, 4).join(', ')}</span>.
              </p>
            )}
            {missingSkills.length > 0 && (
              <p className="line-clamp-1">
                <span className="text-neutral-500 font-medium">Missing: </span>
                <span className="text-neutral-700">{missingSkills.slice(0, 3).join(', ')}</span>.
              </p>
            )}
            {possibleIssues.length > 0 && (
              <p className="text-neutral-500 line-clamp-1">
                <span className="font-medium text-neutral-600">Note: </span>
                {possibleIssues[0]}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Bottom meta & View link */}
      <div className="mt-4 flex items-center justify-between gap-2 text-sm pt-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 min-w-0">
          <span className="shrink-0">
            Viewed {job.viewCount || 0} {job.viewCount === 1 ? 'time' : 'times'}
          </span>
          {job.application?.status && job.application.status !== 'NEW' && (
            <>
              <span className="text-neutral-300">·</span>
              <span>Status: <strong className="font-medium text-neutral-600 lowercase">{job.application.status.replace('_', ' ')}</strong></span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleSave}
            className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
            title={isSaved ? 'Remove from saved' : 'Save role'}
          >
            {isSaved ? (
              <BookmarkCheck className="size-4.5 text-neutral-900" />
            ) : (
              <Bookmark className="size-4.5" />
            )}
          </button>
          <button
            onClick={handleDelete}
            className="text-neutral-400 hover:text-red-600 p-1.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
            title="Delete job"
          >
            <Trash2 className="size-4.5" />
          </button>
          <Link
            href={`/jobs/${job.id}`}
            className="font-semibold text-neutral-900 hover:text-neutral-600 flex items-center gap-1.5 transition-colors text-sm ml-1"
          >
            <span>View</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
