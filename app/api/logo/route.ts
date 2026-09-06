import { NextResponse } from 'next/server';
import { isValidDomain } from '@/lib/logo';
import { getLogoToken } from '@/lib/server-logo';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=3600' };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = (searchParams.get('domain') || '').trim().toLowerCase();
    const name = (searchParams.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const aaLogo = (searchParams.get('aaLogo') || '').trim().slice(0, 200);
    const requestedSize = parseInt(searchParams.get('size') || '128', 10);
    const size = Number.isFinite(requestedSize)
      ? Math.max(16, Math.min(512, requestedSize))
      : 128;

    // Bundesagentur employer logos need no token — stream them through.
    if (aaLogo) {
      const upstream = await fetch(
        `https://rest.arbeitsagentur.de/vermittlung/ag-darstellung-service/ct/v1/arbeitgeberlogo/${encodeURIComponent(aaLogo)}`,
        { headers: { 'X-API-Key': 'jobboerse-jobsuche' }, signal: AbortSignal.timeout(15000) }
      ).catch(() => null);
      const contentType = upstream?.headers.get('content-type') || '';
      if (!upstream || !upstream.ok || !contentType.startsWith('image/')) {
        return NextResponse.json({ error: 'No employer logo available.' }, { status: 404, headers: CACHE_HEADERS });
      }
      const bytes = await upstream.arrayBuffer();
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    const token = await getLogoToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Company logos are not configured. Add a logo.dev publishable key in Settings.' },
        { status: 404, headers: CACHE_HEADERS }
      );
    }
    if (!token.startsWith('pk_')) {
      return NextResponse.json(
        { error: 'logo.dev image lookups require a publishable key that starts with pk_. Secret sk_ keys do not work with img.logo.dev.' },
        { status: 401, headers: CACHE_HEADERS }
      );
    }

    if (domain && isValidDomain(domain)) {
      return NextResponse.redirect(
        `https://img.logo.dev/${domain}?token=${encodeURIComponent(token)}&size=${size}&format=png&retina=true&fallback=404`
      );
    }

    if (name.length >= 2) {
      return NextResponse.redirect(
        `https://img.logo.dev/name/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}&size=${size}&format=png&retina=true&fallback=monogram`
      );
    }

    return NextResponse.json(
      { error: 'Provide a company domain (?domain=) or name (?name=)' },
      { status: 400, headers: CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to resolve company logo' },
      { status: 500 }
    );
  }
}
