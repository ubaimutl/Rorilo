import { z } from 'zod';
import { getAIProvider } from '../ai/openai-compatible';
import { Job, JobAnalysis } from '@prisma/client';
import { prisma } from '../prisma';

export const JobAnalysisSchema = z.object({
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  yearsExperienceMin: z.number().nullable().optional(),
  technologies: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  education: z.string().nullable().optional(),
  languageRequirements: z.array(z.string()).default([]),
  remoteStatus: z.string().nullable().optional(),
  locationRestrictions: z.string().nullable().optional(),
  salaryExtracted: z.string().nullable().optional(),
  responsibilities: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  contactEmail: z.string().nullable().optional(),
  applicationMethod: z.enum(['EMAIL', 'EXTERNAL_URL', 'UNKNOWN']).default('UNKNOWN'),
  warnings: z.array(z.string()).default([]),
});

export type ExtractedJobAnalysis = z.infer<typeof JobAnalysisSchema>;

/**
 * Runs AI structured extraction on a job listing and persists the JobAnalysis record.
 */
export async function extractJobAnalysisWithAI(job: Job): Promise<JobAnalysis> {
  // Check if analysis already exists in DB
  const existing = await prisma.jobAnalysis.findUnique({
    where: { jobId: job.id },
  });
  if (existing) return existing;

  const prompt = `Analyze this job posting and extract structured attributes strictly according to the schema.

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Job Description:
${job.description.slice(0, 4000)}

Extract:
- requiredSkills (must-have technical and non-technical skills)
- preferredSkills (nice-to-have skills)
- yearsExperienceMin (integer or null)
- technologies (specific frameworks, languages, tools mentioned)
- seniority (e.g. Junior, Mid, Senior, Lead, Principal, Staff, or null)
- education (e.g. "Bachelor's in Computer Science or equivalent", or null)
- languageRequirements (e.g. ["English", "German"])
- remoteStatus (e.g. "Remote", "Hybrid", "Onsite")
- locationRestrictions (e.g. "EU only", "US East timezone", or null)
- salaryExtracted (e.g. "$120,000 - $150,000", or null)
- responsibilities (list of key duties)
- benefits (health, equity, PTO, stipend, etc.)
- contactEmail (email address for inquiries or application, or null)
- applicationMethod (EMAIL if an explicit application email is stated, EXTERNAL_URL if an external website form is used, or UNKNOWN)
- warnings (unusual requirements like "requires 24/7 on-call", "unpaid test project", "travel >50%")`;

  let extractedData: ExtractedJobAnalysis;

  try {
    const ai = await getAIProvider();
    extractedData = await ai.generateStructured(prompt, JobAnalysisSchema, {
      temperature: 0.1,
      maxTokens: 1500,
    });
  } catch (err) {
    console.warn('AI structured extraction failed, falling back to heuristics:', err);
    // Fallback heuristic extraction
    extractedData = {
      requiredSkills: JSON.parse(job.requirements || '[]'),
      preferredSkills: [],
      yearsExperienceMin: null,
      technologies: JSON.parse(job.technologies || '[]'),
      seniority: job.seniority || null,
      education: null,
      languageRequirements: JSON.parse(job.languageRequirements || '[]'),
      remoteStatus: job.remoteType,
      locationRestrictions: null,
      salaryExtracted: job.salaryMin ? `${job.salaryMin} - ${job.salaryMax || ''}` : null,
      responsibilities: JSON.parse(job.responsibilities || '[]'),
      benefits: JSON.parse(job.benefits || '[]'),
      contactEmail: job.contactEmail || null,
      applicationMethod: job.contactEmail ? 'EMAIL' : (job.applicationUrl ? 'EXTERNAL_URL' : 'UNKNOWN'),
      warnings: [],
    };
  }

  const analysis = await prisma.jobAnalysis.create({
    data: {
      jobId: job.id,
      requiredSkills: JSON.stringify(extractedData.requiredSkills),
      preferredSkills: JSON.stringify(extractedData.preferredSkills),
      yearsExperienceMin: extractedData.yearsExperienceMin,
      technologies: JSON.stringify(extractedData.technologies),
      seniority: extractedData.seniority,
      education: extractedData.education,
      languageRequirements: JSON.stringify(extractedData.languageRequirements),
      remoteStatus: extractedData.remoteStatus,
      locationRestrictions: extractedData.locationRestrictions,
      salaryExtracted: extractedData.salaryExtracted,
      responsibilities: JSON.stringify(extractedData.responsibilities),
      benefits: JSON.stringify(extractedData.benefits),
      contactEmail: extractedData.contactEmail,
      applicationMethod: extractedData.applicationMethod,
      warnings: JSON.stringify(extractedData.warnings),
      modelUsed: 'ai-or-fallback',
    },
  });

  return analysis;
}
