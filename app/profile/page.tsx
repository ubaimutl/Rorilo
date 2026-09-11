'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Upload, FileText, Check, ChevronDown, ChevronUp, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

export default function ProfilePage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // CV Upload / Paste state
  const [uploadingCv, setUploadingCv] = useState(false);
  const [cvNotice, setCvNotice] = useState<string | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedCvText, setPastedCvText] = useState("");
  const [parsingPasted, setParsingPasted] = useState(false);
  const [cvSummary, setCvSummary] = useState<string[]>([]);
  const [cvAiNudge, setCvAiNudge] = useState(false);

  // Active CV record
  const [activeCv, setActiveCv] = useState<{
    originalFilename: string;
    uploadDate: string;
    extractedText?: string;
    structuredData?: string;
  } | null>(null);

  // User Profile fields
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    linkedIn: "",
    gitHub: "",
    portfolio: "",
    additionalUrlsStr: "",
    currentTitle: "",
    yearsExperience: 0,
    skillsStr: "",
  });

  // Preferences fields
  const [preferences, setPreferences] = useState({
    desiredTitlesStr: "",
    excludedCompaniesStr: "",
    remotePreference: "any",
    minSalary: 0,
    preferredSalary: 0,
    salaryCurrency: "USD",
    technologiesToAvoidStr: "",
    languagesStr: "",
    writingTone: "professional",
    coverLetterLength: "medium",
    coverLetterLanguage: "Auto",
    emailLength: "concise",
    mentionSalary: false,
    mentionAvailability: true,
    writingStyle: "",
    aiNotes: "",
    additionalInstructions: "",
  });

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.profile) {
        const skillsArr = JSON.parse(data.profile.skills || "[]");
        const additionalUrlsArr = JSON.parse(data.profile.additionalUrls || "[]");
        setProfile({
          firstName: data.profile.firstName || "",
          lastName: data.profile.lastName || "",
          email: data.profile.email || "",
          phone: data.profile.phone || "",
          city: data.profile.city || "",
          country: data.profile.country || "",
          linkedIn: data.profile.linkedIn || "",
          gitHub: data.profile.gitHub || "",
          portfolio: data.profile.portfolio || "",
          additionalUrlsStr: additionalUrlsArr.join("\n"),
          currentTitle: data.profile.currentTitle || "",
          yearsExperience: data.profile.yearsExperience || 0,
          skillsStr: skillsArr.join(", "),
        });
      }
      if (data.preferences) {
        const titlesArr = JSON.parse(data.preferences.desiredTitles || "[]");
        const avoidArr = JSON.parse(data.preferences.technologiesToAvoid || "[]");
        const languagesArr = JSON.parse(data.profile?.languages || "[]");
        const excludedCompaniesArr = JSON.parse(data.preferences.excludedCompanies || "[]");
        setPreferences({
          desiredTitlesStr: titlesArr.join(", "),
          excludedCompaniesStr: excludedCompaniesArr.join(", "),
          remotePreference: data.preferences.remotePreference || "any",
          minSalary: data.preferences.minSalary || 0,
          preferredSalary: data.preferences.preferredSalary || 0,
          salaryCurrency: data.preferences.salaryCurrency || "USD",
          technologiesToAvoidStr: avoidArr.join(", "),
          languagesStr: languagesArr.join(", "),
          writingTone: data.preferences.writingTone || "professional",
          coverLetterLength: data.preferences.coverLetterLength || "medium",
          coverLetterLanguage: data.preferences.coverLetterLanguage || "Auto",
          emailLength: data.preferences.emailLength || "concise",
          mentionSalary: Boolean(data.preferences.mentionSalary),
          mentionAvailability: Boolean(data.preferences.mentionAvailability ?? true),
          writingStyle: data.preferences.writingStyle || "",
          aiNotes: data.preferences.aiNotes || "",
          additionalInstructions: data.preferences.additionalInstructions || "",
        });
      }
      if (data.activeCv) {
        setActiveCv(data.activeCv);
        try {
          const structured = JSON.parse(data.activeCv.structuredData || "{}");
          const nextSummary = [
            structured.currentTitle ? t('profile.cvSummaryTitle', { title: structured.currentTitle }) : null,
            Array.isArray(structured.skills) ? t('profile.cvSummarySkills', { count: structured.skills.length }) : null,
            Array.isArray(structured.technologies) ? t('profile.cvSummaryTech', { count: structured.technologies.length }) : null,
            Array.isArray(structured.languages) ? t('profile.cvSummaryLang', { count: structured.languages.length }) : null,
            Array.isArray(structured.workExperience) ? t('profile.cvSummaryWork', { count: structured.workExperience.length }) : null,
            Array.isArray(structured.projects) ? t('profile.cvSummaryProjects', { count: structured.projects.length }) : null,
          ].filter(Boolean) as string[];
          setCvSummary(nextSummary);
        } catch {
          setCvSummary([]);
        }
      } else {
        setActiveCv(null);
        setCvSummary([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCv(true);
    setCvNotice(null);
    setCvAiNudge(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setCvNotice(t('profile.cvProcessedFile', { name: file.name }));
        setCvAiNudge(data.parsedByAi === false);
        if (data.summary) {
          setCvSummary([
            data.summary.title ? t('profile.cvSummaryTitle', { title: data.summary.title }) : null,
            t('profile.cvSummarySkills', { count: data.summary.skills || 0 }),
            t('profile.cvSummaryTech', { count: data.summary.technologies || 0 }),
            t('profile.cvSummaryLang', { count: data.summary.languages || 0 }),
            t('profile.cvSummaryWork', { count: data.summary.workExperience || 0 }),
            t('profile.cvSummaryProjects', { count: data.summary.projects || 0 }),
            t('profile.cvSummaryLinks', { count: data.summary.links || 0 }),
          ].filter(Boolean) as string[]);
        }
        await fetchProfile();
      } else {
        alert(data.error || t("profile.cvParseFailed"));
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploadingCv(false);
      e.target.value = "";
    }
  };

  const handlePasteCvSubmit = async () => {
    if (!pastedCvText.trim()) return;
    setParsingPasted(true);
    setCvNotice(null);
    setCvAiNudge(false);

    try {
      const res = await fetch("/api/cv/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedCvText, filename: "Pasted_Resume.txt" }),
      });
      const data = await res.json();
      if (res.ok) {
        setCvNotice(t('profile.cvProcessedPaste'));
        setCvAiNudge(data.parsedByAi === false);
        if (data.summary) {
          setCvSummary([
            data.summary.title ? t('profile.cvSummaryTitle', { title: data.summary.title }) : null,
            t('profile.cvSummarySkills', { count: data.summary.skills || 0 }),
            t('profile.cvSummaryTech', { count: data.summary.technologies || 0 }),
            t('profile.cvSummaryLang', { count: data.summary.languages || 0 }),
            t('profile.cvSummaryWork', { count: data.summary.workExperience || 0 }),
            t('profile.cvSummaryProjects', { count: data.summary.projects || 0 }),
            t('profile.cvSummaryLinks', { count: data.summary.links || 0 }),
          ].filter(Boolean) as string[]);
        }
        setPastedCvText("");
        setShowPasteBox(false);
        await fetchProfile();
      } else {
        alert(data.error || t("profile.cvPasteParseFailed"));
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setParsingPasted(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    const skills = profile.skillsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const desiredTitles = preferences.desiredTitlesStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const excludedCompanies = preferences.excludedCompaniesStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const technologiesToAvoid = preferences.technologiesToAvoidStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const languages = preferences.languagesStr
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean);

    const additionalUrls = profile.additionalUrlsStr
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileData: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            city: profile.city,
            country: profile.country,
            linkedIn: profile.linkedIn,
            gitHub: profile.gitHub,
            portfolio: profile.portfolio,
            additionalUrls,
            currentTitle: profile.currentTitle,
            yearsExperience: profile.yearsExperience,
            skills,
            languages,
          },
          preferencesData: {
            desiredTitles,
            excludedCompanies,
            remotePreference: preferences.remotePreference,
            minSalary: preferences.minSalary,
            preferredSalary: preferences.preferredSalary,
            salaryCurrency: preferences.salaryCurrency,
            technologiesToAvoid,
            writingTone: preferences.writingTone,
            coverLetterLength: preferences.coverLetterLength,
            coverLetterLanguage: preferences.coverLetterLanguage,
            emailLength: preferences.emailLength,
            mentionSalary: preferences.mentionSalary,
            mentionAvailability: preferences.mentionAvailability,
            writingStyle: preferences.writingStyle,
            aiNotes: preferences.aiNotes,
            additionalInstructions: preferences.additionalInstructions,
          },
        }),
      });

      if (res.ok) {
        setSaveStatus(t("common.changesSaved"));
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch {
      alert(t("profile.cvSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-28 text-sm text-neutral-400 gap-2.5">
        <Loader2 className="size-4 animate-spin" />
        {t('profile.cvLoading')}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <PageHeader
        title={t('profile.title')}
        description={t('profile.description')}
        actions={
          saveStatus && (
            <span className="text-sm text-emerald-700 font-medium">{saveStatus}</span>
          )
        }
      />

      <main className="p-6 md:p-10 max-w-3xl w-full mx-auto">
        <form onSubmit={handleSave} className="space-y-10">
          {/* CV Section */}
          <Card>
            <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                {t('profile.cvTitle')}
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                {t('profile.cvDescription')}
              </p>
            </div>

            {/* Current Active CV Status */}
            <div className="flex items-center justify-between p-3.5 bg-neutral-50/70 border border-neutral-200 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="size-5 text-neutral-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate">
                    {activeCv?.originalFilename || t("profile.cvNoActive")}
                  </p>
                  {activeCv && (
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {t('profile.cvUploaded', { date: formatDate(activeCv.uploadDate) })}
                    </p>
                  )}
                </div>
              </div>
              {cvNotice && (
                <span className="text-xs text-emerald-700 font-medium">{cvNotice}</span>
              )}
            </div>

            {cvSummary.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                {cvSummary.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                    <Check className="size-3.5" />
                    {item}
                  </span>
                ))}
              </div>
            )}

            {cvAiNudge && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
                <span className="mt-px shrink-0 text-amber-500">⚠</span>
                <span>
                  {t('profile.cvAiFallbackNudge')}{' '}
                  <Link href="/settings" className="font-semibold underline underline-offset-2 hover:text-amber-900">
                    Settings →
                  </Link>
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: File Upload */}
              <div className="p-4 bg-neutral-50/70 border border-neutral-200 rounded-xl space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">{t('profile.cvOpt1')}</h3>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                    {t('profile.cvOpt1Hint')}
                  </p>
                </div>

                <label className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 cursor-pointer transition-colors shadow-xs">
                  {uploadingCv ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  <span>{uploadingCv ? t("profile.cvProcessing") : t("profile.cvChooseFile")}</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={handleCvUpload}
                    disabled={uploadingCv}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Option 2: Direct Text Paste */}
              <div className="p-4 bg-neutral-50/70 border border-neutral-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-900">{t('profile.cvOpt2')}</h3>
                  <span className="text-xs text-neutral-400 font-medium">{t('profile.cvDirectFallback')}</span>
                </div>
                <Textarea
                  value={pastedCvText}
                  onChange={(e) => setPastedCvText(e.target.value)}
                  placeholder={t('profile.cvPastePh')}
                  rows={4}
                  className="text-xs font-mono leading-relaxed bg-white"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePasteCvSubmit}
                  disabled={parsingPasted || !pastedCvText.trim()}
                  className="w-full text-xs h-8"
                >
                  {parsingPasted ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <ClipboardPaste className="size-3.5 mr-1.5" />}
                  <span>{t('profile.cvSaveParse')}</span>
                </Button>
              </div>
            </div>

            {activeCv?.extractedText && (
              <details className="text-xs text-neutral-500">
                <summary className="cursor-pointer font-medium hover:text-neutral-800">
                  {t('profile.cvInspect')}
                </summary>
                <div className="mt-2 p-3 bg-neutral-50/70 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-700 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {activeCv.extractedText}
                </div>
              </details>
            )}
          </CardContent>
          </Card>

          <Separator />

          {/* Personal Information */}
          <Card>
            <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                {t('profile.personalTitle')}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                {t('profile.personalHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prof-fn" className="text-sm font-medium text-neutral-700">{t('profile.firstName')}</Label>
                <Input
                  id="prof-fn"
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-ln" className="text-sm font-medium text-neutral-700">{t('profile.lastName')}</Label>
                <Input
                  id="prof-ln"
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-em" className="text-sm font-medium text-neutral-700">{t('profile.email')}</Label>
                <Input
                  id="prof-em"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-ph" className="text-sm font-medium text-neutral-700">{t('profile.phone')}</Label>
                <Input
                  id="prof-ph"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-loc" className="text-sm font-medium text-neutral-700">{t('profile.location')}</Label>
                <Input
                  id="prof-loc"
                  value={profile.city}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                  placeholder={t('profile.locationPh')}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-li" className="text-sm font-medium text-neutral-700">{t('profile.linkedIn')}</Label>
                <Input
                  id="prof-li"
                  value={profile.linkedIn}
                  onChange={(e) => setProfile({ ...profile, linkedIn: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-gh" className="text-sm font-medium text-neutral-700">{t('profile.gitHub')}</Label>
                <Input
                  id="prof-gh"
                  value={profile.gitHub}
                  onChange={(e) => setProfile({ ...profile, gitHub: e.target.value })}
                  placeholder="https://github.com/..."
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-web" className="text-sm font-medium text-neutral-700">{t('profile.portfolio')}</Label>
                <Input
                  id="prof-web"
                  value={profile.portfolio}
                  onChange={(e) => setProfile({ ...profile, portfolio: e.target.value })}
                  placeholder="https://..."
                  className="text-sm h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prof-more-links" className="text-sm font-medium text-neutral-700">
                {t('profile.moreLinks')}
              </Label>
              <Textarea
                id="prof-more-links"
                value={profile.additionalUrlsStr}
                onChange={(e) => setProfile({ ...profile, additionalUrlsStr: e.target.value })}
                rows={3}
                placeholder={t('profile.moreLinksPh')}
                className="text-sm leading-relaxed"
              />
            </div>
          </CardContent>
          </Card>

          <Separator />

          {/* Professional Background */}
          <Card>
            <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                {t('profile.bgTitle')}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                {t('profile.bgHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="prof-title" className="text-sm font-medium text-neutral-700">{t('profile.currentTitle')}</Label>
                <Input
                  id="prof-title"
                  value={profile.currentTitle}
                  onChange={(e) => setProfile({ ...profile, currentTitle: e.target.value })}
                  placeholder={t('profile.currentTitlePh')}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prof-exp" className="text-sm font-medium text-neutral-700">{t('profile.yearsExp')}</Label>
                <Input
                  id="prof-exp"
                  type="number"
                  step="0.5"
                  value={profile.yearsExperience}
                  onChange={(e) =>
                    setProfile({ ...profile, yearsExperience: parseFloat(e.target.value) || 0 })
                  }
                  className="text-sm h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prof-skills" className="text-sm font-medium text-neutral-700">
                {t('profile.skills')}
              </Label>
              <Textarea
                id="prof-skills"
                value={profile.skillsStr}
                onChange={(e) => setProfile({ ...profile, skillsStr: e.target.value })}
                rows={3}
                placeholder={t('profile.skillsPh')}
                className="text-sm leading-relaxed"
              />
            </div>
          </CardContent>
          </Card>

          <Separator />

          {/* Job Preferences */}
          <Card>
            <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                {t('profile.prefsTitle')}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                {t('profile.prefsHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pref-titles" className="text-sm font-medium text-neutral-700">{t('profile.prefsTitles')}</Label>
                <Input
                  id="pref-titles"
                  value={preferences.desiredTitlesStr}
                  onChange={(e) =>
                    setPreferences({ ...preferences, desiredTitlesStr: e.target.value })
                  }
                  placeholder={t('profile.prefsTitlesPh')}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pref-remote" className="text-sm font-medium text-neutral-700">{t('profile.prefsRemote')}</Label>
                <select
                  id="pref-remote"
                  value={preferences.remotePreference}
                  onChange={(e) =>
                    setPreferences({ ...preferences, remotePreference: e.target.value })
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-neutral-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
                >
                  <option value="any">{t('discover.workplace.all')}</option>
                  <option value="remote">{t('profile.prefsRemoteStrict')}</option>
                  <option value="hybrid">{t('profile.prefsRemoteHybrid')}</option>
                  <option value="onsite">{t('profile.prefsRemoteOnsite')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pref-minsal" className="text-sm font-medium text-neutral-700">{t('profile.prefsMinSalary')}</Label>
                <Input
                  id="pref-minsal"
                  type="number"
                  value={preferences.minSalary || ""}
                  onChange={(e) =>
                    setPreferences({ ...preferences, minSalary: parseFloat(e.target.value) || 0 })
                  }
                  placeholder={t('profile.prefsMinSalaryPh')}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pref-avoid" className="text-sm font-medium text-neutral-700">{t('profile.prefsAvoidTech')}</Label>
                <Input
                  id="pref-avoid"
                  value={preferences.technologiesToAvoidStr}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      technologiesToAvoidStr: e.target.value,
                    })
                  }
                  placeholder={t('profile.prefsAvoidTechPh')}
                  className="text-sm h-9"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pref-blocked" className="text-sm font-medium text-neutral-700">{t('profile.prefsBlocked')}</Label>
                <Input
                  id="pref-blocked"
                  value={preferences.excludedCompaniesStr}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      excludedCompaniesStr: e.target.value,
                    })
                  }
                  placeholder={t('profile.prefsBlockedPh')}
                  className="text-sm h-9"
                />
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {t('profile.prefsBlockedHint')}
                </p>
              </div>
            </div>
          </CardContent>
          </Card>

          <Separator />

          {/* Application Writing */}
          <Card>
            <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {t('profile.writingTitle')}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                {t('profile.writingHint')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="pref-language" className="text-sm font-medium text-neutral-700">{t('profile.writingCoverLang')}</Label>
                <Input
                  id="pref-language"
                  value={preferences.coverLetterLanguage}
                  onChange={(e) =>
                    setPreferences({ ...preferences, coverLetterLanguage: e.target.value })
                  }
                  placeholder={t('profile.writingCoverLangPh')}
                  className="text-sm h-9"
                />
                <p className="text-xs text-neutral-500">{t('profile.writingAutoHint')}</p>
              </div>

              <div className="space-y-1.5 flex-1">
                <Label htmlFor="pref-candidate-languages" className="text-sm font-medium text-neutral-700">{t('profile.writingLanguages')}</Label>
                <Input
                  id="pref-candidate-languages"
                  value={preferences.languagesStr}
                  onChange={(e) =>
                    setPreferences({ ...preferences, languagesStr: e.target.value })
                  }
                  placeholder={t('profile.writingLanguagesPh')}
                  className="text-sm h-9"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="pref-tone" className="text-sm font-medium text-neutral-700">{t('profile.writingTone')}</Label>
                <select
                  id="pref-tone"
                  value={preferences.writingTone}
                  onChange={(e) =>
                    setPreferences({ ...preferences, writingTone: e.target.value })
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-neutral-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
                >
                  <option value="professional">{t('profile.writingOptProfessional')}</option>
                  <option value="confident">{t('profile.writingOptConfident')}</option>
                  <option value="concise">{t('profile.writingOptConcise')}</option>
                  <option value="conversational">{t('profile.writingOptConversational')}</option>
                </select>
              </div>

              <div className="space-y-1.5 flex-1">
                <Label htmlFor="pref-cover-length" className="text-sm font-medium text-neutral-700">{t('profile.writingCoverLength')}</Label>
                <select
                  id="pref-cover-length"
                  value={preferences.coverLetterLength}
                  onChange={(e) =>
                    setPreferences({ ...preferences, coverLetterLength: e.target.value })
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-neutral-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
                >
                  <option value="short">{t('profile.writingOptShort')}</option>
                  <option value="medium">{t('profile.writingOptMedium')}</option>
                  <option value="detailed">{t('profile.writingOptDetailed')}</option>
                </select>
              </div>

              <div className="space-y-1.5 flex-1">
                <Label htmlFor="pref-email-length" className="text-sm font-medium text-neutral-700">{t('profile.writingEmailLength')}</Label>
                <select
                  id="pref-email-length"
                  value={preferences.emailLength}
                  onChange={(e) =>
                    setPreferences({ ...preferences, emailLength: e.target.value })
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-neutral-800 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
                >
                  <option value="short">{t('profile.writingOptShort')}</option>
                  <option value="concise">{t('profile.writingOptConcise')}</option>
                  <option value="detailed">{t('profile.writingOptDetailed')}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={preferences.mentionAvailability}
                  onChange={(e) =>
                    setPreferences({ ...preferences, mentionAvailability: e.target.checked })
                  }
                  className="size-4 rounded border-neutral-300"
                />
                {t('profile.writingMentionAvailability')}
              </label>

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={preferences.mentionSalary}
                  onChange={(e) =>
                    setPreferences({ ...preferences, mentionSalary: e.target.checked })
                  }
                  className="size-4 rounded border-neutral-300"
                />
                {t('profile.writingMentionSalary')}
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-style" className="text-sm font-medium text-neutral-700">
                {t('profile.writingStyle')}
              </Label>
              <Textarea
                id="pref-style"
                value={preferences.writingStyle}
                onChange={(e) => setPreferences({ ...preferences, writingStyle: e.target.value })}
                rows={3}
                placeholder={t('profile.writingStylePh')}
                className="text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-ai-notes" className="text-sm font-medium text-neutral-700">
                {t('profile.writingAiNotes')}
              </Label>
              <Textarea
                id="pref-ai-notes"
                value={preferences.aiNotes}
                onChange={(e) => setPreferences({ ...preferences, aiNotes: e.target.value })}
                rows={3}
                placeholder={t('profile.writingAiNotesPh')}
                className="text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-instructions" className="text-sm font-medium text-neutral-700">
                {t('profile.writingInstructions')}
              </Label>
              <Textarea
                id="pref-instructions"
                value={preferences.additionalInstructions}
                onChange={(e) =>
                  setPreferences({ ...preferences, additionalInstructions: e.target.value })
                }
                rows={3}
                placeholder={t('profile.writingInstructionsPh')}
                className="text-sm leading-relaxed"
              />
            </div>
          </CardContent>
          </Card>

          {/* Submit Action */}
          <div className="pt-4 flex items-center justify-end gap-3">
            <Button
              type="submit"
              disabled={saving}
              className="text-sm h-9 px-5"
            >
              {saving ? t("common.saving") : t("profile.saveProfile")}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
