import { NextResponse } from 'next/server';
import { getAIProvider, OpenAICompatibleProvider, parseSavedProviders } from '@/lib/ai/openai-compatible';
import { getJobSource } from '@/lib/job-sources/apify';
import { getEmailProvider } from '@/lib/email/gmail';
import { getLogoToken } from '@/lib/server-logo';
import { getAISettingsRow } from '@/lib/ai/settings-store';
import { redactSecrets } from '@/lib/security/redact';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { target, actorId, apiToken } = body;

    if (target === 'ai') {
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      let apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!apiKey && body.useSavedKey) {
        const saved = await getAISettingsRow();
        if (typeof body.providerId === 'string' && body.providerId.trim()) {
          apiKey = parseSavedProviders(saved?.fallbackProviders).find((provider) => provider.id === body.providerId)?.apiKey || '';
        } else {
          apiKey = saved?.apiKey || '';
        }
      }
      const ai = baseUrl && model
        ? new OpenAICompatibleProvider({
            name: name || 'Typed provider',
            baseUrl,
            model,
            apiKey,
          })
        : await getAIProvider();
      const result = await ai.testConnection();
      return NextResponse.json(result);
    }

    if (target === 'apify') {
      const source = await getJobSource('apify', typeof actorId === 'string' ? actorId : undefined);
      if (source.testConnection) {
        const result = await source.testConnection();
        return NextResponse.json(result);
      }
      return NextResponse.json({ success: true, message: 'Apify source configured.' });
    }

    if (target === 'email') {
      const email = await getEmailProvider();
      const result = await email.testConnection();
      return NextResponse.json(result);
    }

    if (target === 'logo') {
      const token = typeof apiToken === 'string' && apiToken.trim()
        ? apiToken.trim()
        : await getLogoToken();
      if (!token) {
        return NextResponse.json({
          success: false,
          message: 'Add a Logo.dev publishable key first.',
        });
      }
      if (!token.startsWith('pk_')) {
        return NextResponse.json({
          success: false,
          message: 'Logo images require a publishable key that starts with pk_. Secret sk_ keys are only for server APIs.',
        });
      }

      const res = await fetch(
        `https://img.logo.dev/github.com?token=${encodeURIComponent(token)}&size=32&format=png&retina=true&fallback=404`,
        { signal: AbortSignal.timeout(12000) }
      );
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.startsWith('image/')) {
        return NextResponse.json({
          success: false,
          message: `Logo.dev rejected the key or returned no image (${res.status}).`,
        });
      }
      return NextResponse.json({
        success: true,
        message: 'Logo.dev key works. Company logos can load.',
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid test target' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: redactSecrets(error) || 'Test connection error' },
      { status: 500 }
    );
  }
}
