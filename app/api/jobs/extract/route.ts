import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/openai-compatible';

const MAX_INPUT_CHARS = 30000;
const REMOTE_TYPES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;

function cleanText(max: number) {
  return (value: unknown) => String(value ?? '').trim().slice(0, max);
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
}

const ExtractedJobSchema = z.object({
  title: z.preprocess(cleanText(200), z.string()),
  company: z.preprocess(cleanText(200), z.string()),
  location: z.preprocess(cleanText(200), z.string()),
  remoteType: z.preprocess(
    (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      return (REMOTE_TYPES as readonly string[]).includes(normalized) ? normalized : 'unknown';
    },
    z.enum(REMOTE_TYPES)
  ),
  employmentType: z.preprocess(cleanText(50), z.string()),
  salaryMin: z.preprocess(cleanNumber, z.number().nullable()),
  salaryMax: z.preprocess(cleanNumber, z.number().nullable()),
  salaryCurrency: z.preprocess((value) => String(value ?? '').trim().toUpperCase().slice(0, 3), z.string()),
  url: z.preprocess(cleanText(2000), z.string()),
  description: z.preprocess(cleanText(20000), z.string()),
});

/** POST /api/jobs/extract — read pasted posting text and return structured job fields. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Paste the job posting first' }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: 'Pasted text is too long (max 30,000 characters)' },
      { status: 422 }
    );
  }

  const prompt = `Extract the job posting below into the JSON schema.

Rules:
- Use only what the text says. Do not invent details.
- Use an empty string for any text field that is not stated.
- Use null for salaries that are not stated. Use plain numbers (no separators or currency symbols).
- remoteType is one of "remote", "hybrid", "onsite", or "unknown".
- url is the application or posting link if the text contains one, otherwise an empty string.
- description is the full job description (responsibilities, requirements, benefits), cleaned of navigation and boilerplate. Keep the original language.

Job posting:
"""
${text}
"""

Return exactly this shape:
{"title":"","company":"","location":"","remoteType":"unknown","employmentType":"","salaryMin":null,"salaryMax":null,"salaryCurrency":"","url":"","description":""}`;

  try {
    const ai = await getAIProvider();
    const job = await ai.generateStructured(prompt, ExtractedJobSchema, {
      temperature: 0,
      maxTokens: 4000,
      systemPrompt:
        'You extract job postings into structured data. Output only a complete valid JSON object matching the schema. No markdown and no prose.',
    });
    return NextResponse.json({ success: true, job });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'The AI could not read this posting' },
      { status: 502 }
    );
  }
}
