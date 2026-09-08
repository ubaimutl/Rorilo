'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, LayoutGrid, List, ChevronRight, ChevronLeft, KanbanSquare, Download } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreRing, displayMatchScore, isAiCalibrated } from '@/components/ScoreRing';
import { CompanyLogo } from '@/components/CompanyLogo';
import { useI18n } from '@/components/I18nProvider';
import { downloadTrackerApplicationsPdf } from '@/lib/pdf/generatePdf';
import { notify } from '@/components/AppNotifications';

const COLUMNS = [
  { id: 'APPLIED', labelKey: 'tracker.colApplied' as const, dot: 'bg-indigo-500' },
  { id: 'INTERVIEW', labelKey: 'tracker.colInterview' as const, dot: 'bg-amber-500' },
  { id: 'OFFER', labelKey: 'tracker.colOffer' as const, dot: 'bg-emerald-500' },
  { id: 'REJECTED', labelKey: 'tracker.colRejected' as const, dot: 'bg-neutral-300' },
];

const ORDERED_STATUSES = ['APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'];

export default function ApplicationsPage() {
  const { t } = useI18n();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [draggingAppId, setDraggingAppId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/applications');
      const data = await res.json();
      const active = (data.applications || []).filter((a: any) =>
        ['APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'].includes(a.status)
      );
      setApplications(active);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleStatusChange = async (appId: string, jobId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status: newStatus }),
      });
      if (res.ok) {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const moveStatus = (app: any, direction: 'prev' | 'next') => {
    const currentStatus = app.status;
    const currentIndex = ORDERED_STATUSES.indexOf(currentStatus);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < ORDERED_STATUSES.length) {
      handleStatusChange(app.id, app.job.id, ORDERED_STATUSES[nextIndex]);
    }
  };

  const handleDropOnStatus = (status: string) => {
    if (!draggingAppId) return;
    const app = applications.find((item) => item.id === draggingAppId);
    setDraggingAppId(null);
    setDropStatus(null);

    if (!app) return;
    const currentStatus = app.status;
    if (currentStatus === status) return;

    handleStatusChange(app.id, app.job.id, status);
  };

  const getExportDate = (app: any) => {
    const raw = app.appliedAt || app.updatedAt || app.createdAt;
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };

  const getExportApplications = () => {
    const fromDate = exportFrom ? new Date(`${exportFrom}T00:00:00`) : null;
    const toDate = exportTo ? new Date(`${exportTo}T23:59:59`) : null;

    return applications.filter((app) => {
      const date = getExportDate(app);
      if (!date) return !fromDate && !toDate;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    });
  };

  const handleExportPdf = () => {
    if (exportFrom && exportTo && exportFrom > exportTo) {
      notify({
        type: 'error',
        title: t('tracker.exportInvalidTitle'),
        message: t('tracker.exportInvalidMsg'),
      });
      return;
    }

    const items = getExportApplications();
    if (items.length === 0) {
      notify({
        type: 'info',
        title: t('tracker.exportEmptyTitle'),
        message: t('tracker.exportEmptyMsg'),
      });
      return;
    }

    downloadTrackerApplicationsPdf(
      items.map((app) => ({
        status: app.status,
        title: app.job.title,
        company: app.job.company,
        location: app.job.location,
        appliedAt: app.appliedAt,
        updatedAt: app.updatedAt,
        score: app.job.match ? displayMatchScore(app.job.match) : null,
      })),
      {
        from: exportFrom,
        to: exportTo,
        title: t('tracker.exportTitle'),
        statusLabels: Object.fromEntries(COLUMNS.map((col) => [col.id, t(col.labelKey)])),
      },
      `Rorilo_Tracker_${new Date().toISOString().slice(0, 10)}.pdf`
    );
    notify({
      type: 'success',
      title: t('tracker.exportStartedTitle'),
      message: t('tracker.exportStartedMsg', { count: items.length }),
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        title={t('tracker.title')}
        description={t('tracker.description')}
        badge={
          <span className="text-xs text-neutral-500 font-semibold bg-neutral-200/70 px-2.5 py-0.5 rounded-full">
            {t('tracker.tracked', { count: applications.length })}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {applications.length > 0 && (
              <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-9 text-sm">
                <Download className="size-4" />
                <span>{t('tracker.exportPdf')}</span>
              </Button>
            )}
            <div className="flex items-center gap-0.5 border border-neutral-200 rounded-lg p-1 bg-white">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  viewMode === 'kanban'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
                title={t('tracker.board')}
              >
                <LayoutGrid className="size-4" />
                <span>{t('tracker.board')}</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
                title={t('tracker.list')}
              >
                <List className="size-4" />
                <span>{t('tracker.list')}</span>
              </button>
            </div>
          </div>
        }
      />

      <main className="p-6 md:p-8 flex-1 overflow-x-auto">
        {!loading && applications.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{t('tracker.exportRange')}</p>
              <p className="text-xs text-neutral-500">{t('tracker.exportRangeHint')}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                <span>{t('tracker.exportFrom')}</span>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={(event) => setExportFrom(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-neutral-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                <span>{t('tracker.exportTo')}</span>
                <input
                  type="date"
                  value={exportTo}
                  onChange={(event) => setExportTo(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-neutral-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex flex-col md:flex-row gap-4 items-stretch min-w-[950px] pb-10" aria-label={t('tracker.loading')}>
            {[0, 1, 2, 3].map((col) => (
              <div key={col} className="bg-neutral-50/70 border border-neutral-200 rounded-xl p-3 flex flex-col gap-2.5 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="max-w-md mx-auto py-10">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KanbanSquare />
                </EmptyMedia>
                <EmptyTitle>{t('tracker.emptyTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('tracker.emptyHint')}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  href="/"
                  className={buttonVariants({ size: 'sm' })}
                >
                  {t('drafts.openDiscover')}
                </Link>
              </EmptyContent>
            </Empty>
          </div>
        ) : viewMode === 'kanban' ? (
          /* Kanban Board View */
          <div className="flex flex-col md:flex-row gap-4 md:items-start md:min-w-[950px] pb-10">
            {COLUMNS.map((col) => {
              const colApps = applications.filter((a) => {
                return a.status === col.id;
              });

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropStatus(col.id);
                  }}
                  onDragLeave={() => setDropStatus((current) => current === col.id ? null : current)}
                  onDrop={() => handleDropOnStatus(col.id)}
                  className={`bg-neutral-50/70 border rounded-xl p-3 flex flex-col min-h-[220px] flex-1 transition-colors ${
                    dropStatus === col.id
                      ? 'border-neutral-500 bg-neutral-100'
                      : 'border-neutral-200'
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200/80 mb-3 px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${col.dot}`} aria-hidden="true" />
                      <span className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                        {t(col.labelKey)}
                      </span>
                      <Badge variant="secondary" className="tabular-nums">
                        {colApps.length}
                      </Badge>
                    </div>
                  </div>

                  {/* Cards — capped at viewport height, scrolls past that */}
                  <div className="space-y-2.5 flex-1 min-h-0 max-h-[62vh] overflow-y-auto overscroll-contain pr-1 pb-1">
                    {colApps.map((app) => (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingAppId(app.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', app.id);
                        }}
                        onDragEnd={() => {
                          setDraggingAppId(null);
                          setDropStatus(null);
                        }}
                        className={`bg-white border border-neutral-200 rounded-lg p-3.5 shadow-xs hover:border-neutral-300 transition-all space-y-2 group cursor-grab active:cursor-grabbing ${
                          draggingAppId === app.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <CompanyLogo
                              company={app.job.company}
                              website={app.job.companyWebsite}
                              directLogoUrl={app.job.companyLogo}
                              size={26}
                              className="mt-0.5"
                            />
                            <Link
                              href={`/jobs/${app.job.id}`}
                              className="text-sm font-semibold text-neutral-900 hover:text-indigo-600 transition-colors line-clamp-2 leading-snug"
                            >
                              {app.job.title}
                            </Link>
                          </div>
                          <ScoreRing score={displayMatchScore(app.job.match)} size={30} calibrated={isAiCalibrated(app.job.match)} />
                        </div>

                        <p className="text-xs text-neutral-500 font-medium">
                          {app.job.company}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs text-neutral-400">
                          <span>{formatDate(app.updatedAt)}</span>

                          {/* Quick advance / regress status buttons */}
                          <div className="flex items-center gap-1">
                            {col.id !== 'APPLIED' && (
                              <button
                                onClick={() => moveStatus(app, 'prev')}
                                className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                                title={t('tracker.prev')}
                              >
                                <ChevronLeft className="size-3.5" />
                              </button>
                            )}

                            {col.id !== 'REJECTED' && col.id !== 'OFFER' && (
                              <button
                                onClick={() => moveStatus(app, 'next')}
                                className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                                title={t('tracker.next')}
                              >
                                <ChevronRight className="size-3.5" />
                              </button>
                            )}

                            <Link
                              href={`/jobs/${app.job.id}`}
                              className="p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                              title={t('tracker.openDetails')}
                            >
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}

                    {colApps.length === 0 && (
                      <div className="h-28 border border-dashed border-neutral-200 rounded-lg flex items-center justify-center text-xs text-neutral-400">
                        {t('tracker.emptyCol')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List Table View */
          <div className="max-w-4xl mx-auto w-full">
            <div className="hidden sm:grid sm:grid-cols-12 gap-4 pb-3 border-b border-neutral-200 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <div className="col-span-5">{t('tracker.colRole')}</div>
              <div className="col-span-3">{t('tracker.colCompany')}</div>
              <div className="col-span-2">{t('tracker.colDate')}</div>
              <div className="col-span-2 text-right">{t('tracker.colStatus')}</div>
            </div>

            <div className="divide-y divide-neutral-100">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="py-4 sm:grid sm:grid-cols-12 gap-4 items-center hover:bg-neutral-50/60 -mx-2 px-2 rounded-lg transition-colors group"
                >
                  <div className="col-span-5 min-w-0">
                    <Link
                      href={`/jobs/${app.job.id}`}
                      className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 hover:underline block truncate tracking-tight"
                    >
                      {app.job.title}
                    </Link>
                    <p className="text-xs text-neutral-500 sm:hidden mt-0.5">
                      {app.job.company} · {formatDate(app.updatedAt)}
                    </p>
                  </div>

                  <div className="hidden sm:block col-span-3 text-sm text-neutral-600 truncate">
                    {app.job.company}
                  </div>

                  <div className="hidden sm:block col-span-2 text-sm text-neutral-400">
                    {formatDate(app.updatedAt)}
                  </div>

                  <div className="col-span-2 flex items-center justify-between sm:justify-end gap-2 mt-2 sm:mt-0">
                    <select
                      value={app.status}
                      onChange={(e) => handleStatusChange(app.id, app.job.id, e.target.value)}
                      aria-label={t('tracker.statusAria')}
                      className="h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs text-neutral-800 font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer"
                    >
                      {COLUMNS.map((col) => (
                        <option key={col.id} value={col.id}>
                          {t(col.labelKey)}
                        </option>
                      ))}
                    </select>

                    <Link
                      href={`/jobs/${app.job.id}`}
                      className="text-neutral-400 hover:text-neutral-900 p-1 transition-colors"
                      title={t('tracker.viewApp')}
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
