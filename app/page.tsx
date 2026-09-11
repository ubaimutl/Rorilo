"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { SearchModal } from "@/components/SearchModal";
import { SearchInsights } from "@/components/SearchInsights";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
import {
	Search,
	Loader2,
	Trash2,
	Sparkles,
	Briefcase,
	BookmarkCheck,
	Gauge,
	TriangleAlert,
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

export default function JobsPage() {
	const { t } = useI18n();
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
	const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
	const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [triaging, setTriaging] = useState(false);
	const [triageError, setTriageError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [profileReady, setProfileReady] = useState(cachedProfileReady);
	const [hasRestoredState, setHasRestoredState] = useState(false);
	const [searchInsightsRefresh, setSearchInsightsRefresh] = useState(0);
	const abortControllerRef = useRef<AbortController | null>(null);

	const skippedJobs = jobs.filter((job) => job.match?.triageStatus === "SKIP");
	const savedCount = jobs.filter(
		(job) => job.application?.status === "SAVED",
	).length;
	const worthApplyingCount = jobs.filter(
		(job) => job.match?.triageStatus === "WORTH_APPLYING",
	).length;
	const scoredJobs = jobs.filter((job) => job.match);
	const avgScore =
		scoredJobs.length > 0
			? `${Math.round(scoredJobs.reduce((sum, job) => sum + (job.match?.matchScore ?? 0), 0) / scoredJobs.length)}%`
			: "--";
	const matchingPaused = jobs.length > 0 && !profileReady;
	const unscoredBacklog =
		jobs.length > 0 && profileReady && scoredJobs.length === 0;

	const stats = [
		{
			icon: Briefcase,
			value: globalStats ? String(globalStats.visible) : "0",
			label: t("discover.stats.visible"),
		},
		{
			icon: BookmarkCheck,
			value: globalStats ? String(globalStats.saved) : "0",
			label: t("discover.stats.saved"),
		},
		{
			icon: Sparkles,
			value: globalStats ? String(globalStats.worthApplying) : "0",
			label: t("discover.stats.worth"),
		},
		{ 
			icon: Gauge, 
			value: globalStats && globalStats.avgScore !== null ? `${globalStats.avgScore}%` : "--", 
			label: t("discover.stats.avg") 
		},
	];

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

				setSelectedJobIds((current) =>
					current.filter((jobId) =>
						newJobs.some((job: any) => job.id === jobId),
					),
				);
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
				JSON.stringify({ searchQuery, locationQuery, remoteFilter, activeTab }),
			);
		} catch {}
	}, [searchQuery, locationQuery, remoteFilter, activeTab, hasRestoredState]);

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
	}, [locationInput, hasRestoredState]);	// Fetch jobs whenever the debounced query values or filters change
	// Note: First render from cache is synchronous so we don't need to fetch
	// if we restored from cache AND query parameters haven't changed yet.
	useEffect(() => {
		if (!hasRestoredState) return;
		const handler = setTimeout(() => {
			fetchJobs();
		}, 50);
		return () => clearTimeout(handler);
	}, [fetchJobs, hasRestoredState]);

	const toggleJobSelection = (jobId: string) => {
		setSelectedJobIds((current) =>
			current.includes(jobId)
				? current.filter((id) => id !== jobId)
				: [...current, jobId],
		);
	};

	const toggleAllVisible = () => {
		const visibleIds = jobs.map((job) => job.id);
		const allVisibleSelected =
			visibleIds.length > 0 &&
			visibleIds.every((id) => selectedJobIds.includes(id));
		setSelectedJobIds(allVisibleSelected ? [] : visibleIds);
	};

	const handleBulkDelete = async () => {
		if (selectedJobIds.length === 0) return;
		const shouldDelete = window.confirm(
			t("discover.deleteConfirmSelected", {
				count: selectedJobIds.length,
				plural: selectedJobIds.length === 1 ? "" : "s",
			}),
		);
		if (!shouldDelete) return;

		setBulkDeleting(true);
		setDeleteError(null);
		try {
			const idsToDelete = [...selectedJobIds];
			const res = await fetch("/api/jobs", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ids: idsToDelete }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				setJobs((current) =>
					current.filter((job) => !idsToDelete.includes(job.id)),
				);
				setSelectedJobIds([]);
			} else {
				setDeleteError(data.error || t("discover.deleteSelectedFailed"));
			}
		} catch (err) {
			setDeleteError((err as Error).message);
			console.error(err);
		} finally {
			setBulkDeleting(false);
		}
	};

	const handleDeleteSkipped = async () => {
		if (!globalStats || globalStats.skipped === 0) return;
		const shouldDelete = window.confirm(
			t("discover.deleteConfirmSkipped", {
				count: globalStats.skipped,
				plural: globalStats.skipped === 1 ? "" : "s",
			}),
		);
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
				setSelectedJobIds((current) =>
					current.filter((id) => !jobs.find(j => j.id === id && j.match?.triageStatus === "SKIP")),
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

	return (
		<div className="flex-1 flex flex-col min-w-0 bg-background">
			<PageHeader
				title={t("discover.title")}
				description={t("discover.description")}
				actions={
					<>
						{jobs.length > 0 && (
							<Button
								onClick={handleTriageVisible}
								size="sm"
								variant="outline"
								disabled={triaging}
								className="text-sm h-9 px-3.5"
							>
								{triaging ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Sparkles className="size-3.5" />
								)}
								<span>{t("discover.sortVisible")}</span>
							</Button>
						)}
						<SearchInsights refreshKey={searchInsightsRefresh} />
						<Button
							onClick={() => setIsSearchModalOpen(true)}
							size="sm"
							className="text-sm h-9 px-4"
						>
							{t("discover.findRoles")}
						</Button>
					</>
				}
			/>

			<main className="p-6 md:p-10 max-w-4xl w-full mx-auto flex flex-col gap-6">
				{(totalJobsInDb !== null ? totalJobsInDb > 0 : jobs.length > 0) && (
					<Card size="sm">
						<CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
							{stats.map((stat) => {
								const Icon = stat.icon;
								return (
									<div key={stat.label} className="flex items-center gap-3">
										<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
											<Icon className="size-4" />
										</span>
										<span className="min-w-0">
											<span className="block text-xl font-bold tracking-tight tabular-nums">
												{stat.value}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{stat.label}
											</span>
										</span>
									</div>
								);
							})}
						</CardContent>
					</Card>
				)}

				{/* Filters Bar */}
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
					<div className="relative flex-1">
						{loading ? (
							<Loader2 className="size-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none animate-spin" />
						) : (
							<Search className="size-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
						)}
						<Input
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
							placeholder={t("discover.searchPlaceholder")}
							className="pl-9 text-sm h-9"
						/>
					</div>

					<div className="w-full sm:w-44">
						<Input
							value={locationInput}
							onChange={(e) => setLocationInput(e.target.value)}
							placeholder={t("discover.locationPlaceholder")}
							className="text-sm h-9"
						/>
					</div>

					<div className="w-full sm:w-40">
						<select
							value={remoteFilter}
							onChange={(e) => setRemoteFilter(e.target.value)}
							aria-label={t("search.workplace")}
							className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-neutral-800 cursor-pointer"
						>
							<option value="all">{t("discover.workplace.all")}</option>
							<option value="remote">{t("discover.workplace.remote")}</option>
							<option value="hybrid">{t("discover.workplace.hybrid")}</option>
							<option value="onsite">{t("discover.workplace.onsite")}</option>
						</select>
					</div>
				</div>

				{/* View Tabs */}
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

				{triageError && (
					<Alert variant="destructive">
						<TriangleAlert />
						<AlertDescription>{triageError}</AlertDescription>
					</Alert>
				)}

				{deleteError && (
					<Alert variant="destructive">
						<TriangleAlert />
						<AlertDescription>{deleteError}</AlertDescription>
					</Alert>
				)}

				{matchingPaused && (
					<Alert>
						<TriangleAlert />
						<AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<span>{t("discover.profileNeededDescription")}</span>
							<Link
								href="/setup"
								className="inline-flex h-8 w-fit min-w-39.5 !no-underline items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
							>
								{t("setup.firstRunAction")}
							</Link>
						</AlertDescription>
					</Alert>
				)}

				{unscoredBacklog && (
					<Alert>
						<TriangleAlert />
						<AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<span>{t("discover.unscoredBacklogDescription")}</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={handleTriageVisible}
								disabled={triaging}
								className="h-8 w-fit text-xs"
							>
								{triaging ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Sparkles className="size-3.5" />
								)}
								<span>{t("discover.sortVisible")}</span>
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{(totalJobsInDb !== null ? totalJobsInDb > 0 : jobs.length > 0) && (
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
						<label className="flex items-center gap-2 text-sm text-neutral-700">
							<input
								type="checkbox"
								checked={
									jobs.length > 0 &&
									jobs.every((job) => selectedJobIds.includes(job.id))
								}
								onChange={toggleAllVisible}
								disabled={jobs.length === 0}
								className="size-4 rounded border-neutral-300 disabled:opacity-50"
							/>
							{t("discover.selectVisible")}
						</label>

						{(selectedJobIds.length > 0 || (globalStats && globalStats.skipped > 0)) && (
							<div className="flex flex-wrap items-center gap-3">
								{globalStats && globalStats.skipped > 0 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleDeleteSkipped}
										disabled={bulkDeleting}
										className="text-xs h-8"
									>
										{bulkDeleting ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											<Trash2 className="size-3.5" />
										)}
										<span>
											{t("discover.deleteSkipped", {
												count: globalStats.skipped,
											})}
										</span>
									</Button>
								)}
								{selectedJobIds.length > 0 && (
									<>
										<span className="text-sm text-neutral-500">
											{t("discover.selected", { count: selectedJobIds.length })}
										</span>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={handleBulkDelete}
											disabled={bulkDeleting}
											className="text-xs h-8"
										>
											{bulkDeleting ? (
												<Loader2 className="size-3.5 animate-spin" />
											) : (
												<Trash2 className="size-3.5" />
											)}
											<span>{t("discover.deleteSelected")}</span>
										</Button>
									</>
								)}
							</div>
						)}
					</div>
				)}

				{/* Jobs List */}
				{loading && jobs.length === 0 ? (
					<div
						className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-col gap-5"
						aria-label={t("discover.loading")}
					>
						{[0, 1, 2].map((i) => (
							<div key={i} className="flex items-center gap-4">
								<Skeleton className="size-11 shrink-0 rounded-full" />
								<div className="flex flex-1 flex-col gap-2">
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-3 w-1/3" />
								</div>
							</div>
						))}
					</div>
				) : jobs.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Briefcase />
							</EmptyMedia>
							<EmptyTitle>{t("discover.emptyTitle")}</EmptyTitle>
							<EmptyDescription>
								{t("discover.emptyDescription")}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => setIsSearchModalOpen(true)} size="sm">
								{t("discover.findRoles")}
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<div className={`flex flex-col gap-4 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
						{jobs.map((job) => (
							<JobCard
								key={job.id}
								job={job}
								selected={selectedJobIds.includes(job.id)}
								onSelectToggle={toggleJobSelection}
								onSaveToggle={() => fetchJobs()}
								onDelete={(jobId) => {
									setJobs((current) =>
										current.filter((item) => item.id !== jobId),
									);
									setSelectedJobIds((current) =>
										current.filter((id) => id !== jobId),
									);
								}}
							/>
						))}
					</div>
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
					setSelectedJobIds([]);
					fetchJobs(nextState);
					setSearchInsightsRefresh((value) => value + 1);
				}}
			/>
		</div>
	);
}
