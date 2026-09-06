import type { NormalizedJobInput } from '@/lib/job-sources/types';

export type JobSourceHistoryEntry = {
  source: string;
  sourceJobId?: string;
  applicationUrl?: string;
  originalUrl?: string;
  seenAt: string;
};

export function parseRawData(rawData?: string | null): Record<string, unknown> {
  if (!rawData) return {};
  try {
    const parsed = JSON.parse(rawData);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function splitSourceLabels(source?: string | null): string[] {
  return Array.from(
    new Set(
      (source || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
}

export function readSourceHistory(rawData?: string | null, source?: string | null): JobSourceHistoryEntry[] {
  const parsed = parseRawData(rawData);
  const history = parsed._sourceHistory;
  if (Array.isArray(history)) {
    return history
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        source: typeof entry.source === 'string' ? entry.source : 'Unknown source',
        sourceJobId: typeof entry.sourceJobId === 'string' ? entry.sourceJobId : undefined,
        applicationUrl: typeof entry.applicationUrl === 'string' ? entry.applicationUrl : undefined,
        originalUrl: typeof entry.originalUrl === 'string' ? entry.originalUrl : undefined,
        seenAt: typeof entry.seenAt === 'string' ? entry.seenAt : new Date().toISOString(),
      }))
      .filter((entry) => entry.source);
  }

  return splitSourceLabels(source).map((label) => ({
    source: label,
    seenAt: new Date().toISOString(),
  }));
}

export function createSourceHistoryEntry(
  sourceLabel: string,
  jobItem: Pick<NormalizedJobInput, 'sourceJobId' | 'applicationUrl' | 'originalUrl'>
): JobSourceHistoryEntry {
  return {
    source: sourceLabel,
    sourceJobId: jobItem.sourceJobId,
    applicationUrl: jobItem.applicationUrl,
    originalUrl: jobItem.originalUrl,
    seenAt: new Date().toISOString(),
  };
}

export function mergeSourceHistory(
  rawData: string | null | undefined,
  source: string | null | undefined,
  nextEntry: JobSourceHistoryEntry
): string {
  const parsed = parseRawData(rawData);
  const current = readSourceHistory(rawData, source);
  const byKey = new Map<string, JobSourceHistoryEntry>();

  for (const entry of current) {
    const key = [entry.source, entry.sourceJobId || '', entry.applicationUrl || entry.originalUrl || ''].join('|');
    byKey.set(key, entry);
  }

  const nextKey = [nextEntry.source, nextEntry.sourceJobId || '', nextEntry.applicationUrl || nextEntry.originalUrl || ''].join('|');
  byKey.set(nextKey, nextEntry);

  return JSON.stringify({
    ...parsed,
    _sourceHistory: Array.from(byKey.values()),
  });
}

export function attachSourceSummary<T extends { source?: string | null; rawData?: string | null }>(job: T) {
  const sourceHistory = readSourceHistory(job.rawData, job.source);
  const sourceLabels = sourceHistory.length > 0
    ? Array.from(new Set(sourceHistory.map((entry) => entry.source)))
    : splitSourceLabels(job.source);
  const sourceLinks = sourceHistory
    .map((entry) => ({
      source: entry.source,
      url: entry.applicationUrl || entry.originalUrl || '',
      seenAt: entry.seenAt,
    }))
    .filter((entry) => entry.url);

  return {
    ...job,
    sourceLabels,
    sourceLinks,
    sourceHistory,
  };
}
