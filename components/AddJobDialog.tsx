'use client';

import React, { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/components/I18nProvider';

interface AddJobDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new (or duplicate) job id after saving. */
  onAdded: (jobId: string | null) => void;
}

export function AddJobDialog({ open, onClose, onAdded }: AddJobDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [remoteType, setRemoteType] = useState('unknown');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUrl('');
    setTitle('');
    setCompany('');
    setLocation('');
    setRemoteType('unknown');
    setSalaryMin('');
    setSalaryMax('');
    setCurrency('USD');
    setDescription('');
    setError(null);
  };

  const close = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    if (!title.trim() || !company.trim()) {
      setError(t('addjob.required'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim() || undefined,
          title: title.trim(),
          company: company.trim(),
          location: location.trim() || undefined,
          remoteType,
          salaryMin: salaryMin.trim() === '' ? undefined : Number(salaryMin),
          salaryMax: salaryMax.trim() === '' ? undefined : Number(salaryMax),
          salaryCurrency: currency.trim() || undefined,
          description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || 'Failed to save job');
        return;
      }
      const newId: string | null = data.job?.id ?? null;
      // Score it right away so it lands in the queue with a match (best effort).
      if (newId) {
        try {
          await fetch(`/api/jobs/${newId}/analyze`, { method: 'POST' });
        } catch {
          /* matching can run later via Sort visible */
        }
      }
      reset();
      onAdded(newId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-balance">{t('addjob.title')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('addjob.desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="addjob-url">{t('addjob.url')}</Label>
            <Input
              id="addjob-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('addjob.urlPh')}
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="addjob-title">{t('addjob.jobTitle')}</Label>
              <Input
                id="addjob-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Frontend Engineer"
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addjob-company">{t('addjob.company')}</Label>
              <Input
                id="addjob-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Inc."
                autoComplete="off"
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="addjob-location">{t('profile.location')}</Label>
              <Input
                id="addjob-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Berlin"
                autoComplete="address-level2"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addjob-remote">{t('search.workplace')}</Label>
              <select
                id="addjob-remote"
                value={remoteType}
                onChange={(e) => setRemoteType(e.target.value)}
                className="h-11 w-full rounded-2xl border border-input bg-transparent px-3 text-sm cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <option value="unknown">{t('discover.workplace.all')}</option>
                <option value="remote">{t('discover.workplace.remote')}</option>
                <option value="hybrid">{t('discover.workplace.hybrid')}</option>
                <option value="onsite">{t('discover.workplace.onsite')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="addjob-min">{t('addjob.salaryMin')}</Label>
              <Input
                id="addjob-min"
                type="number"
                min={0}
                inputMode="decimal"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="80000"
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addjob-max">{t('addjob.salaryMax')}</Label>
              <Input
                id="addjob-max"
                type="number"
                min={0}
                inputMode="decimal"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="120000"
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addjob-cur">{t('addjob.currency')}</Label>
              <Input
                id="addjob-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="USD"
                autoComplete="off"
                spellCheck={false}
                maxLength={3}
                className="h-11 uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="addjob-desc">{t('addjob.description')}</Label>
              <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {description.trim().length}/50
              </span>
            </div>
            <Textarea
              id="addjob-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Paste the role, requirements, benefits…"
              className="min-h-32 text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">{t('addjob.descriptionHint')}</p>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {t('addjob.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
