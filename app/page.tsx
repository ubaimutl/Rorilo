"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { JobDrawer } from "@/components/JobDrawer";
import { SearchModal } from "@/components/SearchModal";
import { SearchInsights } from "@/components/SearchInsights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import {
	Search,
	MapPin,
	Loader2,
	Trash2,
	Sparkles,
	Briefcase,
	TriangleAlert,
	Cpu,
	FileText,
	Plus,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const DISCOVER_STATE_KEY = "rorilo_discover_state";
// Module-level cache preserves jobs during SPA navigation (like clicking a job and hitting back).
// This allows the page to render synchronously on back-navigation, making native browser
// scroll restoration work perfectly without layout shifts.
let cachedJobs: any[] | null = null;
let cachedProfileReady = false;
let cachedTotalJobsInDb: number | null = null;
let cachedGlobalStats: any = null;

type TriageFilter = "all" | "WORTH_APPLYING" | "MAYBE" | "SAVED" | "SKIP";

export default function JobsPage() {
	const { t, locale } = useI18n();
	const [jobs, setJobs] = useState<any[]>(cachedJobs || []);
	const [totalJobsInDb, setTotalJobsInDb] = useState<number | null>(cachedTotalJobsInDb);
	const [globalStats, setGlobalStats] = useState<any>(cachedGlobalStats);
	const [loading, setLoading] = useState(!cachedJobs);
	// Separate display state (updates instantly) from debounced API state (triggers fetch)
	const [searchInput, setSearchInput] = useState("");
	const [locationInput, setLocationInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [locationQuery, setLocationQuery] = useState("");
	const [remoteFilter, setRemoteFilter] = useState("all");
	const [activeTab, setActiveTab] = useState<"best" | "newest" | "saved">(
		"best",
	);
	const [triageFilter, setTriageFilter] = useState<TriageFilter>("all");
	const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
	const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [triaging, setTriaging] = useState(false);
	const [triageError, setTriageError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [profileReady, setProfileReady] = useState(cachedProfileReady);
	const [hasRestoredState, setHasRestoredState] = useState(false);
	const [searchInsightsRefresh, setSearchInsightsRefresh] = useState(0);
	const abortControllerRef = useRef<AbortController | null>(null);
	const confirm = useConfirm();

	// Single pass over jobs for queue counts.
	const triageCounts = useMemo(() => {
		const counts = { all: 0, WORTH_APPLYING: 0, MAYBE: 0, SKIP: 0, SAVED: 0, UNSCORED: 0 };
		for (let i = 0; i < jobs.length; i++) {
			const job = jobs[i];
			const status = job.match?.triageStatus;
			if (job.application?.status === "SAVED") counts.SAVED++;
			if (status === "SKIP") {
				counts.SKIP++;
				continue;
			}
			counts.all++;
			if (status === "WORTH_APPLYING") counts.WORTH_APPLYING++;
			else if (status === "MAYBE") counts.MAYBE++;
			else counts.UNSCORED++;
		}
		return counts;
	}, [jobs]);

	// "All" is the working queue: everything except skipped.
	const visibleJobs = useMemo(() => {
		if (triageFilter === "all") return jobs.filter((j) => j.match?.triageStatus !== "SKIP");
		if (triageFilter === "SAVED") return jobs.filter((j) => j.application?.status === "SAVED");
		return jobs.filter((j) => j.match?.triageStatus === triageFilter);
	}, [jobs, triageFilter]);

	const matchingPaused = jobs.length > 0 && !profileReady;
	const hasJobs = totalJobsInDb !== null ? totalJobsInDb > 0 : jobs.length > 0;

	const dateLine = useMemo(() => {
		try {
			return new Intl.DateTimeFormat(locale, {
				weekday: "long",
				month: "long",
				day: "numeric",
			}).format(new Date());
		} catch {
			return "";
		}
	}, [locale]);

	const heroSub =
		triageCounts.WORTH_APPLYING > 0
			? t("discover.hero.high", { count: triageCounts.WORTH_APPLYING })
			: triageCounts.UNSCORED > 0
				? t("discover.hero.review", { count: triageCounts.UNSCORED })
				: t("discover.hero.clear");

	const fetchJobs = useCallback(
		async (override?: {
			searchQuery?: string;
			locationQuery?: string;
			remoteFilter?: string;
			activeTab?: "best" | "newest" | "saved";
		}) => {
			// Abort any previous request to prevent race conditions during debounced typing
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
			const abortController = new AbortController();
			abortControllerRef.current = abortController;

			setLoading(true);
			try {
				const params = new URLSearchParams();
				const nextSearch = override?.searchQuery ?? searchQuery;
				const nextLocation = override?.locationQuery ?? locationQuery;
				const nextRemote = override?.remoteFilter ?? remoteFilter;
				const nextTab = override?.activeTab ?? activeTab;
				if (nextSearch) params.set("search", nextSearch);
				if (nextLocation) params.set("location", nextLocation);
				if (nextRemote !== "all") params.set("remote", nextRemote);
				if (nextTab === "saved") params.set("status", "SAVED");
				params.set("sort", nextTab === "newest" ? "newest" : "best");

				const res = await fetch(`/api/jobs?${params.toString()}`, {
					signal: abortController.signal,
				});
				const data = await res.json();

				const newJobs = data.jobs || [];
				setJobs(newJobs);
				setTotalJobsInDb(data.totalJobsInDb ?? 0);
				setGlobalStats(data.globalStats ?? null);
				setProfileReady(Boolean(data.profileReady));

				// Update memory cache for synchronous render on back-navigation
				cachedJobs = newJobs;
				cachedTotalJobsInDb = data.totalJobsInDb ?? 0;
				cachedGlobalStats = data.globalStats ?? null;
				cachedProfileReady = Boolean(data.profileReady);
			} catch (err: any) {
				if (err.name === "AbortError") return; // Ignore aborted requests silently
				console.error(err);
			} finally {
				if (!abortController.signal.aborted) {
					setLoading(false);
				}
			}
		},
		[activeTab, locationQuery, remoteFilter, searchQuery],
	);

	// Restore persisted filter/search state from localStorage on first mount
	useEffect(() => {
		try {
			const saved = localStorage.getItem(DISCOVER_STATE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				if (typeof parsed.searchQuery === "string") {
					setSearchQuery(parsed.searchQuery);
					setSearchInput(parsed.searchQuery);
				}
				if (typeof parsed.locationQuery === "string") {
					setLocationQuery(parsed.locationQuery);
					setLocationInput(parsed.locationQuery);
				}
				if (typeof parsed.remoteFilter === "string")
					setRemoteFilter(parsed.remoteFilter);
				if (["best", "newest", "saved"].includes(parsed.activeTab)) {
					setActiveTab(parsed.activeTab);
				}
				if (["all", "WORTH_APPLYING", "MAYBE", "SAVED", "SKIP"].includes(parsed.triageFilter)) {
					setTriageFilter(parsed.triageFilter);
				}
			}
		} catch {}
		setHasRestoredState(true);
	}, []);

	// Persist filter state whenever it changes
	useEffect(() => {
		if (!hasRestoredState) return;
		try {
			localStorage.setItem(
				DISCOVER_STATE_KEY,
				JSON.stringify({ searchQuery, locationQuery, remoteFilter, activeTab, triageFilter }),
			);
		} catch {}
	}, [searchQuery, locationQuery, remoteFilter, activeTab, triageFilter, hasRestoredState]);

	// Debounce: sync input display values → debounced query values after 400ms idle
	useEffect(() => {
		if (!hasRestoredState) return;
		const timer = setTimeout(() => {
			setSearchQuery(searchInput);
		}, 400);
		return () => clearTimeout(timer);
	}, [searchInput, hasRestoredState]);

	useEffect(() => {
		if (!hasRestoredState) return;
		const timer = setTimeout(() => {
			setLocationQuery(locationInput);
		}, 400);
		return () => clearTimeout(timer);
	}, [locationInput, hasRestoredState]);
	// Fetch jobs whenever the debounced query values or filters change
	// Note: First render from cache is synchronous so we don't need to fetch
	// if we restored from cache AND query parameters haven't changed yet.
	useEffect(() => {
		if (!hasRestoredState) return;
		const handler = setTimeout(() => {
			fetchJobs();
		}, 50);
		return () => clearTimeout(handler);
	}, [fetchJobs, hasRestoredState]);

	// Stable callbacks keep memoized cards from re-rendering on every keystroke.
	const handleSaveToggle = useCallback(() => {
		fetchJobs();
	}, [fetchJobs]);

	const handleDeleteJob = useCallback((jobId: string) => {
		cachedJobs = (cachedJobs || []).filter((item: any) => item.id !== jobId);
		setJobs((current) =>
			current.filter((item) => item.id !== jobId),
		);
	}, []);

	const handleDeleteSkipped = async () => {
		if (!globalStats || globalStats.skipped === 0) return;
		const shouldDelete = await confirm({
			title: t("discover.deleteConfirmSkipped", {
				count: globalStats.skipped,
				plural: globalStats.skipped === 1 ? "" : "s",
			}),
			confirmLabel: t("discover.deleteSkipped", { count: globalStats.skipped }),
			tone: "danger",
		});
		if (!shouldDelete) return;

		setBulkDeleting(true);
		setDeleteError(null);
		try {
			const res = await fetch("/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ deleteSkipped: true }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				setJobs((current) =>
					current.filter((job) => job.match?.triageStatus !== "SKIP"),
				);
				fetchJobs(); // Refresh stats
			} else {
				setDeleteError(data.error || t("discover.deleteSkippedFailed"));
			}
		} catch (err) {
			setDeleteError((err as Error).message);
			console.error(err);
		} finally {
			setBulkDeleting(false);
		}
	};

	const handleTriageVisible = async () => {
		if (jobs.length === 0) return;
		setTriaging(true);
		setTriageError(null);
		try {
			const res = await fetch("/api/jobs/triage", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jobIds: jobs.map((job) => job.id) }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data.success === false) {
				setTriageError(data.error || "Could not sort visible jobs.");
				return;
			}
			await fetchJobs();
		} catch (err) {
			setTriageError((err as Error).message);
		} finally {
			setTriaging(false);
		}
	};

	const pills: Array<{ id: TriageFilter; label: string }> = [
		{ id: "all", label: t("discover.pills.all") },
		{ id: "WORTH_APPLYING", label: t("jobcard.triageWorth") },
		{ id: "MAYBE", label: t("jobcard.triageMaybe") },
		{ id: "SAVED", label: t("discover.tabs.saved") },
		{ id: "SKIP", label: t("jobcard.triageSkip") },
	];

	return (
		<div className="flex-1 flex flex-col min-w-0 bg-background">
			<main className="px-4 sm:px-8 py-6 md:py-8 max-w-[920px] w-full mx-auto flex flex-col gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
				{!hasJobs && !loading ? (
					<section className="rounded-3xl bg-card border border-border p-8 sm:p-12 shadow-[0_16px_48px_-24px_rgba(19,20,23,0.25)]">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{dateLine}
						</p>
						<h1 className="mt-3 text-3xl sm:text-[40px] leading-[1.05] font-heading text-balance max-w-[16ch]">
							{t("discover.onboard.title")}
						</h1>
						<p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty max-w-[52ch]">
							{t("discover.onboard.desc")}
						</p>
						<ol className="mt-8 grid gap-3 sm:grid-cols-3">
							{[
								{ Icon: Cpu, title: t("discover.onboard.step1t"), desc: t("discover.onboard.step1d") },
								{ Icon: FileText, title: t("discover.onboard.step2t"), desc: t("discover.onboard.step2d") },
								{ Icon: Search, title: t("discover.onboard.step3t"), desc: t("discover.onboard.step3d") },
							].map((step, i) => (
								<li key={step.title} className="rounded-2xl bg-muted/60 p-4">
									<span className="flex size-10 items-center justify-center rounded-2xl bg-card text-foreground shadow-xs">
										<step.Icon className="size-5" aria-hidden="true" />
									</span>
									<p className="mt-3 text-sm font-semibold">
										<span className="mr-1.5 tabular-nums text-muted-foreground">{i + 1}.</span>
										{step.title}
									</p>
									<p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.desc}</p>
								</li>
							))}
						</ol>
						<div className="mt-8 flex flex-col sm:flex-row gap-2">
							<Button size="lg" onClick={() => setIsSearchModalOpen(true)}>
								{t("discover.findRoles")}
							</Button>
							<Link
								href="/setup"
								className="inline-flex h-12 items-center justify-center rounded-2xl px-6 text-[15px] font-semibold text-foreground hover:bg-muted motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
							>
								{t("setup.firstRunAction")}
							</Link>
						</div>
					</section>
				) : (
					<>
						<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{dateLine}
								</p>
								<h1 className="mt-2 text-[28px] sm:text-4xl font-heading text-balance">
									{t("discover.hero.title")}
								</h1>
								<p aria-live="polite" className="mt-1.5 text-[15px] text-muted-foreground">
									{heroSub}
								</p>
							</div>
							<Button size="lg" onClick={() => setIsSearchModalOpen(true)} className="shrink-0 w-full sm:w-auto">
								<Plus className="size-4" aria-hidden="true" />
								{t("discover.findRoles")}
							</Button>
						</div>

						<div className="rounded-3xl bg-card border border-border p-2 shadow-[0_8px_32px_-20px_rgba(19,20,23,0.3)] flex flex-col sm:flex-row sm:items-center gap-2">
							<div className="relative flex-1 min-w-0">
								{loading ? (
									<Loader2 className="size-5 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none animate-spin" aria-hidden="true" />
								) : (
									<Search className="size-5 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
								)}
								<label htmlFor="discover-search" className="sr-only">{t("discover.searchPlaceholder")}</label>
								<Input
									id="discover-search"
									name="search"
									type="search"
									autoComplete="off"
									spellCheck={false}
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									placeholder={t("discover.searchPlaceholder")}
									className="pl-12 h-12 border-0 bg-transparent shadow-none text-[15px] focus-visible:ring-0"
								/>
							</div>
							<div aria-hidden="true" className="hidden sm:block w-px self-stretch my-2 bg-border" />
							<div className="relative sm:w-52">
								<MapPin className="size-5 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
								<label htmlFor="discover-location" className="sr-only">{t("discover.locationPlaceholder")}</label>
								<Input
									id="discover-location"
									name="location"
									type="text"
									autoComplete="address-level2"
									inputMode="text"
									value={locationInput}
									onChange={(e) => setLocationInput(e.target.value)}
									placeholder={t("discover.locationPlaceholder")}
									className="pl-12 h-12 border-0 bg-transparent shadow-none text-[15px] focus-visible:ring-0"
								/>
							</div>
						</div>

						{triageCounts.UNSCORED > 0 && profileReady && (
							<div className="rounded-3xl bg-primary text-primary-foreground p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
								<div className="flex-1 min-w-0">
									<p className="font-bold tracking-tight text-lg">
										{t("discover.hero.review", { count: triageCounts.UNSCORED })}
									</p>
									<p className="mt-0.5 text-sm opacity-70">
										{t("discover.unscoredBacklogDescription")}
									</p>
								</div>
								<Button
									type="button"
									variant="secondary"
									size="lg"
									onClick={handleTriageVisible}
									disabled={triaging}
									className="shrink-0"
								>
									{triaging ? (
										<Loader2 className="size-4 animate-spin" aria-hidden="true" />
									) : (
										<Sparkles className="size-4" aria-hidden="true" />
									)}
									{t("discover.sortVisible")}
								</Button>
							</div>
						)}

						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between gap-3">
								<div role="group" aria-label="Filter roles" className="flex gap-2 overflow-x-auto -mx-1 px-1 py-0.5">
									{pills.map((pill) => {
										const pressed = triageFilter === pill.id;
										const count = pill.id === "all" ? triageCounts.all : triageCounts[pill.id];
										return (
											<button
												key={pill.id}
												type="button"
												aria-pressed={pressed}
												onClick={() => setTriageFilter(pill.id)}
												className={`inline-flex shrink-0 items-center gap-2 rounded-full h-10 px-4 text-sm tabular-nums touch-manipulation motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
													pressed
														? "bg-primary text-primary-foreground font-semibold"
														: "bg-card border border-border text-muted-foreground font-medium hover:text-foreground"
												}`}
											>
												{pill.label}
												<span className={pressed ? "opacity-70" : "text-muted-foreground/70"}>{count}</span>
											</button>
										);
									})}
								</div>
								<div className="flex shrink-0 items-center gap-1">
									{globalStats && globalStats.skipped > 0 && (
										<button
											type="button"
											onClick={handleDeleteSkipped}
											disabled={bulkDeleting}
											title={t("discover.deleteSkipped", { count: globalStats.skipped })}
											className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium text-muted-foreground hover:text-destructive touch-manipulation motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
										>
											{bulkDeleting ? (
												<Loader2 className="size-4 animate-spin" aria-hidden="true" />
											) : (
												<Trash2 className="size-4" aria-hidden="true" />
											)}
											<span className="hidden lg:inline tabular-nums">
												{t("discover.deleteSkipped", { count: globalStats.skipped })}
											</span>
										</button>
									)}
									<div className="hidden sm:block">
										<SearchInsights refreshKey={searchInsightsRefresh} />
									</div>
								</div>
							</div>

							<div className="flex items-center justify-between gap-3">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{t("discover.caption.top")}
								</h2>
								<Tabs
									value={activeTab}
									onValueChange={(value) =>
										setActiveTab(value as "best" | "newest" | "saved")
									}
								>
									<TabsList>
										<TabsTrigger value="best">
											{t("discover.tabs.recommended")}
										</TabsTrigger>
										<TabsTrigger value="newest">
											{t("discover.tabs.latest")}
										</TabsTrigger>
										<TabsTrigger value="saved">{t("discover.tabs.saved")}</TabsTrigger>
									</TabsList>
								</Tabs>
							</div>
						</div>

						{triageError && (
							<Alert variant="destructive" role="alert">
								<TriangleAlert aria-hidden="true" />
								<AlertDescription>{triageError}</AlertDescription>
							</Alert>
						)}

						{deleteError && (
							<Alert variant="destructive" role="alert">
								<TriangleAlert aria-hidden="true" />
								<AlertDescription>{deleteError}</AlertDescription>
							</Alert>
						)}

						{matchingPaused && (
							<Alert>
								<TriangleAlert aria-hidden="true" />
								<AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<span className="text-pretty">{t("discover.profileNeededDescription")}</span>
									<Link
										href="/setup"
										className="inline-flex h-10 w-fit items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
									>
										{t("setup.firstRunAction")}
									</Link>
								</AlertDescription>
							</Alert>
						)}

						{loading && jobs.length === 0 ? (
							<div
								className="flex flex-col gap-4"
								role="status"
								aria-label={t("discover.loading")}
								aria-busy="true"
							>
								<span className="sr-only">{t("discover.loading")}</span>
								{[0, 1, 2].map((i) => (
									<div key={i} aria-hidden="true" className="rounded-3xl border border-border bg-card p-5 sm:p-6 flex items-center gap-4">
										<Skeleton className="size-12 shrink-0 rounded-2xl" />
										<div className="flex flex-1 flex-col gap-2">
											<Skeleton className="h-4 w-2/3" />
											<Skeleton className="h-3 w-1/3" />
										</div>
										<Skeleton className="size-13 shrink-0 rounded-full" />
									</div>
								))}
							</div>
						) : visibleJobs.length === 0 ? (
							<Empty className="rounded-3xl border border-border bg-card py-12">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Briefcase aria-hidden="true" />
									</EmptyMedia>
									<EmptyTitle>{t("discover.filter.emptyTitle")}</EmptyTitle>
									<EmptyDescription>
										{t("discover.filter.emptyDesc")}
									</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button onClick={() => setTriageFilter("all")} variant="outline">
										{t("discover.filter.clear")}
									</Button>
								</EmptyContent>
							</Empty>
						) : (
							<>
								<div aria-busy={loading} className={`flex flex-col gap-4 motion-safe:transition-opacity motion-safe:duration-150 ${loading ? 'opacity-60' : ''}`}>
									{visibleJobs.map((job) => (
										<JobCard
											key={job.id}
											job={job}
											onSaveToggle={handleSaveToggle}
											onDelete={handleDeleteJob}
											onOpen={setDrawerJobId}
										/>
									))}
								</div>
							</>
						)}
					</>
				)}
			</main>

			<SearchModal
				isOpen={isSearchModalOpen}
				onClose={() => setIsSearchModalOpen(false)}
				onSearchComplete={() => {
					const nextState = {
						searchQuery: "",
						locationQuery: "",
						remoteFilter: "all",
						activeTab: "newest" as const,
					};
					setSearchQuery(nextState.searchQuery);
					setLocationQuery(nextState.locationQuery);
					setRemoteFilter(nextState.remoteFilter);
					setActiveTab(nextState.activeTab);
					setTriageFilter("all");
					fetchJobs(nextState);
					setSearchInsightsRefresh((value) => value + 1);
				}}
			/>

			<JobDrawer
				jobId={drawerJobId}
				onClose={() => setDrawerJobId(null)}
				onChanged={() => fetchJobs()}
				onDeleted={(jobId) => handleDeleteJob(jobId)}
			/>
		</div>
	);
}
