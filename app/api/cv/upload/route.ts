import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractTextFromPdf, parseCvTextToStructured } from '@/lib/cv/parser';

function parseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let extractedText = '';
    let filename = 'Pasted_Resume.txt';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (!body.text || !body.text.trim()) {
        return NextResponse.json({ error: 'No CV text provided' }, { status: 400 });
      }
      extractedText = body.text.trim();
      filename = body.filename || 'Pasted_Resume.txt';
    } else {
      const formData = await req.formData();
      const pastedText = formData.get('text') as string | null;
      const file = formData.get('file') as File | null;

      if (pastedText && pastedText.trim()) {
        extractedText = pastedText.trim();
        filename = (formData.get('filename') as string) || 'Pasted_Resume.txt';
      } else if (file) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
        }

        filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        if (filename.endsWith('.txt') || filename.endsWith('.md')) {
          extractedText = buffer.toString('utf-8').trim();
        } else {
          // Extract text from PDF
          try {
            extractedText = await extractTextFromPdf(buffer);
          } catch (e) {
            return NextResponse.json(
              { error: `Failed to extract text from PDF: ${(e as Error).message}` },
              { status: 422 }
            );
          }
        }
      } else {
        return NextResponse.json({ error: 'No file or CV text provided' }, { status: 400 });
      }
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'CV content is empty or contains unreadable text' },
        { status: 422 }
      );
    }

    // AI structured extraction
    const structured = await parseCvTextToStructured(extractedText);

    // Mark previous CVs inactive
    await prisma.cV.updateMany({
      data: { isActive: false },
    });

    // Save active CV record
    const cv = await prisma.cV.create({
      data: {
        originalFilename: filename,
        extractedText,
        structuredData: JSON.stringify(structured),
        isActive: true,
      },
    });

    // Update UserProfile with extracted data
    const profile = await prisma.userProfile.findFirst({ where: { id: 'default' } });
    const existingAdditionalUrls = parseJsonArray(profile?.additionalUrls);
    const extractedAdditionalUrls = structured.additionalUrls || [];
    const additionalUrls = Array.from(
      new Set([...existingAdditionalUrls, ...extractedAdditionalUrls].map((url) => url.trim()).filter(Boolean))
    );

    await prisma.userProfile.upsert({
      where: { id: 'default' },
      update: {
        firstName: structured.firstName || profile?.firstName || '',
        lastName: structured.lastName || profile?.lastName || '',
        email: structured.email || profile?.email || '',
        phone: structured.phone || profile?.phone || '',
        city: structured.city || profile?.city || '',
        country: structured.country || profile?.country || '',
        linkedIn: structured.linkedIn || profile?.linkedIn || '',
        gitHub: structured.gitHub || profile?.gitHub || '',
        portfolio: structured.portfolio || profile?.portfolio || '',
        additionalUrls: JSON.stringify(additionalUrls),
        currentTitle: structured.currentTitle || profile?.currentTitle || '',
        yearsExperience: structured.yearsExperience || profile?.yearsExperience || 0,
        skills: JSON.stringify(structured.skills || []),
        technologies: JSON.stringify(structured.technologies || []),
        languages: JSON.stringify(structured.languages || []),
        education: JSON.stringify(structured.education || []),
        workExperience: JSON.stringify(structured.workExperience || []),
        projects: JSON.stringify(structured.projects || []),
      },
      create: {
        id: 'default',
        firstName: structured.firstName || '',
        lastName: structured.lastName || '',
        email: structured.email || '',
        phone: structured.phone || '',
        city: structured.city || '',
        country: structured.country || '',
        linkedIn: structured.linkedIn || '',
        gitHub: structured.gitHub || '',
        portfolio: structured.portfolio || '',
        additionalUrls: JSON.stringify(additionalUrls),
        currentTitle: structured.currentTitle || '',
        yearsExperience: structured.yearsExperience || 0,
        skills: JSON.stringify(structured.skills || []),
        technologies: JSON.stringify(structured.technologies || []),
        languages: JSON.stringify(structured.languages || []),
        education: JSON.stringify(structured.education || []),
        workExperience: JSON.stringify(structured.workExperience || []),
        projects: JSON.stringify(structured.projects || []),
      },
    });

    return NextResponse.json({
      success: true,
      cv,
      structured,
      summary: {
        name: [structured.firstName, structured.lastName].filter(Boolean).join(' '),
        title: structured.currentTitle,
        skills: structured.skills.length,
        technologies: structured.technologies.length,
        languages: structured.languages.length,
        workExperience: structured.workExperience.length,
        projects: structured.projects.length,
        links: [structured.linkedIn, structured.gitHub, structured.portfolio, ...additionalUrls].filter(Boolean).length,
      },
    });
  } catch (error) {
    console.error('CV processing error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to process CV' },
      { status: 500 }
    );
  }
}
