import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${url.origin}/settings?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/settings?error=No+code+provided`);
  }

  const redirectUri = `${url.origin}/api/auth/callback/google`;
  const settings = await prisma.emailSettings.findFirst({ where: { id: 'default' } });
  
  const clientId = settings?.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = settings?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${url.origin}/settings?error=Missing+Client+Credentials`);
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Google Token Error:", data);
      return NextResponse.redirect(`${url.origin}/settings?error=${encodeURIComponent(data.error_description || data.error || 'Failed to exchange token')}`);
    }

    await prisma.emailSettings.upsert({
      where: { id: 'default' },
      update: {
        refreshToken: data.refresh_token || settings?.refreshToken,
        accessToken: data.access_token,
        isConfigured: true,
      },
      create: {
        id: 'default',
        providerType: 'gmail',
        clientId,
        clientSecret,
        refreshToken: data.refresh_token || '',
        accessToken: data.access_token,
        isConfigured: true,
      }
    });

    return NextResponse.redirect(`${url.origin}/settings?success=Gmail+Connected`);
  } catch (err) {
    return NextResponse.redirect(`${url.origin}/settings?error=Internal+Server+Error`);
  }
}
