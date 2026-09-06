'use client';

import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/components/I18nProvider';
import { validateManualDescription } from '@/lib/jobs/manual-description';

interface JobDescriptionInputProps {
  jobId: string;
  onSaved: () => Promise<void> | void;
}

export function JobDescriptionInput({ jobId, onSaved }: JobDescriptionInputProps) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    setSavedMessage(null);

    const validation = validateManualDescription(value);
    if (!validation.ok) {
      setError(
        validation.error === 'TOO_LONG'
          ? t('jobdetail.manualTooLong')
          : t('jobdetail.manualTooShort')
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: validation.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('jobdetail.manualFailed'));
        return;
      }

      let matchRefreshed = true;
      try {
        const analyzeRes = await fetch(`/api/jobs/${jobId}/analyze`, { method: 'POST' });
        matchRefreshed = analyzeRes.ok;
      } catch {
        matchRefreshed = false;
      }

      await onSaved();
      setValue('');
      setSavedMessage(
        matchRefreshed ? t('jobdetail.manualSaved') : t('jobdetail.manualSavedBasic')
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/70 p-4 space-y-3">
      <div>
        <Label htmlFor={`manual-desc-${jobId}`} className="text-sm font-semibold text-neutral-900">
          {t('jobdetail.manualTitle')}
        </Label>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          {t('jobdetail.manualHint')}
        </p>
      </div>
      <Textarea
        id={`manual-desc-${jobId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={t('jobdetail.manualPh')}
        className="bg-white text-sm leading-relaxed"
      />
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {savedMessage && <p className="text-xs text-emerald-700 font-medium">{savedMessage}</p>}
      <Button
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={saving || !value.trim()}
        className="h-8 text-xs gap-1.5"
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        <span>{saving ? t('common.saving') : t('jobdetail.manualSave')}</span>
      </Button>
    </div>
  );
}
