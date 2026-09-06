import { NormalizedJobInput } from '../job-sources/types';

/**
 * Strips HTML tags and excessive whitespace safely.
 */
export function sanitizeDescription(htmlOrText: string | undefined | null): string {
  if (!htmlOrText) return '';
  return htmlOrText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detects remote work type from title, location, or description.
 */
export function detectRemoteType(
  title: string = '',
  location: string = '',
  description: string = ''
): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  const combined = `${title} ${location} ${description}`.toLowerCase();

  if (combined.includes('hybrid') || combined.includes('flexible onsite')) {
    return 'hybrid';
  }
  if (
    combined.includes('fully remote') ||
    combined.includes('100% remote') ||
    combined.includes('remote friendly') ||
    combined.includes('remote, ') ||
    combined.includes('(remote)') ||
    combined.includes('[remote]') ||
    location.toLowerCase() === 'remote' ||
    combined.includes('work from home') ||
    combined.includes('anywhere')
  ) {
    return 'remote';
  }
  if (combined.includes('on-site') || combined.includes('onsite') || combined.includes('in-office')) {
    return 'onsite';
  }
  return 'unknown';
}

/**
 * Extracts salary range and currency from text/numbers.
 */
export function parseSalary(
  rawSalary?: string | number,
  min?: number,
  max?: number,
  currency?: string
): { salaryMin?: number; salaryMax?: number; salaryCurrency?: string } {
  if (typeof min === 'number' && min > 0) {
    return {
      salaryMin: min,
      salaryMax: typeof max === 'number' && max > 0 ? max : min,
      salaryCurrency: currency || 'USD',
    };
  }

  if (!rawSalary || typeof rawSalary !== 'string') {
    return {};
  }

  const str = rawSalary.trim();
  let detectedCurrency = 'USD';
  if (str.includes('€') || str.toLowerCase().includes('eur')) detectedCurrency = 'EUR';
  else if (str.includes('£') || str.toLowerCase().includes('gbp')) detectedCurrency = 'GBP';
  else if (str.includes('CAD') || str.includes('C$')) detectedCurrency = 'CAD';

  // Match numbers with optional k/kilo (e.g. $120k, $120,000, 80-100k)
  const matches = str.match(/(?:[\$€£]\s*)?(\d{1,3}(?:[,\.]\d{3})*|\d+)\s*(k|kilo)?/gi);
  if (matches && matches.length >= 1) {
    const nums = matches.map((m) => {
      const isK = /k/i.test(m);
      const digits = m.replace(/[^\d]/g, '');
      let val = parseInt(digits, 10);
      if (isNaN(val)) return 0;
      if (isK && val < 1000) val *= 1000;
      return val;
    }).filter((n) => n > 0);

    if (nums.length >= 2) {
      const sorted = [...nums].sort((a, b) => a - b);
      return {
        salaryMin: sorted[0],
        salaryMax: sorted[sorted.length - 1],
        salaryCurrency: detectedCurrency,
      };
    } else if (nums.length === 1) {
      return {
        salaryMin: nums[0],
        salaryMax: nums[0],
        salaryCurrency: detectedCurrency,
      };
    }
  }

  return { salaryCurrency: detectedCurrency };
}

/**
 * Extracts email addresses from text if present.
 */
export function extractContactEmail(text: string): string | undefined {
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = text.match(emailRegex);
  if (!matches) return undefined;
  // Filter out typical dummy / system emails
  const filtered = matches.filter(
    (e) => !e.includes('example.com') && !e.includes('domain.com') && !e.endsWith('.png') && !e.endsWith('.jpg')
  );
  return filtered[0];
}

/**
 * Extracts common technology keywords from text.
 */
const COMMON_TECHS = [
  'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Go', 'Golang',
  'Rust', 'Java', 'C#', '.NET', 'Ruby', 'Rails', 'PHP', 'Laravel', 'PostgreSQL',
  'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Prisma', 'GraphQL', 'REST', 'Tailwind',
  'Tailwind CSS', 'CSS', 'HTML', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
  'Git', 'CI/CD', 'Linux', 'Vue', 'Angular', 'Svelte', 'FastAPI', 'Django',
  'Flask', 'Express', 'Kafka', 'Elasticsearch', 'Terraform', 'OpenAI', 'LangChain',
];

export function extractTechnologies(text: string): string[] {
  const found = new Set<string>();
  for (const tech of COMMON_TECHS) {
    // Word boundary check
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      found.add(tech);
    }
  }
  return Array.from(found);
}

/**
 * Normalizes any arbitrary job data into NormalizedJobInput.
 */
const SOURCE_BASE_URLS: Array<{ match: string; base: string }> = [
  { match: 'stepstone', base: 'https://www.stepstone.de' },
  { match: 'arbeitsagentur', base: 'https://www.arbeitsagentur.de' },
  { match: 'linkedin', base: 'https://www.linkedin.com' },
  { match: 'indeed', base: 'https://www.indeed.com' },
];

export function resolveSourceUrl(url: string, source: string = ''): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) {
    const lower = source.toLowerCase();
    const hit = SOURCE_BASE_URLS.find((entry) => lower.includes(entry.match));
    if (hit) return `${hit.base}${url}`;
  }
  return url;
}
export function normalizeJobPayload(raw: Record<string, unknown>, source: string = 'unknown'): NormalizedJobInput {
  const title = (raw.title || raw.jobTitle || raw.position || raw.titel || raw.beruf || raw.stelle || raw.berufsbezeichnung || 'Untitled Position') as string;
  const company = (raw.company || raw.companyName || raw.employer || raw.arbeitgeber || raw.unternehmen || raw.firma || 'Unknown Company') as string;
  const location = (raw.location || raw.city || raw.workplace || raw.ort || raw.arbeitsort || raw.standort || '') as string;
  const rawDesc = (raw.descriptionText || raw.description || raw.jobDescription || raw.descriptionHtml || raw.summary || raw.details || raw.stellenbeschreibung || raw.beschreibung || raw.textSnippet || raw.snippet || raw.text || '') as string;
  const description = sanitizeDescription(rawDesc);

  const workModel = String(raw.workModel || '').toLowerCase();
  const remoteType =
    raw.remoteType === 'remote' || raw.remoteType === 'hybrid' || raw.remoteType === 'onsite'
      ? raw.remoteType
      : /remote|home[\s-]?office/.test(workModel)
      ? 'remote'
      : /hybrid|flexib/.test(workModel)
      ? 'hybrid'
      : /on[\s-]?site|office|präsenz|vor.?ort/.test(workModel)
      ? 'onsite'
      : detectRemoteType(title, location, description);

  const salaryText = typeof raw.salary === 'string' ? raw.salary : '';
  const salary = parseSalary(
    raw.salary as string,
    typeof raw.salaryMin === 'number' ? raw.salaryMin : undefined,
    typeof raw.salaryMax === 'number' ? raw.salaryMax : undefined,
    raw.salaryCurrency as string
  );
  if (!raw.salaryCurrency) {
    if (/€|EUR/i.test(salaryText)) salary.salaryCurrency = 'EUR';
    else if (/£|GBP/i.test(salaryText)) salary.salaryCurrency = 'GBP';
  }

  const tech = extractTechnologies(`${title} ${description}`);

  // Requirements / Responsibilities extraction if available in lists or text
  let requirements: string[] = [];
  if (Array.isArray(raw.requirements)) {
    requirements = raw.requirements.map(String).map(sanitizeDescription).filter(Boolean);
  } else if (typeof raw.requirements === 'string') {
    requirements = raw.requirements.split('\n').map(sanitizeDescription).filter(Boolean);
  }

  let responsibilities: string[] = [];
  if (Array.isArray(raw.responsibilities)) {
    responsibilities = raw.responsibilities.map(String).map(sanitizeDescription).filter(Boolean);
  } else if (typeof raw.responsibilities === 'string') {
    responsibilities = raw.responsibilities.split('\n').map(sanitizeDescription).filter(Boolean);
  }

  let benefits: string[] = [];
  if (Array.isArray(raw.benefits)) {
    benefits = raw.benefits.map(String).map(sanitizeDescription).filter(Boolean);
  }

  const contacts = raw.contacts as { emails?: unknown; people?: unknown } | undefined;
  const contactEmailFromContacts = Array.isArray(contacts?.emails)
    ? String(contacts.emails.find((email) => typeof email === 'string' && email.includes('@')) || '')
    : '';
  const contactEmail =
    (raw.contactEmail as string) || contactEmailFromContacts || extractContactEmail(description);
  const applicationUrl = (raw.applicationUrl || raw.applyUrl || raw.jobUrl || raw.detailUrl || raw.link || raw.url || raw.stellenUrl || raw.bewerbungsUrl || '') as string;
  const originalUrl = (raw.originalUrl || raw.jobUrl || raw.detailUrl || raw.link || raw.url || raw.stellenUrl || '') as string;

  return {
    source,
    sourceJobId: raw.id ? String(raw.id) : (raw.jobId ? String(raw.jobId) : undefined),
    title: title.trim(),
    company: company.trim(),
    companyWebsite: (raw.companyWebsite || raw.companyUrl) as string | undefined,
    companyLogo: (raw.companyLogo || raw.companyLogoUrl || raw.logo || raw.logoUrl) as string | undefined,
    location: location.trim(),
    remoteType,
    employmentType: (raw.employmentType || raw.jobType || 'full-time') as string,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    salaryCurrency: salary.salaryCurrency || 'USD',
    description,
    requirements,
    responsibilities,
    benefits,
    technologies: tech,
    seniority: (raw.seniority || raw.experienceLevel) as string | undefined,
    languageRequirements: Array.isArray(raw.languages) ? raw.languages.map(String) : [],
    contactName: (raw.contactName || raw.recruiterName) as string | undefined,
    contactEmail,
    applicationUrl: applicationUrl ? resolveSourceUrl(applicationUrl, source) : undefined,
    originalUrl: originalUrl ? resolveSourceUrl(originalUrl, source) : undefined,
    datePosted: raw.datePosted ? new Date(String(raw.datePosted)) : new Date(),
    rawData: raw,
  };
}
