'use client';

import React, { useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/components/I18nProvider';

interface ModelPickerProps {
  id?: string;
  label?: string;
  model: string;
  onModelChange: (model: string) => void;
  baseUrl: string;
  apiKey: string;
  /** True when the key field is empty but a key is already saved. */
  useSavedKey?: boolean;
  inputClassName?: string;
  required?: boolean;
}

export function ModelPicker({
  id = 'ai-model',
  label,
  model,
  onModelChange,
  baseUrl,
  apiKey,
  useSavedKey = false,
  inputClassName = 'font-mono text-xs h-8',
  required = false,
}: ModelPickerProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refreshModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined, useSavedKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.models)) {
        setModels(data.models);
        setLoaded(true);
      } else {
        setError(data.error || t('settings.modelLoadFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.modelLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const options = Array.from(new Set([
    ...(model.trim() ? [model.trim()] : []),
    ...models,
  ]));
  const listId = `${id}-suggestions`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label ?? 'Model'}
        </Label>
        <button
          type="button"
          onClick={refreshModels}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer disabled:opacity-60"
          title={t('settings.modelRefreshHint')}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          <span>{t('settings.modelRefresh')}</span>
        </button>
      </div>

      <Input
        id={id}
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        className={inputClassName}
        required={required}
        list={options.length > 0 ? listId : undefined}
        placeholder="provider/model-name"
        autoComplete="off"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </datalist>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-neutral-400">
          {loaded && !error && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              {models.length} suggestion{models.length === 1 ? '' : 's'} loaded. You can still type any model manually.
            </span>
          )}
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
