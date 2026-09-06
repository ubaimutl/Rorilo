'use client';

import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, History, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/components/I18nProvider';
import type { TranslationKey } from '@/lib/i18n';

type TFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

type SearchRun = {
  id: string;
  source: string;
  searchParameters: string;
  jobsDiscovered: number;
  newJobs: number;
  duplicateJobs: number;
  status: string;
  error?: string | null;
  startedAt: string;
};

type SourceHealth = {
  source: string;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  newJobs: number;
  duplicates: number;
  discovered: number;
  duplicateRate: number;
  averageNewJobs: number;
  lastStatus: string;
  lastRunAt: string;
  lastError?: string | null;
};

function formatRelativeTime(value: string, t: TFn) {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return t('insights.now');
  if (minutes < 60) return t('insights.mins', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('insights.hours', { count: hours });
  const days = Math.round(hours / 24);
  return t('insights.days', { count: days });
}

function parseSearchLabel(value: string, t: TFn) {
  try {
    const parsed = JSON.parse(value);
    const parts = [
      parsed.title,
      Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords.join(', ') : null,
      parsed.location,
      parsed.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : t('insights.defaultSearch');
  } catch {
    return t('insights.savedSearch');
  }
}

export function SearchInsights({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useI18n();
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/search/runs');
      const data = await res.json();
      setRuns(data.runs || []);
      setSourceHealth(data.sourceHealth || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [refreshKey]);

  const latestRuns = runs.slice(0, 6);
  const topSources = sourceHealth.slice(0, 5);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9 px-3.5 text-sm">
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <History className="size-3.5" />}
        <span>{t('insights.history')}</span>
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t('insights.close')}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed right-4 top-20 z-50 flex max-h-[calc(100vh-6rem)] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-neutral-900">{t('insights.title')}</h2>
                <p className="truncate text-xs text-neutral-500">
                  {sourceHealth.length > 0
                    ? t('insights.tracked', { count: sourceHealth.length, plural: sourceHealth.length === 1 ? '' : 's' })
                    : t('insights.empty')}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={fetchRuns} disabled={loading} className="h-8 px-2 text-xs">
                  <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 px-2 text-xs">
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {!loading && runs.length === 0 && sourceHealth.length === 0 && (
            <p className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-sm text-neutral-500">
              {t('insights.hint')}
            </p>
          )}

          {topSources.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">{t('insights.health')}</h3>
              <div className="flex flex-col gap-2">
                {topSources.map((source) => (
                  <div key={source.source} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{source.source}</span>
                      <Badge variant={source.lastStatus === 'FAILED' ? 'destructive' : 'outline'}>
                        {source.lastStatus === 'FAILED' ? <AlertCircle /> : <CheckCircle2 />}
                        {source.lastStatus.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>{t('insights.runs', { count: source.runs })}</span>
                      <span>{t('insights.new', { count: source.newJobs })}</span>
                      <span>{t('insights.avg', { count: source.averageNewJobs })}</span>
                      <span>{t('insights.dupPct', { count: source.duplicateRate })}</span>
                      <span>{formatRelativeTime(source.lastRunAt, t)}</span>
                    </div>
                    {source.lastError && (
                      <p className="text-xs text-red-600">{source.lastError}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {latestRuns.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">{t('insights.recent')}</h3>
              <div className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-100">
                {latestRuns.map((run) => (
                  <div key={run.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{run.source}</p>
                      <p className="truncate text-xs text-neutral-500">{parseSearchLabel(run.searchParameters, t)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      <span>{t('insights.found', { count: run.jobsDiscovered })}</span>
                      <span>{t('insights.new', { count: run.newJobs })}</span>
                      <span>{t('insights.dupes', { count: run.duplicateJobs })}</span>
                      <span>{formatRelativeTime(run.startedAt, t)}</span>
                      <Activity className="size-3.5 text-neutral-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
