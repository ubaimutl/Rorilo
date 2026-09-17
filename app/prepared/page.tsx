'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Sparkles,
  Download,
  Copy,
  Check,
  Send,
  Save,
  ExternalLink,
  Briefcase,
  FileText,
  CheckCircle2,
  AlertCircle,
  Mail,
  RotateCcw,
  TriangleAlert,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreRing, displayMatchScore, isAiCalibrated } from '@/components/ScoreRing';
import { CompanyLogo } from '@/components/CompanyLogo';
import { FormattedDescription } from '@/components/FormattedDescription';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { resolveSourceUrl } from '@/lib/jobs/normalize';
import { useI18n } from '@/components/I18nProvider';
import { downloadCoverLetterPdf, CoverLetterTemplate, COVER_LETTER_TEMPLATES } from '@/lib/pdf/generatePdf';
import { notify } from '@/components/AppNotifications';
import { JobDescriptionInput } from '@/components/JobDescriptionInput';
import { RequestChanges } from '@/components/RequestChanges';
import { useConfirm } from '@/components/ConfirmDialog';

export default function PreparedJobsPage() {
  const { t } = useI18n();
  const [preparedJobs, setPreparedJobs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'material' | 'description' | 'match'>('material');

  // Active job details
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [coverLetterContent, setCoverLetterContent] = useState('');
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [enrichingDescription, setEnrichingDescription] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [appliedStatusNotice, setAppliedStatusNotice] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CoverLetterTemplate>('german_din');
  const [clockMs, setClockMs] = useState(0);
  const [revisingEmail, setRevisingEmail] = useState(false);
  const [revisingCover, setRevisingCover] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [editingContactEmail, setEditingContactEmail] = useState(false);
  const [contactEmailInput, setContactEmailInput] = useState('');
  const confirm = useConfirm();

  const handleSaveContactEmail = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: contactEmailInput }),
      });
      if (res.ok) {
        setEditingContactEmail(false);
        await loadJobDetails(selectedJob.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPreparedJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/applications');
      const data = await res.json();
      const prepared = (data.applications || []).filter((a: any) =>
        ['READY', 'DRAFT_CREATED'].includes(a.status)
      );

      setPreparedJobs(prepared);
      if (prepared.length > 0 && (!selectedJobId || !prepared.some((item: any) => item.job.id === selectedJobId))) {
        setSelectedJobId(prepared[0].job.id);
      } else if (prepared.length === 0) {
        setSelectedJobId(null);
        setSelectedJob(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreparedJobs();
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => setProfile(data.profile || null))
      .catch(() => setProfile(null));
    setClockMs(Date.now());
  }, []);

  const loadJobDetails = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        const j = data.job;
        setSelectedJob(j);

        const cl = j.application?.documents?.find((d: any) => d.type === 'COVER_LETTER');
        setCoverLetterContent(cl ? cl.content : '');

        const em = j.application?.documents?.find((d: any) => d.type === 'EMAIL_DRAFT');
        if (em) {
          try {
            const parsed = JSON.parse(em.content);
            setEmailSubject(parsed.subject || '');
            setEmailBody(parsed.body || '');
          } catch {
            setEmailBody(em.content);
          }
        } else {
          setEmailSubject('');
          setEmailBody('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetails(selectedJobId);
    }
  }, [selectedJobId]);

  const handleDeleteJob = async (jobId: string) => {
    const ok = await confirm({
      title: t('common.confirmDelete' as any) || 'Delete this job?',
      confirmLabel: t('jobcard.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete job');
      setPreparedJobs(prev => prev.filter(item => item.job.id !== jobId));
      if (selectedJobId === jobId) setSelectedJobId(null);
      notify({ title: t('common.deleted' as any) || 'Deleted successfully', type: 'success' });
    } catch (err) {
      console.error(err);
      notify({ title: t('common.error' as any) || 'Failed to delete job', type: 'error' });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedJob) return;
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selectedJob.id, status: newStatus }),
      });
      if (res.ok) {
        setAppliedStatusNotice(t('drafts.statusUpdated', { status: newStatus }));
        setTimeout(() => setAppliedStatusNotice(null), 2500);
        await loadJobDetails(selectedJob.id);
        await fetchPreparedJobs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getInactiveDays = (dateValue?: string | Date | null) => {
    if (!dateValue || clockMs === 0) return 0;
    const updatedAt = new Date(dateValue).getTime();
    if (Number.isNaN(updatedAt)) return 0;
    return Math.floor((clockMs - updatedAt) / (1000 * 60 * 60 * 24));
  };

  const handleCreateDraft = async () => {
    if (!selectedJob?.application?.id) return;
    setDraftingEmail(true);
    setDraftNotice(null);
    try {
      const res = await fetch(`/api/applications/${selectedJob.application.id}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: emailSubject,
          body: emailBody,
          to: selectedJob.contactEmail,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraftNotice(t('material.draftCreated'));
      } else {
        setDraftNotice(data.error || data.message || t('material.draftFallback'));
      }
    } catch (err) {
      setDraftNotice((err as Error).message);
    } finally {
      setDraftingEmail(false);
    }
  };

  const handleEnrichDescription = async () => {
    if (!selectedJob) return;
    setEnrichingDescription(true);
    setMaterialNotice(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/enrich`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await loadJobDetails(selectedJob.id);
        setMaterialNotice(data.enriched ? t('drafts.descLoaded') : t('drafts.descComplete'));
        setTimeout(() => setMaterialNotice(null), 2500);
      } else {
        setMaterialNotice(data.error || t('drafts.descFailed'));
      }
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setEnrichingDescription(false);
    }
  };

  const handleRegenerateMaterials = async () => {
    if (!selectedJob) return;
    const shouldRegenerate = await confirm({
      title: t('drafts.regenConfirm'),
      confirmLabel: t('drafts.regenerateShort'),
    });
    if (!shouldRegenerate) return;

    setRegenerating(true);
    setMaterialNotice(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/prepare`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setMaterialNotice(data.error || t('drafts.regenFailed'));
        return;
      }

      if (data.materials?.coverLetter) setCoverLetterContent(data.materials.coverLetter);
      if (data.materials?.emailSubject) setEmailSubject(data.materials.emailSubject);
      if (data.materials?.emailBody) setEmailBody(data.materials.emailBody);

      await loadJobDetails(selectedJob.id);
      await fetchPreparedJobs();
      setMaterialNotice(t('drafts.regenDone'));
      setTimeout(() => setMaterialNotice(null), 2500);
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  const coverDoc = selectedJob?.application?.documents?.find((d: any) => d.type === 'COVER_LETTER');
  const emailDoc = selectedJob?.application?.documents?.find((d: any) => d.type === 'EMAIL_DRAFT');

  const flashMaterialNotice = (message: string) => {
    setMaterialNotice(message);
    setTimeout(() => setMaterialNotice(null), 2500);
  };

  const handleReviseEmail = async (instruction: string): Promise<string | null> => {
    if (!selectedJob) return t('revise.failed');
    setRevisingEmail(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'email', subject: emailSubject, body: emailBody, instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return data.error || t('revise.failed');
      }
      setEmailSubject(data.subject ?? '');
      setEmailBody(data.body ?? '');
      return null;
    } catch (err) {
      return (err as Error).message;
    } finally {
      setRevisingEmail(false);
    }
  };

  const handleReviseCover = async (instruction: string): Promise<string | null> => {
    if (!selectedJob) return t('revise.failed');
    setRevisingCover(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'cover-letter', content: coverLetterContent, instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return data.error || t('revise.failed');
      }
      setCoverLetterContent(data.revisedText ?? '');
      return null;
    } catch (err) {
      return (err as Error).message;
    } finally {
      setRevisingCover(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!selectedJob || !emailDoc) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: emailDoc.id,
          content: JSON.stringify({ subject: emailSubject, body: emailBody }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMaterialNotice(data.error || t('revise.saveFailed'));
        return;
      }
      await loadJobDetails(selectedJob.id);
      flashMaterialNotice(t('revise.saved'));
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveCover = async () => {
    if (!selectedJob || !coverDoc) return;
    setSavingCover(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coverDoc.id, content: coverLetterContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMaterialNotice(data.error || t('revise.saveFailed'));
        return;
      }
      await loadJobDetails(selectedJob.id);
      flashMaterialNotice(t('revise.saved'));
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setSavingCover(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedJob) return;
    const candidateName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || t('drafts.candidateFallback');
    const additionalLinks = (() => {
      try {
        return JSON.parse(profile?.additionalUrls || '[]');
      } catch {
        return [];
      }
    })();
    const candidateLinks = [profile?.linkedIn, profile?.gitHub, profile?.portfolio, ...additionalLinks]
      .filter(Boolean)
      .join(' | ');

    downloadCoverLetterPdf(
      {
        candidateName,
        candidateTitle: profile?.currentTitle || undefined,
        candidateEmail: profile?.email || undefined,
        candidatePhone: profile?.phone || undefined,
        candidateLocation: [profile?.city, profile?.country].filter(Boolean).join(', '),
        candidateLinks,
        companyName: selectedJob.company,
        contactPerson: selectedJob.contactName || undefined,
        jobTitle: selectedJob.title,
        content: coverLetterContent,
        template: selectedTemplate,
      },
      `Cover_Letter_${selectedJob.company.replace(/\s+/g, '_')}.pdf`
    );
    notify({
      type: 'success',
      title: t('coverletter.pdfStarted'),
      message: t('coverletter.pdfHint'),
    });
  };

  const answersDoc = selectedJob?.application?.documents?.find((d: any) => d.type === 'ANSWERS');
  let qaData: { answers?: Array<{ question: string; answer: string }> } = {};
  if (answersDoc) {
    try {
      qaData = JSON.parse(answersDoc.content);
    } catch {}
  }

  const strongMatches: string[] = selectedJob?.match?.strongMatches
    ? JSON.parse(selectedJob.match.strongMatches)
    : [];
  const missingSkills: string[] = selectedJob?.match?.missingSkills
    ? JSON.parse(selectedJob.match.missingSkills)
    : [];
  const selectedDraftInactiveDays = getInactiveDays(selectedJob?.application?.updatedAt);
  const shouldSuggestDraftAction =
    selectedJob?.application &&
    ['READY', 'DRAFT_CREATED'].includes(selectedJob.application.status) &&
    selectedDraftInactiveDays >= 3;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        sticky={false}
        title={t('drafts.title')}
        description={t('drafts.description')}
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {t('drafts.ready', { count: preparedJobs.length })}
          </span>
        }
        actions={
          <Link
            href="/"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-sm h-9 px-3.5 gap-1.5' })}
          >
            <Briefcase className="size-4" />
            <span>{t('drafts.openDiscover')}</span>
          </Link>
        }
      />

      {/* Main Master-Detail Split Workspace */}
      <div className="flex-1 flex flex-col md:flex-row md:items-start min-w-0">
        {/* Left Column: Prepared Jobs List (340px) — pinned while the detail scrolls */}
        <aside className={`w-full md:w-80 lg:w-96 shrink-0 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:overscroll-contain md:p-3 ${selectedJobId ? 'hidden md:block' : 'block'}`}>
          {loading ? (
            <div className="flex flex-col gap-4 p-4" role="status" aria-label={t('drafts.loading')}>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-[10px]" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : preparedJobs.length === 0 ? (
            <div className="p-6 my-auto">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Sparkles />
                  </EmptyMedia>
                  <EmptyTitle>{t('drafts.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>
                    {t('drafts.emptyHint')}
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
          ) : (
            <div className="flex flex-col gap-2 p-3 md:p-0">
              {preparedJobs.map((item) => {
                const isSelected = item.job.id === selectedJobId;
                const score = displayMatchScore(item.job.match);
                const inactiveDays = getInactiveDays(item.updatedAt);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedJobId(item.job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedJobId(item.job.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected || undefined}
                    aria-label={`${item.job.title} at ${item.job.company}`}
                    className={cn(
                      'w-full text-left p-3.5 rounded-2xl border cursor-pointer block motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground shadow-[0_12px_32px_-16px_rgba(19,20,23,0.5)]'
                        : 'bg-card/60 border-border hover:border-primary/25 hover:bg-card'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyLogo
                        company={item.job.company}
                        website={item.job.companyWebsite}
                        directLogoUrl={item.job.companyLogo}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className={cn('text-sm font-semibold truncate tracking-[-0.01em]', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                          {item.job.title}
                        </h2>
                        <p className={cn('text-xs mt-0.5 truncate', isSelected ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
                          {item.job.company} · {item.job.location || t('discover.workplace.remote')}
                        </p>
                      </div>
                      <ScoreRing score={score} size={36} calibrated={isAiCalibrated(item.job.match)} inverted={isSelected} />
                    </div>

                    <div className={cn('flex items-center justify-between mt-2.5 text-xs tabular-nums', isSelected ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
                      <span className="font-medium capitalize">
                        {item.status.toLowerCase().replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-1">
                        <span>{formatDate(item.updatedAt)}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteJob(item.job.id);
                          }}
                          aria-label={t('jobcard.delete')}
                          title={t('common.delete' as any) || 'Delete'}
                          className={cn(
                            'p-1.5 rounded-md motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            isSelected
                              ? 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/10 dark:hover:bg-black/10'
                              : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                          )}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {inactiveDays >= 3 && (
                      <p className={cn(
                        'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        isSelected
                          ? 'bg-white/10 text-amber-200 dark:bg-black/10 dark:text-amber-800'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      )}>
                        {t('drafts.sendOrArchive')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Column: Selected Job Detail & Application Material */}
        <main className={`flex-1 flex-col min-w-0 ${selectedJobId ? 'flex' : 'hidden md:flex'}`}>
          {selectedJob ? (
            <div className="flex-1 flex flex-col min-w-0">
              {/* Right Panel Header */}
              <div className="px-3 sm:px-6 pt-3 sm:pt-4">
              <div className="rounded-3xl border border-border bg-card/95 backdrop-blur-md px-4 sm:px-5 py-4 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.3)] flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSelectedJobId(null)}
                    className="md:hidden text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 motion-safe:transition-colors mb-1 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    <span>{t('drafts.all')}</span>
                  </button>
                  <h1 className="font-heading text-xl sm:text-2xl text-foreground break-words text-balance">
                    {selectedJob.title}
                  </h1>
                  <p className="text-[13px] text-muted-foreground mt-1 break-words">
                    {selectedJob.company} · {selectedJob.location || t('discover.workplace.remote')} ·{' '}
                    <span className="capitalize">{selectedJob.remoteType}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    onClick={handleRegenerateMaterials}
                    disabled={regenerating}
                    variant="outline"
                    className="h-10 rounded-full px-4 text-[13px]"
                    title={regenerating ? t('drafts.regenerating') : t('drafts.regenerateShort')}
                  >
                    {regenerating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
                    <span className="hidden sm:inline">{regenerating ? t('drafts.regenerating') : t('drafts.regenerateShort')}</span>
                  </Button>

                  {selectedJob.application?.status !== 'APPLIED' ? (
                    <Button
                      onClick={() => handleStatusChange('APPLIED')}
                      className="h-10 rounded-full px-4 text-[13px]"
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">{t('drafts.markApplied')}</span>
                      <span className="sm:hidden">{t('drafts.markAppliedShort')}</span>
                    </Button>
                  ) : (
                    <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/[0.08] px-4 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <Check className="size-4" aria-hidden="true" /> {t('tracker.colApplied')}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteJob(selectedJob.id)}
                    aria-label={t('common.delete' as any) || 'Delete'}
                    title={t('common.delete' as any) || 'Delete'}
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Trash2 className="size-[18px]" aria-hidden="true" />
                  </button>
                </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {appliedStatusNotice && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium" role="status">{appliedStatusNotice}</span>
                  )}
                  {materialNotice && (
                    <span role="status" className={`text-xs font-medium ${/could not|failed|error/i.test(materialNotice) ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'}`}>
                      {materialNotice}
                    </span>
                  )}

                  <label htmlFor="draft-status" className="sr-only">{t('drafts.statusAria')}</label>
                  <select
                    id="draft-status"
                    value={selectedJob.application?.status || 'READY'}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="h-9 rounded-full border border-border bg-transparent px-3 text-[13px] font-medium cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <option value="READY">{t('drafts.statusReady')}</option>
                    <option value="APPLIED">{t('tracker.colApplied')}</option>
                    <option value="INTERVIEW">{t('tracker.colInterview')}</option>
                    <option value="OFFER">{t('tracker.colOffer')}</option>
                    <option value="REJECTED">{t('tracker.colRejected')}</option>
                  </select>

                  {selectedJob.applicationUrl && (
                    <a
                      href={selectedJob.applicationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
                    >
                      <span>{t('company.website')}</span>
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
              </div>

              {/* Right Side Top Menu (Tabs) */}
              <div className="px-3 sm:px-6 pt-3 shrink-0 overflow-x-auto">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'material' | 'description' | 'match')}>
                  <TabsList>
                    <TabsTrigger value="material">
                      <FileText />
                      <span className="hidden sm:inline">{t('drafts.tabMaterial')}</span>
                      <span className="sm:hidden">{t('drafts.tabMaterialShort')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="description">
                      <Briefcase />
                      <span className="hidden sm:inline">{t('drafts.tabRole')}</span>
                      <span className="sm:hidden">{t('drafts.tabRoleShort')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="match">
                      <Sparkles />
                      <span className="hidden sm:inline">{t('drafts.tabMatch')}</span>
                      <span className="sm:hidden">{t('drafts.tabMatchShort')}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 px-3 sm:px-6 py-4 sm:py-5 max-w-4xl w-full">
                {shouldSuggestDraftAction && (
                  <div className="mb-4 rounded-2xl border border-amber-600/20 bg-amber-500/[0.07] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        {t('drafts.staleTitle', { count: selectedDraftInactiveDays })}
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {t('drafts.staleHint')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleStatusChange('APPLIED')}
                        className="h-8 text-xs"
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>{t('drafts.markAppliedShort')}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange('IGNORED')}
                        className="h-8 text-xs"
                      >
                        {t('drafts.archive')}
                      </Button>
                    </div>
                  </div>
                )}
                {activeTab === 'material' && (
                  <div className="flex flex-col gap-4">
                    {/* Email Draft Section */}
                    <section aria-label={t('drafts.emailCaption')} className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('drafts.emailCaption')}
                        </h2>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                              setCopiedEmail(true);
                              setTimeout(() => setCopiedEmail(false), 2000);
                            }}
                            aria-label={t('material.copyText')}
                            title={t('material.copyText')}
                            className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {copiedEmail ? <Check className="size-[18px] text-emerald-600" aria-hidden="true" /> : <Copy className="size-[18px]" aria-hidden="true" />}
                          </button>
                          <a
                            href={`mailto:${encodeURIComponent(
                              selectedJob.contactEmail || ''
                            )}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                            onClick={() => {
                              notify({
                                type: 'info',
                                title: t('drafts.openingMail'),
                                message: t('drafts.handingClient'),
                              });
                            }}
                            aria-label={t('material.openMailApp')}
                            title={t('drafts.mailTitle')}
                            className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
                          >
                            <Mail className="size-[18px]" aria-hidden="true" />
                          </a>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex-1">
                            {editingContactEmail ? (
                              <div className="flex items-center gap-2 max-w-sm mb-1.5">
                                <Input
                                  value={contactEmailInput}
                                  onChange={(e) => setContactEmailInput(e.target.value)}
                                  placeholder="Recruiter email..."
                                  className="h-10 text-sm"
                                />
                                <Button onClick={handleSaveContactEmail} className="h-10 px-4">{t('revise.save')}</Button>
                                {selectedJob.contactEmail && <Button variant="ghost" onClick={() => setEditingContactEmail(false)} className="h-10 px-3">{t('common.cancel')}</Button>}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group cursor-pointer mb-1.5" onClick={() => setEditingContactEmail(true)}>
                                {selectedJob.contactEmail ? (
                                  <h3 className="text-sm font-semibold border-b border-dashed border-border pb-0.5 hover:border-muted-foreground motion-safe:transition-colors">
                                    {t('material.emailTo', { email: selectedJob.contactEmail })}
                                  </h3>
                                ) : (
                                  <Button variant="secondary" size="sm" className="h-8 text-[13px] gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200">
                                    <Mail className="size-3.5" aria-hidden="true" />
                                    Set Recruiter Email
                                  </Button>
                                )}
                              </div>
                            )}
                            <p className="text-[13px] text-muted-foreground">
                              {t('material.tailoredHint')}
                            </p>
                          </div>
                        </div>

                        <RequestChanges
                          inputId="prep-revise-email"
                          applying={revisingEmail}
                          onApply={handleReviseEmail}
                        />

                        <div className="mt-4 space-y-1.5">
                          <Label htmlFor="prep-email-sub" className="text-[13px] font-medium">{t('material.subject')}</Label>
                          <Input
                            id="prep-email-sub"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            className="text-sm h-11"
                          />
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor="prep-email-msg" className="text-[13px] font-medium">{t('material.message')}</Label>
                          <Textarea
                            id="prep-email-msg"
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            rows={8}
                            className="text-sm leading-relaxed"
                          />
                        </div>

                        <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4">
                          <span className="text-xs text-muted-foreground">
                            {t('material.attachments', { list: 'Resume (PDF), Cover Letter (PDF)' })}
                          </span>
                          <div className="flex flex-col sm:flex-row gap-2">
                            {emailDoc && (
                              <Button
                                onClick={handleSaveEmail}
                                disabled={savingEmail}
                                variant="outline"
                                className="flex-1"
                              >
                                {savingEmail ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                                <span>{savingEmail ? t('common.saving') : t('revise.save')}</span>
                              </Button>
                            )}
                            {/* 1-Click Open in Gmail Web Compose (Zero Auth Needed) */}
                            <a
                              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                                selectedJob.contactEmail || ''
                              )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                notify({
                                  type: 'info',
                                  title: t('drafts.openingGmail'),
                                  message: t('drafts.handingBrowser'),
                                });
                              }}
                              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold hover:bg-muted motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
                              title={t('drafts.gmailTitle')}
                            >
                              <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
                              <span>{t('material.openGmail')}</span>
                            </a>

                            {/* API Background Draft (If Google Cloud OAuth is configured) */}
                            <Button
                              onClick={handleCreateDraft}
                              disabled={draftingEmail}
                              size="lg"
                              className="flex-1"
                              title={t('drafts.apiTitle')}
                            >
                              {draftingEmail ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                              <span>{t('material.saveGmailDrafts')}</span>
                            </Button>
                          </div>
                        </div>

                        {draftNotice && (
                          <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300 font-medium">{draftNotice}</p>
                        )}
                      </div>
                    </section>

                    {/* Cover Letter Section */}
                    <section aria-label={t('drafts.coverCaption')} className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('drafts.coverCaption')}
                        </h2>
                        <div className="flex items-center gap-2">
                          <label htmlFor="cover-template" className="sr-only">{t('material.templateLabel')}</label>
                          <select
                            id="cover-template"
                            value={selectedTemplate}
                            onChange={(e) => setSelectedTemplate(e.target.value as any)}
                            className="h-10 max-w-44 truncate rounded-full border border-border bg-transparent px-3 text-[13px] font-medium cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {COVER_LETTER_TEMPLATES.map((tmpl) => (
                              <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[13px] text-muted-foreground">
                        {t('material.tailoredCoverHint')}
                      </p>

                      <div className="mt-3">
                      <RequestChanges
                        inputId="prep-revise-cover"
                        applying={revisingCover}
                        onApply={handleReviseCover}
                      />
                      </div>

                      <Textarea
                        value={coverLetterContent}
                        onChange={(e) => setCoverLetterContent(e.target.value)}
                        rows={12}
                        aria-label={t('drafts.coverCaption')}
                        className="mt-3 min-h-96 text-[15px] leading-7 px-5 py-4"
                      />

                      <div className="mt-4 flex flex-col sm:flex-row gap-2 border-t border-border/70 pt-4">
                        <Button
                          size="lg"
                          onClick={handleDownloadPdf}
                          className="flex-1"
                        >
                          <Download className="size-4" aria-hidden="true" />
                          <span>{t('material.downloadPdf')}</span>
                        </Button>
                        {coverDoc && (
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={handleSaveCover}
                            disabled={savingCover}
                            className="flex-1"
                          >
                            {savingCover ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                            <span>{savingCover ? t('common.saving') : t('revise.save')}</span>
                          </Button>
                        )}
                      </div>
                    </section>

                    {/* Screening Q&A */}
                    {qaData?.answers && qaData.answers.length > 0 && (
                      <div className="space-y-4 pt-2">
                        <div>
                          <h2 className="text-sm font-semibold text-neutral-900">
                            {t('material.screeningTitle')}
                          </h2>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {t('material.screeningHint')}
                          </p>
                        </div>

                        <div className="space-y-3">
                          {qaData.answers.map((qa, i) => (
                            <div key={i} className="p-4 rounded-2xl border border-border bg-muted/40 space-y-1.5">
                              <p className="text-sm font-semibold text-neutral-900">{qa.question}</p>
                              <p className="text-sm text-neutral-600 leading-relaxed">{qa.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'description' && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-3xl border border-border bg-card p-5 sm:p-8 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('drafts.original')}
                      </h2>
                      {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                        <p className="text-lg font-bold tabular-nums tracking-tight mt-2">
                          {formatCurrency(selectedJob.salaryMin, selectedJob.salaryCurrency || 'USD')}
                          {selectedJob.salaryMax && selectedJob.salaryMax !== selectedJob.salaryMin
                            ? ` – ${formatCurrency(selectedJob.salaryMax, selectedJob.salaryCurrency || 'USD')}`
                            : ''}
                        </p>
                      )}
                      {(selectedJob.description || '').trim().length > 0 && (
                        <div className="mt-5">
                          <FormattedDescription
                            text={selectedJob.description}
                          />
                        </div>
                      )}
                    </div>

                    {(selectedJob.description || '').trim().length < 200 && (
                      <Alert>
                        <TriangleAlert />
                        <AlertDescription>
                          {(selectedJob.description || '').trim().length === 0
                            ? t('drafts.noDesc')
                            : t('drafts.shortDesc')}{' '}
                          {t('drafts.openOriginalHint')}
                        </AlertDescription>
                      </Alert>
                    )}

                    {(selectedJob.description || '').trim().length < 200 &&
                      [selectedJob.applicationUrl, selectedJob.originalUrl]
                        .filter((url): url is string => Boolean(url))
                        .map((url) => resolveSourceUrl(url, selectedJob.source || ''))
                        .some((url) => /stepstone\./i.test(url)) && (
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleEnrichDescription}
                            disabled={enrichingDescription}
                            className="text-xs h-8 gap-1.5"
                            title={t('drafts.fetchTitle')}
                          >
                            {enrichingDescription ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <FileText className="size-3.5" />
                            )}
                            <span>
                              {enrichingDescription ? t('drafts.fetching') : t('drafts.fetch')}
                            </span>
                          </Button>
                        </div>
                      )}

                    {(selectedJob.description || '').trim().length < 200 && (
                      <JobDescriptionInput
                        jobId={selectedJob.id}
                        onSaved={async () => {
                          await loadJobDetails(selectedJob.id);
                          await fetchPreparedJobs();
                        }}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'match' && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-4">
                        <ScoreRing score={displayMatchScore(selectedJob.match)} size={64} calibrated={isAiCalibrated(selectedJob.match)} />
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{t('drafts.overall')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('drafts.deterministic')}
                          </p>
                        </div>
                      </div>
                      {selectedJob.match?.aiInterpretation && (
                        <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                          {selectedJob.match.aiInterpretation}
                        </p>
                      )}
                    </div>

                    <Separator />

                    {strongMatches.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-neutral-900">{t('drafts.strong')}</h3>
                        <ul className="space-y-1.5 text-sm text-neutral-600">
                          {strongMatches.map((m, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {missingSkills.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-neutral-900">{t('drafts.missing')}</h3>
                        <ul className="space-y-1.5 text-sm text-neutral-600">
                          {missingSkills.map((m, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
              {t('drafts.selectPrompt')}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
