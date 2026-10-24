-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "linkedIn" TEXT NOT NULL DEFAULT '',
    "gitHub" TEXT NOT NULL DEFAULT '',
    "portfolio" TEXT NOT NULL DEFAULT '',
    "additionalUrls" TEXT NOT NULL DEFAULT '[]',
    "currentTitle" TEXT NOT NULL DEFAULT '',
    "yearsExperience" REAL NOT NULL DEFAULT 0,
    "skills" TEXT NOT NULL DEFAULT '[]',
    "technologies" TEXT NOT NULL DEFAULT '[]',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "education" TEXT NOT NULL DEFAULT '[]',
    "certifications" TEXT NOT NULL DEFAULT '[]',
    "workExperience" TEXT NOT NULL DEFAULT '[]',
    "projects" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CV" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalFilename" TEXT NOT NULL,
    "filePath" TEXT,
    "extractedText" TEXT NOT NULL,
    "structuredData" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobPreference" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "desiredTitles" TEXT NOT NULL DEFAULT '[]',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "excludedKeywords" TEXT NOT NULL DEFAULT '[]',
    "excludedCompanies" TEXT NOT NULL DEFAULT '[]',
    "locations" TEXT NOT NULL DEFAULT '[]',
    "remotePreference" TEXT NOT NULL DEFAULT 'any',
    "employmentTypes" TEXT NOT NULL DEFAULT '[]',
    "minSalary" REAL,
    "preferredSalary" REAL,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "industries" TEXT NOT NULL DEFAULT '[]',
    "companySizes" TEXT NOT NULL DEFAULT '[]',
    "preferredTechnologies" TEXT NOT NULL DEFAULT '[]',
    "technologiesToAvoid" TEXT NOT NULL DEFAULT '[]',
    "visaNotes" TEXT NOT NULL DEFAULT '',
    "maxCommute" TEXT NOT NULL DEFAULT '',
    "writingTone" TEXT NOT NULL DEFAULT 'professional',
    "coverLetterLength" TEXT NOT NULL DEFAULT 'medium',
    "coverLetterLanguage" TEXT NOT NULL DEFAULT 'Auto',
    "emailLength" TEXT NOT NULL DEFAULT 'concise',
    "mentionSalary" BOOLEAN NOT NULL DEFAULT false,
    "mentionAvailability" BOOLEAN NOT NULL DEFAULT true,
    "writingStyle" TEXT NOT NULL DEFAULT '',
    "aiNotes" TEXT NOT NULL DEFAULT '',
    "additionalInstructions" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AIProviderSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "temperature" REAL NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 2000,
    "providerName" TEXT NOT NULL DEFAULT 'Primary',
    "fallbackProviders" TEXT NOT NULL DEFAULT '[]',
    "structuredOutput" BOOLEAN NOT NULL DEFAULT true,
    "disableReasoning" BOOLEAN NOT NULL DEFAULT true,
    "providerOptions" TEXT NOT NULL DEFAULT '{}',
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApifySettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "apiToken" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT 'curious_coder/linkedin-jobs-scraper',
    "actorIds" TEXT NOT NULL DEFAULT '["curious_coder/linkedin-jobs-scraper"]',
    "actorInputTemplate" TEXT NOT NULL DEFAULT '{}',
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "providerType" TEXT NOT NULL DEFAULT 'gmail',
    "userEmail" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "tokenExpiry" DATETIME,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LogoSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "apiToken" TEXT NOT NULL DEFAULT '',
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FreeSourceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "adzunaAppId" TEXT NOT NULL DEFAULT '',
    "adzunaAppKey" TEXT NOT NULL DEFAULT '',
    "techmapKey" TEXT NOT NULL DEFAULT '',
    "enabledSources" TEXT NOT NULL DEFAULT '["arbeitsagentur"]',
    "disabledBoards" TEXT NOT NULL DEFAULT '[]',
    "customBoards" TEXT NOT NULL DEFAULT '[]',
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'apify',
    "sourceJobId" TEXT,
    "deduplicationHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyWebsite" TEXT,
    "companyLogo" TEXT,
    "location" TEXT,
    "countryCode" TEXT,
    "remoteType" TEXT NOT NULL DEFAULT 'unknown',
    "employmentType" TEXT,
    "salaryMin" REAL,
    "salaryMax" REAL,
    "salaryCurrency" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL DEFAULT '[]',
    "responsibilities" TEXT NOT NULL DEFAULT '[]',
    "benefits" TEXT NOT NULL DEFAULT '[]',
    "technologies" TEXT NOT NULL DEFAULT '[]',
    "seniority" TEXT,
    "languageRequirements" TEXT NOT NULL DEFAULT '[]',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "applicationUrl" TEXT,
    "originalUrl" TEXT,
    "datePosted" DATETIME,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeletedJobFingerprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deduplicationHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "normalizedCompany" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL DEFAULT '',
    "descriptionSignature" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "requiredSkills" TEXT NOT NULL DEFAULT '[]',
    "preferredSkills" TEXT NOT NULL DEFAULT '[]',
    "yearsExperienceMin" INTEGER,
    "technologies" TEXT NOT NULL DEFAULT '[]',
    "seniority" TEXT,
    "education" TEXT,
    "languageRequirements" TEXT NOT NULL DEFAULT '[]',
    "remoteStatus" TEXT,
    "locationRestrictions" TEXT,
    "salaryExtracted" TEXT,
    "responsibilities" TEXT NOT NULL DEFAULT '[]',
    "benefits" TEXT NOT NULL DEFAULT '[]',
    "contactEmail" TEXT,
    "applicationMethod" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "modelUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "skillsScore" INTEGER NOT NULL DEFAULT 0,
    "roleScore" INTEGER NOT NULL DEFAULT 0,
    "experienceScore" INTEGER NOT NULL DEFAULT 0,
    "locationScore" INTEGER NOT NULL DEFAULT 0,
    "languageScore" INTEGER NOT NULL DEFAULT 0,
    "salaryScore" INTEGER NOT NULL DEFAULT 0,
    "preferencesScore" INTEGER NOT NULL DEFAULT 0,
    "strongMatches" TEXT NOT NULL DEFAULT '[]',
    "possibleIssues" TEXT NOT NULL DEFAULT '[]',
    "missingSkills" TEXT NOT NULL DEFAULT '[]',
    "aiInterpretation" TEXT,
    "triageStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "triageReason" TEXT NOT NULL DEFAULT '',
    "aiMatchScore" INTEGER,
    "aiScoredAt" DATETIME,
    "triagedAt" DATETIME,
    "lastCalculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "method" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT NOT NULL DEFAULT '',
    "appliedAt" DATETIME,
    "followUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'apify',
    "searchParameters" TEXT NOT NULL DEFAULT '{}',
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "newJobs" INTEGER NOT NULL DEFAULT 0,
    "duplicateJobs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_deduplicationHash_key" ON "Job"("deduplicationHash");

-- CreateIndex
CREATE INDEX "Job_company_idx" ON "Job"("company");

-- CreateIndex
CREATE INDEX "Job_title_idx" ON "Job"("title");

-- CreateIndex
CREATE INDEX "Job_countryCode_idx" ON "Job"("countryCode");

-- CreateIndex
CREATE INDEX "Job_remoteType_idx" ON "Job"("remoteType");

-- CreateIndex
CREATE INDEX "Job_discoveredAt_idx" ON "Job"("discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletedJobFingerprint_deduplicationHash_key" ON "DeletedJobFingerprint"("deduplicationHash");

-- CreateIndex
CREATE INDEX "DeletedJobFingerprint_normalizedCompany_idx" ON "DeletedJobFingerprint"("normalizedCompany");

-- CreateIndex
CREATE INDEX "DeletedJobFingerprint_normalizedTitle_idx" ON "DeletedJobFingerprint"("normalizedTitle");

-- CreateIndex
CREATE INDEX "DeletedJobFingerprint_normalizedUrl_idx" ON "DeletedJobFingerprint"("normalizedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "JobAnalysis"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_key" ON "JobMatch"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "ApplicationDocument_applicationId_type_idx" ON "ApplicationDocument"("applicationId", "type");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_idx" ON "ApplicationEvent"("applicationId");
