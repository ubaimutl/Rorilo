'use client';

import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/components/I18nProvider';

interface RequestChangesProps {
  inputId: string;
  applying: boolean;
  /** Runs the revision. Returns an error message to display, or null on success. */
  onApply: (instruction: string) => Promise<string | null>;
}

export function RequestChanges({ inputId, applying, onApply }: RequestChangesProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const trimmed = instruction.trim();

  const run = async () => {
    if (!trimmed || applying) return;
    setError(null);
    setDone(false);
    const failure = await onApply(trimmed);
    if (failure) {
      setError(failure);
    } else {
      setDone(true);
      setInstruction('');
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 text-xs gap-1.5"
      >
        <Sparkles className="size-3.5" />
        <span>{t('revise.toggle')}</span>
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 space-y-2">
      <p className="text-xs text-neutral-500 leading-relaxed">{t('revise.hint')}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id={inputId}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t('revise.placeholder')}
          disabled={applying}
          className="h-8 text-xs bg-white flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={run}
            disabled={!trimmed || applying}
            className="h-8 text-xs gap-1.5"
          >
            {applying && <Loader2 className="size-3.5 animate-spin" />}
            <span>{applying ? t('revise.applying') : t('revise.apply')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={applying}
            className="h-8 text-xs"
          >
            {t('common.cancel')}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {done && !error && <p className="text-xs text-emerald-700 font-medium">{t('revise.applied')}</p>}
    </div>
  );
}
