import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function safeFilename(name: string, fallbackExt: string): string {
  const clean = (name || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_') || `cv${fallbackExt}`;
  return clean.includes('.') ? clean : `${clean}${fallbackExt}`;
}

/** GET /api/cv?download=<id|active> — download the saved CV file. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const which = searchParams.get('download');
    if (!which) {
      return NextResponse.json({ error: 'Missing download parameter' }, { status: 400 });
    }

    const cv =
      which === 'active'
        ? await prisma.cV.findFirst({ where: { isActive: true }, orderBy: { uploadDate: 'desc' } })
        : await prisma.cV.findUnique({ where: { id: which } });
    if (!cv) {
      return NextResponse.json({ error: 'CV not found' }, { status: 404 });
    }

    // Legacy rows (uploaded before file storage) fall back to extracted text.
    const hasBytes = Boolean(cv.fileData);
    const bytes = hasBytes
      ? Buffer.from(cv.fileData as Uint8Array)
      : Buffer.from(cv.extractedText || '', 'utf-8');
    const mime = hasBytes
      ? cv.mimeType || 'application/octet-stream'
      : 'text/plain';
    const name = hasBytes
      ? cv.originalFilename
      : cv.originalFilename.replace(/\.[a-zA-Z0-9]+$/, '') || 'cv';
    const ext = mime === 'application/pdf' ? '.pdf' : mime === 'text/markdown' ? '.md' : '.txt';

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${safeFilename(name, ext)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to download CV' },
      { status: 500 }
    );
  }
}
