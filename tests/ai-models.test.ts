import { afterEach, describe, it, expect, vi } from 'vitest';
import { fetchOpenAIModels, parseModelList } from '../lib/ai/models';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Model list parsing', () => {
  it('extracts ids from OpenAI-style payloads', () => {
    expect(
      parseModelList({ object: 'list', data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] })
    ).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('accepts model ids from gateway-style name and model fields', () => {
    expect(
      parseModelList({ data: [{ name: 'provider/name-field' }, { model: 'provider/model-field' }] })
    ).toEqual(['provider/model-field', 'provider/name-field']);
  });

  it('tolerates bare arrays, junk, duplicates, and ordering', () => {
    expect(parseModelList(['b-model', '', 'a-model', 'b-model', 42, null, { id: '  ' }])).toEqual([
      'a-model',
      'b-model',
    ]);
  });

  it('returns nothing usable for garbage payloads', () => {
    expect(parseModelList({})).toEqual([]);
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList('nope')).toEqual([]);
  });

  it('caps very long lists', () => {
    const payload = { data: Array.from({ length: 1600 }, (_, i) => ({ id: `model-${i}` })) };
    expect(parseModelList(payload)).toHaveLength(1500);
  });

  it('keeps large gateway lists broad enough for provider prefixes', () => {
    const payload = {
      data: [
        ...Array.from({ length: 350 }, (_, i) => ({ id: `anthropic/model-${i}` })),
        { id: 'openai/gpt-example' },
        ...Array.from({ length: 350 }, (_, i) => ({ id: `zai/model-${i}` })),
      ],
    };
    expect(parseModelList(payload)).toContain('openai/gpt-example');
  });

  it('retries Vercel AI Gateway model listing without auth when auth is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('nope', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'openai/gpt-example' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpenAIModels('https://ai-gateway.vercel.sh/v1/', 'bad-key')).resolves.toEqual([
      'openai/gpt-example',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer bad-key' });
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty('Authorization');
  });
});
