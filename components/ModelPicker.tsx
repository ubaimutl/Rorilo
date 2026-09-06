'use client';

import React, { useEffect, useState } from 'react';
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

  const MAX_SUGGESTIONS_SHOWN = 100;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const options = Array.from(new Set([
    ...(model.trim() ? [model.trim()] : []),
    ...models,
  ]));
  const listId = `${id}-suggestions`;
  const query = model.trim().toLowerCase();
  const matches = query
    ? options.filter((option) => option.toLowerCase().includes(query))
    : options;
  const shown = matches.slice(0, MAX_SUGGESTIONS_SHOWN);
  const hiddenCount = matches.length - shown.length;
  const activeIndex = Math.min(highlight, Math.max(0, shown.length - 1));

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, listId]);

  const chooseOption = (value: string) => {
    onModelChange(value);
    setOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlight((current) =>
        e.key === 'ArrowDown'
          ? (current + 1) % shown.length
          : (current - 1 + shown.length) % shown.length
      );
    } else if (e.key === 'Enter' && open && shown[activeIndex]) {
      e.preventDefault();
      chooseOption(shown[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label ?? t('settings.aiModelPh')}
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

      <div className="relative">
        <Input
          id={id}
          name="rorilo-ai-model"
          value={model}
          onChange={(e) => {
            onModelChange(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            setOpen(true);
            setHighlight(0);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleInputKeyDown}
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className={inputClassName}
          required={required}
          placeholder="provider/model-name"
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore="true"
        />
        {open && shown.length > 0 && (
          <div
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {shown.map((option, index) => (
              <button
                key={option}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseOption(option)}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full truncate px-2.5 py-1.5 text-left font-mono text-xs ${
                  index === activeIndex ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-700'
                }`}
              >
                {option}
              </button>
            ))}
            {hiddenCount > 0 && (
              <p className="px-2.5 py-1.5 text-[11px] text-neutral-400">
                {t('settings.modelMore', { count: hiddenCount })}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-neutral-400">
          {loaded && !error && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              {t('settings.modelLoaded', { count: models.length, plural: models.length === 1 ? '' : 's' })}
            </span>
          )}
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
