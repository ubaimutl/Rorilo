import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [cvs, applicationDocs] = await Promise.all([
      prisma.cV.findMany({ orderBy: { uploadDate: 'desc' } }),
      prisma.applicationDocument.findMany({
        include: {
          application: {
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  company: true,
                  location: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return NextResponse.json({ cvs, applicationDocs });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, content, title } = body;

    if (!id) {
      return NextResponse.json({ error: 'Document id required' }, { status: 400 });
    }

    const updated = await prisma.applicationDocument.update({
      where: { id },
      data: {
        content: content !== undefined ? content : undefined,
        title: title !== undefined ? title : undefined,
        version: { increment: 1 },
      },
    });

    return NextResponse.json({ success: true, document: updated });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update document' },
      { status: 500 }
    );
  }
}
