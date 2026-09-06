import { NextResponse } from 'next/server';
import { fetchOpenAIModels } from '@/lib/ai/models';
import { getAISettingsRow } from '@/lib/ai/settings-store';
import { redactSecrets } from '@/lib/security/redact';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      baseUrl?: string;
      apiKey?: string;
      useSavedKey?: boolean;
    };

    const saved = await getAISettingsRow().catch(() => null);

    const typedBase = (body.baseUrl || '').trim();
    const typedKey = (body.apiKey || '').trim();
    const baseUrl = typedBase || saved?.baseUrl || process.env.AI_BASE_URL || '';
    // Empty typed key means "keyless" when the user also typed a base URL;
    // otherwise fall back to the saved key when the UI asks for it.
    const apiKey = typedKey
      ? typedKey
      : body.useSavedKey
        ? saved?.apiKey || ''
        : !body.baseUrl
          ? saved?.apiKey || process.env.AI_API_KEY || ''
          : '';

    const models = await fetchOpenAIModels(baseUrl, apiKey);
    return NextResponse.json({ success: true, models });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: redactSecrets(error) || 'Failed to load models' },
      { status: 502 }
    );
  }
}
