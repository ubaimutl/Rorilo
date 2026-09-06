'use client';

import React, { useState, useEffect, useRef } from 'react';
import { JobCard } from '@/components/JobCard';
import { SearchModal } from '@/components/SearchModal';
import { SearchInsights } from '@/components/SearchInsights';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Loader2, Trash2, Sparkles, Briefcase, BookmarkCheck, Gauge, TriangleAlert } from 'lucide-react';
import { useI18n } from '@/components/I18nProvider';

const DISCOVER_STATE_KEY = 'rorilo_discover_state';
const DISCOVER_SCROLL_KEY = 'rorilo_discover_scroll';

export default function JobsPage() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'best' | 'newest' | 'saved'>('best');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const [searchInsightsRefresh, setSearchInsightsRefresh] = useState(0);
  const restoredScroll = useRef(false);

  const skippedJobs = jobs.filter((job) => job.match?.triageStatus === 'SKIP');
  const savedCount = jobs.filter((job) => job.application?.status === 'SAVED').length;
  const worthApplyingCount = jobs.filter((job) => job.match?.triageStatus === 'WORTH_APPLYING').length;
  const avgScore = jobs.length > 0
    ? Math.round(jobs.reduce((sum, job) => sum + (job.match?.matchScore ?? 0), 0) / jobs.length)
    : 0;

  const stats = [
    { icon: Briefcase, value: String(jobs.length), label: t('discover.stats.visible') },
    { icon: BookmarkCheck, value: String(savedCount), label: t('discover.stats.saved') },
    { icon: Sparkles, value: String(worthApplyingCount), label: t('discover.stats.worth') },
    { icon: Gauge, value: `${avgScore}%`, label: t('discover.stats.avg') },
  ];

  const fetchJobs = async (override?: {
    searchQuery?: string;
    locationQuery?: string;
    remoteFilter?: string;
    activeTab?: 'best' | 'newest' | 'saved';
  }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const nextSearch = override?.searchQuery ?? searchQuery;
      const nextLocation = override?.locationQuery ?? locationQuery;
      const nextRemote = override?.remoteFilter ?? remoteFilter;
      const nextTab = override?.activeTab ?? activeTab;
      if (nextSearch) params.set('search', nextSearch);
      if (nextLocation) params.set('location', nextLocation);
      if (nextRemote !== 'all') params.set('remote', nextRemote);
      if (nextTab === 'saved') params.set('status', 'SAVED');
      params.set('sort', nextTab === 'newest' ? 'newest' : 'best');

      const res = await fetch(`/api/jobs?${params.toString()}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setSelectedJobIds((current) =>
        current.filter((jobId) => (data.jobs || []).some((job: any) => job.id === jobId))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISCOVER_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.searchQuery === 'string') setSearchQuery(parsed.searchQuery);
        if (typeof parsed.locationQuery === 'string') setLocationQuery(parsed.locationQuery);
        if (typeof parsed.remoteFilter === 'string') setRemoteFilter(parsed.remoteFilter);
        if (['best', 'newest', 'saved'].includes(parsed.activeTab)) {
          setActiveTab(parsed.activeTab);
        }
      }
    } catch {}
    setHasRestoredState(true);
  }, []);

  useEffect(() => {
    if (!hasRestoredState) return;
    try {
      localStorage.setItem(
        DISCOVER_STATE_KEY,
        JSON.stringify({ searchQuery, locationQuery, remoteFilter, activeTab })
      );
    } catch {}
  }, [searchQuery, locationQuery, remoteFilter, activeTab, hasRestoredState]);

  useEffect(() => {
    if (!hasRestoredState) return;
    const handler = setTimeout(() => {
      fetchJobs();
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQuery, locationQuery, remoteFilter, activeTab, hasRestoredState]);

  useEffect(() => {
    const handleScroll = () => {
      try {
        localStorage.setItem(DISCOVER_SCROLL_KEY, String(window.scrollY));
      } catch {}
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (loading || restoredScroll.current) return;
    restoredScroll.current = true;
    try {
      const savedScroll = Number(localStorage.getItem(DISCOVER_SCROLL_KEY) || '0');
      if (savedScroll > 0) {
        requestAnimationFrame(() => window.scrollTo({ top: savedScroll }));
      }
    } catch {}
  }, [loading]);

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId]
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = jobs.map((job) => job.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedJobIds.includes(id));
    setSelectedJobIds(allVisibleSelected ? [] : visibleIds);
  };

  const handleBulkDelete = async () => {
    if (selectedJobIds.length === 0) return;
    const shouldDelete = window.confirm(`Delete ${selectedJobIds.length} selected job${selectedJobIds.length === 1 ? '' : 's'}?`);
    if (!shouldDelete) return;

    setBulkDeleting(true);
    setDeleteError(null);
    try {
      const idsToDelete = [...selectedJobIds];
      const res = await fetch('/api/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs((current) => current.filter((job) => !idsToDelete.includes(job.id)));
        setSelectedJobIds([]);
      } else {
        setDeleteError(data.error || 'Could not delete selected jobs.');
      }
    } catch (err) {
      setDeleteError((err as Error).message);
      console.error(err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteSkipped = async () => {
    if (skippedJobs.length === 0) return;
    const shouldDelete = window.confirm(`Delete ${skippedJobs.length} skipped job${skippedJobs.length === 1 ? '' : 's'}?`);
    if (!shouldDelete) return;

    setBulkDeleting(true);
    setDeleteError(null);
    try {
      const skippedIds = skippedJobs.map((job) => job.id);
      const res = await fetch('/api/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: skippedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs((current) => current.filter((job) => !skippedIds.includes(job.id)));
        setSelectedJobIds((current) => current.filter((id) => !skippedIds.includes(id)));
      } else {
        setDeleteError(data.error || 'Could not delete skipped jobs.');
      }
    } catch (err) {
      setDeleteError((err as Error).message);
      console.error(err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleTriageVisible = async () => {
    if (jobs.length === 0) return;
    setTriaging(true);
    setTriageError(null);
    try {
      const res = await fetch('/api/jobs/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: jobs.map((job) => job.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setTriageError(data.error || 'Could not sort visible jobs.');
        return;
      }
      await fetchJobs();
    } catch (err) {
      setTriageError((err as Error).message);
    } finally {
      setTriaging(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        title={t('discover.title')}
        description={t('discover.description')}
        actions={
          <>
            {jobs.length > 0 && (
              <Button
                onClick={handleTriageVisible}
                size="sm"
                variant="outline"
                disabled={triaging}
                className="text-sm h-9 px-3.5"
              >
                {triaging ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                <span>{t('discover.sortVisible')}</span>
              </Button>
            )}
            <SearchInsights refreshKey={searchInsightsRefresh} />
            <Button
              onClick={() => setIsSearchModalOpen(true)}
              size="sm"
              className="text-sm h-9 px-4"
            >
              {t('discover.findRoles')}
            </Button>
          </>
        }
      />

      <main className="p-6 md:p-10 max-w-4xl w-full mx-auto flex flex-col gap-6">
        {!loading && jobs.length > 0 && (
          <Card size="sm">
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xl font-bold tracking-tight tabular-nums">
                        {stat.value}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {stat.label}
                      </span>
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="size-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('discover.searchPlaceholder')}
              className="pl-9 text-sm h-9"
            />
          </div>

          <div className="w-full sm:w-44">
            <Input
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder={t('discover.locationPlaceholder')}
              className="text-sm h-9"
            />
          </div>

          <div className="w-full sm:w-40">
            <select
              value={remoteFilter}
              onChange={(e) => setRemoteFilter(e.target.value)}
              aria-label={t('search.workplace')}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-neutral-800 cursor-pointer"
            >
              <option value="all">{t('discover.workplace.all')}</option>
              <option value="remote">{t('discover.workplace.remote')}</option>
              <option value="hybrid">{t('discover.workplace.hybrid')}</option>
              <option value="onsite">{t('discover.workplace.onsite')}</option>
            </select>
          </div>
        </div>

        {/* View Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'best' | 'newest' | 'saved')}>
          <TabsList>
            <TabsTrigger value="best">{t('discover.tabs.recommended')}</TabsTrigger>
            <TabsTrigger value="newest">{t('discover.tabs.latest')}</TabsTrigger>
            <TabsTrigger value="saved">{t('discover.tabs.saved')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {triageError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{triageError}</AlertDescription>
          </Alert>
        )}

        {deleteError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{deleteError}</AlertDescription>
          </Alert>
        )}

        {jobs.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.id))}
                onChange={toggleAllVisible}
                className="size-4 rounded border-neutral-300"
              />
              {t('discover.selectVisible')}
            </label>

            {(selectedJobIds.length > 0 || skippedJobs.length > 0) && (
              <div className="flex flex-wrap items-center gap-3">
                {skippedJobs.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteSkipped}
                    disabled={bulkDeleting}
                    className="text-xs h-8"
                  >
                    {bulkDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    <span>{t('discover.deleteSkipped', { count: skippedJobs.length })}</span>
                  </Button>
                )}
                {selectedJobIds.length > 0 && (
                  <>
                <span className="text-sm text-neutral-500">
                  {t('discover.selected', { count: selectedJobIds.length })}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="text-xs h-8"
                >
                  {bulkDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  <span>{t('discover.deleteSelected')}</span>
                </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Jobs List */}
        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-col gap-5" aria-label={t('discover.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Briefcase />
              </EmptyMedia>
              <EmptyTitle>{t('discover.emptyTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('discover.emptyDescription')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setIsSearchModalOpen(true)} size="sm">
                {t('discover.findRoles')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedJobIds.includes(job.id)}
                onSelectToggle={toggleJobSelection}
                onSaveToggle={() => fetchJobs()}
                onDelete={(jobId) => {
                  setJobs((current) => current.filter((item) => item.id !== jobId));
                  setSelectedJobIds((current) => current.filter((id) => id !== jobId));
                }}
              />
            ))}
          </div>
        )}
      </main>

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSearchComplete={() => {
          const nextState = {
            searchQuery: '',
            locationQuery: '',
            remoteFilter: 'all',
            activeTab: 'newest' as const,
          };
          setSearchQuery(nextState.searchQuery);
          setLocationQuery(nextState.locationQuery);
          setRemoteFilter(nextState.remoteFilter);
          setActiveTab(nextState.activeTab);
          setSelectedJobIds([]);
          fetchJobs(nextState);
          setSearchInsightsRefresh((value) => value + 1);
        }}
      />
    </div>
  );
}
