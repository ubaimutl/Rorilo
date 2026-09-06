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
  ExternalLink,
  Briefcase,
  FileText,
  CheckCircle2,
  AlertCircle,
  Mail,
  RotateCcw,
  TriangleAlert,
  ArrowLeft,
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
import { formatCurrency, formatDate } from '@/lib/utils';
import { resolveSourceUrl } from '@/lib/jobs/normalize';
import { useI18n } from '@/components/I18nProvider';
import { downloadCoverLetterPdf, CoverLetterTemplate, COVER_LETTER_TEMPLATES } from '@/lib/pdf/generatePdf';

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

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedJob) return;
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selectedJob.id, status: newStatus }),
      });
      if (res.ok) {
        setAppliedStatusNotice(`Status updated to ${newStatus}`);
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
      if (data.success) {
        setDraftNotice('Draft created in your Gmail mailbox.');
      } else {
        setDraftNotice(data.message || 'Draft prepared. You can copy the text below.');
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
        setMaterialNotice(data.enriched ? 'Full description loaded.' : 'Description already complete.');
        setTimeout(() => setMaterialNotice(null), 2500);
      } else {
        setMaterialNotice(data.error || 'Could not fetch the full description.');
      }
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setEnrichingDescription(false);
    }
  };

  const handleRegenerateMaterials = async () => {
    if (!selectedJob) return;
    const shouldRegenerate = window.confirm(
      'Regenerate application materials for this job? This will replace the current cover letter, email draft, and Q&A.'
    );
    if (!shouldRegenerate) return;

    setRegenerating(true);
    setMaterialNotice(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/prepare`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setMaterialNotice(data.error || 'Could not regenerate materials.');
        return;
      }

      if (data.materials?.coverLetter) setCoverLetterContent(data.materials.coverLetter);
      if (data.materials?.emailSubject) setEmailSubject(data.materials.emailSubject);
      if (data.materials?.emailBody) setEmailBody(data.materials.emailBody);

      await loadJobDetails(selectedJob.id);
      await fetchPreparedJobs();
      setMaterialNotice('Materials regenerated.');
      setTimeout(() => setMaterialNotice(null), 2500);
    } catch (err) {
      setMaterialNotice((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedJob) return;
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
        companyName: selectedJob.company,
        contactPerson: selectedJob.contactName || undefined,
        jobTitle: selectedJob.title,
        content: coverLetterContent,
        template: selectedTemplate,
      },
      `Cover_Letter_${selectedJob.company.replace(/\s+/g, '_')}.pdf`
    );
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
    <div className="flex-1 flex flex-col min-w-0 bg-background h-screen overflow-hidden">
      <PageHeader
        title={t('drafts.title')}
        description={t('drafts.description')}
        badge={
          <span className="text-xs text-neutral-500 font-semibold bg-neutral-200/70 px-2.5 py-0.5 rounded-full">
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
      <div className="flex-1 flex min-h-0">
        {/* Left Column: Prepared Jobs List (340px) */}
        <aside className={`w-full md:w-80 lg:w-96 border-r border-neutral-200 flex-col bg-neutral-50/50 shrink-0 overflow-y-auto ${selectedJobId ? 'hidden md:flex' : 'flex'}`}>
          {loading ? (
            <div className="flex flex-col gap-4 p-4" aria-label="Loading prepared jobs">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
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
                  <EmptyTitle>No drafts yet</EmptyTitle>
                  <EmptyDescription>
                    Open a role in Discover and prepare the application materials.
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
            <div className="divide-y divide-neutral-200/80">
              {preparedJobs.map((item) => {
                const isSelected = item.job.id === selectedJobId;
                const score = displayMatchScore(item.job.match);
                const inactiveDays = getInactiveDays(item.updatedAt);

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedJobId(item.job.id)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer block border-l-2 ${
                      isSelected
                        ? 'bg-white border-l-neutral-900 shadow-xs'
                        : 'border-l-transparent hover:bg-neutral-100/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        company={item.job.company}
                        website={item.job.companyWebsite}
                        directLogoUrl={item.job.companyLogo}
                        size={34}
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-neutral-900 truncate tracking-tight">
                          {item.job.title}
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">
                          {item.job.company} · {item.job.location || 'Remote'}
                        </p>
                      </div>
                      <ScoreRing score={score} size={34} calibrated={isAiCalibrated(item.job.match)} />
                    </div>

                    <div className="flex items-center justify-between mt-2.5 text-xs text-neutral-400">
                      <span className="font-medium text-neutral-600 capitalize">
                        {item.status.toLowerCase().replace('_', ' ')}
                      </span>
                      <span>{formatDate(item.updatedAt)}</span>
                    </div>
                    {inactiveDays >= 3 && (
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        Send or archive?
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Column: Selected Job Detail & Application Material */}
        <main className={`flex-1 flex-col min-w-0 bg-background overflow-y-auto ${selectedJobId ? 'flex' : 'hidden md:flex'}`}>
          {selectedJob ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Right Panel Header */}
              <div className="px-4 sm:px-8 py-5 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background sticky top-0 z-10 shrink-0">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedJobId(null)}
                    className="md:hidden text-sm font-medium text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5 transition-colors mb-1 cursor-pointer"
                  >
                    <ArrowLeft className="size-4" />
                    <span>All drafts</span>
                  </button>
                  <h1 className="text-xl font-bold text-neutral-900 tracking-tight truncate">
                    {selectedJob.title}
                  </h1>
                  <p className="text-xs text-neutral-500 mt-1">
                    {selectedJob.company} · {selectedJob.location || 'Remote'} ·{' '}
                    <span className="capitalize">{selectedJob.remoteType}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {appliedStatusNotice && (
                    <span className="text-xs text-emerald-700 font-medium">{appliedStatusNotice}</span>
                  )}
                  {materialNotice && (
                    <span className={`text-xs font-medium ${materialNotice.includes('regenerated') ? 'text-emerald-700' : 'text-red-600'}`}>
                      {materialNotice}
                    </span>
                  )}

                  <Button
                    onClick={handleRegenerateMaterials}
                    disabled={regenerating}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5"
                  >
                    {regenerating ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    <span>{regenerating ? 'Regenerating...' : 'Regenerate'}</span>
                  </Button>

                  {selectedJob.application?.status !== 'APPLIED' ? (
                    <Button
                      onClick={() => handleStatusChange('APPLIED')}
                      size="sm"
                      className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>Mark as Applied</span>
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1">
                      <Check className="size-3.5" /> Applied
                    </span>
                  )}

                  <select
                    value={selectedJob.application?.status || 'READY'}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    aria-label="Change status"
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs font-semibold text-neutral-800 outline-none cursor-pointer"
                  >
                    <option value="READY">Prepared</option>
                    <option value="APPLIED">Applied</option>
                    <option value="INTERVIEW">Interview</option>
                    <option value="OFFER">Offer</option>
                    <option value="REJECTED">Rejected</option>
                  </select>

                  {selectedJob.applicationUrl && (
                    <a
                      href={selectedJob.applicationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 gap-1' })}
                    >
                      <span>Website</span>
                      <ExternalLink className="size-3 text-neutral-400" />
                    </a>
                  )}
                </div>
              </div>

              {/* Right Side Top Menu (Tabs) */}
              <div className="px-4 sm:px-8 pt-4 sm:pt-5 shrink-0 overflow-x-auto">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'material' | 'description' | 'match')}>
                  <TabsList>
                    <TabsTrigger value="material">
                      <FileText />
                      <span className="hidden sm:inline">Application Material</span>
                      <span className="sm:hidden">Material</span>
                    </TabsTrigger>
                    <TabsTrigger value="description">
                      <Briefcase />
                      <span className="hidden sm:inline">Job Description</span>
                      <span className="sm:hidden">Role</span>
                    </TabsTrigger>
                    <TabsTrigger value="match">
                      <Sparkles />
                      <span className="hidden sm:inline">Match & Notes</span>
                      <span className="sm:hidden">Match</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 p-4 sm:p-8 max-w-4xl w-full overflow-y-auto">
                {shouldSuggestDraftAction && (
                  <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        This draft has waited {selectedDraftInactiveDays} days.
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Move it forward or archive it to keep Drafts clean.
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
                        <span>Mark applied</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange('IGNORED')}
                        className="h-8 text-xs"
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                )}
                {activeTab === 'material' && (
                  <div className="space-y-8">
                    {/* Email Draft Section */}
                    {selectedJob.contactEmail && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-sm font-semibold text-neutral-900">
                              Application Email (To: {selectedJob.contactEmail})
                            </h2>
                            <p className="text-xs text-neutral-500 mt-0.5">
                              Tailored introduction for human review before dispatch.
                            </p>
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
                            <span>{copiedEmail ? 'Copied' : 'Copy text'}</span>
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="prep-email-sub" className="text-xs font-medium text-neutral-700">Subject</Label>
                          <Input
                            id="prep-email-sub"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            className="text-sm h-9"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="prep-email-msg" className="text-xs font-medium text-neutral-700">Message</Label>
                          <Textarea
                            id="prep-email-msg"
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            rows={8}
                            className="text-sm font-sans leading-relaxed bg-white"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                          <span className="text-xs text-neutral-400">
                            Attachments: Resume (PDF), Cover Letter (PDF)
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 1-Click Open in Gmail Web Compose (Zero Auth Needed) */}
                            <a
                              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                                selectedJob.contactEmail || ''
                              )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                              target="_blank"
                              rel="noreferrer"
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

                            {/* 1-Click Open in Default Mail Client (Apple Mail, Outlook, Thunderbird) */}
                            <a
                              href={`mailto:${encodeURIComponent(
                                selectedJob.contactEmail || ''
                              )}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
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

                            {/* API Background Draft (If Google Cloud OAuth is configured) */}
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

                        <Separator />
                      </div>
                    )}

                    {/* Cover Letter Section */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold text-neutral-900">
                            Tailored Cover Letter
                          </h2>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Fact-checked against your profile with zero invented qualifications.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-neutral-500 font-medium">Design:</label>
                          <select
                            value={selectedTemplate}
                            onChange={(e) => setSelectedTemplate(e.target.value as any)}
                            aria-label="Cover letter template"
                            className="h-8 rounded-lg border border-input bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 outline-none cursor-pointer shadow-xs"
                          >
                            {COVER_LETTER_TEMPLATES.map((tmpl) => (
                              <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.name} ({tmpl.tagline})
                              </option>
                            ))}
                          </select>

                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleDownloadPdf}
                            className="text-xs h-8 gap-1.5 shadow-xs"
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
                        className="min-h-96 text-[15px] font-sans leading-7 bg-white px-5 py-4"
                      />
                    </div>

                    {/* Screening Q&A */}
                    {qaData?.answers && qaData.answers.length > 0 && (
                      <div className="space-y-4 pt-2">
                        <div>
                          <h2 className="text-sm font-semibold text-neutral-900">
                            Screening Questions & Answers
                          </h2>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Ready responses for common web application forms.
                          </p>
                        </div>

                        <div className="space-y-3">
                          {qaData.answers.map((qa, i) => (
                            <div key={i} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1.5">
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
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Original Posting
                      </h2>
                      {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                        <p className="text-base font-semibold text-neutral-900 mt-2">
                          {formatCurrency(selectedJob.salaryMin, selectedJob.salaryCurrency || 'USD')}
                          {selectedJob.salaryMax && selectedJob.salaryMax !== selectedJob.salaryMin
                            ? ` – ${formatCurrency(selectedJob.salaryMax, selectedJob.salaryCurrency || 'USD')}`
                            : ''}
                        </p>
                      )}
                    </div>

                    {(selectedJob.description || '').trim().length < 200 && (
                      <Alert>
                        <TriangleAlert />
                        <AlertDescription>
                          {(selectedJob.description || '').trim().length === 0
                            ? 'This listing arrived without a description, so the match score is based on title and location only.'
                            : 'Only a short preview arrived for this listing — the source did not provide a full description.'}{' '}
                          Open the original posting for full details.
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
                            title="Fetches the full posting text via one Apify detail request (about $0.001)"
                          >
                            {enrichingDescription ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <FileText className="size-3.5" />
                            )}
                            <span>
                              {enrichingDescription ? 'Fetching full description…' : 'Fetch full description'}
                            </span>
                          </Button>
                        </div>
                      )}

                    {(selectedJob.description || '').trim().length > 0 && (
                      <FormattedDescription
                        text={selectedJob.description}
                        className="text-sm leading-relaxed"
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
                          <p className="text-sm font-semibold text-neutral-900">Overall match</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Deterministic 7-category score.
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
                        <h3 className="text-sm font-semibold text-neutral-900">Strong Matches</h3>
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
                        <h3 className="text-sm font-semibold text-neutral-900">Missing Skills</h3>
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
              Select a prepared job from the left list to inspect materials.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
