import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/auth/callback/google`;

  const settings = await prisma.emailSettings.findFirst({ where: { id: 'default' } });
  const clientId = settings?.clientId || process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: 'Missing Client ID' }, { status: 400 });
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.compose',
    access_type: 'offline',
    prompt: 'consent'
  }).toString();

  return NextResponse.redirect(authUrl);
}
