'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ExternalLink,
  Loader2,
  Check,
  Copy,
  Download,
  Send,
  Save,
  Sparkles,
  Mail,
  MapPin,
  Laptop,
  Briefcase,
  TriangleAlert,
  FileText,
  Edit2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScoreRing, displayMatchScore, isAiCalibrated } from '@/components/ScoreRing';
import { CompanyLogo } from '@/components/CompanyLogo';
import { FormattedDescription } from '@/components/FormattedDescription';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/utils';
import { resolveSourceUrl } from '@/lib/jobs/normalize';
import { downloadCoverLetterPdf, CoverLetterTemplate, COVER_LETTER_TEMPLATES } from '@/lib/pdf/generatePdf';
import { notify } from '@/components/AppNotifications';
import { useI18n } from '@/components/I18nProvider';
import { JobDescriptionInput } from '@/components/JobDescriptionInput';
import { RequestChanges } from '@/components/RequestChanges';

function companyHref(company: string) {
  return `/companies/${encodeURIComponent(encodeURIComponent(company))}`;
}

export default function JobDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CoverLetterTemplate>('german_din');
  const [enriching, setEnriching] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Editable application content
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [coverLetterContent, setCoverLetterContent] = useState('');
  const [revisingEmail, setRevisingEmail] = useState(false);
  const [revisingCover, setRevisingCover] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [editingContactEmail, setEditingContactEmail] = useState(false);
  const [contactEmailInput, setContactEmailInput] = useState('');

  const fetchJob = async (trackView = false) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/jobs/${id}${trackView ? '?trackView=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);

        // Populate documents if already prepared
        const cl = data.job.application?.documents?.find((d: any) => d.type === 'COVER_LETTER');
        if (cl) setCoverLetterContent(cl.content);

        const em = data.job.application?.documents?.find((d: any) => d.type === 'EMAIL_DRAFT');
        if (em) {
          try {
            const parsed = JSON.parse(em.content);
            setEmailSubject(parsed.subject || '');
            setEmailBody(parsed.body || '');
          } catch {
            setEmailBody(em.content);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob(true);
  }, [id]);

  useEffect(() => {
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => setProfile(data.profile || null))
      .catch(() => setProfile(null));
  }, []);

  const handlePrepare = async () => {
    setPreparing(true);
    setDraftNotice(null);
    try {
      const res = await fetch(`/api/jobs/${id}/prepare`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.materials?.coverLetter) setCoverLetterContent(data.materials.coverLetter);
        if (data.materials?.emailSubject) setEmailSubject(data.materials.emailSubject);
        if (data.materials?.emailBody) setEmailBody(data.materials.emailBody);
        await fetchJob();
        setIsSheetOpen(true);
      } else {
        notify({ title: data.error || t('jobdetail.prepareFailed'), type: 'error' });
      }
    } catch (err) {
      notify({ title: (err as Error).message, type: 'error' });
    } finally {
      setPreparing(false);
    }
  };

  const handleSaveContactEmail = async () => {
    if (!job) return;
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: contactEmailInput }),
      });
      if (res.ok) {
        setEditingContactEmail(false);
        await fetchJob();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateDraft = async () => {
    if (!job?.application?.id) return;
    setDraftingEmail(true);
    setDraftNotice(null);
    try {
      const res = await fetch(`/api/applications/${job.application.id}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: emailSubject,
          body: emailBody,
          to: job.contactEmail,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraftNotice(t('material.draftCreated'));
      } else {
        setDraftNotice(data.error || data.message || t('material.draftFallback'));
      }
      await fetchJob();
    } catch (err) {
      setDraftNotice((err as Error).message);
    } finally {
      setDraftingEmail(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, status: newStatus }),
      });
      if (res.ok) {
        fetchJob();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const coverDoc = job?.application?.documents?.find((d: any) => d.type === 'COVER_LETTER');
  const emailDoc = job?.application?.documents?.find((d: any) => d.type === 'EMAIL_DRAFT');

  const flashDraftNotice = (message: string) => {
    setDraftNotice(message);
    setTimeout(() => setDraftNotice(null), 2500);
  };

  const handleReviseEmail = async (instruction: string): Promise<string | null> => {
    if (!job) return t('revise.failed');
    setRevisingEmail(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/revise`, {
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
    if (!job) return t('revise.failed');
    setRevisingCover(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/revise`, {
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
    if (!job || !emailDoc) return;
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
        setDraftNotice(data.error || t('revise.saveFailed'));
        return;
      }
      await fetchJob();
      flashDraftNotice(t('revise.saved'));
    } catch (err) {
      setDraftNotice((err as Error).message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveCover = async () => {
    if (!job || !coverDoc) return;
    setSavingCover(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coverDoc.id, content: coverLetterContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftNotice(data.error || t('revise.saveFailed'));
        return;
      }
      await fetchJob();
      flashDraftNotice(t('revise.saved'));
    } catch (err) {
      setDraftNotice((err as Error).message);
    } finally {
      setSavingCover(false);
    }
  };

  const handleDownloadPdf = () => {
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
        companyName: job.company,
        contactPerson: job.contactName || undefined,
        jobTitle: job.title,
        content: coverLetterContent,
        template: selectedTemplate,
      },
      `Cover_Letter_${job.company.replace(/\s+/g, '_')}.pdf`
    );
    notify({
      type: 'success',
      title: t('coverletter.pdfStarted'),
      message: t('coverletter.pdfHint'),
    });
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch(`/api/jobs/${id}/enrich`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchJob();
      } else {
        setEnrichError(data.error || t('drafts.descFailed'));
      }
    } catch (err) {
      setEnrichError((err as Error).message);
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-28 text-sm text-neutral-400 gap-2.5">
        <Loader2 className="size-4.5 animate-spin" />
        {t('jobdetail.loading')}
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-10 text-sm text-neutral-500">
        {t('jobdetail.notFound')}{' '}
        <Link href="/" className="underline text-neutral-900 font-medium">
          {t('company.back')}
        </Link>
      </div>
    );
  }

  const match = job.match;
  const score = displayMatchScore(match);
  const calibrated = isAiCalibrated(match);

  const remoteLabel =
    job.remoteType === 'remote' ? t('discover.workplace.remote') : job.remoteType === 'hybrid' ? t('discover.workplace.hybrid') : job.remoteType === 'onsite' ? t('discover.workplace.onsite') : null;

  const scoreBreakdown = match
    ? [
        { label: t('jobdetail.skills'), value: match.skillsScore ?? 0, max: 30 },
        { label: t('jobdetail.roleFit'), value: match.roleScore ?? 0, max: 20 },
        { label: t('jobdetail.experience'), value: match.experienceScore ?? 0, max: 15 },
        { label: t('jobdetail.location'), value: match.locationScore ?? 0, max: 15 },
        { label: t('jobdetail.preferences'), value: match.preferencesScore ?? 0, max: 10 },
        { label: t('jobdetail.language'), value: match.languageScore ?? 0, max: 5 },
        { label: t('jobdetail.salary'), value: match.salaryScore ?? 0, max: 5 },
      ]
    : [];

  const descriptionLength = (job.description || '').trim().length;
  const hasDescription = descriptionLength > 0;
  const descriptionNotice =
    descriptionLength === 0
      ? `${t('drafts.noDesc')} ${t('drafts.openOriginalHint')}`
      : descriptionLength < 200
      ? `${t('drafts.shortDesc')} ${t('drafts.openOriginalHint')}`
      : null;
  const canEnrich =
    descriptionLength < 200 &&
    [job.applicationUrl, job.originalUrl]
      .filter((url): url is string => Boolean(url))
      .map((url) => resolveSourceUrl(url, job.source || ''))
      .some((url) => /stepstone\./i.test(url));

  const strongMatches: string[] = match?.strongMatches ? JSON.parse(match.strongMatches) : [];
  const possibleIssues: string[] = match?.possibleIssues ? JSON.parse(match.possibleIssues) : [];
  const missingSkills: string[] = match?.missingSkills ? JSON.parse(match.missingSkills) : [];

  const isEmailMethod = Boolean(job.contactEmail);
  const isPrepared = Boolean(coverLetterContent || emailBody);
  const sourceLabels: string[] = Array.isArray(job.sourceLabels)
    ? job.sourceLabels
    : String(job.source || '').split(',').map((source) => source.trim()).filter(Boolean);
  const sourceLinks: Array<{ source: string; url: string; seenAt?: string }> = Array.isArray(job.sourceLinks)
    ? job.sourceLinks
    : [];

  const answersDoc = job.application?.documents?.find((d: any) => d.type === 'ANSWERS');
  let qaData: { answers?: Array<{ question: string; answer: string }> } = {};
  if (answersDoc) {
    try {
      qaData = JSON.parse(answersDoc.content);
    } catch {}
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        back={{ href: '/', label: t('discover.title') }}
        title={job.title}
        description={`${job.company} · ${job.location || t('jobdetail.locationUnlisted')} · ${
          remoteLabel || ''
        }`}
        badge={
          <CompanyLogo
            company={job.company}
            website={job.companyWebsite}
            directLogoUrl={job.companyLogo}
            size={30}
          />
        }
        actions={
          <>
            {isPrepared && (
              <Link
                href="/prepared"
                className="h-10 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 motion-safe:transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation hidden sm:inline-flex"
              >
                {t('material.openInDrafts')}
              </Link>
            )}

            <Link
              href={companyHref(job.company)}
              className="h-10 inline-flex items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:text-foreground motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation hidden sm:inline-flex"
            >
              {t('jobdetail.company')}
            </Link>

            <select
              value={job.application?.status || 'NEW'}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label={t('tracker.statusAria')}
              className="h-10 rounded-full border border-border bg-card px-4 text-sm font-semibold cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="NEW">{t('jobdetail.unapplied')}</option>
              <option value="SAVED">{t('discover.tabs.saved')}</option>
              <option value="READY">{t('drafts.statusReady')}</option>
              <option value="APPLIED">{t('tracker.colApplied')}</option>
              <option value="INTERVIEW">{t('tracker.colInterview')}</option>
              <option value="REJECTED">{t('tracker.colRejected')}</option>
              <option value="OFFER">{t('tracker.colOffer')}</option>
            </select>
          </>
        }
      />

      <main className="px-4 sm:px-6 lg:px-8 py-6 md:py-8 max-w-5xl w-full mx-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          {/* Main Column: Clean Reading Document (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {(job.salaryMin || job.salaryMax) && (
              <p className="text-lg font-semibold text-neutral-900 tracking-tight">
                {formatCurrency(job.salaryMin, job.salaryCurrency || 'USD')}
                {job.salaryMax && job.salaryMax !== job.salaryMin
                  ? ` – ${formatCurrency(job.salaryMax, job.salaryCurrency || 'USD')}`
                  : ''}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {job.location && (
                <Badge variant="outline">
                  <MapPin />
                  {job.location}
                </Badge>
              )}
              {remoteLabel && (
                <Badge variant="outline">
                  <Laptop />
                  {remoteLabel}
                </Badge>
              )}
              {job.employmentType && (
                <Badge variant="outline">
                  <Briefcase />
                  {job.employmentType}
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-4 mt-8">
              {descriptionNotice && (
                <Alert>
                  <TriangleAlert />
                  <AlertDescription>{descriptionNotice}</AlertDescription>
                </Alert>
              )}
              {canEnrich && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="text-xs h-8 gap-1.5"
                    title={t('drafts.fetchTitle')}
                  >
                    {enriching ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                    <span>{enriching ? t('drafts.fetching') : t('drafts.fetch')}</span>
                  </Button>
                  {enrichError && (
                    <span className="text-xs text-red-600 font-medium">{enrichError}</span>
                  )}
                </div>
              )}
              {!isEditingDesc && hasDescription && (
                <div className="group relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditingDesc(true)}
                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 size-8 bg-white/80 backdrop-blur-sm"
                    title={t('common.edit' as any) || 'Edit description'}
                  >
                    <Edit2 className="size-3.5" />
                  </Button>
                  <FormattedDescription text={job.description} />
                </div>
              )}
              
              {(!hasDescription || isEditingDesc || descriptionLength < 200) && (
                <JobDescriptionInput 
                  jobId={job.id} 
                  initialValue={job.description || ''} 
                  onSaved={() => {
                    setIsEditingDesc(false);
                    fetchJob();
                  }}
                  onCancel={hasDescription && descriptionLength >= 200 ? () => setIsEditingDesc(false) : undefined}
                />
              )}
            </div>
          </div>

          {/* Right Action & Fit Summary Column */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <section className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]">
              {match ? (
                <div className="flex items-center gap-4">
                  <ScoreRing score={score} size={72} calibrated={calibrated} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('drafts.overall')}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums leading-none tracking-tight">{score}<span className="text-lg font-semibold text-muted-foreground">%</span></p>
                  </div>
                </div>
              ) : (
                <Alert>
                  <TriangleAlert />
                  <AlertDescription>{t('jobdetail.profileNeeded')}</AlertDescription>
                </Alert>
              )}

              {match?.aiInterpretation && (
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed text-pretty">
                  {match.aiInterpretation}
                </p>
              )}

              {strongMatches.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('jobdetail.why')}</h3>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {strongMatches.slice(0, 6).map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 h-8 text-[13px] font-medium text-primary-foreground">
                        <Check className="size-3.5" aria-hidden="true" />
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {missingSkills.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('jobcard.missing')}</h3>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {missingSkills.slice(0, 6).map((m, i) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-border px-3 h-8 text-[13px] font-medium text-muted-foreground">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {possibleIssues.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('jobdetail.issues')}</h3>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
                    {possibleIssues.slice(0, 3).map((issue, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {scoreBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('jobdetail.breakdown')}</CardTitle>
                  <CardDescription>{t('jobdetail.points')}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {scoreBreakdown.map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="text-neutral-600">{row.label}</span>
                        <span className="font-semibold tabular-nums text-neutral-900">
                          {row.value}/{row.max}
                        </span>
                      </div>
                      <Progress value={row.max > 0 ? (row.value / row.max) * 100 : 0} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(sourceLabels.length > 0 || sourceLinks.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('company.sourceTitle')}</CardTitle>
                  <CardDescription>
                    {sourceLabels.length > 1
                      ? t('jobdetail.merged', { count: sourceLabels.length })
                      : t('jobdetail.foundWhere')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {sourceLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sourceLabels.map((source) => (
                        <Badge key={source} variant="outline">{source}</Badge>
                      ))}
                    </div>
                  )}
                  {sourceLinks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {sourceLinks.slice(0, 4).map((entry, index) => (
                        <a
                          key={`${entry.source}-${index}`}
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-neutral-100 px-2.5 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
                        >
                          <span className="truncate">{entry.source}</span>
                          <ExternalLink className="size-3.5 shrink-0 text-neutral-400" />
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-3 shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]">
              <Button
                onClick={isPrepared ? () => setIsSheetOpen(true) : handlePrepare}
                disabled={preparing}
                size="lg"
                className="w-full"
              >
                {preparing ? (
                  <Loader2 className="size-4 animate-spin mr-2" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-4 mr-2" aria-hidden="true" />
                )}
                <span>
                  {preparing
                    ? t('material.preparing')
                    : isPrepared
                    ? t('material.viewDraft')
                    : t('material.prepareApplication')}
                </span>
              </Button>

              {isPrepared && (
                <Button
                  onClick={handlePrepare}
                  disabled={preparing}
                  variant="outline"
                  className="w-full"
                >
                  {t('material.regenerate')}
                </Button>
              )}

              {job.applicationUrl && (
                <a
                  href={job.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'w-full text-sm h-10 justify-center font-medium',
                  })}
                >
                  <span>{t('material.openOriginal')}</span>
                  <ExternalLink className="size-4 ml-1.5 text-neutral-400" />
                </a>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Slide-over Application Material Panel */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-2xl lg:max-w-3xl w-full overflow-y-auto overflow-x-hidden p-6 sm:p-8 space-y-6">
          <SheetHeader className="p-0 space-y-1">
            <SheetTitle className="text-base font-semibold tracking-tight text-neutral-900">
              {t('jobdetail.sheetTitle')}
            </SheetTitle>
            <SheetDescription className="text-sm text-neutral-500">
              {t('jobdetail.sheetDesc', { company: job.company })}
            </SheetDescription>
          </SheetHeader>

          {/* Email Flow */}
          {isEmailMethod && (
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex-1">
                  {editingContactEmail ? (
                    <div className="flex items-center gap-2 max-w-sm">
                      <Input 
                        value={contactEmailInput} 
                        onChange={(e) => setContactEmailInput(e.target.value)} 
                        placeholder="Recruiter email..." 
                        className="h-8 text-xs" 
                      />
                      <Button size="sm" onClick={handleSaveContactEmail} className="h-8 text-xs px-3">{t('revise.save')}</Button>
                      {job.contactEmail && <Button size="sm" variant="ghost" onClick={() => setEditingContactEmail(false)} className="h-8 px-2 text-xs">{t('common.cancel')}</Button>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingContactEmail(true)}>
                      {job.contactEmail ? (
                        <h2 className="text-sm font-semibold text-neutral-900 border-b border-dashed border-neutral-300 pb-0.5 hover:border-neutral-500 transition-colors">
                          {t('material.emailTo', { email: job.contactEmail })}
                        </h2>
                      ) : (
                        <Button variant="secondary" size="sm" className="h-7 text-xs gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200">
                          <Mail className="size-3.5" />
                          Set Recruiter Email
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2000);
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
                >
                  {copiedEmail ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copiedEmail ? t('material.copied') : t('material.copyText')}</span>
                </button>
              </div>

              <RequestChanges
                inputId="job-revise-email"
                applying={revisingEmail}
                onApply={handleReviseEmail}
              />

              <div className="space-y-1.5">
                <Label htmlFor="email-sub" className="text-xs font-medium text-neutral-700">{t('material.subject')}</Label>
                <Input
                  id="email-sub"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-msg" className="text-xs font-medium text-neutral-700">{t('material.message')}</Label>
                <Textarea
                  id="email-msg"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="text-sm font-sans leading-relaxed bg-white"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <span className="text-xs text-neutral-400">
                  {t('material.attachments', { list: 'CV (PDF), Cover Letter (PDF)' })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {emailDoc && (
                    <Button
                      onClick={handleSaveEmail}
                      disabled={savingEmail}
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 gap-1.5 shadow-xs"
                    >
                      {savingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      <span>{savingEmail ? t('common.saving') : t('revise.save')}</span>
                    </Button>
                  )}
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                      job?.contactEmail || ''
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
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'text-xs h-8 gap-1.5 cursor-pointer shadow-xs',
                    })}
                    title={t('drafts.gmailTitle')}
                  >
                    <ExternalLink className="size-3.5 text-neutral-500" />
                    <span>{t('material.openGmail')}</span>
                  </a>

                  <a
                    href={`mailto:${encodeURIComponent(
                      job?.contactEmail || ''
                    )}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                    onClick={() => {
                      notify({
                        type: 'info',
                        title: t('drafts.openingMail'),
                        message: t('drafts.handingClient'),
                      });
                    }}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'text-xs h-8 gap-1.5 cursor-pointer shadow-xs',
                    })}
                    title={t('drafts.mailTitle')}
                  >
                    <Mail className="size-3.5 text-neutral-500" />
                    <span>{t('material.openMailApp')}</span>
                  </a>

                  <Button
                    onClick={handleCreateDraft}
                    disabled={draftingEmail}
                    size="sm"
                    className="text-xs h-8 gap-1.5 shadow-xs"
                    title={t('drafts.apiTitle')}
                  >
                    {draftingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 mr-1" />}
                    <span>{t('material.saveGmailDrafts')}</span>
                  </Button>
                </div>
              </div>

              {draftNotice && (
                <p className="text-sm text-emerald-700 font-medium">{draftNotice}</p>
              )}
            </div>
          )}

          <Separator />

          {/* Cover Letter */}
          <div className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm">
              <span className="font-semibold text-neutral-900">{t('material.coverLetter')}</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as any)}
                  aria-label={t('coverletter.templateAria')}
                  className="h-8 max-w-[200px] sm:max-w-[240px] truncate rounded-lg border border-input bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 outline-none cursor-pointer shadow-xs"
                >
                  {COVER_LETTER_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>

                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownloadPdf}
                  className="text-xs h-8 gap-1.5 shadow-xs shrink-0"
                >
                  <Download className="size-3.5" />
                  <span>{t('material.downloadPdf')}</span>
                </Button>
                {coverDoc && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveCover}
                    disabled={savingCover}
                    className="text-xs h-8 gap-1.5 shadow-xs shrink-0"
                  >
                    {savingCover ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    <span>{savingCover ? t('common.saving') : t('revise.save')}</span>
                  </Button>
                )}
              </div>
            </div>
            <RequestChanges
              inputId="job-revise-cover"
              applying={revisingCover}
              onApply={handleReviseCover}
            />
            <Textarea
              value={coverLetterContent}
              onChange={(e) => setCoverLetterContent(e.target.value)}
              rows={12}
              className="min-h-96 w-full text-[14px] font-sans leading-relaxed bg-white px-4 py-3"
            />
          </div>

          {/* Interview Q&A */}
          {qaData?.answers && qaData.answers.length > 0 && (
            <div className="space-y-3.5 pt-2">
              <span className="font-semibold text-neutral-900 text-sm block">
                {t('material.commonAnswers')}
              </span>
              <div className="space-y-2.5">
                {qaData.answers.map((qa, i) => (
                  <div key={i} className="text-sm p-3.5 rounded-lg border border-neutral-100 bg-neutral-50/70 space-y-1">
                    <p className="font-medium text-neutral-900">{qa.question}</p>
                    <p className="text-neutral-600 leading-relaxed text-sm">{qa.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
