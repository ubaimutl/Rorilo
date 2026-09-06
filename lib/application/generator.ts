import { z } from 'zod';
import { getAIProvider } from '../ai/openai-compatible';
import { Job, UserProfile, JobPreference, CV } from '@prisma/client';

export const GeneratedApplicationMaterialsSchema = z.object({
  coverLetter: z.string().describe('Natural, tailored cover letter text ready for export'),
  emailSubject: z.string().describe('Direct email subject line'),
  emailBody: z.string().describe('Direct, professional email draft body'),
  shortIntroduction: z.string().describe('2-3 sentence introductory message for LinkedIn or recruiters'),
  answersToCommonQuestions: z.array(
    z.preprocess((value) => {
      if (typeof value === 'string') {
        return {
          question: 'Application question',
          answer: value,
        };
      }
      return value;
    },
    z.object({
      question: z.string().default('Application question'),
      answer: z.string(),
    })
    )
  ).describe('Answers to common screening questions strictly grounded in user profile'),
  relevantSkillsSummary: z.array(z.string()).describe('Top matching skills relevant to this specific role'),
  missingOrGapsNoted: z.array(z.string()).describe('Honest acknowledgment of skills or requirements not in user background'),
});

export type GeneratedApplicationMaterials = z.infer<typeof GeneratedApplicationMaterialsSchema>;

function countSignals(text: string, signals: string[]) {
  const lower = text.toLowerCase();
  return signals.reduce((score, signal) => score + (lower.includes(signal) ? 1 : 0), 0);
}

function detectJobLanguage(job: Job): 'German' | 'English' | null {
  const text = `${job.title}\n${job.description}`;
  const germanScore = countSignals(text, [
    'bewerbung',
    'berufserfahrung',
    'kenntnisse',
    'tätigkeit',
    'aufgaben',
    'anforderungen',
    'kaufmännisch',
    'datenerfasser',
    'sachbearbeiter',
    'mitarbeiter',
    'deutsch',
    'm/w/d',
  ]) + (/[äöüß]/i.test(text) ? 2 : 0);
  const englishScore = countSignals(text, [
    'apply',
    'application',
    'experience',
    'responsibilities',
    'requirements',
    'qualifications',
    'skills',
    'team',
    'role',
    'position',
    'remote',
    'hybrid',
    'full-time',
    'part-time',
    'm/f/d',
  ]);

  if (englishScore >= 2 && englishScore > germanScore) return 'English';
  if (germanScore >= 2 && germanScore > englishScore) return 'German';
  return null;
}

function resolveDraftLanguage(requestedLanguage: string, job: Job): string {
  const normalized = requestedLanguage.trim();
  const jobLanguage = detectJobLanguage(job);
  if (jobLanguage) return jobLanguage;

  if (!normalized || normalized.toLowerCase() === 'auto') {
    return 'the primary language of the job posting';
  }
  return normalized;
}

function getLengthInstruction(length: string): string {
  if (length === 'short') {
    return 'Keep the cover letter to 3 compact paragraphs plus greeting and closing.';
  }
  if (length === 'detailed') {
    return 'Use 5 focused paragraphs only if the job description provides enough evidence.';
  }
  return 'Use 4 focused paragraphs plus greeting and closing.';
}

function isGermanTarget(language: string) {
  return language.toLowerCase().startsWith('german') || language.toLowerCase().startsWith('deutsch');
}

function isEnglishTarget(language: string) {
  return language.toLowerCase().startsWith('english') || language.toLowerCase().startsWith('englisch');
}

function normalizeLanguageMarkers(text: string, language: string) {
  if (isEnglishTarget(language)) {
    return text
      .replace(/^Sehr geehrte Damen und Herren,?/i, 'Dear Hiring Team,')
      .replace(/^Sehr geehrte(?:r)?\s+[^,\n]+,?/i, 'Dear Hiring Team,')
      .replace(/\bMit freundlichen Grüßen\b/gi, 'Sincerely,')
      .replace(/\bViele Grüße\b/gi, 'Best regards,')
      .replace(/\bBetreff:\s*/gi, 'Subject: ');
  }

  if (isGermanTarget(language)) {
    return text
      .replace(/^Dear Hiring Team,?/i, 'Sehr geehrte Damen und Herren,')
      .replace(/^Dear Hiring Manager,?/i, 'Sehr geehrte Damen und Herren,')
      .replace(/^Dear Sir or Madam,?/i, 'Sehr geehrte Damen und Herren,')
      .replace(/\bSincerely,?\b/gi, 'Mit freundlichen Grüßen')
      .replace(/\bBest regards,?\b/gi, 'Mit freundlichen Grüßen')
      .replace(/\bSubject:\s*/gi, 'Betreff: ');
  }

  return text;
}

function normalizeMaterialsLanguage(
  materials: GeneratedApplicationMaterials,
  language: string
): GeneratedApplicationMaterials {
  return {
    ...materials,
    coverLetter: normalizeLanguageMarkers(materials.coverLetter, language),
    emailSubject: normalizeLanguageMarkers(materials.emailSubject, language),
    emailBody: normalizeLanguageMarkers(materials.emailBody, language),
    shortIntroduction: normalizeLanguageMarkers(materials.shortIntroduction, language),
    answersToCommonQuestions: materials.answersToCommonQuestions.map((item) => ({
      question: normalizeLanguageMarkers(item.question, language),
      answer: normalizeLanguageMarkers(item.answer, language),
    })),
  };
}

export async function generateApplicationMaterials(
  job: Job,
  profile: UserProfile | null,
  preferences: JobPreference | null,
  cv: CV | null
): Promise<GeneratedApplicationMaterials> {
  const writingTone = preferences?.writingTone || 'professional';
  const coverLetterLength = preferences?.coverLetterLength || 'medium';
  const coverLetterLanguage = resolveDraftLanguage(preferences?.coverLetterLanguage || 'Auto', job);
  const emailLength = preferences?.emailLength || 'concise';
  const mentionSalary = preferences?.mentionSalary || false;
  const mentionAvailability = preferences?.mentionAvailability ?? true;
  const writingStyle = preferences?.writingStyle || '';
  const aiNotes = preferences?.aiNotes || '';
  const additionalInstructions = preferences?.additionalInstructions || '';
  const visaNotes = preferences?.visaNotes || '';
  const salaryExpectation = preferences?.preferredSalary
    ? `${preferences.preferredSalary} ${preferences.salaryCurrency || 'USD'}`
    : preferences?.minSalary
    ? `minimum ${preferences.minSalary} ${preferences.salaryCurrency || 'USD'}`
    : 'competitive market rate';

  let additionalUrlsList: string[] = [];
  try {
    if (profile?.additionalUrls) {
      const parsed = JSON.parse(profile.additionalUrls);
      if (Array.isArray(parsed)) additionalUrlsList = parsed;
    }
  } catch {}

  const profileLinks = [
    profile?.linkedIn ? `LinkedIn: ${profile.linkedIn}` : null,
    profile?.gitHub ? `GitHub: ${profile.gitHub}` : null,
    profile?.portfolio ? `Portfolio: ${profile.portfolio}` : null,
    ...additionalUrlsList,
  ].filter(Boolean).join('\n');

  const candidateLocation = [profile?.city, profile?.country].filter(Boolean).join(', ');

  const prompt = `You are an expert application writer. Generate tailored, honest application materials for a candidate applying to this position.

CRITICAL NON-FABRICATION RULE:
NEVER invent or fabricate qualifications, past employers, degrees, certifications, years of experience, or technical proficiencies that the candidate does not have.
If a required skill is missing from the candidate's profile, state it honestly or describe related foundational experience without lying.
Do not force a software-engineering angle into non-technical roles. If the role is administrative, data-entry, customer-support, operations, commercial, or assistant work, connect only relevant transferable experience such as accuracy, structured work, documentation, communication, tools, reliability, and organization.
Avoid generic AI cliches such as:
- "I am thrilled to apply..."
- "I am writing to express my enthusiasm..."
- "I am confident that my skills..."
- "In today's fast-paced world..."
- "Your innovative company..."
Write like a real applicant: specific, calm, grounded, and easy to read.

JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location || 'Not specified'} (${job.remoteType})
- Recruiter / Hiring Contact: ${job.contactName || 'Hiring Manager / Team'}
- Contact Email: ${job.contactEmail || 'Not specified'}
- Description:
${job.description.slice(0, 3000)}

CANDIDATE PROFILE:
- Name: ${profile?.firstName || 'Candidate'} ${profile?.lastName || ''}
- Email: ${profile?.email || 'Not specified'}
- Phone: ${profile?.phone || 'Not specified'}
- Location: ${candidateLocation || 'Not specified'}
- Current Title: ${profile?.currentTitle || 'Software Engineer'}
- Years Experience: ${profile?.yearsExperience || 3}
- Verified Skills: ${profile?.skills || '[]'}
- Verified Technologies: ${profile?.technologies || '[]'}
- Candidate Languages: ${profile?.languages || '[]'}
- Candidate Links:
${profileLinks || 'None provided'}
- Work Experience Summary: ${profile?.workExperience || '[]'}
- Education: ${profile?.education || '[]'}
- CV Raw Snippet: ${cv?.extractedText ? cv.extractedText.slice(0, 2000) : 'None'}

USER APPLICATION PREFERENCES & INSTRUCTIONS:
- Draft Language: ${coverLetterLanguage}
- Desired Tone: ${writingTone}
- Preferred Cover Letter Length: ${coverLetterLength}
- Length Rule: ${getLengthInstruction(coverLetterLength)}
- Preferred Email Length: ${emailLength}
- Target Salary Expectation: ${salaryExpectation}
- Mention Salary Instruction: ${mentionSalary ? `Yes (state candidate target salary is ${salaryExpectation})` : 'No (do not mention salary)'}
- Mention Start Date/Availability: ${mentionAvailability ? 'Yes (mention ready to start with standard notice)' : 'No'}
- Visa & Work Authorization: ${visaNotes || 'None specified'}
- User Writing Style Sample/Guide: ${writingStyle || 'No specific style sample provided'}
- Private Candidate Notes: ${aiNotes || 'None'}
- Reusable Instructions: ${additionalInstructions || 'None'}

LANGUAGE AND STYLE RULES:
- Write all generated application-facing material in ${coverLetterLanguage}.
- Do not mix languages. The cover letter greeting, body, closing, email, subject, introduction, and answers must all be in ${coverLetterLanguage}.
- The detected job posting language is more important than the CV language. If the job posting is English, write fully in English even when the CV is German. If the job posting is German, write fully in German.
- For English cover letters, use "Dear Hiring Team," and "Sincerely,".
- For German cover letters, use "Sehr geehrte Damen und Herren," unless a real contact person is provided. Use "Mit freundlichen Grüßen" as the closing.
- Preserve the candidate's writing style where provided, but do not mention that a style sample was used.
- Treat private notes and reusable instructions as direction for emphasis and constraints; only include them when appropriate for an employer to read.

COVER LETTER QUALITY RULES:
- Make the first paragraph direct: role, company, and why this application makes sense.
- Pick 2-3 job requirements and match them to evidence from the CV/profile.
- Use concrete evidence from the CV before using general claims.
- If the profile has mixed experience, explain the fit naturally instead of pretending every past role is identical to the job.
- Avoid repeating the same sentence pattern across paragraphs.
- Do not output markdown bullets in the cover letter.
- Do not include placeholders, square brackets, empty emphasis phrases, or sentences that end after "emphasis on".
- Do not mention salary unless the salary instruction says yes.
- Do not mention availability unless the availability instruction says yes.
- Keep the letter human and concise; no inflated adjectives, no corporate filler.

Generate:
1. "coverLetter": A polished, employer-ready cover letter matching the language and role type.
2. "emailSubject": A clear subject in the same language as the draft.
3. "emailBody": A concise email draft ready for recruiter inbox, in the same language as the draft.
4. "shortIntroduction": A 2-3 sentence introductory message in the same language as the draft.
5. "answersToCommonQuestions": exactly 3 objects in this shape: [{"question":"...","answer":"..."}]. Do not return plain strings.
6. "relevantSkillsSummary": 3-6 exact matching strengths grounded in the profile/CV.
7. "missingOrGapsNoted": Honest gaps between the posting and candidate background.`;

  try {
    const ai = await getAIProvider();
    const materials = await ai.generateStructured(prompt, GeneratedApplicationMaterialsSchema, {
      temperature: 0.45,
      maxTokens: 3000,
      systemPrompt:
        'You write precise, natural job application materials. Return ONLY valid JSON matching the schema. Do not wrap the JSON in markdown fences.',
    });
    return normalizeMaterialsLanguage(materials, coverLetterLanguage);
  } catch (err) {
    console.error('AI application generation failed:', err);
    throw new Error(
      `Could not generate application materials. Check your AI provider settings and try again. ${(err as Error).message || ''}`.trim()
    );
  }
}
