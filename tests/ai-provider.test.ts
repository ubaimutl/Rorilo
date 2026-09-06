import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildProviderConfigs, FallbackAIProvider, OpenAICompatibleProvider, parseSavedProviders } from '../lib/ai/openai-compatible';
import { publicSettingsError, redactSecrets } from '../lib/security/redact';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('secret redaction', () => {
  it('removes provider keys from public error messages', () => {
    const message = redactSecrets('apiKey: "vck_secretValue" and token sk-secretValue');
    expect(message).not.toContain('vck_secretValue');
    expect(message).not.toContain('sk-secretValue');
    expect(message).toContain('[redacted]');
  });

  it('turns Prisma validation errors into a safe settings message', () => {
    const message = publicSettingsError('Invalid `prisma.aIProviderSettings.upsert()` invocation with apiKey: "vck_secretValue" Unknown argument `providerName`.');
    expect(message).toBe('Settings database client is out of date. Restart the dev server after the Prisma update, then try again.');
    expect(message).not.toContain('vck_secretValue');
  });
});

describe('AI provider fallback', () => {
  it('keeps the primary provider before enabled fallbacks', () => {
    const configs = buildProviderConfigs({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'primary-key',
      model: 'gpt-5.4-mini',
      providerName: 'OpenAI',
      fallbackProviders: JSON.stringify([
        {
          id: 'groq',
          name: 'Groq',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'fallback-key',
          model: 'llama',
          enabled: true,
        },
        {
          id: 'off',
          name: 'Disabled',
          baseUrl: 'https://disabled.example/v1',
          apiKey: 'unused',
          model: 'unused',
          enabled: false,
        },
      ]),
    });

    expect(configs.map((config) => config.name)).toEqual(['OpenAI', 'Groq']);
  });

  it('parses saved fallback providers defensively', () => {
    expect(parseSavedProviders(JSON.stringify([
      { id: 'a', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'x', model: 'llama', enabled: true },
      { id: '', baseUrl: 'https://bad.example', model: 'nope' },
      null,
    ]))).toEqual([
      {
        id: 'a',
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: 'x',
        model: 'llama',
        enabled: true,
        structuredOutput: true,
        disableReasoning: true,
        providerOptions: {},
      },
    ]);
  });

  it('tries the next provider when the first one fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 500 }))
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: 'ok' } }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new FallbackAIProvider([
      { name: 'First', baseUrl: 'https://first.example/v1', apiKey: '', model: 'bad' },
      { name: 'Second', baseUrl: 'https://second.example/v1', apiKey: '', model: 'good' },
    ]);

    await expect(provider.chat([{ role: 'user', content: 'hi' }])).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries structured generation when a provider returns blank content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: '' } }],
      }))
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider({
      name: 'DeepSeek',
      baseUrl: 'https://deepseek.example/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
    });

    await expect(provider.generateStructured('return ok', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('adds structured JSON and DeepSeek reasoning controls to structured calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: '{"ok":true}' } }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      providerOptions: { custom_option: 'kept' },
    });

    await provider.generateStructured('return ok', z.object({ ok: z.boolean() }));

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.reasoning_effort).toBe('none');
    expect(body.custom_option).toBe('kept');
  });

  it('does not add structured-only provider options to normal chat calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: 'ok' } }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      providerOptions: { custom_option: 'structured-only' },
    });

    await provider.chat([{ role: 'user', content: 'hi' }]);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.custom_option).toBeUndefined();
  });
});
