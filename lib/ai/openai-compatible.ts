import { z } from 'zod';
import { AIProvider, AIProviderConfig, AICompletionOptions, ChatMessage } from './types';
import { redactSecrets } from '../security/redact';
import { getAISettingsRow } from './settings-store';

const DEFAULT_AI_MODEL = 'gpt-5.4-mini';

export type SavedAIProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  structuredOutput?: boolean;
  disableReasoning?: boolean;
  providerOptions?: Record<string, unknown>;
};

export class AIProviderError extends Error {
  retryable: boolean;
  providerName: string;
  status?: number;

  constructor(message: string, options: { retryable: boolean; providerName: string; status?: number }) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = options.retryable;
    this.providerName = options.providerName;
    this.status = options.status;
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly providerName: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private structuredOutput: boolean;
  private disableReasoning: boolean;
  private providerOptions: Record<string, unknown>;

  constructor(config: AIProviderConfig) {
    this.providerName = config.name || config.model;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.defaultTemperature = config.temperature ?? 0.3;
    this.defaultMaxTokens = config.maxTokens ?? 2500;
    this.structuredOutput = config.structuredOutput ?? true;
    this.disableReasoning = config.disableReasoning ?? true;
    this.providerOptions = config.providerOptions ?? {};
  }

  async chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const requestedMaxTokens = options?.maxTokens ?? this.defaultMaxTokens;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages,
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: Math.max(16, requestedMaxTokens),
    };
    if (options?.responseFormatJson) {
      body.response_format = { type: 'json_object' };
    }
    if (options?.disableReasoning) {
      Object.assign(body, reasoningControlForProvider(this.baseUrl, this.model));
    }
    if (options?.responseFormatJson || options?.disableReasoning) {
      Object.assign(body, this.providerOptions);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      throw new AIProviderError(
        `${this.providerName} could not be reached: ${error instanceof Error ? error.message : 'Network error'}`,
        { retryable: true, providerName: this.providerName }
      );
    }

    if (!response.ok) {
      const errorText = redactSecrets(await response.text().catch(() => 'Unknown error'));
      throw new AIProviderError(
        `${this.providerName} error (${response.status}): ${errorText}`,
        { retryable: true, providerName: this.providerName, status: response.status }
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AIProviderError(`${this.providerName} did not return JSON.`, {
        retryable: true,
        providerName: this.providerName,
      });
    }
    const record = data as Record<string, unknown>;
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content !== 'string') {
      throw new AIProviderError(`Invalid response structure received from ${this.providerName}.`, {
        retryable: true,
        providerName: this.providerName,
      });
    }

    return content.trim();
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: AICompletionOptions
  ): Promise<T> {
    const systemPrompt =
      options?.systemPrompt ??
      'You are a precise data extraction and synthesis assistant. You must output ONLY valid JSON that matches the requested schema. Do not include markdown code block formatting or backticks if possible, just the raw JSON object.';

    let lastError: AIProviderError | null = null;
    const attempts = [
      { systemPrompt, prompt },
      {
        systemPrompt: `${systemPrompt} Return a complete JSON object only. If unsure, still return valid JSON with empty arrays rather than blank text.`,
        prompt: `${prompt}\n\nReturn valid JSON only. Do not return blank text.`,
      },
    ];

    for (const attempt of attempts) {
      const rawResponse = await this.chat(
        [
          { role: 'system', content: attempt.systemPrompt },
          { role: 'user', content: attempt.prompt },
        ],
        {
          ...options,
          responseFormatJson: options?.responseFormatJson ?? this.structuredOutput,
          disableReasoning: options?.disableReasoning ?? this.disableReasoning,
        }
      );

      let cleanJson = rawResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      if (!cleanJson) {
        lastError = new AIProviderError(`${this.providerName} returned an empty response.`, {
          retryable: true,
          providerName: this.providerName,
        });
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleanJson);
      } catch (e) {
        lastError = new AIProviderError(
          `${this.providerName} returned invalid JSON: ${(e as Error).message}. Raw content: ${cleanJson.slice(0, 300)}`,
          { retryable: true, providerName: this.providerName }
        );
        continue;
      }

      const validation = schema.safeParse(parsedJson);
      if (!validation.success) {
        const issues = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        lastError = new AIProviderError(`${this.providerName} response failed schema validation: ${issues}`, {
          retryable: true,
          providerName: this.providerName,
        });
        continue;
      }

      return validation.data;
    }

    throw lastError ?? new AIProviderError(`${this.providerName} could not produce valid JSON.`, {
      retryable: true,
      providerName: this.providerName,
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string; model?: string }> {
    try {
      const response = await this.chat(
        [
          { role: 'system', content: 'You are a test responder.' },
          { role: 'user', content: 'Respond with the single word: "PONG"' },
        ],
        { maxTokens: 50, temperature: 0 }
      );

      return {
        success: true,
        message: `Connection successful! Response: "${response}"`,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        message: redactSecrets(error) || 'Connection failed',
        model: this.model,
      };
    }
  }
}

export class FallbackAIProvider implements AIProvider {
  private providers: OpenAICompatibleProvider[];

  constructor(configs: AIProviderConfig[]) {
    this.providers = configs.map((config) => new OpenAICompatibleProvider(config));
  }

  private ensureProviders() {
    if (this.providers.length === 0) {
      throw new Error('No AI provider configured. Add a provider in Settings.');
    }
  }

  async chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string> {
    this.ensureProviders();
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.chat(messages, options);
      } catch (error) {
        errors.push((error as Error).message);
        if (error instanceof AIProviderError && !error.retryable) break;
      }
    }
    throw new Error(`All AI providers failed. ${errors.join(' | ')}`);
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: AICompletionOptions
  ): Promise<T> {
    this.ensureProviders();
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.generateStructured(prompt, schema, options);
      } catch (error) {
        errors.push((error as Error).message);
        if (error instanceof AIProviderError && !error.retryable) break;
      }
    }
    throw new Error(`All AI providers failed. ${errors.join(' | ')}`);
  }

  async testConnection(): Promise<{ success: boolean; message: string; model?: string }> {
    this.ensureProviders();
    const results = [];
    for (const provider of this.providers) {
      const result = await provider.testConnection();
      results.push(`${provider.providerName}: ${result.success ? 'ok' : result.message}`);
      if (result.success) {
        return {
          success: true,
          message: `Connection successful via ${provider.providerName}.`,
          model: result.model,
        };
      }
    }
    return {
      success: false,
      message: `All AI providers failed. ${results.join(' | ')}`,
    };
  }
}

function parseSavedProviders(value: unknown): SavedAIProvider[] {
  if (!value) return [];
  let raw: unknown = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): SavedAIProvider | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const name = String(record.name || '').trim();
      const baseUrl = String(record.baseUrl || '').trim();
      const apiKey = String(record.apiKey || '').trim();
      const model = String(record.model || '').trim();
      const enabled = record.enabled !== false;
      const structuredOutput = record.structuredOutput !== false;
      const disableReasoning = record.disableReasoning !== false;
      const providerOptions = parseProviderOptions(record.providerOptions);
      if (!id || !baseUrl || !model) return null;
      return {
        id,
        name: name || model,
        baseUrl,
        apiKey,
        model,
        enabled,
        structuredOutput,
        disableReasoning,
        providerOptions,
      };
    })
    .filter((entry): entry is SavedAIProvider => Boolean(entry));
}

export function serializeFallbackProviders(providers: SavedAIProvider[]): string {
  return JSON.stringify(
    providers
      .filter((provider) => provider.baseUrl.trim() && provider.model.trim())
      .map((provider) => ({
        id: provider.id,
        name: provider.name.trim() || provider.model.trim(),
        baseUrl: provider.baseUrl.trim().replace(/\/+$/, ''),
        apiKey: provider.apiKey.trim(),
        model: provider.model.trim(),
        enabled: provider.enabled !== false,
        structuredOutput: provider.structuredOutput !== false,
        disableReasoning: provider.disableReasoning !== false,
        providerOptions: provider.providerOptions ?? {},
      }))
  );
}

export function parseProviderOptions(value: unknown): Record<string, unknown> {
  if (!value) return {};
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function reasoningControlForProvider(baseUrl: string, model: string): Record<string, unknown> {
  const provider = `${baseUrl} ${model}`.toLowerCase();
  if (provider.includes('deepseek')) {
    return {
      thinking: { type: 'disabled' },
      reasoning_effort: 'none',
    };
  }
  if (provider.includes('ollama') || provider.includes('localhost:11434') || provider.includes('127.0.0.1:11434')) {
    return {
      reasoning_effort: 'none',
      reasoning: { effort: 'none' },
    };
  }
  if (provider.includes('qwen') || provider.includes('dashscope') || provider.includes('alibabacloud')) {
    return {
      enable_thinking: false,
    };
  }
  return {};
}

function sameProvider(a: AIProviderConfig, b: AIProviderConfig): boolean {
  return a.baseUrl.replace(/\/+$/, '') === b.baseUrl.replace(/\/+$/, '') && a.model === b.model;
}

export function buildProviderConfigs(settings?: {
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  providerName?: string | null;
  fallbackProviders?: string | null;
  structuredOutput?: boolean | null;
  disableReasoning?: boolean | null;
  providerOptions?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
}): AIProviderConfig[] {
  const temperature = settings?.temperature ?? 0.3;
  const maxTokens = settings?.maxTokens ?? 2500;
  const configs: AIProviderConfig[] = [];

  const primary: AIProviderConfig = {
    name: settings?.providerName || 'Primary',
    baseUrl: settings?.baseUrl || process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: settings?.apiKey || process.env.AI_API_KEY || '',
    model: settings?.model || process.env.AI_MODEL || DEFAULT_AI_MODEL,
    temperature,
    maxTokens,
    structuredOutput: settings?.structuredOutput ?? true,
    disableReasoning: settings?.disableReasoning ?? true,
    providerOptions: parseProviderOptions(settings?.providerOptions),
  };
  if (primary.baseUrl.trim() && primary.model.trim() && !configs.some((config) => sameProvider(config, primary))) {
    configs.push(primary);
  }

  for (const provider of parseSavedProviders(settings?.fallbackProviders)) {
    if (!provider.enabled) continue;
    const config: AIProviderConfig = {
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      temperature,
      maxTokens,
      structuredOutput: provider.structuredOutput,
      disableReasoning: provider.disableReasoning,
      providerOptions: provider.providerOptions,
    };
    if (!configs.some((existing) => sameProvider(existing, config))) configs.push(config);
  }

  return configs;
}

export { parseSavedProviders };

/**
 * Helper to get the currently configured AI Provider from DB or environment.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const dbSettings = await getAISettingsRow();

  return new FallbackAIProvider(buildProviderConfigs(dbSettings ?? undefined));
}
