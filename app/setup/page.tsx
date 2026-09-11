'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  Search,
  Settings,
  Upload,
  User,
  Image as ImageIcon,
  ExternalLink,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SecretInput } from '@/components/SecretInput';
import { ModelPicker } from '@/components/ModelPicker';
import { KNOWN_JOB_SOURCES, orderApifyPicker } from '@/lib/job-sources/sources';
import { orderFreeSources } from '@/lib/job-sources/free';
import { COUNTRY_OPTIONS, sourceCoverageGroupTitle, sourceCoverageLabel, sourceCoveragePriority } from '@/lib/job-sources/countries';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';
import type { TranslationKey } from '@/lib/i18n';

type StepId = 'ai' | 'cv' | 'profile' | 'writing' | 'sources' | 'dispatch';

const STEPS: Array<{ id: StepId; titleKey: TranslationKey; hintKey: TranslationKey; icon: React.ElementType }> = [
  { id: 'ai', titleKey: 'setup.stepAiTitle', hintKey: 'setup.stepAiHint', icon: KeyRound },
  { id: 'cv', titleKey: 'setup.stepCvTitle', hintKey: 'setup.stepCvHint', icon: FileText },
  { id: 'profile', titleKey: 'setup.stepProfileTitle', hintKey: 'setup.stepProfileHint', icon: User },
  { id: 'writing', titleKey: 'setup.stepWritingTitle', hintKey: 'setup.stepWritingHint', icon: Settings },
  { id: 'sources', titleKey: 'setup.stepSourcesTitle', hintKey: 'setup.stepSourcesHint', icon: Search },
  { id: 'dispatch', titleKey: 'setup.stepDispatchTitle', hintKey: 'setup.stepDispatchHint', icon: Mail },
];

const SETUP_AREA_STEPS = STEPS.filter((step) => step.id !== 'dispatch');
const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

function splitComma(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitUrls(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function stepComplete(step: StepId, state: WizardState): boolean {
  if (step === 'ai') return Boolean(state.aiModel.trim() && (state.hasAiKey || state.aiApiKey.trim()));
  if (step === 'cv') return Boolean(state.activeCvName || state.cvText.trim() || state.cvFileName);
  if (step === 'profile') return Boolean(state.firstName.trim() && state.email.trim());
  if (step === 'writing') return Boolean(state.desiredTitles.trim() || state.currentTitle.trim());
  if (step === 'sources') return state.sourcesSaved && (state.freeEnabled.length > 0 || (state.hasApifyToken && state.apifyActorIds.length > 0));
  return false;
}

type WizardState = {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiStructuredOutput: boolean;
  aiDisableReasoning: boolean;
  aiProviderOptionsJson: string;
  hasAiKey: boolean;
  cvText: string;
  cvFile: File | null;
  cvFileName: string;
  activeCvName: string;
  cvParsedByAi: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedIn: string;
  gitHub: string;
  portfolio: string;
  additionalUrls: string;
  currentTitle: string;
  yearsExperience: number;
  skills: string;
  languages: string;
  desiredTitles: string;
  excludedCompanies: string;
  remotePreference: string;
  salaryCurrency: string;
  coverLetterLanguage: string;
  writingTone: string;
  writingStyle: string;
  aiNotes: string;
  apifyToken: string;
  hasApifyToken: boolean;
  apifyActorIds: string[];
  freeEnabled: string[];
  adzunaAppId: string;
  adzunaAppKey: string;
  techmapKey: string;
  sourcesSaved: boolean;
  logoToken: string;
  hasLogoToken: boolean;
  logoKeyType: string | null;
  emailUser: string;
  emailClientId: string;
  emailClientSecret: string;
};

const DEFAULT_STATE: WizardState = {
  aiBaseUrl: 'https://api.openai.com/v1',
  aiApiKey: '',
  aiModel: DEFAULT_AI_MODEL,
  aiStructuredOutput: true,
  aiDisableReasoning: true,
  aiProviderOptionsJson: '{\n}',
  hasAiKey: false,
  cvText: '',
  cvFile: null,
  cvFileName: '',
  activeCvName: '',
  cvParsedByAi: true,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  country: 'DE',
  linkedIn: '',
  gitHub: '',
  portfolio: '',
  additionalUrls: '',
  currentTitle: '',
  yearsExperience: 0,
  skills: '',
  languages: '',
  desiredTitles: '',
  excludedCompanies: '',
  remotePreference: 'any',
  salaryCurrency: 'USD',
  coverLetterLanguage: 'Auto',
  writingTone: 'professional',
  writingStyle: '',
  aiNotes: '',
  apifyToken: '',
  hasApifyToken: false,
  apifyActorIds: ['curious_coder/linkedin-jobs-scraper'],
  freeEnabled: [],
  adzunaAppId: '',
  adzunaAppKey: '',
  techmapKey: '',
  sourcesSaved: false,
  logoToken: '',
  hasLogoToken: false,
  logoKeyType: null,
  emailUser: '',
  emailClientId: '',
  emailClientSecret: '',
};

export default function SetupPage() {
  const { t } = useI18n();
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoTesting, setLogoTesting] = useState(false);
  const [logoTestResult, setLogoTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const step = STEPS[stepIndex];
  const completedCount = useMemo(
    () => SETUP_AREA_STEPS.filter((item) => stepComplete(item.id, state)).length,
    [state]
  );

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch('/api/settings').then((res) => res.json()).catch(() => ({})),
      fetch('/api/profile').then((res) => res.json()).catch(() => ({})),
    ])
      .then(([settings, profileData]) => {
        if (!mounted) return;
        const profile = profileData.profile;
        const preferences = profileData.preferences;
        setState((current) => ({
          ...current,
          aiBaseUrl: settings.ai?.baseUrl || current.aiBaseUrl,
          aiModel: settings.ai?.model || current.aiModel,
          aiStructuredOutput: settings.ai?.structuredOutput !== false,
          aiDisableReasoning: settings.ai?.disableReasoning !== false,
          aiProviderOptionsJson: settings.ai?.providerOptionsJson || current.aiProviderOptionsJson,
          hasAiKey: Boolean(settings.ai?.hasApiKey),
          hasApifyToken: Boolean(settings.apify?.hasToken),
          apifyActorIds: settings.apify?.actorIds?.length ? settings.apify.actorIds : current.apifyActorIds,
          freeEnabled: settings.free?.enabledSources?.length
            ? settings.free.enabledSources.filter((sourceId: string) => {
                const hasCompanyBoards = Array.isArray(settings.free?.boards) && settings.free.boards.some((board: { enabled?: boolean }) => board.enabled !== false);
                return sourceId !== 'ats' || hasCompanyBoards;
              })
            : current.freeEnabled,
          sourcesSaved: Boolean(settings.free?.hasSavedSettings || settings.apify?.isConfigured || settings.logo?.isConfigured),
          hasLogoToken: Boolean(settings.logo?.hasToken),
          logoKeyType: settings.logo?.keyType || null,
          emailUser: settings.email?.userEmail || '',
          activeCvName: profileData.activeCv?.originalFilename || '',
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          email: profile?.email || '',
          phone: profile?.phone || '',
          city: profile?.city || '',
          country: profile?.country || current.country,
          linkedIn: profile?.linkedIn || '',
          gitHub: profile?.gitHub || '',
          portfolio: profile?.portfolio || '',
          additionalUrls: readArray(profile?.additionalUrls).join('\n'),
          currentTitle: profile?.currentTitle || '',
          yearsExperience: profile?.yearsExperience || 0,
          skills: readArray(profile?.skills).join(', '),
          languages: readArray(profile?.languages).join(', '),
          desiredTitles: readArray(preferences?.desiredTitles).join(', '),
          excludedCompanies: readArray(preferences?.excludedCompanies).join(', '),
          remotePreference: preferences?.remotePreference || 'any',
          salaryCurrency: preferences?.salaryCurrency || 'USD',
          coverLetterLanguage: preferences?.coverLetterLanguage || 'Auto',
          writingTone: preferences?.writingTone || 'professional',
          writingStyle: preferences?.writingStyle || '',
          aiNotes: preferences?.aiNotes || '',
        }));
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const patch = (data: Partial<WizardState>) => setState((current) => ({ ...current, ...data }));

  const saveAI = async () => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'ai',
        data: {
          baseUrl: state.aiBaseUrl,
          model: state.aiModel,
          apiKey: state.aiApiKey || undefined,
          structuredOutput: state.aiStructuredOutput,
          disableReasoning: state.aiDisableReasoning,
          providerOptionsJson: state.aiProviderOptionsJson,
        },
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('setup.errAi'));
    patch({ hasAiKey: state.hasAiKey || Boolean(state.aiApiKey), aiApiKey: '' });
  };

  const saveCV = async () => {
    if (!state.cvFile && !state.cvText.trim()) return;
    let res: Response;
    if (state.cvFile) {
      const form = new FormData();
      form.append('file', state.cvFile);
      res = await fetch('/api/cv/upload', { method: 'POST', body: form });
    } else {
      res = await fetch('/api/cv/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: state.cvText, filename: 'Pasted_Resume.txt' }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('setup.errCv'));
    patch({
      cvText: '',
      cvFile: null,
      cvFileName: '',
      activeCvName: data.cv?.originalFilename || state.cvFileName || state.activeCvName,
      firstName: data.structured?.firstName || state.firstName,
      lastName: data.structured?.lastName || state.lastName,
      email: data.structured?.email || state.email,
      phone: data.structured?.phone || state.phone,
      currentTitle: data.structured?.currentTitle || state.currentTitle,
      yearsExperience: data.structured?.yearsExperience || state.yearsExperience,
      skills: data.structured?.skills?.join(', ') || state.skills,
      languages: data.structured?.languages?.join(', ') || state.languages,
      cvParsedByAi: data.parsedByAi !== false,
    });
  };

  const saveProfileAndPreferences = async () => {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileData: {
          firstName: state.firstName,
          lastName: state.lastName,
          email: state.email,
          phone: state.phone,
          city: state.city,
          country: state.country,
          linkedIn: state.linkedIn,
          gitHub: state.gitHub,
          portfolio: state.portfolio,
          additionalUrls: splitUrls(state.additionalUrls),
          currentTitle: state.currentTitle,
          yearsExperience: state.yearsExperience,
          skills: splitComma(state.skills),
          languages: splitComma(state.languages),
        },
        preferencesData: {
          desiredTitles: splitComma(state.desiredTitles),
          excludedCompanies: splitComma(state.excludedCompanies),
          remotePreference: state.remotePreference,
          salaryCurrency: state.salaryCurrency,
          writingTone: state.writingTone,
          coverLetterLanguage: state.coverLetterLanguage,
          writingStyle: state.writingStyle,
          aiNotes: state.aiNotes,
        },
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('setup.errProfile'));
  };

  const saveSources = async () => {
    const apifyRes = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'apify',
        data: {
          apiToken: state.apifyToken || undefined,
          actorIds: state.apifyActorIds,
        },
      }),
    });
    if (!apifyRes.ok) throw new Error((await apifyRes.json().catch(() => ({}))).error || t('setup.errApify'));

    const freeRes = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'free',
        data: {
          enabledSources: state.freeEnabled,
          adzunaAppId: state.adzunaAppId || undefined,
          adzunaAppKey: state.adzunaAppKey || undefined,
          techmapKey: state.techmapKey || undefined,
        },
      }),
    });
    if (!freeRes.ok) throw new Error((await freeRes.json().catch(() => ({}))).error || t('setup.errFree'));

    if (state.logoToken.trim()) {
      const logoRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'logo',
          data: {
            apiToken: state.logoToken,
          },
        }),
      });
      if (!logoRes.ok) throw new Error((await logoRes.json().catch(() => ({}))).error || t('setup.errLogo'));
    }

    patch({
      hasApifyToken: state.hasApifyToken || Boolean(state.apifyToken),
      hasLogoToken: state.hasLogoToken || Boolean(state.logoToken),
      logoKeyType: state.logoToken ? 'publishable' : state.logoKeyType,
      sourcesSaved: true,
      apifyToken: '',
      adzunaAppId: '',
      adzunaAppKey: '',
      techmapKey: '',
      logoToken: '',
    });
  };

  const handleTestLogo = async () => {
    setLogoTesting(true);
    setLogoTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'logo',
          apiToken: state.logoToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setLogoTestResult({
        success: Boolean(data.success),
        message: data.message || (res.ok ? t('setup.logoTestOk') : t('setup.logoTestFailed')),
      });
    } catch (err) {
      setLogoTestResult({ success: false, message: (err as Error).message });
    } finally {
      setLogoTesting(false);
    }
  };

  const saveDispatch = async () => {
    if (!state.emailUser && !state.emailClientId && !state.emailClientSecret) return;
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'email',
        data: {
          userEmail: state.emailUser,
          clientId: state.emailClientId || undefined,
          clientSecret: state.emailClientSecret || undefined,
        },
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('setup.errEmail'));
    patch({ emailClientId: '', emailClientSecret: '' });
  };

  const saveCurrentStep = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      if (step.id === 'ai') await saveAI();
      if (step.id === 'cv') await saveCV();
      if (step.id === 'profile' || step.id === 'writing') await saveProfileAndPreferences();
      if (step.id === 'sources') await saveSources();
      if (step.id === 'dispatch') await saveDispatch();
      setNotice(t('setup.saved'));
      setTimeout(() => setNotice(null), 2200);
      if (stepIndex < STEPS.length - 1) setStepIndex((current) => current + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActor = (actorId: string) => {
    patch({
      apifyActorIds: state.apifyActorIds.includes(actorId)
        ? state.apifyActorIds.filter((id) => id !== actorId)
        : [...state.apifyActorIds, actorId],
    });
  };

  const toggleFree = (sourceId: string) => {
    patch({
      freeEnabled: state.freeEnabled.includes(sourceId)
        ? state.freeEnabled.filter((id) => id !== sourceId)
        : [...state.freeEnabled, sourceId],
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 py-28 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Loading setup...
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-background">
      <PageHeader
        title={t('setup.title')}
        description={t('setup.description')}
        actions={
          <div className="flex items-center gap-2">
            {notice && <span className="text-sm font-medium text-emerald-700">{notice}</span>}
            <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('setup.advanced')}
            </Link>
          </div>
        }
      />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 md:p-8">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-900">{t('setup.progress', { count: completedCount, total: SETUP_AREA_STEPS.length })}</p>
              <p className="mt-1 text-sm text-neutral-500">{t('setup.progressHint')}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const active = index === stepIndex;
                const complete = stepComplete(item.id, state);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStepIndex(index)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : complete
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {complete && !active ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                    <span className="font-medium">{t(item.titleKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-neutral-950">{t(step.titleKey)}</h2>
            <p className="text-sm text-neutral-500">{t(step.hintKey)}</p>
          </div>

          {step.id === 'ai' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ai-base">{t('settings.aiBaseLabel')}</Label>
                  <Input id="ai-base" value={state.aiBaseUrl} onChange={(e) => patch({ aiBaseUrl: e.target.value })} />
                </div>
                <div className="flex-1 space-y-1.5">
                  <ModelPicker
                    id="ai-model"
                    model={state.aiModel}
                    onModelChange={(aiModel) => patch({ aiModel })}
                    baseUrl={state.aiBaseUrl}
                    apiKey={state.aiApiKey}
                    useSavedKey={!state.aiApiKey && state.hasAiKey}
                  />
                </div>
              </div>
              <SecretInput
                id="ai-key"
                label={t('settings.aiKeyLabel')}
                value={state.aiApiKey}
                onChange={(value) => patch({ aiApiKey: value })}
                placeholder={state.hasAiKey ? t('common.keyKept') : 'sk-...'}
                fieldName="rorilo-setup-ai-key"
              />
              <details className="rounded-xl border border-border bg-muted/60">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-neutral-700">
                  <span>{t('settings.aiAdvanced')}</span>
                  <Info className="size-4 text-neutral-400" />
                </summary>
                <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    {t('setup.aiAdvancedNote')}
                  </p>
                  <label className="flex items-start gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={state.aiStructuredOutput}
                      onChange={(e) => patch({ aiStructuredOutput: e.target.checked })}
                      className="mt-1 size-3.5 rounded border-neutral-300 text-neutral-900"
                    />
                    <span>
                      <span className="font-medium text-neutral-900">{t('settings.aiStructured')}</span>
                      <span className="block text-xs text-neutral-500">{t('settings.aiStructuredHint')}</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={state.aiDisableReasoning}
                      onChange={(e) => patch({ aiDisableReasoning: e.target.checked })}
                      className="mt-1 size-3.5 rounded border-neutral-300 text-neutral-900"
                    />
                    <span>
                      <span className="font-medium text-neutral-900">{t('settings.aiReasoning')}</span>
                      <span className="block text-xs text-neutral-500">{t('settings.aiReasoningHint')}</span>
                    </span>
                  </label>
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-provider-options">{t('settings.aiRawJson')}</Label>
                    <Textarea
                      id="setup-provider-options"
                      value={state.aiProviderOptionsJson}
                      onChange={(e) => patch({ aiProviderOptionsJson: e.target.value })}
                      spellCheck={false}
                      className="min-h-24 font-mono text-xs"
                      placeholder={`{\n  "thinking": { "type": "disabled" }\n}`}
                    />
                  </div>
                </div>
              </details>
            </div>
          )}

          {step.id === 'cv' && (
            <div className="flex flex-col gap-4">
              {state.activeCvName && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <Check className="size-4" />
                  {t('setup.cvActive', { name: state.activeCvName })}
                </div>
              )}
              {state.activeCvName && !state.cvParsedByAi && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
                  <span className="mt-px shrink-0 text-amber-500">⚠</span>
                  <span>
                    {t('profile.cvAiFallbackNudge')}{' '}
                    <Link href="/settings" className="font-semibold underline underline-offset-2 hover:text-amber-900">
                      Settings →
                    </Link>
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-4 sm:flex-row">
                <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center hover:bg-neutral-100">
                  <Upload className="size-5 text-neutral-500" />
                  <span className="text-sm font-semibold text-neutral-900">{state.cvFileName || t('setup.cvChoose')}</span>
                  <span className="text-xs text-neutral-500">{t('setup.cvParsedHint')}</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      patch({ cvFile: file, cvFileName: file?.name || '' });
                    }}
                  />
                </label>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="cv-paste">{t('setup.cvPasteLabel')}</Label>
                  <Textarea
                    id="cv-paste"
                    value={state.cvText}
                    onChange={(e) => patch({ cvText: e.target.value, cvFile: null, cvFileName: '' })}
                    placeholder={t('setup.cvPastePh')}
                    className="min-h-40"
                  />
                </div>
              </div>
            </div>
          )}

          {step.id === 'profile' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('profile.firstName')} value={state.firstName} onChange={(value) => patch({ firstName: value })} />
                <Field label={t('profile.lastName')} value={state.lastName} onChange={(value) => patch({ lastName: value })} />
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('profile.email')} value={state.email} onChange={(value) => patch({ email: value })} />
                <Field label={t('profile.phone')} value={state.phone} onChange={(value) => patch({ phone: value })} />
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('setup.profileCity')} value={state.city} onChange={(value) => patch({ city: value })} />
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="setup-country">{t('search.country')}</Label>
                  <select
                    id="setup-country"
                    value={state.country}
                    onChange={(e) => patch({ country: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country.code} value={country.code}>{country.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('profile.linkedIn')} value={state.linkedIn} onChange={(value) => patch({ linkedIn: value })} />
                <Field label={t('profile.gitHub')} value={state.gitHub} onChange={(value) => patch({ gitHub: value })} />
                <Field label={t('profile.portfolio')} value={state.portfolio} onChange={(value) => patch({ portfolio: value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-links">{t('profile.moreLinks')}</Label>
                <Textarea id="setup-links" value={state.additionalUrls} onChange={(e) => patch({ additionalUrls: e.target.value })} placeholder={t('setup.linksPh')} />
              </div>
            </div>
          )}

          {step.id === 'writing' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('profile.currentTitle')} value={state.currentTitle} onChange={(value) => patch({ currentTitle: value })} />
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="setup-years">{t('setup.yearsExp')}</Label>
                  <Input id="setup-years" type="number" min={0} step={0.5} value={state.yearsExperience} onChange={(e) => patch({ yearsExperience: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <Field label={t('setup.writingTitles')} value={state.desiredTitles} onChange={(value) => patch({ desiredTitles: value })} placeholder={t('setup.writingTitlesPh')} />
              <Field label={t('setup.writingSkills')} value={state.skills} onChange={(value) => patch({ skills: value })} placeholder={t('setup.writingSkillsPh')} />
              <Field label={t('setup.writingLanguages')} value={state.languages} onChange={(value) => patch({ languages: value })} placeholder={t('setup.writingLanguagesPh')} />
              <div className="flex flex-col gap-4 sm:flex-row">
                <SelectField label={t('profile.prefsRemote')} value={state.remotePreference} onChange={(value) => patch({ remotePreference: value })} options={['any', 'remote', 'hybrid', 'onsite']} />
                <Field label={t('setup.writingSalaryCurrency')} value={state.salaryCurrency} onChange={(value) => patch({ salaryCurrency: value })} />
                <Field label={t('setup.writingDraftLang')} value={state.coverLetterLanguage} onChange={(value) => patch({ coverLetterLanguage: value })} placeholder={t('setup.writingDraftLangAuto')} />
              </div>
              <Field label={t('setup.writingExcluded')} value={state.excludedCompanies} onChange={(value) => patch({ excludedCompanies: value })} placeholder={t('setup.writingExcludedPh')} />
              <div className="space-y-1.5">
                <Label htmlFor="setup-style">{t('setup.writingStyleNotes')}</Label>
                <Textarea id="setup-style" value={state.writingStyle} onChange={(e) => patch({ writingStyle: e.target.value })} placeholder={t('setup.writingStylePh')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-notes">{t('setup.writingNotes')}</Label>
                <Textarea id="setup-notes" value={state.aiNotes} onChange={(e) => patch({ aiNotes: e.target.value })} placeholder={t('setup.writingNotesPh')} />
              </div>
            </div>
          )}

          {step.id === 'sources' && (
            <div className="flex flex-col gap-5">
              <SecretInput
                id="setup-apify-token"
                label={t('settings.apifyTokenLabel')}
                value={state.apifyToken}
                onChange={(value) => patch({ apifyToken: value })}
                placeholder={state.hasApifyToken ? t('common.tokenKept') : 'apify_api_...'}
                fieldName="rorilo-setup-apify-token"
              />

              <div className="space-y-2">
                <Label>{t('setup.sourcesApifyActors')}</Label>
                <div className="flex flex-wrap gap-2">
                  {orderApifyPicker(KNOWN_JOB_SOURCES, state.country).map((source) => {
                    const active = state.apifyActorIds.includes(source.actorId);
                    const coverageLabel = sourceCoverageLabel(source.coverage, state.country);
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => toggleActor(source.actorId)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        )}
                      >
                        <span>{source.name}</span>
                        <span className="ml-2 text-xs font-normal opacity-60">{coverageLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.freeTitle')}</Label>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2, 3].map((priority) => {
                    const sources = orderFreeSources(state.country).filter((source) =>
                      source.id !== 'ats' && sourceCoveragePriority(source.coverage, state.country) === priority
                    );
                    if (sources.length === 0) return null;
                    return (
                    <div key={priority} className="flex flex-wrap items-center gap-2">
                      <span className="w-full text-xs font-medium text-neutral-500 sm:w-28">{sourceCoverageGroupTitle(priority, state.country, t)}</span>
                      {sources.map((source) => {
                          const active = state.freeEnabled.includes(source.id);
                          const coverageLabel = sourceCoverageLabel(source.coverage, state.country);
                          return (
                            <button
                              key={source.id}
                              type="button"
                              onClick={() => toggleFree(source.id)}
                              className={cn(
                                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                active ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                              )}
                            >
                              <span>{source.name}</span>
                              <span className="ml-2 text-xs font-normal opacity-60">{coverageLabel}</span>
                            </button>
                          );
                        })}
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('settings.freeAdzunaId')} value={state.adzunaAppId} onChange={(value) => patch({ adzunaAppId: value })} />
                <SecretInput id="setup-adzuna-key" label={t('settings.freeAdzunaKey')} value={state.adzunaAppKey} onChange={(value) => patch({ adzunaAppKey: value })} fieldName="rorilo-setup-adzuna-key" />
                <SecretInput id="setup-techmap-key" label={t('settings.freeTechmapKey')} value={state.techmapKey} onChange={(value) => patch({ techmapKey: value })} fieldName="rorilo-setup-techmap-key" />
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-600 ring-1 ring-neutral-200">
                    <ImageIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{t('setup.logoTitle')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                      {t('setup.logoDesc')}
                    </p>
                    {state.hasLogoToken && (
                      <p className={cn(
                        'mt-1 text-xs font-medium',
                        state.logoKeyType === 'publishable' ? 'text-emerald-700' : 'text-amber-700'
                      )}>
                        {state.logoKeyType === 'publishable'
                          ? t('setup.logoSavedOk')
                          : t('setup.logoSavedNonPk')}
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href="https://www.logo.dev/dashboard/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-950 hover:underline"
                >
                  <span>{t('settings.logoOpenDashboard')}</span>
                  <ExternalLink className="size-3.5" />
                </a>
                <SecretInput
                  id="setup-logo-token"
                  label={t('setup.logoTokenLabel')}
                  value={state.logoToken}
                  onChange={(value) => {
                    patch({ logoToken: value });
                    setLogoTestResult(null);
                  }}
                  placeholder={state.hasLogoToken ? t('common.keyKept') : 'pk_...'}
                  fieldName="rorilo-setup-logo-token"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestLogo}
                    disabled={logoTesting || (!state.logoToken.trim() && !state.hasLogoToken)}
                    className="h-8 text-xs"
                  >
                    {logoTesting && <Loader2 className="size-3.5 animate-spin" />}
                    <span>{t('setup.logoTest')}</span>
                  </Button>
                  {logoTestResult && (
                    <span className={cn(
                      'text-xs font-medium',
                      logoTestResult.success ? 'text-emerald-700' : 'text-red-600'
                    )}>
                      {logoTestResult.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {step.id === 'dispatch' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-neutral-600">{t('setup.dispatchNote')}</p>
              <Field label={t('settings.emailUserLabel')} value={state.emailUser} onChange={(value) => patch({ emailUser: value })} />
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label={t('settings.emailClientIdLabel')} value={state.emailClientId} onChange={(value) => patch({ emailClientId: value })} />
                <SecretInput id="setup-email-secret" label={t('settings.emailClientSecretLabel')} value={state.emailClientSecret} onChange={(value) => patch({ emailClientSecret: value })} fieldName="rorilo-setup-email-secret" />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/" className={buttonVariants()}>
                  {t('drafts.openDiscover')}
                </Link>
                <Link href="/profile" className={buttonVariants({ variant: 'outline' })}>
                  {t('setup.reviewProfile')}
                </Link>
                <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
                  {t('setup.advanced')}
                </Link>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-6 flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0 || saving}
            >
              <ArrowLeft className="size-4" />
              {t('setup.back')}
            </Button>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {stepIndex < STEPS.length - 1 && (
                <Button type="button" variant="ghost" onClick={() => setStepIndex((current) => current + 1)} disabled={saving}>
                  {t('setup.skip')}
                </Button>
              )}
              <Button type="button" onClick={saveCurrentStep} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : stepIndex === STEPS.length - 1 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
                {stepIndex === STEPS.length - 1 ? t('setup.saveFinish') : t('setup.saveContinue')}
              </Button>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = `setup-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  const id = `setup-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => {
          const item = typeof option === 'string' ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>{item.label}</option>
          );
        })}
      </select>
    </div>
  );
}
