import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/openai-compatible';

const TRIAGE_STATUSES = ['WORTH_APPLYING', 'MAYBE', 'SKIP'] as const;

export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

/**
 * Maps free-form model output ("worth applying", "SKIP ", "maybe.") to the
 * strict triage enum. Unknown values fall back to MAYBE so the listing gets
 * manual review instead of failing the whole batch.
 */
export function normalizeTriageStatus(raw: unknown): TriageStatus {
  const normalized = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (
    ['WORTH_APPLYING', 'WORTHAPPLYING', 'WORTH_IT', 'APPLY', 'APPLY_NOW', 'YES', 'GOOD', 'GOOD_FIT', 'STRONG_YES'].includes(
      normalized
    )
  ) {
    return 'WORTH_APPLYING';
  }
  if (
    ['SKIP', 'SKIPPED', 'SKIP_IT', 'NO', 'REJECT', 'REJECTED', 'BAD', 'BAD_FIT', 'POOR', 'POOR_FIT', 'AVOID', 'NOT_RECOMMENDED'].includes(
      normalized
    )
  ) {
    return 'SKIP';
  }
  return 'MAYBE';
}

const TriageItemSchema = z.object({
  jobId: z.preprocess((value) => String(value ?? '').trim(), z.string()),
  status: z.preprocess(normalizeTriageStatus, z.enum(TRIAGE_STATUSES)),
  reason: z.preprocess(
    (value) => String(value ?? '').trim().slice(0, 180),
    z.string()
  ),
  score: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim());
      if (!Number.isFinite(num)) return null;
      return Math.max(0, Math.min(100, Math.round(num)));
    },
    z.number().min(0).max(100).nullable()
  ),
});

export const JobTriageResponseSchema = z.object({
  results: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(TriageItemSchema)
  ),
});

export type JobTriageResult = z.infer<typeof TriageItemSchema>;

type TriageProfile = {
  firstName?: string;
  lastName?: string;
  currentTitle?: string;
  city?: string;
  country?: string;
  skills?: string;
  technologies?: string;
  languages?: string;
  workExperience?: string;
};

type TriagePreferences = {
  desiredTitles?: string;
  keywords?: string;
  excludedKeywords?: string;
  locations?: string;
  remotePreference?: string;
  employmentTypes?: string;
  preferredTechnologies?: string;
  technologiesToAvoid?: string;
  industries?: string;
  maxCommute?: string;
  aiNotes?: string;
};

type TriageJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  employmentType: string | null;
  description: string;
  technologies: string;
  requirements: string;
  languageRequirements: string;
  match?: {
    matchScore: number;
    strongMatches: string;
    possibleIssues: string;
    missingSkills: string;
  } | null;
};

function compactJson(value: unknown) {
  if (!value) return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return value;
  }
}

function trimText(text: string, max = 900) {
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

export function fallbackTriageJobs(jobs: TriageJob[]): JobTriageResult[] {
  return jobs.map((job) => {
    const score = job.match?.matchScore ?? null;
    const status: TriageStatus =
      score === null ? 'MAYBE' : score >= 75 ? 'WORTH_APPLYING' : score < 45 ? 'SKIP' : 'MAYBE';
    const reason =
      score === null
        ? 'Needs manual review because no model triage was available.'
        : `Model triage was unavailable; using deterministic match score ${score}.`;
    return {
      jobId: job.id,
      status,
      reason,
      score,
    };
  });
}

export async function triageJobsWithAI(
  jobs: TriageJob[],
  profile: TriageProfile | null,
  preferences: TriagePreferences | null,
  cvText: string
): Promise<JobTriageResult[]> {
  if (jobs.length === 0) return [];

  const prompt = `
Classify each job into exactly one bucket for this candidate:
- WORTH_APPLYING: clearly worth attention now.
- MAYBE: unclear fit or needs manual review.
- SKIP: weak fit, unwanted direction, obvious mismatch, or excluded by preferences.

Rules:
- Return one result for every jobId.
- Use the status value EXACTLY as written here: "WORTH_APPLYING", "MAYBE", or "SKIP" (uppercase, underscores, no variations).
- Set "score" to your own 0-100 fit assessment for the candidate. It must agree with your bucket: WORTH_APPLYING is a strong fit, MAYBE is middling, SKIP is weak. Use the provided matchScore only as a starting point and adjust it to match your verdict.
- Use only evidence from the job, CV/profile, match notes, and preferences.
- Do not invent qualifications or company details.
- Keep each reason short and practical, max one sentence.
- If a job is in German or asks for German and the candidate has German context, do not penalize it for not being English.
- Treat excluded keywords, unwanted technologies, wrong location, and poor role fit as strong skip signals.

Candidate profile:
${JSON.stringify({
  name: [profile?.firstName, profile?.lastName].filter(Boolean).join(' '),
  currentTitle: profile?.currentTitle,
  city: profile?.city,
  country: profile?.country,
  skills: compactJson(profile?.skills),
  technologies: compactJson(profile?.technologies),
  languages: compactJson(profile?.languages),
  workExperience: compactJson(profile?.workExperience),
}, null, 2)}

Preferences and notes:
${JSON.stringify({
  desiredTitles: compactJson(preferences?.desiredTitles),
  keywords: compactJson(preferences?.keywords),
  excludedKeywords: compactJson(preferences?.excludedKeywords),
  locations: compactJson(preferences?.locations),
  remotePreference: preferences?.remotePreference,
  employmentTypes: compactJson(preferences?.employmentTypes),
  preferredTechnologies: compactJson(preferences?.preferredTechnologies),
  technologiesToAvoid: compactJson(preferences?.technologiesToAvoid),
  industries: compactJson(preferences?.industries),
  maxCommute: preferences?.maxCommute,
  notes: preferences?.aiNotes,
}, null, 2)}

CV excerpt:
${trimText(cvText || '', 1800)}

Jobs:
${JSON.stringify(jobs.map((job) => ({
  jobId: job.id,
  title: job.title,
  company: job.company,
  location: job.location,
  remoteType: job.remoteType,
  employmentType: job.employmentType,
  technologies: compactJson(job.technologies),
  requirements: compactJson(job.requirements),
  languageRequirements: compactJson(job.languageRequirements),
  matchScore: job.match?.matchScore,
  strongMatches: compactJson(job.match?.strongMatches),
  possibleIssues: compactJson(job.match?.possibleIssues),
  missingSkills: compactJson(job.match?.missingSkills),
  description: trimText(job.description),
})), null, 2)}

Return exactly this shape:
{"results":[{"jobId":"...","status":"WORTH_APPLYING|MAYBE|SKIP","reason":"short sentence","score":0}]}
`;

  const ai = await getAIProvider();
  const result = await ai.generateStructured(prompt, JobTriageResponseSchema, {
    temperature: 0.1,
    maxTokens: Math.min(4000, 800 + jobs.length * 180),
    systemPrompt:
      'You classify job opportunities for a candidate. Output only a complete valid JSON object matching the schema. No markdown, no prose before or after JSON. Be conservative, evidence-grounded, and concise.',
  });

  const requestedIds = new Set(jobs.map((job) => job.id));
  return result.results.filter((item) => requestedIds.has(item.jobId));
}
