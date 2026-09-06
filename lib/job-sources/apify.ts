import { JobSource, JobSearchParams, JobSourceSearchResult, NormalizedJobInput } from './types';
import { normalizeJobPayload } from '../jobs/normalize';
import { prisma } from '../prisma';

import { resolveSourceAdapter } from './sources';

export interface ApifyConfig {
  apiToken: string;
  actorId?: string;
  actorInputTemplate?: string;
}

export class ApifyJobSource implements JobSource {
  name = 'apify';
  private apiToken: string;
  private actorId: string;
  private actorInputTemplate?: string;

  constructor(config: ApifyConfig) {
    this.apiToken = config.apiToken;
    this.actorId = config.actorId || 'curious_coder/linkedin-jobs-scraper';
    this.actorInputTemplate = config.actorInputTemplate;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiToken) {
      return { success: false, message: 'Apify API token is not configured.' };
    }

    try {
      const res = await fetch(`https://api.apify.com/v2/users/me?token=${this.apiToken}`);
      if (!res.ok) {
        if (res.status === 401) {
          return {
            success: false,
            message: 'Authentication failed (401): Token is invalid. Make sure you use an API token (starts with "apify_api_") from console.apify.com/account/integrations, not your account password.',
          };
        }
        return { success: false, message: `Apify authentication failed (${res.status})` };
      }
      const data = await res.json();
      return {
        success: true,
        message: `Successfully connected to Apify as user "${data.data?.username || data.data?.email || 'User'}"`,
      };
    } catch (err) {
      return { success: false, message: (err as Error).message || 'Apify connection error' };
    }
  }

  async searchJobs(params: JobSearchParams): Promise<JobSourceSearchResult> {
    if (!this.apiToken) {
      throw new Error('Apify API token is not configured in settings or .env');
    }

    const requestedLimit = params.limit ? Math.max(1, Number(params.limit)) : 5;
    const adapter = resolveSourceAdapter(this.actorId);

    // Build input payload using the dedicated adapter for this specific actor
    let actorInput: Record<string, unknown> = adapter.buildInput({
      title: params.title,
      keywords: params.keywords,
      country: params.country,
      location: params.location,
      remote: params.remote,
      datePosted: params.datePosted,
      limit: requestedLimit,
    });

    if (this.actorInputTemplate && this.actorInputTemplate.trim()) {
      try {
        const parsed = JSON.parse(this.actorInputTemplate);
        actorInput = { ...actorInput, ...parsed };
      } catch {
        // Ignore JSON parse errors in template, fallback to default
      }
    }

    // Clean actor ID for URL path (e.g. username~actor-name)
    const formattedActorId = adapter.actorId.replace('/', '~');
    const endpoint = `https://api.apify.com/v2/acts/${formattedActorId}/run-sync-get-dataset-items?token=${this.apiToken}&timeout=120`;

    let items: any[] = [];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    });

    if (response.ok) {
      items = await response.json();
    } else {
      const errText = await response.text().catch(() => 'Unknown error');
      if (response.status === 401) {
        throw new Error(
          'Apify authentication failed (401): The provided token is invalid. Please enter a valid API token (starts with "apify_api_") in Settings > Job Discovery, obtained from https://console.apify.com/account/integrations.'
        );
      }

      // If the actor run timed out, recover any dataset items already collected before the timeout
      const runIdMatch = errText.match(/run ID:\s*([a-zA-Z0-9]+)/);
      if (runIdMatch) {
        const runId = runIdMatch[1];
        try {
          const datasetRes = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${this.apiToken}`
          );
          if (datasetRes.ok) {
            const recovered = await datasetRes.json();
            if (Array.isArray(recovered) && recovered.length > 0) {
              items = recovered;
            }
          }
        } catch {
          // If recovery fails, fall through to throw original error
        }
      }

      if (!items || items.length === 0) {
        throw new Error(`Apify Actor execution failed (${response.status}): ${errText}`);
      }
    }

    if (!Array.isArray(items)) {
      throw new Error('Apify dataset output is not an array of items');
    }

    const limitedItems = items.slice(0, requestedLimit);
    const normalized = limitedItems.map((item) => this.normalizeJob(item));

    return {
      jobs: normalized,
      totalDiscovered: normalized.length,
      source: adapter.displayName || this.name,
      rawPayload: limitedItems,
    };
  }

  normalizeJob(rawItem: unknown): NormalizedJobInput {
    const adapter = resolveSourceAdapter(this.actorId);
    return normalizeJobPayload(rawItem as Record<string, unknown>, adapter.displayName || this.name);
  }
}

/**
 * Runs any Apify actor with a custom input and returns dataset items.
 * Used for one-off flows (e.g. detail enrichment) outside the search pipeline.
 */
export async function runApifyActor(
  apiToken: string,
  actorId: string,
  actorInput: Record<string, unknown>,
  timeoutSec = 120
): Promise<unknown[]> {
  if (!apiToken) {
    throw new Error('Apify API token is not configured in settings or .env');
  }
  const formattedActorId = actorId.replace('/', '~');
  const endpoint = `https://api.apify.com/v2/acts/${formattedActorId}/run-sync-get-dataset-items?token=${apiToken}&timeout=${timeoutSec}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actorInput),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    if (response.status === 401) {
      throw new Error(
        'Apify authentication failed (401): The provided token is invalid. Please enter a valid API token (starts with "apify_api_") in Settings > Job Discovery, obtained from https://console.apify.com/account/integrations.'
      );
    }
    throw new Error(`Apify actor ${actorId} failed (${response.status}): ${errText.slice(0, 300)}`);
  }
  const items: unknown = await response.json();
  if (!Array.isArray(items)) {
    throw new Error('Apify dataset output is not an array of items');
  }
  return items;
}

/**
 * Gets the configured Apify job source.
 */
export async function getJobSource(preferredSource?: string, actorOverride?: string): Promise<JobSource> {
  const settings = await prisma.apifySettings.findFirst({ where: { id: 'default' } });
  const token = settings?.apiToken || process.env.APIFY_TOKEN;
  const actorId = actorOverride || settings?.actorId || process.env.APIFY_ACTOR_ID;

  if (preferredSource === 'apify' || (token && settings?.isConfigured)) {
    return new ApifyJobSource({
      apiToken: token || '',
      actorId: actorId || 'curious_coder/linkedin-jobs-scraper',
      actorInputTemplate: settings?.actorInputTemplate,
    });
  }

  throw new Error('Apify is not configured. Add an Apify token in Settings, or use free sources.');
}
