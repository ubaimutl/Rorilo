import type { AISettingsRow } from '@/lib/ai/settings-store';
import { buildProviderConfigs } from '@/lib/ai/openai-compatible';

type ProfileLike = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  currentTitle?: string | null;
  skills?: string | null;
  technologies?: string | null;
  languages?: string | null;
  workExperience?: string | null;
  projects?: string | null;
};

type PreferencesLike = {
  desiredTitles?: string | null;
  keywords?: string | null;
  locations?: string | null;
  preferredTechnologies?: string | null;
};

type CvLike = {
  extractedText?: string | null;
} | null;

function text(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonCount(value?: string | null): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((item) => {
      if (typeof item === 'string') return item.trim().length > 0;
      if (!item || typeof item !== 'object') return false;
      return Object.values(item).some((inner) =>
        Array.isArray(inner)
          ? inner.some((entry) => String(entry || '').trim().length > 0)
          : String(inner || '').trim().length > 0
      );
    }).length;
  } catch {
    return text(value).length > 0 ? 1 : 0;
  }
}

function hasLocalBaseUrl(baseUrl: string): boolean {
  return /(^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$))/i.test(baseUrl.trim());
}

export function hasMatchProfile(profile?: ProfileLike | null, preferences?: PreferencesLike | null): boolean {
  if (!profile && !preferences) return false;
  const profileSignals =
    Number(Boolean(text(profile?.currentTitle))) +
    jsonCount(profile?.skills) +
    jsonCount(profile?.technologies) +
    jsonCount(profile?.workExperience) +
    jsonCount(profile?.projects);
  const preferenceSignals =
    jsonCount(preferences?.desiredTitles) +
    jsonCount(preferences?.keywords) +
    jsonCount(preferences?.preferredTechnologies) +
    jsonCount(preferences?.locations);

  return profileSignals + preferenceSignals >= 2;
}

export function getDraftReadinessIssues(
  profile?: ProfileLike | null,
  preferences?: PreferencesLike | null,
  cv?: CvLike
): string[] {
  const issues: string[] = [];
  const hasName = Boolean(`${text(profile?.firstName)} ${text(profile?.lastName)}`.trim());
  const hasEmail = Boolean(text(profile?.email));
  const hasCvText = text(cv?.extractedText).length >= 150;

  if (!hasName) issues.push('Add your name in Profile.');
  if (!hasEmail) issues.push('Add your email address in Profile.');
  if (!hasCvText && !hasMatchProfile(profile, preferences)) {
    issues.push('Add or paste a CV, or fill in your skills and target roles.');
  }

  return issues;
}

export function getAiProviderIssue(settings?: AISettingsRow | null): string | null {
  const configured = buildProviderConfigs(settings ?? undefined).some((provider) => {
    if (!provider.baseUrl.trim() || !provider.model.trim()) return false;
    return Boolean(provider.apiKey.trim()) || hasLocalBaseUrl(provider.baseUrl);
  });

  return configured ? null : 'Configure an AI provider before generating application materials.';
}
