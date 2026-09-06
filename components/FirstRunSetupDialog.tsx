'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/components/I18nProvider';

const FIRST_RUN_DIALOG_KEY = 'rorilo-setup-first-run-dismissed';

function readArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

type SettingsResponse = {
  ai?: { hasApiKey?: boolean };
  apify?: { isConfigured?: boolean };
  free?: { hasSavedSettings?: boolean };
  logo?: { isConfigured?: boolean };
};

type ProfileResponse = {
  activeCv?: { originalFilename?: string };
  profile?: {
    firstName?: string;
    email?: string;
    currentTitle?: string;
  };
  preferences?: {
    desiredTitles?: string | null;
    writingStyle?: string;
    aiNotes?: string;
  };
};

function hasSetupStarted(settings: SettingsResponse, profileData: ProfileResponse): boolean {
  const profile = profileData.profile || {};
  const preferences = profileData.preferences || {};
  const hasAi = Boolean(settings.ai?.hasApiKey);
  const hasCv = Boolean(profileData.activeCv?.originalFilename);
  const hasProfile = Boolean(profile.firstName?.trim() && profile.email?.trim());
  const hasWriting = Boolean(
    profile.currentTitle?.trim() ||
    readArray(preferences.desiredTitles).length > 0 ||
    preferences.writingStyle?.trim() ||
    preferences.aiNotes?.trim()
  );
  const hasSources = Boolean(
    settings.free?.hasSavedSettings ||
    settings.apify?.isConfigured ||
    settings.logo?.isConfigured
  );

  return hasAi || hasCv || hasProfile || hasWriting || hasSources;
}

export function FirstRunSetupDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    try {
      if (localStorage.getItem(FIRST_RUN_DIALOG_KEY) === '1') return;
    } catch {
      /* continue */
    }

    Promise.all([
      fetch('/api/settings').then((res) => res.json()).catch(() => ({})),
      fetch('/api/profile').then((res) => res.json()).catch(() => ({})),
    ]).then(([settings, profileData]) => {
      if (!mounted) return;
      if (!hasSetupStarted(settings, profileData)) setOpen(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(FIRST_RUN_DIALOG_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('setup.firstRunTitle')}</DialogTitle>
          <DialogDescription>{t('setup.firstRunDescription')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {t('setup.firstRunHint')}
        </div>
        <DialogFooter>
          <Link href="/setup" onClick={dismiss} className={buttonVariants()}>
            {t('setup.firstRunAction')}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
