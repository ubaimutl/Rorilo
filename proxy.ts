import { NextRequest, NextResponse } from 'next/server';

const AUTH_USER = process.env.RORILO_AUTH_USER || 'rorilo';
const AUTH_SECRET = process.env.RORILO_AUTH_SECRET?.trim();
const AUTH_DISABLED = process.env.RORILO_DISABLE_AUTH === '1';

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Rorilo", charset="UTF-8"',
    },
  });
}

function decodeBasicAuth(header: string) {
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      return null;
    }

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  if (AUTH_DISABLED || !AUTH_SECRET) {
    return NextResponse.next();
  }

  const credentials = decodeBasicAuth(request.headers.get('authorization') || '');
  if (credentials?.user === AUTH_USER && credentials.password === AUTH_SECRET) {
    return NextResponse.next();
  }

  return unauthorized();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
