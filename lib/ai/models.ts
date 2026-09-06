const MAX_MODELS = 1500;

/**
 * Extracts model ids from an OpenAI-compatible /models payload.
 * Tolerates `{ data: [{ id }] }`, bare arrays, and junk entries.
 */
export function parseModelList(payload: unknown): string[] {
  const raw: unknown =
    payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
      ? (payload as Record<string, unknown>).data
      : payload;
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const id = record.id || record.name || record.model;
        return typeof id === 'string' ? id.trim() : '';
      }
      return '';
    })
    .filter((id) => id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
}

export async function fetchOpenAIModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Enter a base URL first.');
  }
  let url: URL;
  try {
    url = new URL(`${base}/models`);
  } catch {
    throw new Error('That base URL does not look valid.');
  }
  async function requestModels(includeKey: boolean): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (includeKey && apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  }

  let response: Response;
  try {
    response = await requestModels(true);
  } catch (error) {
    throw new Error(
      `Could not reach ${url.host}. ${error instanceof Error ? error.message : 'Network error.'}`
    );
  }
  if ((response.status === 401 || response.status === 403) && apiKey?.trim() && url.hostname === 'ai-gateway.vercel.sh') {
    response = await requestModels(false);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('The server rejected the request. Check the API key.');
  }
  if (response.status === 404) {
    throw new Error('No /models endpoint here. Type the model manually.');
  }
  if (!response.ok) {
    throw new Error(`Model list failed (${response.status}). Type the model manually.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The server did not return JSON. Type the model manually.');
  }
  const models = parseModelList(payload);
  if (models.length === 0) {
    throw new Error('The server returned no models. Type the model manually.');
  }
  return models;
}
