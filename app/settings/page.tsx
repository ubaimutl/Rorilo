'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Mail, ChevronDown, ChevronUp, CheckCircle2, ExternalLink, X, Info, Download, Upload, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { SecretInput } from '@/components/SecretInput';
import { ModelPicker } from '@/components/ModelPicker';
import { CompanyLogo } from '@/components/CompanyLogo';
import { orderFreeSources } from '@/lib/job-sources/free';
import { KNOWN_JOB_SOURCES, orderApifyPicker } from '@/lib/job-sources/sources';
import { sourceCoverageGroupTitle, sourceCoverageLabel, sourceCoveragePriority } from '@/lib/job-sources/countries';
import { useI18n } from '@/components/I18nProvider';
import { notify } from '@/components/AppNotifications';

const BOARD_PROVIDER_OPTIONS = [
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'personio', label: 'Personio' },
] as const;

const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

type FallbackProviderForm = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  structuredOutput?: boolean;
  disableReasoning?: boolean;
  providerOptionsJson?: string;
  hasApiKey?: boolean;
  testing?: boolean;
  testResult?: string | null;
};

export default function SettingsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);

  // AI State
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com/v1');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiProviderName, setAiProviderName] = useState('Primary');
  const [aiStructuredOutput, setAiStructuredOutput] = useState(true);
  const [aiDisableReasoning, setAiDisableReasoning] = useState(true);
  const [aiProviderOptionsJson, setAiProviderOptionsJson] = useState('{\n}');
  const [fallbackProviders, setFallbackProviders] = useState<FallbackProviderForm[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);
  const [aiSaveResult, setAiSaveResult] = useState<string | null>(null);

  // Apify State
  const [apifyToken, setApifyToken] = useState('');
  const [apifyActorIds, setApifyActorIds] = useState<string[]>(['curious_coder/linkedin-jobs-scraper']);
  const [newApifyActorId, setNewApifyActorId] = useState('');
  const [hasApifyToken, setHasApifyToken] = useState(false);
  const [apifyTesting, setApifyTesting] = useState(false);
  const [apifySaving, setApifySaving] = useState(false);
  const [apifyTestResult, setApifyTestResult] = useState<string | null>(null);
  const [apifySaveResult, setApifySaveResult] = useState<string | null>(null);
  const [showCustomActors, setShowCustomActors] = useState(false);

  // Email State
  const [emailUser, setEmailUser] = useState('');
  const [emailClientId, setEmailClientId] = useState('');
  const [emailClientSecret, setEmailClientSecret] = useState('');
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null);
  const [emailSaveResult, setEmailSaveResult] = useState<string | null>(null);

  // Company Logos (logo.dev) State
  const [logoToken, setLogoToken] = useState('');
  const [hasLogoToken, setHasLogoToken] = useState(false);
  const [logoKeyType, setLogoKeyType] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoSaveResult, setLogoSaveResult] = useState<string | null>(null);

  // Free Sources State
  const [freeEnabled, setFreeEnabled] = useState<string[]>(['arbeitsagentur']);
  const [adzunaAppId, setAdzunaAppId] = useState('');
  const [adzunaAppKey, setAdzunaAppKey] = useState('');
  const [techmapKey, setTechmapKey] = useState('');
  const [hasAdzunaId, setHasAdzunaId] = useState(false);
  const [hasAdzunaKey, setHasAdzunaKey] = useState(false);
  const [hasTechmapKey, setHasTechmapKey] = useState(false);
  const [freeBoards, setFreeBoards] = useState<
    Array<{ provider: string; board: string; company: string; custom: boolean; enabled: boolean }>
  >([]);
  const [newBoardProvider, setNewBoardProvider] = useState('greenhouse');
  const [newBoardId, setNewBoardId] = useState('');
  const [newBoardCompany, setNewBoardCompany] = useState('');
  const [freeSaving, setFreeSaving] = useState(false);
  const [freeSaveResult, setFreeSaveResult] = useState<string | null>(null);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.ai) {
        setAiBaseUrl(data.ai.baseUrl);
        setAiModel(data.ai.model);
        setAiProviderName(data.ai.providerName || 'Primary');
        setAiStructuredOutput(data.ai.structuredOutput !== false);
        setAiDisableReasoning(data.ai.disableReasoning !== false);
        setAiProviderOptionsJson(data.ai.providerOptionsJson || '{\n}');
        if (Array.isArray(data.ai.fallbackProviders)) {
          setFallbackProviders(data.ai.fallbackProviders.map((provider: FallbackProviderForm) => ({
            id: provider.id,
            name: provider.name || 'Fallback',
            baseUrl: provider.baseUrl || '',
            apiKey: '',
            model: provider.model || '',
            enabled: provider.enabled !== false,
            structuredOutput: provider.structuredOutput !== false,
            disableReasoning: provider.disableReasoning !== false,
            providerOptionsJson: provider.providerOptionsJson || '{\n}',
            hasApiKey: Boolean(provider.hasApiKey),
          })));
        }
        setHasApiKey(data.ai.hasApiKey);
      }
      if (data.apify) {
        setApifyActorIds(data.apify.actorIds?.length ? data.apify.actorIds : [data.apify.actorId]);
        setHasApifyToken(data.apify.hasToken);
      }
      if (data.email) {
        setEmailUser(data.email.userEmail || '');
      }
      if (data.logo) {
        setHasLogoToken(data.logo.hasToken);
        setLogoKeyType(data.logo.keyType || null);
      }
      if (data.free) {
        const hasCompanyBoards = Array.isArray(data.free.boards) && data.free.boards.some((board: { enabled?: boolean }) => board.enabled !== false);
        if (Array.isArray(data.free.enabledSources)) {
          setFreeEnabled(data.free.enabledSources.filter((sourceId: string) => sourceId !== 'ats' || hasCompanyBoards));
        }
        setHasAdzunaId(Boolean(data.free.adzuna?.hasAppId));
        setHasAdzunaKey(Boolean(data.free.adzuna?.hasAppKey));
        setHasTechmapKey(Boolean(data.free.techmap?.hasKey));
        if (Array.isArray(data.free.boards)) setFreeBoards(data.free.boards);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiSaving(true);
    setAiSaveResult(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'ai',
          data: {
            providerName: aiProviderName,
            baseUrl: aiBaseUrl,
            apiKey: aiApiKey || undefined,
            model: aiModel,
            structuredOutput: aiStructuredOutput,
            disableReasoning: aiDisableReasoning,
            providerOptionsJson: aiProviderOptionsJson,
            fallbackProviders: fallbackProviders.map((provider) => ({
              id: provider.id,
              name: provider.name,
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey || undefined,
              model: provider.model,
              enabled: provider.enabled,
              structuredOutput: provider.structuredOutput !== false,
              disableReasoning: provider.disableReasoning !== false,
              providerOptionsJson: provider.providerOptionsJson || '{}',
            })),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAiSaveResult(t('common.saved'));
        if (aiApiKey) setHasApiKey(true);
        setFallbackProviders((current) =>
          current.map((provider) => ({
            ...provider,
            hasApiKey: provider.hasApiKey || Boolean(provider.apiKey),
            apiKey: '',
          }))
        );
        setAiApiKey('');
        setTimeout(() => setAiSaveResult(null), 2500);
      } else {
        setAiSaveResult(t('common.saveFailed', { error: data.error || `server responded ${res.status}` }));
      }
    } catch {
      setAiSaveResult(t('common.saveFailed', { error: 'network error' }));
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestAI = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'ai',
          name: aiProviderName,
          baseUrl: aiBaseUrl,
          apiKey: aiApiKey || undefined,
          useSavedKey: !aiApiKey && hasApiKey,
          model: aiModel,
        }),
      });
      const data = await res.json();
      setAiTestResult(data.message);
    } catch (err) {
      setAiTestResult((err as Error).message);
    } finally {
      setAiTesting(false);
    }
  };

  const addFallbackProvider = () => {
    setFallbackProviders((current) => [
      ...current,
      {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `fallback-${Date.now()}`,
        name: 'Fallback',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: DEFAULT_AI_MODEL,
        enabled: true,
        structuredOutput: true,
        disableReasoning: true,
        providerOptionsJson: '{\n}',
      },
    ]);
  };

  const updateFallbackProvider = (id: string, patch: Partial<FallbackProviderForm>) => {
    setFallbackProviders((current) =>
      current.map((provider) => provider.id === id ? { ...provider, ...patch } : provider)
    );
  };

  const removeFallbackProvider = (id: string) => {
    setFallbackProviders((current) => current.filter((provider) => provider.id !== id));
  };

  const testFallbackProvider = async (id: string) => {
    const provider = fallbackProviders.find((item) => item.id === id);
    if (!provider) return;
    updateFallbackProvider(id, { testing: true, testResult: null });
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'ai',
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey || undefined,
          useSavedKey: !provider.apiKey && provider.hasApiKey,
          providerId: provider.id,
          model: provider.model,
        }),
      });
      const data = await res.json();
      updateFallbackProvider(id, { testing: false, testResult: data.message });
    } catch (err) {
      updateFallbackProvider(id, { testing: false, testResult: (err as Error).message });
    }
  };

  const handleSaveApify = async (e: React.FormEvent) => {
    e.preventDefault();
    setApifySaving(true);
    setApifySaveResult(null);
    try {
      const actorIds = apifyActorIds.map((actor) => actor.trim()).filter(Boolean);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'apify',
          data: { apiToken: apifyToken || undefined, actorIds },
        }),
      });
      if (res.ok) {
        setApifySaveResult(t('common.saved'));
        if (apifyToken) setHasApifyToken(true);
        setApifyToken('');
        // Re-read persisted settings so the UI always reflects what is stored.
        await fetchSettings();
        setTimeout(() => setApifySaveResult(null), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        setApifySaveResult(t('common.saveFailed', { error: data.error || `server responded ${res.status}` }));
      }
    } catch {
      setApifySaveResult(t('common.saveFailed', { error: 'network error' }));
    } finally {
      setApifySaving(false);
    }
  };

  const addApifyActor = () => {
    const actor = newApifyActorId.trim();
    if (!actor) return;
    setApifyActorIds((current) => Array.from(new Set([...current, actor])));
    setNewApifyActorId('');
  };

  const removeApifyActor = (actor: string) => {
    setApifyActorIds((current) => {
      const next = current.filter((item) => item !== actor);
      return next.length > 0 ? next : current;
    });
  };

  const toggleJobSource = (actorId: string) => {
    setApifyActorIds((current) => {
      if (current.includes(actorId)) {
        const next = current.filter((id) => id !== actorId);
        return next.length > 0 ? next : current;
      }
      return [...current, actorId];
    });
  };

  const handleTestApify = async () => {
    setApifyTesting(true);
    setApifyTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'apify', actorId: apifyActorIds[0] }),
      });
      const data = await res.json();
      setApifyTestResult(data.message);
    } catch (err) {
      setApifyTestResult((err as Error).message);
    } finally {
      setApifyTesting(false);
    }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailSaveResult(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'email',
          data: {
            userEmail: emailUser,
            clientId: emailClientId || undefined,
            clientSecret: emailClientSecret || undefined,
          },
        }),
      });
      if (res.ok) {
        setEmailSaveResult(t('common.saved'));
        setTimeout(() => setEmailSaveResult(null), 2500);
      }
    } catch {
      alert(t('settings.emailSaveFailed'));
    } finally {
      setEmailSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setEmailTesting(true);
    setEmailTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'email' }),
      });
      const data = await res.json();
      setEmailTestResult(data.message);
    } catch (err) {
      setEmailTestResult((err as Error).message);
    } finally {
      setEmailTesting(false);
    }
  };

  const handleSaveLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogoSaving(true);
    setLogoSaveResult(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'logo',
          data: { apiToken: logoToken || undefined },
        }),
      });
      if (res.ok) {
        setLogoSaveResult(t('common.saved'));
        if (logoToken) setHasLogoToken(true);
        if (logoToken) setLogoKeyType('publishable');
        setLogoToken('');
        setTimeout(() => setLogoSaveResult(null), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        setLogoSaveResult(t('common.saveFailed', { error: data.error || `${res.status}` }));
      }
    } catch {
      setLogoSaveResult(t('common.saveFailed', { error: 'network error' }));
    } finally {
      setLogoSaving(false);
    }
  };

  const handleSaveFree = async (e: React.FormEvent) => {
    e.preventDefault();
    setFreeSaving(true);
    setFreeSaveResult(null);
    try {
      const disabledBoards = freeBoards
        .filter((board) => !board.enabled)
        .map((board) => `${board.provider}:${board.board}`);
      const customBoards = freeBoards
        .filter((board) => board.custom)
        .map((board) => ({ provider: board.provider, board: board.board, company: board.company }));
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'free',
          data: {
            adzunaAppId: adzunaAppId || undefined,
            adzunaAppKey: adzunaAppKey || undefined,
            techmapKey: techmapKey || undefined,
            enabledSources: freeEnabled,
            disabledBoards,
            customBoards,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFreeSaveResult(t('common.saved'));
        if (adzunaAppId) setHasAdzunaId(true);
        if (adzunaAppKey) setHasAdzunaKey(true);
        if (techmapKey) setHasTechmapKey(true);
        setAdzunaAppId('');
        setAdzunaAppKey('');
        setTechmapKey('');
        await fetchSettings();
        setTimeout(() => setFreeSaveResult(null), 2500);
      } else {
        setFreeSaveResult(t('common.saveFailed', { error: data.error || `server responded ${res.status}` }));
      }
    } catch {
      setFreeSaveResult(t('common.saveFailed', { error: 'network error' }));
    } finally {
      setFreeSaving(false);
    }
  };

  const toggleFreeEnabled = (sourceId: string) => {
    setFreeEnabled((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );
  };

  const toggleBoard = (provider: string, board: string) => {
    const key = `${provider}:${board}`.toLowerCase();
    setFreeBoards((current) =>
      current.map((entry) =>
        `${entry.provider}:${entry.board}`.toLowerCase() === key
          ? { ...entry, enabled: !entry.enabled }
          : entry
      )
    );
  };

  const addCustomBoard = () => {
    const board = newBoardId.trim();
    const company = newBoardCompany.trim();
    if (!board || !company) return;
    const key = `${newBoardProvider}:${board}`.toLowerCase();
    setFreeBoards((current) => {
      if (current.some((entry) => `${entry.provider}:${entry.board}`.toLowerCase() === key)) {
        return current.map((entry) =>
          `${entry.provider}:${entry.board}`.toLowerCase() === key
            ? { ...entry, company, enabled: true }
            : entry
        );
      }
      return [...current, { provider: newBoardProvider, board, company, custom: true, enabled: true }];
    });
    setFreeEnabled((current) => current.includes('ats') ? current : [...current, 'ats']);
    setNewBoardId('');
    setNewBoardCompany('');
  };

  const removeCustomBoard = (provider: string, board: string) => {
    const key = `${provider}:${board}`.toLowerCase();
    setFreeBoards((current) => {
      const next = current.filter((entry) => `${entry.provider}:${entry.board}`.toLowerCase() !== key);
      if (next.length === 0) {
        setFreeEnabled((sources) => sources.filter((sourceId) => sourceId !== 'ats'));
      }
      return next;
    });
  };

  const handleImportBackup = async (file: File | null) => {
    if (!file) return;
    const shouldImport = window.confirm(
      'Import this backup into the current app database? Existing jobs, profile, applications, settings, and drafts will be replaced.'
    );
    if (!shouldImport) return;

    setBackupImporting(true);
    setBackupResult(null);
    try {
      const formData = new FormData();
      formData.append('backup', file);
      const res = await fetch('/api/data/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setBackupResult(t('common.saveFailed', { error: data.error || `server responded ${res.status}` }));
        return;
      }
      setBackupResult(`Imported ${data.importedRows || 0} rows. Reload the app to refresh every page.`);
      await fetchSettings();
    } catch (err) {
      setBackupResult(t('common.saveFailed', { error: (err as Error).message }));
    } finally {
      setBackupImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24 text-xs text-neutral-400 gap-2">
        <Loader2 className="size-4 animate-spin" />
        {t('settings.loading')}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <main className="p-6 md:p-8 max-w-2xl w-full mx-auto space-y-10">
        {/* 1. AI Provider */}
        <Card>
          <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
              AI Provider
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Model used for deterministic analysis, match explanation, and application material generation. Supports OpenAI-compatible providers.
            </p>
          </div>

          <form onSubmit={handleSaveAI} className="flex flex-col gap-4" autoComplete="off">
            <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-neutral-900">Primary provider</h3>
                <p className="text-xs text-neutral-500">Used first. Add fallback providers below for backup.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ai-name" className="text-sm font-medium text-neutral-700">Name</Label>
                  <Input
                    id="ai-name"
                    value={aiProviderName}
                    onChange={(e) => setAiProviderName(e.target.value)}
                    className="text-xs h-8"
                    placeholder="OpenAI"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ai-base" className="text-sm font-medium text-neutral-700">Base URL</Label>
                  <Input
                    id="ai-base"
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    className="font-mono text-xs h-8"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <ModelPicker
                    id="ai-model"
                    model={aiModel}
                    onModelChange={setAiModel}
                    baseUrl={aiBaseUrl}
                    apiKey={aiApiKey}
                    useSavedKey={!aiApiKey && hasApiKey}
                    inputClassName="font-mono text-xs h-8"
                    required
                  />
                </div>
                <div className="flex-1">
                  <SecretInput
                    id="ai-key"
                    label="API Key"
                    value={aiApiKey}
                    onChange={setAiApiKey}
                    placeholder={hasApiKey ? 'Key saved. Leave blank to keep' : 'sk-...'}
                    fieldName="rorilo-ai-key"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestAI}
                  disabled={aiTesting}
                  className="text-xs h-7"
                >
                  {aiTesting ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                  <span>Test primary</span>
                </Button>
                {aiTestResult && (
                  <span className="text-xs text-neutral-600">{aiTestResult}</span>
                )}
              </div>
              <details className="rounded-lg border border-neutral-200 bg-neutral-50/80">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-neutral-700">
                  <span>Advanced provider options</span>
                  <Info className="size-3.5 text-neutral-400" />
                </summary>
                <div className="flex flex-col gap-3 border-t border-neutral-200 px-3 py-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    These options are only used for structured JSON tasks like triage, CV parsing, and draft generation. “Disable reasoning” uses provider-specific fields for DeepSeek, Ollama, and Qwen; use raw JSON only when your provider needs a custom option.
                  </div>
                  <label className="flex items-start gap-2 text-xs text-neutral-700">
                    <input
                      type="checkbox"
                      checked={aiStructuredOutput}
                      onChange={(e) => setAiStructuredOutput(e.target.checked)}
                      className="mt-0.5 size-3.5 rounded border-neutral-300 text-neutral-900"
                    />
                    <span>
                      <span className="font-medium text-neutral-900">Structured output mode</span>
                      <span className="block text-neutral-500">Adds JSON mode when the provider supports OpenAI-compatible `response_format`.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-neutral-700">
                    <input
                      type="checkbox"
                      checked={aiDisableReasoning}
                      onChange={(e) => setAiDisableReasoning(e.target.checked)}
                      className="mt-0.5 size-3.5 rounded border-neutral-300 text-neutral-900"
                    />
                    <span>
                      <span className="font-medium text-neutral-900">Disable reasoning for JSON tasks</span>
                      <span className="block text-neutral-500">Helps avoid empty `content` responses from thinking models.</span>
                    </span>
                  </label>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-provider-options" className="text-xs font-medium text-neutral-700">Raw extra request JSON</Label>
                    <Textarea
                      id="ai-provider-options"
                      value={aiProviderOptionsJson}
                      onChange={(e) => setAiProviderOptionsJson(e.target.value)}
                      spellCheck={false}
                      className="min-h-24 font-mono text-xs"
                      placeholder={`{\n  "thinking": { "type": "disabled" }\n}`}
                    />
                  </div>
                </div>
              </details>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">Fallback providers</h3>
                  <p className="text-xs text-neutral-500">Tried in order when an earlier provider fails.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFallbackProvider} className="h-8 text-xs">
                  <Plus className="size-3.5" />
                  <span>Add fallback</span>
                </Button>
              </div>
              {fallbackProviders.length > 0 && (
                <div className="flex flex-col gap-2">
                  {fallbackProviders.map((provider, index) => (
                    <div key={provider.id} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(e) => updateFallbackProvider(provider.id, { enabled: e.target.checked })}
                            className="size-3.5 rounded border-neutral-300 text-neutral-900"
                          />
                          Fallback {index + 1}
                        </label>
                        <button
                          type="button"
                          onClick={() => removeFallbackProvider(provider.id)}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove fallback"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={provider.name}
                          onChange={(e) => updateFallbackProvider(provider.id, { name: e.target.value })}
                          placeholder="Name"
                          className="h-8 text-xs sm:w-36"
                        />
                        <Input
                          value={provider.baseUrl}
                          onChange={(e) => updateFallbackProvider(provider.id, { baseUrl: e.target.value })}
                          placeholder="Base URL"
                          className="h-8 flex-1 font-mono text-xs"
                        />
                        <Input
                          value={provider.model}
                          onChange={(e) => updateFallbackProvider(provider.id, { model: e.target.value })}
                          placeholder="Model"
                          className="h-8 flex-1 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <SecretInput
                            id={`fallback-key-${provider.id}`}
                            label="API key"
                            value={provider.apiKey}
                            onChange={(value) => updateFallbackProvider(provider.id, { apiKey: value })}
                            placeholder={provider.hasApiKey ? 'Key saved. Leave blank to keep' : 'optional'}
                            fieldName={`rorilo-fallback-key-${provider.id}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => testFallbackProvider(provider.id)}
                          disabled={provider.testing || !provider.baseUrl.trim() || !provider.model.trim()}
                          className="h-8 text-xs"
                        >
                          {provider.testing ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                          <span>Test</span>
                        </Button>
                      </div>
                      {provider.testResult && <p className="text-xs text-neutral-600">{provider.testResult}</p>}
                      <details className="rounded-lg border border-neutral-200 bg-neutral-50/80">
                        <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-neutral-700">
                          <span>Advanced options</span>
                          <Info className="size-3.5 text-neutral-400" />
                        </summary>
                        <div className="flex flex-col gap-3 border-t border-neutral-200 px-3 py-3">
                          <label className="flex items-start gap-2 text-xs text-neutral-700">
                            <input
                              type="checkbox"
                              checked={provider.structuredOutput !== false}
                              onChange={(e) => updateFallbackProvider(provider.id, { structuredOutput: e.target.checked })}
                              className="mt-0.5 size-3.5 rounded border-neutral-300 text-neutral-900"
                            />
                            <span>
                              <span className="font-medium text-neutral-900">Structured output mode</span>
                              <span className="block text-neutral-500">Use JSON mode for schema-based tasks.</span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 text-xs text-neutral-700">
                            <input
                              type="checkbox"
                              checked={provider.disableReasoning !== false}
                              onChange={(e) => updateFallbackProvider(provider.id, { disableReasoning: e.target.checked })}
                              className="mt-0.5 size-3.5 rounded border-neutral-300 text-neutral-900"
                            />
                            <span>
                              <span className="font-medium text-neutral-900">Disable reasoning for JSON tasks</span>
                              <span className="block text-neutral-500">Uses known switches for DeepSeek, Ollama, and Qwen.</span>
                            </span>
                          </label>
                          <div className="space-y-1.5">
                            <Label htmlFor={`fallback-options-${provider.id}`} className="text-xs font-medium text-neutral-700">Raw extra request JSON</Label>
                            <Textarea
                              id={`fallback-options-${provider.id}`}
                              value={provider.providerOptionsJson || '{\n}'}
                              onChange={(e) => updateFallbackProvider(provider.id, { providerOptionsJson: e.target.value })}
                              spellCheck={false}
                              className="min-h-20 font-mono text-xs"
                              placeholder={`{\n}`}
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {aiSaveResult && (
                <span className={`text-xs font-medium ${
                  aiSaveResult === t('common.saved') ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {aiSaveResult}
                </span>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={aiSaving}
                className="text-xs h-7 px-3"
              >
                {aiSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Database className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
                  Backup & restore
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Move your profile, settings, jobs, drafts, and application tracker between Docker, local development, and the desktop app.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs leading-relaxed text-neutral-600">
                Export creates a JSON backup. Keep it private because it can include saved keys. Import replaces the current app database with the backup contents.
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  href="/api/data/export"
                  download
                  onClick={() => {
                    notify({
                      type: 'success',
                      title: 'Backup export started',
                      message: 'Check your Downloads folder.',
                    });
                  }}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Download className="size-3.5" />
                  <span>Export backup</span>
                </a>
                <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted">
                  {backupImporting ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  <span>{backupImporting ? 'Importing...' : 'Import backup'}</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    disabled={backupImporting}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleImportBackup(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            {backupResult && <p className="text-xs text-neutral-600">{backupResult}</p>}
          </CardContent>
        </Card>

        <Separator />

        {/* 2. Job Discovery (Apify) */}
        <Card>
          <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
              Job Discovery
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Apify cloud scraper configuration for running automated discovery on LinkedIn or Indeed.
            </p>
          </div>

          <form onSubmit={handleSaveApify} className="space-y-3.5" autoComplete="off">
            <div className="space-y-3">
              <SecretInput
                id="apify-tok"
                label="Apify API Token"
                value={apifyToken}
                onChange={setApifyToken}
                placeholder={hasApifyToken ? '••••••••••••••••' : 'apify_api_...'}
                fieldName="rorilo-apify-token"
              />

              {/* Job Sources Selection */}
              <div className="space-y-2.5">
                <div>
                  <Label className="text-xs font-semibold text-neutral-800">Job Sources</Label>
                  <p className="text-xs text-neutral-500">
                    Enable the job boards you want Rorilo to search:
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Global job boards */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
                      <span>Global Career Portals</span>
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
                      {orderApifyPicker(KNOWN_JOB_SOURCES, 'DE')
                        .filter((src) => src.coverage.global)
                        .map((src) => {
                          const isEnabled = apifyActorIds.includes(src.actorId) || apifyActorIds.includes(src.id);
                          return (
                            <div
                              key={src.id}
                              onClick={() => toggleJobSource(src.actorId)}
                              className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-all sm:flex-1 sm:min-w-64 ${
                                isEnabled
                                  ? 'border-blue-500 bg-blue-50/40 shadow-2xs'
                                  : 'border-neutral-200 bg-white hover:border-neutral-300'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-neutral-900">{src.name}</span>
                                  {isEnabled && (
                                    <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-medium">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-neutral-500 leading-normal">{src.tagline}</p>
                              </div>

                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => {}}
                                className="size-4 mt-0.5 rounded border-neutral-300 text-blue-600 cursor-pointer"
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Country and regional boards */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
                      <span>Germany & DACH portals</span>
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
                      {orderApifyPicker(KNOWN_JOB_SOURCES, 'DE')
                        .filter((src) => !src.coverage.global)
                        .map((src) => {
                          const isEnabled = apifyActorIds.includes(src.actorId) || apifyActorIds.includes(src.id);
                          return (
                            <div
                              key={src.id}
                              onClick={() => toggleJobSource(src.actorId)}
                              className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-all sm:flex-1 sm:min-w-64 ${
                                isEnabled
                                  ? 'border-blue-500 bg-blue-50/40 shadow-2xs'
                                  : 'border-neutral-200 bg-white hover:border-neutral-300'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-neutral-900">{src.name}</span>
                                  {isEnabled && (
                                    <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-medium">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-neutral-500 leading-normal">{src.tagline}</p>
                              </div>

                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => {}}
                                className="size-4 mt-0.5 rounded border-neutral-300 text-blue-600 cursor-pointer"
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced: Custom Actors */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomActors(!showCustomActors)}
                  className="text-xs text-neutral-500 hover:text-neutral-800 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {showCustomActors ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  <span>Advanced: Custom Apify Scraper Actors</span>
                </button>

                {showCustomActors && (
                  <div className="mt-2.5 p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-3">
                    <p className="text-xs text-neutral-500">
                      If you have custom Apify scraper actors, you can add their IDs below:
                    </p>
                    <div className="space-y-2">
                      {apifyActorIds.map((actor) => (
                        <div key={actor} className="flex items-center gap-2">
                          <Input value={actor} readOnly className="font-mono text-xs h-8 bg-white" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => removeApifyActor(actor)}
                            title="Remove actor"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="apify-actor"
                        value={newApifyActorId}
                        onChange={(e) => setNewApifyActorId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addApifyActor();
                          }
                        }}
                        placeholder="username/actor-name"
                        className="font-mono text-xs h-8 bg-white"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addApifyActor}
                        className="text-xs h-8"
                      >
                        <Plus className="size-3.5" />
                        <span>Add</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestApify}
                  disabled={apifyTesting}
                  className="text-xs h-7"
                >
                  {apifyTesting ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                  <span>Test token</span>
                </Button>
                {apifyTestResult && (
                  <span className="text-xs text-neutral-600 truncate max-w-xs">{apifyTestResult}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {apifySaveResult && (
                  <span
                    className={`text-xs font-medium ${
                      apifySaveResult === t('common.saved')
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {apifySaveResult}
                  </span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={apifySaving}
                  className="text-xs h-7 px-3"
                >
                  {apifySaving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        </Card>

        <Separator />

        {/* 3. Free Sources */}
        <Card>
          <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
              Free Sources
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              API job feeds that cost nothing or have free tiers. Keys stay on this machine. Apify remains available as a paid fallback.
            </p>
          </div>

          <form onSubmit={handleSaveFree} className="flex flex-col gap-4" autoComplete="off">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">Enabled by default in Find Roles</span>
              <div className="flex flex-col gap-2.5">
                {[0, 1, 2, 3].map((priority) => {
                  const sources = orderFreeSources('DE').filter((source) => sourceCoveragePriority(source.coverage, 'DE') === priority);
                  if (sources.length === 0) return null;
                  return (
                    <div key={priority} className="flex flex-wrap items-center gap-2">
                      <span className="w-full text-xs font-medium text-neutral-500 sm:w-28">
                        {sourceCoverageGroupTitle(priority, 'DE')}
                      </span>
                      {sources.map((source) => {
                        const isOn = freeEnabled.includes(source.id);
                        const coverageLabel = sourceCoverageLabel(source.coverage, 'DE');
                        const needsBoards = source.id === 'ats' && freeBoards.length === 0;
                        return (
                          <label
                            key={source.id}
                            title={source.tagline}
                            className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs cursor-pointer transition-colors ${
                              needsBoards
                                ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                                : isOn
                                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleFreeEnabled(source.id)}
                              disabled={needsBoards}
                              className="size-3.5 rounded border-neutral-300 cursor-pointer text-emerald-600"
                            />
                            <span>{source.name}</span>
                            <span className="text-neutral-400 font-normal">
                              {needsBoards ? 'add boards below' : `${coverageLabel} · ${source.cost}`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="free-adzuna-id" className="text-sm font-medium text-neutral-700">Adzuna App ID</Label>
                <Input
                  id="free-adzuna-id"
                  name="rorilo-adzuna-id"
                  value={adzunaAppId}
                  onChange={(e) => setAdzunaAppId(e.target.value)}
                  autoComplete="off"
                  placeholder={hasAdzunaId ? '•••••••• (ID saved. Leave blank to keep)' : 'abc123...'}
                  className="font-mono text-xs h-9"
                />
              </div>
              <SecretInput
                id="free-adzuna-key"
                label="Adzuna App Key"
                value={adzunaAppKey}
                onChange={setAdzunaAppKey}
                placeholder={hasAdzunaKey ? '••••••••••••••••' : '••••••••'}
                fieldName="rorilo-adzuna-key"
              />
              <div className="sm:col-span-2">
                <SecretInput
                  id="free-techmap-key"
                  label="Techmap API Key"
                  value={techmapKey}
                  onChange={setTechmapKey}
                  placeholder={hasTechmapKey ? '••••••••••••••••' : 'RapidAPI key...'}
                  fieldName="rorilo-techmap-key"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700">Company career boards</span>
                <p className="text-xs text-neutral-500">
                  Add only companies you want to watch. Supports public Greenhouse, Lever, Ashby, and Personio boards.
                </p>
              </div>
              {freeBoards.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-2">
                  {freeBoards.map((entry) => {
                    const key = `${entry.provider}:${entry.board}`;
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2 rounded-md px-2 py-2 transition-colors ${
                          entry.enabled ? 'bg-neutral-50' : 'bg-white opacity-60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleBoard(entry.provider, entry.board)}
                          className="min-w-0 flex flex-1 items-center gap-2 text-left"
                          aria-pressed={entry.enabled}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                              entry.enabled
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-neutral-300 bg-white text-transparent'
                            }`}
                            aria-hidden="true"
                          >
                            <CheckCircle2 className="size-3" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-neutral-900">
                              {entry.company}
                            </span>
                            <span className="block truncate text-xs text-neutral-500">
                              {entry.provider} / {entry.board}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomBoard(entry.provider, entry.board)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remove board"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Board provider">
                  {BOARD_PROVIDER_OPTIONS.map((provider) => {
                    const selected = newBoardProvider === provider.value;
                    return (
                      <button
                        key={provider.value}
                        type="button"
                        onClick={() => setNewBoardProvider(provider.value)}
                        className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                        aria-pressed={selected}
                      >
                        {provider.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={newBoardId}
                    onChange={(e) => setNewBoardId(e.target.value)}
                    placeholder={newBoardProvider === 'personio' ? 'subdomain or career URL' : 'board-name'}
                    aria-label="Board ID"
                    className="text-xs h-9 bg-white flex-1"
                  />
                  <Input
                    value={newBoardCompany}
                    onChange={(e) => setNewBoardCompany(e.target.value)}
                    placeholder="Company"
                    aria-label="Company name"
                    className="text-xs h-9 bg-white flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomBoard}
                    className="text-xs h-9 sm:w-auto"
                  >
                    <Plus className="size-3.5" />
                    <span>Add</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {freeSaveResult && (
                <span
                  className={`text-xs font-medium ${
                    freeSaveResult === t('common.saved') ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {freeSaveResult}
                </span>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={freeSaving}
                className="text-xs h-7 px-3"
              >
                {freeSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
        </Card>

        {/* 4. Email Dispatch */}
        <Card>
          <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
              Email Dispatch
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Creates application drafts in your personal Gmail account for human review before sending.
            </p>
          </div>

          {/* Zero Config Helper Banner */}
          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
            <Mail className="size-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-blue-950">Zero-Config Email Dispatch Available:</span>
              <p className="text-xs text-blue-800 leading-relaxed">
                Rorilo includes 1-click <strong>Open in Gmail</strong> (web compose) and <strong>Open in Mail App</strong> buttons on every job. You can open pre-filled drafts in your browser or desktop mail app with zero setup.
              </p>
              <p className="text-xs text-blue-700 pt-0.5">
                Optional: If you want background automated draft creation via the Gmail API, configure your Google Cloud credentials below.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveEmail} className="space-y-3.5" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gmail-addr" className="text-sm font-medium text-neutral-700">Gmail Address</Label>
                <Input
                  id="gmail-addr"
                  type="email"
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gmail-cid" className="text-sm font-medium text-neutral-700">Google OAuth Client ID</Label>
                <Input
                  id="gmail-cid"
                  value={emailClientId}
                  onChange={(e) => setEmailClientId(e.target.value)}
                  placeholder="Client ID..."
                  className="font-mono text-xs h-8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <SecretInput
                id="gmail-secret"
                label="Client Secret"
                value={emailClientSecret}
                onChange={setEmailClientSecret}
                placeholder="Client secret..."
                fieldName="rorilo-gmail-secret"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestEmail}
                  disabled={emailTesting}
                  className="text-xs h-7"
                >
                  {emailTesting ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                  <span>Test mailbox</span>
                </Button>
                {emailTestResult && (
                  <span className="text-xs text-neutral-600 truncate max-w-xs">{emailTestResult}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {emailSaveResult && (
                  <span className="text-xs text-emerald-700 font-medium">{emailSaveResult}</span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={emailSaving}
                  className="text-xs h-7 px-3"
                >
                  {emailSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        </Card>

        {/* 5. Company Logos */}
        <Card>
          <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
              Company Logos
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Optional. Use a logo.dev publishable key that starts with pk_. Secret sk_ keys are for server APIs and cannot render image logos.
            </p>
            <a
              href="https://www.logo.dev/dashboard/api-keys"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-950 hover:underline"
            >
              <span>Open Logo.dev dashboard</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          <form onSubmit={handleSaveLogo} className="flex flex-col gap-3.5" autoComplete="off">
            <SecretInput
              id="logo-token"
              label="logo.dev Token"
              value={logoToken}
              onChange={setLogoToken}
              placeholder={hasLogoToken ? '•••••••••••••••• (Token saved. Leave blank to keep)' : 'pk_...'}
              fieldName="rorilo-logo-token"
            />
            {hasLogoToken && logoKeyType !== 'publishable' && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                The saved logo.dev key is not a publishable pk_ key, so logo images will be rejected. Paste the publishable key from the logo.dev playground.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <CompanyLogo company="GitHub" website="github.com" size={32} />
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {hasLogoToken
                    ? logoKeyType === 'publishable'
                      ? 'Live preview — if a logo shows here, job views will show them too.'
                      : 'The saved key cannot load image logos. Replace it with a publishable key.'
                    : 'Preview appears here once a token is saved. Until then, initials are shown.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {logoSaveResult && (
                  <span className="text-xs text-emerald-700 font-medium">{logoSaveResult}</span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={logoSaving}
                  className="text-xs h-7 px-3"
                >
                  {logoSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        </Card>

      </main>
    </div>
  );
}
