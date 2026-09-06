export interface JobSearchParams {
  title?: string;
  keywords?: string[];
  country?: string;
  location?: string;
  remote?: 'remote' | 'hybrid' | 'onsite' | 'any';
  datePosted?: string; // '24h', 'week', 'month', 'any'
  employmentType?: string; // 'full-time', 'contract', 'part-time', 'any'
  limit?: number;
}

export interface NormalizedJobInput {
  source: string;
  sourceJobId?: string;
  title: string;
  company: string;
  companyWebsite?: string;
  companyLogo?: string;
  location?: string;
  countryCode?: string;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  technologies: string[];
  seniority?: string;
  languageRequirements: string[];
  contactName?: string;
  contactEmail?: string;
  applicationUrl?: string;
  originalUrl?: string;
  datePosted?: Date;
  rawData?: Record<string, unknown> | string;
}

export interface JobSourceSearchResult {
  jobs: NormalizedJobInput[];
  totalDiscovered: number;
  source: string;
  rawPayload?: unknown;
}

export interface JobSource {
  name: string;
  searchJobs(params: JobSearchParams): Promise<JobSourceSearchResult>;
  fetchJob?(sourceJobId: string): Promise<NormalizedJobInput | null>;
  normalizeJob(rawItem: unknown): NormalizedJobInput;
  testConnection?(): Promise<{ success: boolean; message: string }>;
}
