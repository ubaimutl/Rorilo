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
  Sparkles,
  Mail,
  MapPin,
  Laptop,
  Briefcase,
  TriangleAlert,
  FileText,
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

function companyHref(company: string) {
  return `/companies/${encodeURIComponent(encodeURIComponent(company))}`;
}

export default function JobDetailPage() {
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
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Editable application content
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [coverLetterContent, setCoverLetterContent] = useState('');

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
        alert(data.error || 'Failed to prepare application');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPreparing(false);
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
      if (data.success) {
        setDraftNotice('Draft created in your Gmail mailbox.');
      } else {
        setDraftNotice(data.message || 'Draft prepared. You can copy the text.');
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

  const handleDownloadPdf = () => {
    const candidateName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || 'Candidate';
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
      title: 'PDF download started',
      message: 'Check your Downloads folder.',
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
        setEnrichError(data.error || 'Could not fetch the full description.');
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
        Loading role details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-10 text-sm text-neutral-500">
        Job not found.{' '}
        <Link href="/" className="underline text-neutral-900 font-medium">
          Back to Discover
        </Link>
      </div>
    );
  }

  const match = job.match;
  const score = displayMatchScore(match);
  const calibrated = isAiCalibrated(match);

  const remoteLabel =
    job.remoteType === 'remote' ? 'Remote' : job.remoteType === 'hybrid' ? 'Hybrid' : job.remoteType === 'onsite' ? 'Onsite' : null;

  const scoreBreakdown = match
    ? [
        { label: 'Skills', value: match.skillsScore ?? 0, max: 30 },
        { label: 'Role fit', value: match.roleScore ?? 0, max: 20 },
        { label: 'Experience', value: match.experienceScore ?? 0, max: 15 },
        { label: 'Location', value: match.locationScore ?? 0, max: 15 },
        { label: 'Preferences', value: match.preferencesScore ?? 0, max: 10 },
        { label: 'Language', value: match.languageScore ?? 0, max: 5 },
        { label: 'Salary', value: match.salaryScore ?? 0, max: 5 },
      ]
    : [];

  const descriptionLength = (job.description || '').trim().length;
  const hasDescription = descriptionLength > 0;
  const descriptionNotice =
    descriptionLength === 0
      ? 'This listing arrived without a description, so the match score is based on title and location only. Open the original posting for full details.'
      : descriptionLength < 200
      ? 'Only a short preview arrived for this listing — the source did not provide a full description. Open the original posting for full details.'
      : null;
  const canEnrich =
    descriptionLength < 200 &&
    [job.applicationUrl, job.originalUrl]
      .filter((url): url is string => Boolean(url))
      .map((url) => resolveSourceUrl(url, job.source || ''))
      .some((url) => /stepstone\./i.test(url));

  const strongMatches: string[] = match?.strongMatches ? JSON.parse(match.strongMatches) : [];
  const possibleIssues: string[] = match?.possibleIssues ? JSON.parse(match.possibleIssues) : [];

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
        back={{ href: '/', label: 'Discover' }}
        title={job.title}
        description={`${job.company} · ${job.location || 'Location unlisted'} · ${
          job.remoteType ? String(job.remoteType).charAt(0).toUpperCase() + String(job.remoteType).slice(1) : ''
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
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors hidden sm:inline-block"
              >
                Open in Drafts →
              </Link>
            )}

            <Link
              href={companyHref(job.company)}
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white transition-colors hidden sm:inline-block"
            >
              Company
            </Link>

            <select
              value={job.application?.status || 'NEW'}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Application status"
              className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm font-semibold text-neutral-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
            >
              <option value="NEW">Unapplied</option>
              <option value="SAVED">Saved</option>
              <option value="READY">Prepared</option>
              <option value="APPLIED">Applied</option>
              <option value="INTERVIEW">Interview</option>
              <option value="REJECTED">Rejected</option>
              <option value="OFFER">Offer</option>
            </select>
          </>
        }
      />

      <main className="p-6 md:p-10 max-w-5xl w-full mx-auto">
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

            <Card>
              <CardHeader>
                <CardTitle>About the role</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {descriptionNotice && (
                  <Alert>
                    <TriangleAlert />
                    <AlertDescription>{descriptionNotice}</AlertDescription>
                  </Alert>
                )}
                {canEnrich && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnrich}
                      disabled={enriching}
                      className="text-xs h-8 gap-1.5"
                      title="Fetches the full posting text via one Apify detail request (about $0.001)"
                    >
                      {enriching ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                      <span>{enriching ? 'Fetching full description…' : 'Fetch full description'}</span>
                    </Button>
                    {enrichError && (
                      <span className="text-xs text-red-600 font-medium">{enrichError}</span>
                    )}
                  </div>
                )}
                {hasDescription && <FormattedDescription text={job.description} />}
              </CardContent>
            </Card>
          </div>

          {/* Right Action & Fit Summary Column */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <ScoreRing score={score} size={68} calibrated={calibrated} />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Overall match</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Deterministic 7-category score, no guesswork.
                    </p>
                  </div>
                </div>

                {match?.aiInterpretation && (
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {match.aiInterpretation}
                  </p>
                )}

                {strongMatches.length > 0 && (
                  <div className="flex flex-col gap-1 text-sm pt-1">
                    <h3 className="font-semibold text-neutral-900">Why it matches</h3>
                    <ul className="flex flex-col gap-1 text-neutral-600">
                      {strongMatches.slice(0, 4).map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-neutral-400">•</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {possibleIssues.length > 0 && (
                  <div className="flex flex-col gap-1 text-sm pt-1">
                    <h3 className="font-semibold text-neutral-900">Potential issues</h3>
                    <ul className="flex flex-col gap-1 text-neutral-600">
                      {possibleIssues.slice(0, 3).map((issue, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-neutral-400">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {scoreBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Score breakdown</CardTitle>
                  <CardDescription>Points earned per category.</CardDescription>
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
                  <CardTitle>Source coverage</CardTitle>
                  <CardDescription>
                    {sourceLabels.length > 1
                      ? `Merged from ${sourceLabels.length} sources.`
                      : 'Where this posting was found.'}
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
            <div className="space-y-2.5">
              <Button
                onClick={isPrepared ? () => setIsSheetOpen(true) : handlePrepare}
                disabled={preparing}
                className="w-full text-sm font-semibold h-10"
              >
                {preparing ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="size-4 mr-2" />
                )}
                <span>
                  {preparing
                    ? 'Preparing...'
                    : isPrepared
                    ? 'View Draft'
                    : 'Prepare application'}
                </span>
              </Button>

              {isPrepared && (
                <Button
                  onClick={handlePrepare}
                  disabled={preparing}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8 text-neutral-500"
                >
                  Regenerate material
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
                  <span>Open original job</span>
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
              Application Material
            </SheetTitle>
            <SheetDescription className="text-sm text-neutral-500">
              Review and customize your tailored materials for {job.company}.
            </SheetDescription>
          </SheetHeader>

          {/* Email Flow */}
          {isEmailMethod && (
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-900">
                  Application Email (To: {job.contactEmail})
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2000);
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
                >
                  {copiedEmail ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copiedEmail ? 'Copied' : 'Copy text'}</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-sub" className="text-xs font-medium text-neutral-700">Subject</Label>
                <Input
                  id="email-sub"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-msg" className="text-xs font-medium text-neutral-700">Message</Label>
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
                  Attachments: CV (PDF), Cover Letter (PDF)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                      job?.contactEmail || ''
                    )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      notify({
                        type: 'info',
                        title: 'Opening Gmail',
                        message: 'Rorilo is handing the draft to your browser.',
                      });
                    }}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'text-xs h-8 gap-1.5 cursor-pointer shadow-xs',
                    })}
                    title="Open pre-filled in your browser Gmail (Zero setup required)"
                  >
                    <ExternalLink className="size-3.5 text-neutral-500" />
                    <span>Open in Gmail</span>
                  </a>

                  <a
                    href={`mailto:${encodeURIComponent(
                      job?.contactEmail || ''
                    )}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                    onClick={() => {
                      notify({
                        type: 'info',
                        title: 'Opening mail app',
                        message: 'Rorilo is handing the draft to your default mail client.',
                      });
                    }}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'text-xs h-8 gap-1.5 cursor-pointer shadow-xs',
                    })}
                    title="Open pre-filled in your desktop email app"
                  >
                    <Mail className="size-3.5 text-neutral-500" />
                    <span>Open in Mail App</span>
                  </a>

                  <Button
                    onClick={handleCreateDraft}
                    disabled={draftingEmail}
                    size="sm"
                    className="text-xs h-8 gap-1.5 shadow-xs"
                    title="Create draft in Gmail account via API"
                  >
                    {draftingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 mr-1" />}
                    <span>Save to Gmail Drafts</span>
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
              <span className="font-semibold text-neutral-900">Cover Letter</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as any)}
                  aria-label="Cover letter template"
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
                  <span>Download PDF</span>
                </Button>
              </div>
            </div>
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
                Common Screening Answers
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
