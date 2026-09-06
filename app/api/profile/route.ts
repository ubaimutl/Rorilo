import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { extractCvLocally, mergeStructuredCv, parseStoredStructuredCv, type StructuredCV } from '@/lib/cv/parser';

function arrayLength(value?: string | null): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function parseJsonList(value?: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function richerArray(current: string | undefined | null, next: unknown[], replaceWhenCleaner = false) {
  const currentList = parseJsonList(current);
  if (next.length > currentList.length) return JSON.stringify(next);
  if (replaceWhenCleaner && next.length > 0 && JSON.stringify(currentList) !== JSON.stringify(next)) {
    return JSON.stringify(next);
  }
  return current || JSON.stringify([]);
}

async function enrichStaleProfileFromCv(
  profile: Awaited<ReturnType<typeof prisma.userProfile.findFirst>>,
  activeCv: Awaited<ReturnType<typeof prisma.cV.findFirst>>
) {
  if (!activeCv?.extractedText) return { profile, activeCv };

  const stored = parseStoredStructuredCv(activeCv.structuredData);
  const enhanced = mergeStructuredCv(stored, extractCvLocally(activeCv.extractedText));
  const storedRichness =
    stored.skills.length +
    stored.technologies.length +
    stored.languages.length +
    stored.workExperience.length * 3 +
    stored.projects.length * 2 +
    stored.education.length;
  const enhancedRichness =
    enhanced.skills.length +
    enhanced.technologies.length +
    enhanced.languages.length +
    enhanced.workExperience.length * 3 +
    enhanced.projects.length * 2 +
    enhanced.education.length;

  let nextCv = activeCv;
  if (enhancedRichness > storedRichness || JSON.stringify(enhanced) !== JSON.stringify(stored)) {
    nextCv = await prisma.cV.update({
      where: { id: activeCv.id },
      data: { structuredData: JSON.stringify(enhanced) },
    });
  }

  const profileUpdate: Record<string, unknown> = {};
  const fillString = (key: keyof StructuredCV & string) => {
    const current = profile?.[key as keyof typeof profile];
    const next = enhanced[key];
    if (typeof current === 'string' && current.trim() !== current) {
      profileUpdate[key] = current.trim();
      return;
    }
    if ((!current || String(current).trim() === '') && typeof next === 'string' && next.trim()) {
      profileUpdate[key] = next;
    }
  };

  for (const key of ['firstName', 'lastName', 'email', 'phone', 'city', 'country', 'linkedIn', 'gitHub', 'portfolio', 'currentTitle'] as const) {
    fillString(key);
  }
  if ((profile?.yearsExperience || 0) < enhanced.yearsExperience) {
    profileUpdate.yearsExperience = enhanced.yearsExperience;
  }
  profileUpdate.additionalUrls = richerArray(profile?.additionalUrls, enhanced.additionalUrls);
  profileUpdate.skills = richerArray(profile?.skills, enhanced.skills);
  profileUpdate.technologies = richerArray(profile?.technologies, enhanced.technologies);
  profileUpdate.languages = richerArray(profile?.languages, enhanced.languages, true);
  profileUpdate.education = richerArray(profile?.education, enhanced.education);
  profileUpdate.workExperience = richerArray(profile?.workExperience, enhanced.workExperience);
  profileUpdate.projects = richerArray(profile?.projects, enhanced.projects);

  const hasUsefulProfileUpdate = Object.entries(profileUpdate).some(([key, value]) => {
    const current = profile?.[key as keyof typeof profile];
    return value !== current;
  });

  if (!hasUsefulProfileUpdate) return { profile, activeCv: nextCv };

  const nextProfile = await prisma.userProfile.upsert({
    where: { id: 'default' },
    update: profileUpdate,
    create: {
      id: 'default',
      firstName: enhanced.firstName,
      lastName: enhanced.lastName,
      email: enhanced.email,
      phone: enhanced.phone,
      city: enhanced.city,
      country: enhanced.country,
      linkedIn: enhanced.linkedIn,
      gitHub: enhanced.gitHub,
      portfolio: enhanced.portfolio,
      additionalUrls: JSON.stringify(enhanced.additionalUrls),
      currentTitle: enhanced.currentTitle,
      yearsExperience: enhanced.yearsExperience,
      skills: JSON.stringify(enhanced.skills),
      technologies: JSON.stringify(enhanced.technologies),
      languages: JSON.stringify(enhanced.languages),
      education: JSON.stringify(enhanced.education),
      workExperience: JSON.stringify(enhanced.workExperience),
      projects: JSON.stringify(enhanced.projects),
    },
  });

  return { profile: nextProfile, activeCv: nextCv };
}

export async function GET() {
  try {
    const [profile, preferences, activeCvRaw, cvList] = await Promise.all([
      prisma.userProfile.findFirst({ where: { id: 'default' } }),
      prisma.jobPreference.findFirst({ where: { id: 'default' } }),
      prisma.cV.findFirst({ where: { isActive: true }, orderBy: { uploadDate: 'desc' } }),
      prisma.cV.findMany({ orderBy: { uploadDate: 'desc' } }),
    ]);
    const { profile: enrichedProfile, activeCv } = await enrichStaleProfileFromCv(profile, activeCvRaw);

    return NextResponse.json({
      profile: enrichedProfile || null,
      preferences: preferences || null,
      activeCv: activeCv || null,
      cvList: cvList || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to load profile data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { profileData, preferencesData } = body;

    let updatedProfile;
    if (profileData) {
      // Only touch provided keys so partial updates never wipe other fields.
      const profileUpdate: Record<string, unknown> = {};
      const setString = (key: string, value: unknown, fallback = '') => {
        if (value !== undefined) profileUpdate[key] = (value as string | null) ?? fallback;
      };
      setString('firstName', profileData.firstName);
      setString('lastName', profileData.lastName);
      setString('email', profileData.email);
      setString('phone', profileData.phone);
      setString('city', profileData.city);
      setString('country', profileData.country);
      setString('linkedIn', profileData.linkedIn);
      setString('gitHub', profileData.gitHub);
      setString('portfolio', profileData.portfolio);
      setString('currentTitle', profileData.currentTitle);
      if (profileData.yearsExperience !== undefined) {
        profileUpdate.yearsExperience = Number(profileData.yearsExperience ?? 0);
      }
      const setJson = (key: string, value: unknown) => {
        if (value !== undefined) profileUpdate[key] = JSON.stringify(value || []);
      };
      setJson('additionalUrls', profileData.additionalUrls);
      setJson('skills', profileData.skills);
      setJson('technologies', profileData.technologies);
      setJson('languages', profileData.languages);
      setJson('education', profileData.education);
      setJson('workExperience', profileData.workExperience);
      setJson('projects', profileData.projects);
      updatedProfile = await prisma.userProfile.upsert({
        where: { id: 'default' },
        update: profileUpdate,
        create: {
          id: 'default',
          firstName: profileData.firstName ?? '',
          lastName: profileData.lastName ?? '',
          email: profileData.email ?? '',
          phone: profileData.phone ?? '',
          city: profileData.city ?? '',
          country: profileData.country ?? '',
          linkedIn: profileData.linkedIn ?? '',
          gitHub: profileData.gitHub ?? '',
          portfolio: profileData.portfolio ?? '',
          additionalUrls: JSON.stringify(profileData.additionalUrls || []),
          currentTitle: profileData.currentTitle ?? '',
          yearsExperience: Number(profileData.yearsExperience ?? 0),
          skills: JSON.stringify(profileData.skills || []),
          technologies: JSON.stringify(profileData.technologies || []),
          languages: JSON.stringify(profileData.languages || []),
          education: JSON.stringify(profileData.education || []),
          workExperience: JSON.stringify(profileData.workExperience || []),
          projects: JSON.stringify(profileData.projects || []),
        },
      });
    }

    let updatedPreferences;
    if (preferencesData) {
      // Only touch provided keys so partial updates never wipe other fields.
      const preferencesUpdate: Record<string, unknown> = {};
      const setJsonPref = (key: string, value: unknown) => {
        if (value !== undefined) preferencesUpdate[key] = JSON.stringify(value || []);
      };
      setJsonPref('desiredTitles', preferencesData.desiredTitles);
      setJsonPref('keywords', preferencesData.keywords);
      setJsonPref('excludedKeywords', preferencesData.excludedKeywords);
      setJsonPref('excludedCompanies', preferencesData.excludedCompanies);
      setJsonPref('locations', preferencesData.locations);
      setJsonPref('employmentTypes', preferencesData.employmentTypes);
      setJsonPref('industries', preferencesData.industries);
      setJsonPref('preferredTechnologies', preferencesData.preferredTechnologies);
      setJsonPref('technologiesToAvoid', preferencesData.technologiesToAvoid);
      if (preferencesData.remotePreference !== undefined) {
        preferencesUpdate.remotePreference = preferencesData.remotePreference || 'any';
      }
      if (preferencesData.minSalary !== undefined) {
        preferencesUpdate.minSalary = preferencesData.minSalary ? Number(preferencesData.minSalary) : null;
      }
      if (preferencesData.preferredSalary !== undefined) {
        preferencesUpdate.preferredSalary = preferencesData.preferredSalary ? Number(preferencesData.preferredSalary) : null;
      }
      const setPrefString = (key: string, value: unknown, fallback = '') => {
        if (value !== undefined) preferencesUpdate[key] = (value as string | null) ?? fallback;
      };
      setPrefString('salaryCurrency', preferencesData.salaryCurrency, 'USD');
      setPrefString('visaNotes', preferencesData.visaNotes);
      setPrefString('maxCommute', preferencesData.maxCommute);
      setPrefString('writingTone', preferencesData.writingTone, 'professional');
      setPrefString('coverLetterLength', preferencesData.coverLetterLength, 'medium');
      setPrefString('coverLetterLanguage', preferencesData.coverLetterLanguage, 'Auto');
      setPrefString('emailLength', preferencesData.emailLength, 'concise');
      setPrefString('writingStyle', preferencesData.writingStyle);
      setPrefString('aiNotes', preferencesData.aiNotes);
      setPrefString('additionalInstructions', preferencesData.additionalInstructions);
      if (preferencesData.mentionSalary !== undefined) {
        preferencesUpdate.mentionSalary = Boolean(preferencesData.mentionSalary);
      }
      if (preferencesData.mentionAvailability !== undefined) {
        preferencesUpdate.mentionAvailability = Boolean(preferencesData.mentionAvailability);
      }
      updatedPreferences = await prisma.jobPreference.upsert({
        where: { id: 'default' },
        update: preferencesUpdate,
        create: {
          id: 'default',
          desiredTitles: JSON.stringify(preferencesData.desiredTitles || []),
          keywords: JSON.stringify(preferencesData.keywords || []),
          excludedKeywords: JSON.stringify(preferencesData.excludedKeywords || []),
          excludedCompanies: JSON.stringify(preferencesData.excludedCompanies || []),
          locations: JSON.stringify(preferencesData.locations || []),
          remotePreference: preferencesData.remotePreference || 'any',
          employmentTypes: JSON.stringify(preferencesData.employmentTypes || []),
          minSalary: preferencesData.minSalary ? Number(preferencesData.minSalary) : null,
          preferredSalary: preferencesData.preferredSalary ? Number(preferencesData.preferredSalary) : null,
          salaryCurrency: preferencesData.salaryCurrency || 'USD',
          industries: JSON.stringify(preferencesData.industries || []),
          preferredTechnologies: JSON.stringify(preferencesData.preferredTechnologies || []),
          technologiesToAvoid: JSON.stringify(preferencesData.technologiesToAvoid || []),
          visaNotes: preferencesData.visaNotes ?? '',
          maxCommute: preferencesData.maxCommute ?? '',
          writingTone: preferencesData.writingTone || 'professional',
          coverLetterLength: preferencesData.coverLetterLength || 'medium',
          coverLetterLanguage: preferencesData.coverLetterLanguage || 'Auto',
          emailLength: preferencesData.emailLength || 'concise',
          mentionSalary: Boolean(preferencesData.mentionSalary),
          mentionAvailability: Boolean(preferencesData.mentionAvailability ?? true),
          writingStyle: preferencesData.writingStyle ?? '',
          aiNotes: preferencesData.aiNotes ?? '',
          additionalInstructions: preferencesData.additionalInstructions ?? '',
        },
      });
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      preferences: updatedPreferences,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
