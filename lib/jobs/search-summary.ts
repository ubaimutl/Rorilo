export interface SourceOutcomeInput {
  source: string;
  discovered?: number;
  newJobs?: number;
  duplicates?: number;
  skippedDeleted?: number;
  skippedExcluded?: number;
}

export interface SourceFailureInput {
  source: string;
  error: string;
}

export interface SearchSummary {
  newJobs: number;
  dismissed: number;
  excluded: number;
  failures: SourceFailureInput[];
  allQuiet: boolean;
  lines: Array<{
    source: string;
    discovered: number;
    newJobs: number;
    duplicates: number;
    dismissed: number;
    excluded: number;
  }>;
}

export function summarizeSearchOutcome(
  results: SourceOutcomeInput[] = [],
  failedSources: SourceFailureInput[] = []
): SearchSummary {
  const lines = results.map((result) => ({
    source: result.source,
    discovered: result.discovered || 0,
    newJobs: result.newJobs || 0,
    duplicates: result.duplicates || 0,
    dismissed: result.skippedDeleted || 0,
    excluded: result.skippedExcluded || 0,
  }));
  const newJobs = lines.reduce((total, line) => total + line.newJobs, 0);
  const dismissed = lines.reduce((total, line) => total + line.dismissed, 0);
  const excluded = lines.reduce((total, line) => total + line.excluded, 0);
  return {
    newJobs,
    dismissed,
    excluded,
    failures: failedSources,
    allQuiet: newJobs === 0 && failedSources.length === 0,
    lines,
  };
}
