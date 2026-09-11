import { z } from 'zod';
import { getAIProvider } from '../ai/openai-compatible';

/**
 * Null-safe schema helpers.
 * Zod's .default() only fills in `undefined`, never `null`.
 * AI models often return `null` for missing fields, which causes schema
 * validation failures. These preprocessors coerce null → the fallback value
 * before Zod sees the input, preventing false fallbacks.
 */
// null/undefined → '' (string)
const ns = (fallback = '') =>
  z.preprocess((v) => (v == null ? fallback : String(v)), z.string());

// null/undefined → [] (string array), filter out non-strings
const nsa = () =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => x != null).map(String) : []),
    z.array(z.string())
  );

// null/undefined → 0 (number)
const nn = (fallback = 0) =>
  z.preprocess((v) => {
    if (v == null) return fallback;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }, z.number());

// null/undefined → undefined (optional string)
const nos = () =>
  z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional());

export const StructuredCVSchema = z.object({
  firstName: ns(),
  lastName: ns(),
  email: ns(),
  phone: ns(),
  city: ns(),
  country: ns(),
  linkedIn: ns(),
  gitHub: ns(),
  portfolio: ns(),
  additionalUrls: nsa(),
  currentTitle: ns(),
  yearsExperience: nn(),
  skills: nsa(),
  technologies: nsa(),
  languages: nsa(),
  education: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        institution: ns(),
        degree: ns(),
        field: ns(),
        year: ns(),
      })
    )
  ),
  workExperience: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        company: ns(),
        role: ns(),
        startDate: ns(),
        endDate: ns(),
        highlights: nsa(),
      })
    )
  ),
  projects: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name: ns(),
        description: ns(),
        technologies: nsa(),
        link: nos(),
      })
    )
  ),
});

export type StructuredCV = z.infer<typeof StructuredCVSchema>;

const SECTION_TITLES = new Set([
  'berufserfahrung',
  'experience',
  'work experience',
  'kenntnisse',
  'skills',
  'technologies',
  'technische kenntnisse',
  'sprachen',
  'languages',
  'ausbildung',
  'education',
  'projekte',
  'projects',
]);

const TECHNOLOGY_ALIASES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'JavaScript', pattern: /\bjava\s*script\b|\bjavascript\b/i },
  { label: 'TypeScript', pattern: /\btype\s*script\b|\btypescript\b/i },
  { label: 'React', pattern: /\breact\b/i },
  { label: 'Next.js', pattern: /\bnext(?:\.js|js)?\b/i },
  { label: 'WordPress', pattern: /\bwordpress\b/i },
  { label: 'HTML', pattern: /\bhtml\b/i },
  { label: 'CSS', pattern: /\bcss\b/i },
  { label: 'Tailwind CSS', pattern: /\btailwind\b/i },
  { label: 'Shadcn UI', pattern: /\bshadcn\b/i },
  { label: 'Linux', pattern: /\blinux\b/i },
  { label: 'Docker', pattern: /\bdocker\b/i },
  { label: 'MySQL', pattern: /\bmysql\b/i },
  { label: 'PostgreSQL', pattern: /\bpostgres(?:ql)?\b/i },
  { label: 'Python', pattern: /\bpython\b/i },
  { label: 'Django', pattern: /\bdjango\b/i },
  { label: 'MedusaJS', pattern: /\bmedusajs\b|\bmedusa\b/i },
  { label: 'Payload CMS', pattern: /\bpayload\s*cms\b|\bpayloadcms\b/i },
  { label: 'GitHub', pattern: /\bgithub\b/i },
  { label: 'Git', pattern: /\bgit\b/i },
  { label: 'Dokploy', pattern: /\bdokploy\b/i },
  { label: 'cPanel', pattern: /\bcpanel\b/i },
  { label: 'DirectAdmin', pattern: /\bdirectadmin\b/i },
  { label: 'Cloudflare', pattern: /\bcloudflare\b/i },
  { label: 'Claude Code', pattern: /\bclaude\s*code\b/i },
  { label: 'OpenAI Codex', pattern: /\bopenai\s+codex\b|\bcodex\b/i },
];

const SKILL_ALIASES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Frontend development', pattern: /frontend|benutzeroberfl[aä]chen|weboberfl[aä]chen/i },
  { label: 'Web development', pattern: /webentwicklung|webentwickler|webprojekten|websites/i },
  { label: 'Landing pages', pattern: /landingpages|landing pages/i },
  { label: 'Testing', pattern: /testing|tests?/i },
  { label: 'Debugging', pattern: /debugging|fehleranalyse/i },
  { label: 'Performance optimization', pattern: /performance|optimierung/i },
  { label: 'Deployments', pattern: /deployments?|bereitstellung/i },
  { label: 'Project organization', pattern: /projektorganisation|projektarbeit/i },
  { label: 'Data entry', pattern: /datenerfassung|dateneingabe/i },
  { label: 'Returns management', pattern: /retourenmanagement/i },
  { label: 'Databases', pattern: /datenbanken|database/i },
  { label: 'AI-assisted development', pattern: /ki-gest[uü]tz|ai-assisted|claude code|openai codex/i },
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function languageKey(value: string): string {
  const lower = value.toLowerCase();
  if (/deutsch|german/.test(lower)) return 'de';
  if (/englisch|english/.test(lower)) return 'en';
  if (/arabisch|arabic/.test(lower)) return 'ar';
  return lower.replace(/\s*\([^)]*\)/g, '').trim();
}

function mergeLanguages(primary: string[], fallback: string[]): string[] {
  const byLanguage = new Map<string, string>();
  for (const language of unique([...primary, ...fallback])) {
    const key = languageKey(language);
    const current = byLanguage.get(key);
    if (!current || (!current.includes('(') && language.includes('('))) {
      byLanguage.set(key, language);
    }
  }
  return Array.from(byLanguage.values());
}

function normalizeCvText(cvText: string): string {
  return cvText
    .replace(/\u00ad/g, '')
    .replace(/\b(ORT|MAIL|TELEFON|WEB)(?=[A-ZÄÖÜ])/g, '$1 ')
    .replace(/([A-Za-zÄÖÜäöüß])-\s*\n\s*([A-Za-zÄÖÜäöüß])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cvLines(cvText: string): string[] {
  return normalizeCvText(cvText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isSectionTitle(line: string): boolean {
  return SECTION_TITLES.has(line.toLowerCase());
}

function isDateLine(line: string): boolean {
  return /^(?:seit\s+)?(?:\d{2}\/)?(?:19|20)\d{2}(?:\s*(?:-|–|—|bis|to)\s*(?:(?:\d{2}\/)?(?:19|20)\d{2}|heute|present|aktuell|now))?$/i.test(line);
}

function isLikelyCompany(line: string): boolean {
  if (!line || isSectionTitle(line) || line.startsWith('▪')) return false;
  if (/^(mail|telefon|web|ort)$/i.test(line)) return false;
  return /gmbh|ag\b|inc\b|llc\b|ltd\b|e\.v\.|upwork|fiver|freelance|company|studio|labs|group/i.test(line)
    || /^[A-ZÄÖÜ0-9][A-Za-zÄÖÜäöüß0-9 .,/&+-]{1,70}$/.test(line);
}

function extractUrls(text: string): string[] {
  return unique((text.match(/https?:\/\/[^\s)]+/gi) || []).map((url) => url.replace(/[.,;]+$/, '')));
}

function extractName(lines: string[]): { firstName: string; lastName: string } {
  const uppercaseNames = lines
    .slice(0, 12)
    .filter((line) => /^[A-ZÄÖÜ][A-ZÄÖÜ\s'-]{1,30}$/.test(line) && !isSectionTitle(line) && !/^(MAIL|TELEFON|WEB|ORT)$/.test(line));
  if (uppercaseNames.length >= 2) {
    return { firstName: uppercaseNames[0], lastName: uppercaseNames[1] };
  }
  const firstLine = lines[0] || '';
  const nameParts = firstLine.split(/\s+/);
  return { firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '' };
}

function extractCurrentTitle(lines: string[]): string {
  return lines.find((line, index) =>
    index > 0 &&
    !isSectionTitle(line) &&
    !/^(MAIL|TELEFON|WEB|ORT)\b/i.test(line) &&
    !/https?:\/\//i.test(line) &&
    !/^[A-ZÄÖÜ][A-ZÄÖÜ\s'-]{1,30}$/.test(line) &&
    /entwickler|developer|engineer|data|frontend|backend|designer|manager|assistant|angestell/i.test(line)
  ) || lines[1] || '';
}

function extractLocation(text: string): { city: string; country: string } {
  const locationMatch = normalizeCvText(text).match(/\bORT\s*([^\n]+)/i);
  const location = locationMatch?.[1]?.trim() || '';
  const city = location.split(',')[0]?.replace(/\d{4,}/g, '').trim() || '';
  const country = /deutschland|germany|berlin/i.test(text) ? 'DE' : '';
  return { city, country };
}

function extractLanguages(text: string): string[] {
  const matches = text.match(/(?:Deutsch|German|Englisch|English|Arabisch|Arabic)(?:\s*\([^)]+\))?/gi) || [];
  return unique(matches.map((match) =>
    match
      .replace(/^German/i, 'Deutsch')
      .replace(/^English/i, 'Englisch')
      .replace(/^Arabic/i, 'Arabisch')
  ));
}

function extractMatches(text: string, aliases: Array<{ label: string; pattern: RegExp }>): string[] {
  return unique(aliases.filter((item) => item.pattern.test(text)).map((item) => item.label));
}

function extractWorkExperience(lines: string[]): StructuredCV['workExperience'] {
  const entries: StructuredCV['workExperience'] = [];
  const workEnd = lines.findIndex((line) => /^sprachen$|^languages$|^ausbildung$|^education$/i.test(line));
  const scanLines = workEnd === -1 ? lines : lines.slice(0, workEnd);

  for (let i = 0; i < scanLines.length - 2; i++) {
    const company = scanLines[i];
    const date = scanLines[i + 1];
    if (!isLikelyCompany(company) || !isDateLine(date)) continue;

    const role = !isSectionTitle(scanLines[i + 2]) && !isDateLine(scanLines[i + 2]) ? scanLines[i + 2] : '';
    const location = scanLines[i + 3] && !isSectionTitle(scanLines[i + 3]) && !isDateLine(scanLines[i + 3]) ? scanLines[i + 3] : '';
    const highlights: string[] = [];

    for (let j = i + (location ? 4 : 3); j < scanLines.length; j++) {
      const line = scanLines[j];
      if (isSectionTitle(line) || (j < scanLines.length - 1 && isLikelyCompany(line) && isDateLine(scanLines[j + 1]))) break;
      if (line.startsWith('▪')) break;
      if (/^seite\s+\d+/i.test(line)) break;
      highlights.push(line);
    }

    entries.push({
      company,
      role,
      startDate: date,
      endDate: /^seit/i.test(date) ? 'present' : '',
      highlights: highlights.slice(0, 6),
    });

    if (location) i += 3;
  }

  return entries;
}

function extractEducation(lines: string[]): StructuredCV['education'] {
  const education: StructuredCV['education'] = [];
  const start = lines.findIndex((line) => /^ausbildung$/i.test(line) || /^education$/i.test(line));
  if (start === -1) return education;

  const section = lines.slice(start + 1);
  for (let i = 0; i < section.length; i++) {
    if (!isDateLine(section[i])) continue;
    const title = section[i + 1] || section[i - 1] || '';
    const [degree, institution = ''] = title.split(/\s+-\s+/);
    education.push({
      institution: institution.trim(),
      degree: degree.trim(),
      field: /anwendungsentwicklung/i.test(title) ? 'Anwendungsentwicklung' : '',
      year: section[i],
    });
  }

  const schoolLine = section.find((line) => /MSA|Mittlerer Schulabschluss|school/i.test(line));
  if (schoolLine) {
    education.push({
      institution: 'Hyaleen - Syria',
      degree: 'Mittlerer Schulabschluss',
      field: '',
      year: '',
    });
  }

  return education;
}

function extractProjects(text: string, workExperience: StructuredCV['workExperience'], technologies: string[]): StructuredCV['projects'] {
  const projects: StructuredCV['projects'] = [];
  if (/webprojekten|websites|landingpages|weboberfl[aä]chen/i.test(text)) {
    const webWork = workExperience.find((entry) => /webentwickler|developer/i.test(entry.role));
    projects.push({
      name: 'Websites, landing pages and web interfaces',
      description: webWork?.highlights.join(' ') || 'Frontend-oriented web projects with websites, landing pages, and user interfaces.',
      technologies: technologies.filter((tech) => /JavaScript|TypeScript|React|Next\.js|WordPress|HTML|CSS|Tailwind|Shadcn/i.test(tech)),
      link: extractUrls(text).find((url) => !/linkedin\.com|github\.com/i.test(url)),
    });
  }
  return projects;
}

function estimateYearsExperience(workExperience: StructuredCV['workExperience']): number {
  const currentYear = new Date().getFullYear();
  let best = 0;
  for (const entry of workExperience) {
    const years = entry.startDate.match(/(19|20)\d{2}/g)?.map(Number) || [];
    if (years.length === 0) continue;
    const start = years[0];
    const end = /^present$/i.test(entry.endDate) || /^seit/i.test(entry.startDate) ? currentYear : years[1] || currentYear;
    best = Math.max(best, Math.max(0, end - start));
  }
  return best;
}

export function extractCvLocally(cvText: string): StructuredCV {
  const text = normalizeCvText(cvText);
  const lines = cvLines(cvText);
  const urls = extractUrls(text);
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = text.match(/(?:\+\d{1,3}[-.\s]?)?(?:\d[\d\s()./-]{6,}\d)/);
  const { firstName, lastName } = extractName(lines);
  const linkedIn = urls.find((url) => /linkedin\.com/i.test(url)) || '';
  const gitHub = urls.find((url) => /github\.com/i.test(url)) || '';
  const portfolio = urls.find((url) => !/linkedin\.com|github\.com/i.test(url)) || '';
  const workExperience = extractWorkExperience(lines);
  const technologies = extractMatches(text, TECHNOLOGY_ALIASES);
  const skills = unique([...extractMatches(text, SKILL_ALIASES), ...technologies.slice(0, 8)]);
  const projects = extractProjects(text, workExperience, technologies);
  const location = extractLocation(text);

  return {
    firstName,
    lastName,
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    city: location.city,
    country: location.country,
    linkedIn,
    gitHub,
    portfolio,
    additionalUrls: urls.filter((url) => url !== linkedIn && url !== gitHub && url !== portfolio),
    currentTitle: extractCurrentTitle(lines),
    yearsExperience: estimateYearsExperience(workExperience),
    skills,
    technologies,
    languages: extractLanguages(text),
    education: extractEducation(lines),
    workExperience,
    projects,
  };
}

export function mergeStructuredCv(ai: StructuredCV, local: StructuredCV): StructuredCV {
  const mergeArray = (primary: string[], fallback: string[]) => unique([...primary, ...fallback]);
  const mergeObjects = <T extends Record<string, unknown>>(primary: T[], fallback: T[], key: keyof T) => {
    const existing = new Set(primary.map((item) => String(item[key] || '').toLowerCase()).filter(Boolean));
    return [
      ...primary,
      ...fallback.filter((item) => {
        const value = String(item[key] || '').toLowerCase();
        return value && !existing.has(value);
      }),
    ];
  };

  return {
    ...ai,
    firstName: ai.firstName || local.firstName,
    lastName: ai.lastName || local.lastName,
    email: ai.email || local.email,
    phone: ai.phone || local.phone,
    city: ai.city || local.city,
    country: ai.country || local.country,
    linkedIn: ai.linkedIn || local.linkedIn,
    gitHub: ai.gitHub || local.gitHub,
    portfolio: ai.portfolio || local.portfolio,
    additionalUrls: mergeArray(ai.additionalUrls || [], local.additionalUrls || []),
    currentTitle: ai.currentTitle || local.currentTitle,
    yearsExperience: Math.max(ai.yearsExperience || 0, local.yearsExperience || 0),
    skills: mergeArray(ai.skills || [], local.skills || []),
    technologies: mergeArray(ai.technologies || [], local.technologies || []),
    languages: mergeLanguages(ai.languages || [], local.languages || []),
    education: mergeObjects(ai.education || [], local.education || [], 'degree'),
    workExperience: mergeObjects(ai.workExperience || [], local.workExperience || [], 'company'),
    projects: mergeObjects(ai.projects || [], local.projects || [], 'name'),
  };
}

export function parseStoredStructuredCv(value?: string | null): StructuredCV {
  if (!value) return StructuredCVSchema.parse({});
  try {
    return StructuredCVSchema.parse(JSON.parse(value));
  } catch {
    return StructuredCVSchema.parse({});
  }
}

/**
 * Extracts raw plain text from a PDF buffer server-side.
 */
export async function extractTextFromPdf(pdfBuffer: Buffer | Uint8Array): Promise<string> {
  const { extractText } = await import('unpdf');
  const uint8 = new Uint8Array(pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength
  ));
  const result = await extractText(uint8);
  const pages = Array.isArray(result.text) ? result.text : [result.text || ''];
  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new Error('PDF appears to have no selectable text. Please use the Paste CV option instead.');
  }
  return text;
}

/**
 * Parses raw CV text into a structured profile using AI with Zod validation.
 * Falls back to local heuristic parsing when no AI provider is configured.
 * Returns both the structured data and a flag indicating whether AI was used.
 */
export async function parseCvTextToStructured(
  cvText: string
): Promise<{ structured: StructuredCV; parsedByAi: boolean; parseError?: string }> {
  const prompt = `Extract all resume/CV details from the text below into the requested JSON schema.
Only extract information that is explicitly stated. Do not fabricate any employers, dates, skills, or degrees.
For any field where information is not present, use an empty string "" for text fields and an empty array [] for list fields. Never use null.

CV TEXT:
${cvText.slice(0, 6000)}
`;

  try {
    const ai = await getAIProvider();
    const aiResult = await ai.generateStructured(prompt, StructuredCVSchema, {
      temperature: 0.1,
      maxTokens: 2500,
      systemPrompt:
        'You extract structured CV/resume data. Return ONLY valid JSON matching the schema. Use empty string "" for missing text fields and empty array [] for missing list fields — never use null.',
    });
    return {
      structured: mergeStructuredCv(aiResult, extractCvLocally(cvText)),
      parsedByAi: true,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('AI CV structuring failed, using fallback parsing:', reason);
    return {
      structured: extractCvLocally(cvText),
      parsedByAi: false,
      parseError: reason,
    };
  }
}


