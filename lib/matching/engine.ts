import { Job, UserProfile, JobPreference, JobAnalysis } from '@prisma/client';
import { cleanText } from '../jobs/deduplicate';

export interface ScoreBreakdown {
  skillsScore: number;
  roleScore: number;
  experienceScore: number;
  locationScore: number;
  languageScore: number;
  salaryScore: number;
  preferencesScore: number;
  totalScore: number;
}

export interface MatchResult {
  matchScore: number;
  breakdown: ScoreBreakdown;
  strongMatches: string[];
  possibleIssues: string[];
  missingSkills: string[];
  aiInterpretation?: string;
}

function parseJsonArray(jsonStr: string | null | undefined): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function calculateDeterministicMatch(
  job: Partial<Job> & { analysis?: Partial<JobAnalysis> | null },
  profile: Partial<UserProfile> | null,
  preferences: Partial<JobPreference> | null
): MatchResult {
  const strongMatches: string[] = [];
  const possibleIssues: string[] = [];
  const missingSkills: string[] = [];

  const userSkills = new Set<string>([
    ...parseJsonArray(profile?.skills).map((s) => s.toLowerCase()),
    ...parseJsonArray(profile?.technologies).map((s) => s.toLowerCase()),
  ]);

  const userDesiredTitles = parseJsonArray(preferences?.desiredTitles).map((t) => t.toLowerCase());
  const userCurrentTitle = (profile?.currentTitle || '').toLowerCase();
  const userLanguages = parseJsonArray(profile?.languages).map((l) => l.toLowerCase());
  const userYearsExp = profile?.yearsExperience ?? 3;

  const userPrefTech = parseJsonArray(preferences?.preferredTechnologies).map((t) => t.toLowerCase());
  const userAvoidTech = parseJsonArray(preferences?.technologiesToAvoid).map((t) => t.toLowerCase());
  const userExcludedKeywords = parseJsonArray(preferences?.excludedKeywords).map((k) => k.toLowerCase());

  // 1. SKILLS MATCH (Max 30 pts)
  let skillsScore = 0;
  const jobTechs = parseJsonArray(job.technologies);
  const jobReqSkills = parseJsonArray(job.analysis?.requiredSkills);
  const allJobSkills = Array.from(new Set([...jobTechs, ...jobReqSkills]));

  /**
   * Checks whether a skill token appears as a whole word in a candidate string.
   * This prevents HTML/URL artifacts (e.g. "javascript:void(0)") from matching
   * a clean skill like "javascript" via simple substring containment.
   */
  function skillTokenMatch(haystack: string, needle: string): boolean {
    if (needle.length < 3) return false; // ignore trivially short tokens
    // Exact containment — only allowed when both sides are clean identifiers
    // (no special URL/HTML characters in needle or surrounding context)
    const hasSpecialChars = /[:/\\.<>(){}[\]@#&?=%]/.test(needle);
    if (hasSpecialChars) return false;
    // Use word-boundary regex to avoid matching inside URLs or HTML tokens
    try {
      const pattern = new RegExp(`(?<![\\w.:/])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.:/])`, 'i');
      return pattern.test(haystack);
    } catch {
      return haystack.includes(needle);
    }
  }

  if (allJobSkills.length === 0) {
    skillsScore = 22; // Neutral average if listing doesn't specify technologies
  } else {
    let matchedCount = 0;
    for (const skill of allJobSkills) {
      const lowerSkill = skill.toLowerCase().trim();
      // Skip garbage tokens: skills that look like URLs, HTML tags, or are too long
      if (lowerSkill.length > 60 || /[:/\\<>]/.test(lowerSkill)) {
        continue;
      }
      const matched =
        userSkills.has(lowerSkill) ||
        Array.from(userSkills).some(
          (us) =>
            // user skill contains job skill as a whole word (e.g. "node.js" ⊇ "node")
            (us.length >= 3 && skillTokenMatch(us, lowerSkill)) ||
            // job skill contains user skill as a whole word (e.g. "typescript" ⊇ "ts" — blocked by min length)
            (lowerSkill.length >= 3 && us.length >= 3 && skillTokenMatch(lowerSkill, us))
        );
      if (matched) {
        matchedCount++;
        strongMatches.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }
    const ratio = allJobSkills.length > 0 ? matchedCount / allJobSkills.length : 0;
    skillsScore = Math.round(ratio * 30);
  }

  // 2. ROLE / TITLE MATCH (Max 20 pts)
  let roleScore = 0;
  const jobTitleLower = (job.title || '').toLowerCase();
  const titlesToTest = [...userDesiredTitles, userCurrentTitle].filter(Boolean);

  if (titlesToTest.length === 0) {
    roleScore = 14;
  } else {
    let bestMatch = 0;
    for (const title of titlesToTest) {
      if (jobTitleLower === title) {
        bestMatch = 20;
        break;
      }
      const titleTokens = title.split(/\s+/);
      const matchedTokens = titleTokens.filter((token) => token.length > 2 && jobTitleLower.includes(token));
      const score = Math.round((matchedTokens.length / titleTokens.length) * 18);
      if (score > bestMatch) bestMatch = score;
    }
    roleScore = bestMatch;
    if (roleScore >= 15) {
      strongMatches.push(`Title matches "${job.title}"`);
    }
  }

  // 3. EXPERIENCE MATCH (Max 15 pts)
  let experienceScore = 15;
  const seniority = (job.seniority || '').toLowerCase();
  let requiredYears = job.analysis?.yearsExperienceMin;

  if (requiredYears == null) {
    if (seniority.includes('senior') || seniority.includes('lead')) requiredYears = 5;
    else if (seniority.includes('staff') || seniority.includes('principal')) requiredYears = 7;
    else if (seniority.includes('mid')) requiredYears = 3;
    else if (seniority.includes('junior')) requiredYears = 1;
  }

  if (requiredYears != null && requiredYears > 0) {
    if (userYearsExp >= requiredYears) {
      experienceScore = 15;
      strongMatches.push(`${userYearsExp}y experience meets ${requiredYears}y requirement`);
    } else {
      const diff = requiredYears - userYearsExp;
      experienceScore = Math.max(4, Math.round(15 - diff * 3));
      possibleIssues.push(`Requires ${requiredYears} years experience (profile lists ${userYearsExp})`);
    }
  }

  // 4. LOCATION / REMOTE MATCH (Max 15 pts)
  let locationScore = 12;
  const prefRemote = preferences?.remotePreference || 'any';
  const jobRemote = job.remoteType || 'unknown';

  if (prefRemote === 'any') {
    locationScore = 15;
  } else if (prefRemote === 'remote') {
    if (jobRemote === 'remote') {
      locationScore = 15;
      strongMatches.push('Remote allowed');
    } else if (jobRemote === 'hybrid') {
      locationScore = 7;
      possibleIssues.push('Job is hybrid, but your preference is fully remote');
    } else if (jobRemote === 'onsite') {
      locationScore = 2;
      possibleIssues.push('Job is onsite, but your preference is fully remote');
    }
  } else if (prefRemote === 'hybrid') {
    if (jobRemote === 'hybrid' || jobRemote === 'remote') {
      locationScore = 15;
      strongMatches.push('Hybrid or remote flexibility matches');
    } else {
      locationScore = 6;
      possibleIssues.push('Job is onsite, preference is hybrid');
    }
  } else if (prefRemote === 'onsite') {
    if (jobRemote === 'onsite' || jobRemote === 'hybrid') {
      locationScore = 15;
    } else {
      locationScore = 10;
    }
  }

  // 5. LANGUAGE MATCH (Max 5 pts)
  let languageScore = 5;
  const jobLangs = parseJsonArray(job.languageRequirements);
  if (jobLangs.length > 0) {
    const missingLangs = jobLangs.filter(
      (lang) => !userLanguages.some((ul) => ul.includes(lang.toLowerCase()) || lang.toLowerCase().includes(ul))
    );
    if (missingLangs.length > 0) {
      languageScore = Math.max(0, 5 - missingLangs.length * 2.5);
      possibleIssues.push(`Requires language proficiency in: ${missingLangs.join(', ')}`);
    } else {
      strongMatches.push(`Language requirements met (${jobLangs.join(', ')})`);
    }
  }

  // 6. SALARY MATCH (Max 5 pts)
  let salaryScore = 3;
  if (job.salaryMax || job.salaryMin) {
    const userPreferred = preferences?.preferredSalary;
    const userMin = preferences?.minSalary;
    const jobTop = job.salaryMax || job.salaryMin || 0;

    if (userPreferred && jobTop >= userPreferred) {
      salaryScore = 5;
      strongMatches.push('Salary meets preferred target');
    } else if (userMin && jobTop >= userMin) {
      salaryScore = 4;
      strongMatches.push('Salary meets minimum threshold');
    } else if (userMin && jobTop < userMin) {
      salaryScore = 1;
      possibleIssues.push(`Salary (${jobTop}) is below your minimum (${userMin})`);
    } else {
      salaryScore = 4;
    }
  }

  // 7. USER PREFERENCES & EXCLUSIONS (Max 10 pts)
  let preferencesScore = 10;
  const jobTextCombined = `${job.title} ${job.description}`.toLowerCase();

  // Excluded keywords penalty
  for (const excluded of userExcludedKeywords) {
    if (jobTextCombined.includes(excluded)) {
      preferencesScore = Math.max(0, preferencesScore - 5);
      possibleIssues.push(`Mentions excluded keyword "${excluded}"`);
    }
  }

  // Technologies to avoid penalty
  for (const avoid of userAvoidTech) {
    if (jobTextCombined.includes(avoid)) {
      preferencesScore = Math.max(0, preferencesScore - 6);
      possibleIssues.push(`Contains avoided technology "${avoid}"`);
    }
  }

  // Preferred tech bonus
  for (const pref of userPrefTech) {
    if (jobTextCombined.includes(pref)) {
      strongMatches.push(`Uses preferred technology "${pref}"`);
    }
  }

  // Check free-form instruction heuristics (e.g. "avoid WordPress")
  const freeform = (preferences?.additionalInstructions || '').toLowerCase();
  if (freeform.includes('avoid wordpress') && jobTextCombined.includes('wordpress')) {
    preferencesScore = Math.max(0, preferencesScore - 8);
    possibleIssues.push('Mentions WordPress which you asked to avoid in custom instructions');
  }

  const totalScore = Math.min(
    100,
    Math.max(
      0,
      skillsScore +
        roleScore +
        experienceScore +
        locationScore +
        languageScore +
        salaryScore +
        preferencesScore
    )
  );

  const breakdown: ScoreBreakdown = {
    skillsScore,
    roleScore,
    experienceScore,
    locationScore,
    languageScore,
    salaryScore,
    preferencesScore,
    totalScore,
  };

  return {
    matchScore: totalScore,
    breakdown,
    strongMatches: Array.from(new Set(strongMatches)).slice(0, 12),
    possibleIssues: Array.from(new Set(possibleIssues)).slice(0, 12),
    missingSkills: Array.from(new Set(missingSkills)).slice(0, 12),
  };
}

/**
 * AI-assisted matching synthesis. Summarizes why this job matches or doesn't match.
 */
export async function synthesizeMatchWithAI(
  job: Partial<Job>,
  matchResult: MatchResult,
  profile: Partial<UserProfile> | null
): Promise<string> {
  const { getAIProvider } = await import('../ai/openai-compatible');
  try {
    const ai = await getAIProvider();
    const prompt = `You are an executive career advisor. In 2 concise sentences, explain why this job has a ${matchResult.matchScore}% match for this candidate.

Job Title: ${job.title} at ${job.company}
Strong matches: ${matchResult.strongMatches.join(', ') || 'None noted'}
Possible issues: ${matchResult.possibleIssues.join(', ') || 'None noted'}
Missing skills: ${matchResult.missingSkills.join(', ') || 'None noted'}
Candidate Current Title: ${profile?.currentTitle || 'Engineer'}
Candidate Experience: ${profile?.yearsExperience || 3} years

Return ONLY the 2 sentences. Be objective and direct.`;

    const summary = await ai.chat([
      { role: 'system', content: 'You are a concise, objective career matching analyst.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 120, temperature: 0.2 });

    return summary.trim();
  } catch {
    // Fallback deterministic interpretation
    return `Calculated ${matchResult.matchScore}% match based on key technologies (${matchResult.strongMatches.slice(0, 3).join(', ') || 'alignment'}) and role criteria.${
      matchResult.possibleIssues.length > 0 ? ` Points of note: ${matchResult.possibleIssues[0]}.` : ''
    }`;
  }
}
