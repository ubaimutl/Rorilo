"use client";

import React, { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Bookmark, Plus, X, RotateCcw } from "lucide-react";
import {
	mergeAvailableActors,
	KNOWN_JOB_SOURCES,
	orderApifyPicker,
} from "@/lib/job-sources/sources";
import { orderFreeSources } from "@/lib/job-sources/free";
import {
	summarizeSearchOutcome,
	type SearchSummary,
} from "@/lib/jobs/search-summary";
import {
	COUNTRY_OPTIONS,
	normalizeCountryCode,
	sourceCoverageGroupTitle,
	sourceCoverageLabel,
	sourceCoveragePriority,
	sourceCoversCountry,
} from "@/lib/job-sources/countries";
import { useI18n } from "./I18nProvider";

export interface SearchModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSearchComplete: (jobIds?: string[]) => void;
}

export interface SearchPreset {
	id: string;
	name: string;
	title: string;
	country: string;
	location: string;
	remote: "remote" | "hybrid" | "onsite" | "any";
	limit: number;
}

const DEFAULT_PRESETS: SearchPreset[] = [
	{
		id: "preset-general-software",
		name: "General software",
		title: "Software Developer",
		country: "DE",
		location: "",
		remote: "any",
		limit: 10,
	},
];

const LAST_SEARCH_KEY = "rorilo_last_search";
const PRESETS_KEY = "rorilo_search_presets";

export function SearchModal({
	isOpen,
	onClose,
	onSearchComplete,
}: SearchModalProps) {
	const { t } = useI18n();
	const [title, setTitle] = useState("Software Developer");
	const [country, setCountry] = useState("DE");
	const [profileCountry, setProfileCountry] = useState("DE");
	const [location, setLocation] = useState("");
	const [remote, setRemote] = useState<"remote" | "hybrid" | "onsite" | "any">(
		"any",
	);
	const [availableActors, setAvailableActors] = useState<string[]>([]);
	const [selectedActors, setSelectedActors] = useState<string[]>([]);
	const [selectedFree, setSelectedFree] = useState<string[]>([]);
	const [freeReady, setFreeReady] = useState<Record<string, boolean>>({
		arbeitsagentur: true,
		arbeitnow: true,
		jobicy: true,
		remoteok: true,
		remotive: true,
		adzuna: false,
		techmap: false,
		ats: false,
	});
	const [datePosted, setDatePosted] = useState<
		"any" | "24h" | "week" | "month"
	>("any");
	const [limit, setLimit] = useState(10);
	const [loading, setLoading] = useState(false);
	const [loadingPhase, setLoadingPhase] = useState<"searching" | "triaging">(
		"searching",
	);
	const [error, setError] = useState<string | null>(null);
	const [summary, setSummary] = useState<SearchSummary | null>(null);
	const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

	// Presets state
	const [presets, setPresets] = useState<SearchPreset[]>([]);
	const [activePresetId, setActivePresetId] = useState<string | null>(null);
	const [isAddingPreset, setIsAddingPreset] = useState(false);
	const [newPresetName, setNewPresetName] = useState("");

	// Load presets and last search on open
	useEffect(() => {
		if (!isOpen) return;
		setError(null);
		setSummary(null);
		setNeedsProfileSetup(false);

		// 1. Load presets from localStorage or use defaults
		try {
			const savedPresets = localStorage.getItem(PRESETS_KEY);
			if (savedPresets) {
				setPresets(JSON.parse(savedPresets));
			} else {
				setPresets(DEFAULT_PRESETS);
				localStorage.setItem(PRESETS_KEY, JSON.stringify(DEFAULT_PRESETS));
			}
		} catch {
			setPresets(DEFAULT_PRESETS);
		}

		// 2. Load last search inputs
		try {
			const lastSearchRaw = localStorage.getItem(LAST_SEARCH_KEY);
			if (lastSearchRaw) {
				const lastSearch = JSON.parse(lastSearchRaw);
				if (lastSearch.title) setTitle(lastSearch.title);
				if (lastSearch.location !== undefined) setLocation(lastSearch.location);
				if (lastSearch.remote) setRemote(lastSearch.remote);
				if (lastSearch.limit) setLimit(lastSearch.limit);
				if (["any", "24h", "week", "month"].includes(lastSearch.datePosted)) {
					setDatePosted(lastSearch.datePosted);
				}
			}
		} catch {}

		// 3. Load profile and available actors from settings.
		let isMounted = true;
		Promise.all([
			fetch("/api/settings").then((res) => res.json()),
			fetch("/api/profile")
				.then((res) => res.json())
				.catch(() => ({})),
		])
			.then(([data, profileData]) => {
				if (!isMounted) return;
				const savedCountry = normalizeCountryCode(
					profileData.profile?.country || "DE",
				);
				setProfileCountry(savedCountry);
				let activeCountry = savedCountry;
				try {
					const lastSearchRaw = localStorage.getItem(LAST_SEARCH_KEY);
					if (lastSearchRaw) {
						const lastSearch = JSON.parse(lastSearchRaw);
						activeCountry = normalizeCountryCode(
							lastSearch.country || savedCountry,
						);
					}
				} catch {}
				setCountry(activeCountry);

				const saved: string[] = data.apify?.actorIds?.length
					? data.apify.actorIds
					: [];
				const actors = mergeAvailableActors(saved, KNOWN_JOB_SOURCES);
				let lastActors: string[] | null = null;
				let lastFree: string[] | null = null;
				try {
					const lastSearchRaw = localStorage.getItem(LAST_SEARCH_KEY);
					if (lastSearchRaw) {
						const lastSearch = JSON.parse(lastSearchRaw);
						if (Array.isArray(lastSearch.selectedActors)) {
							lastActors = lastSearch.selectedActors.filter(
								(item: unknown): item is string => typeof item === "string",
							);
						}
						if (Array.isArray(lastSearch.selectedFree)) {
							lastFree = lastSearch.selectedFree.filter(
								(item: unknown): item is string => typeof item === "string",
							);
						}
					}
				} catch {}
				setAvailableActors(actors);
				setSelectedActors(
					(lastActors ?? []).filter((actor) => actors.includes(actor)),
				);
				const hasCompanyBoards =
					Array.isArray(data.free?.boards) &&
					data.free.boards.some(
						(board: { enabled?: boolean }) => board.enabled !== false,
					);
				setSelectedFree(
					(lastFree ?? []).filter((id) =>
						orderFreeSources(activeCountry).some(
							(source) =>
								source.id === id &&
								(source.id !== "ats" || hasCompanyBoards) &&
								sourceCoversCountry(source.coverage, activeCountry),
						),
					),
				);
				const free = data.free || {};
				setFreeReady({
					arbeitsagentur: free.arbeitsagentur?.ready !== false,
					adzuna: Boolean(free.adzuna?.hasAppId && free.adzuna?.hasAppKey),
					techmap: Boolean(free.techmap?.hasKey),
					ats: hasCompanyBoards,
				});
			})
			.catch(() => {
				if (!isMounted) return;
				setAvailableActors(mergeAvailableActors([], KNOWN_JOB_SOURCES));
			});

		return () => {
			isMounted = false;
		};
	}, [isOpen]);

	const loadPreset = (preset: SearchPreset) => {
		setTitle(preset.title);
		setCountry(normalizeCountryCode(preset.country || profileCountry));
		setLocation(preset.location);
		setRemote(preset.remote);
		setLimit(preset.limit);
		setActivePresetId(preset.id);
	};

	const handleSavePreset = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newPresetName.trim()) return;

		const newPreset: SearchPreset = {
			id: `preset-${Date.now()}`,
			name: newPresetName.trim(),
			title,
			country,
			location,
			remote,
			limit,
		};

		const updated = [...presets, newPreset];
		setPresets(updated);
		setActivePresetId(newPreset.id);
		try {
			localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
		} catch {}
		setNewPresetName("");
		setIsAddingPreset(false);
	};

	const handleDeletePreset = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const updated = presets.filter((p) => p.id !== id);
		setPresets(updated);
		if (activePresetId === id) setActivePresetId(null);
		try {
			localStorage.setItem(PRESETS_KEY, JSON.stringify(updated));
		} catch {}
	};

	const knownActorIds = Object.values(KNOWN_JOB_SOURCES).map(
		(source) => source.actorId,
	);
	const customActorIds = availableActors.filter(
		(actor) => !knownActorIds.includes(actor),
	);

	const chooseCountry = (value: string) => {
		const nextCountry = normalizeCountryCode(value);
		setCountry(nextCountry);
		setActivePresetId(null);
		setSelectedActors((current) => {
			return current.filter((actor) => {
				const known = Object.values(KNOWN_JOB_SOURCES).find(
					(source) => source.actorId === actor,
				);
				return !known || sourceCoversCountry(known.coverage, nextCountry);
			});
		});
		setSelectedFree((current) => {
			return current.filter((id) => {
				const source = orderFreeSources(nextCountry).find(
					(item) => item.id === id,
				);
				return source && sourceCoversCountry(source.coverage, nextCountry);
			});
		});
	};

	const toggleActor = (actorId: string) => {
		setSelectedActors((current) =>
			current.includes(actorId)
				? current.filter((id) => id !== actorId)
				: [...current, actorId],
		);
	};

	const toggleFreeSource = (sourceId: string) => {
		setSelectedFree((current) =>
			current.includes(sourceId)
				? current.filter((id) => id !== sourceId)
				: [...current, sourceId],
		);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setLoadingPhase("searching");
		setError(null);

		// Persist last search to localStorage
		try {
			localStorage.setItem(
				LAST_SEARCH_KEY,
				JSON.stringify({
					title,
					country,
					location,
					remote,
					limit,
					datePosted,
					selectedActors,
					selectedFree,
				}),
			);
		} catch {}

		try {
			const res = await fetch("/api/jobs/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title,
					country,
					location,
					remote,
					actors: selectedActors,
					freeSources: selectedFree,
					datePosted,
					limit,
				}),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				const jobIds = Array.isArray(data.jobIds) ? data.jobIds : [];
				setNeedsProfileSetup(Boolean(data.needsProfileSetup));
				if (jobIds.length > 0) {
					setLoadingPhase("triaging");
					const triageRes = await fetch("/api/jobs/triage", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ jobIds }),
					});
					const triageData = await triageRes.json().catch(() => ({}));
					if (!triageRes.ok || triageData.success === false) {
						onSearchComplete(jobIds);
						setSummary(
							summarizeSearchOutcome(data.results, data.failedSources),
						);
						if (!data.needsProfileSetup) {
							setError(
								`Imported ${data.newJobs} new jobs, but triage did not finish: ${triageData.error || "Check AI provider settings."}`,
							);
						}
						return;
					}
				}

				onSearchComplete(jobIds);
				setSummary(summarizeSearchOutcome(data.results, data.failedSources));
			} else {
				setError(data.error || "Failed to execute job discovery");
			}
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain sm:max-w-2xl rounded-2xl p-5 sm:p-6">
				<DialogHeader>
					<div className="flex items-center justify-between pr-6">
						<DialogTitle className="text-sm font-semibold tracking-tight text-neutral-900 flex items-center gap-2">
							<Search className="size-4 text-neutral-600" />
							<span>{t("search.title")}</span>
						</DialogTitle>
					</div>
				</DialogHeader>

				{/* Presets Bar */}
				<div className="rounded-2xl border border-neutral-200/80 bg-muted/60 p-3.5 space-y-2.5">
					<div className="flex items-center justify-between text-xs">
						<span className="font-semibold text-neutral-700 flex items-center gap-1.5">
							<Bookmark className="size-3.5 text-neutral-500" />
							<span>{t("search.presets")}</span>
						</span>
						{!isAddingPreset && (
							<button
								type="button"
								onClick={() => setIsAddingPreset(true)}
								className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer transition-colors"
							>
								<Plus className="size-3" />
								<span>{t("search.savePreset")}</span>
							</button>
						)}
					</div>

					{/* Preset Buttons */}
					<div className="flex flex-wrap items-center gap-1.5">
						{presets.map((preset) => {
							const isActive = activePresetId === preset.id;
							return (
								<div
									key={preset.id}
									onClick={() => loadPreset(preset)}
									className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer transition-all ${
										isActive
											? "border-blue-500 bg-blue-50/80 text-blue-800 shadow-xs"
											: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100/60"
									}`}
								>
									<span>{preset.name}</span>
									<span className="text-xs text-neutral-400 group-hover:text-neutral-500 font-normal">
										({normalizeCountryCode(preset.country || profileCountry)} ·{" "}
										{preset.location || t("search.any")})
									</span>
									<button
										type="button"
										onClick={(e) => handleDeletePreset(preset.id, e)}
										className="opacity-60 hover:opacity-100 hover:text-red-600 p-0.5 ml-0.5 transition-opacity"
										title={t("search.deletePreset")}
									>
										<X className="size-2.5" />
									</button>
								</div>
							);
						})}
					</div>

					{/* Inline Add Preset Input */}
					{isAddingPreset && (
						<div className="pt-1.5 border-t border-neutral-200/60 flex items-center gap-2">
							<Input
								value={newPresetName}
								onChange={(e) => setNewPresetName(e.target.value)}
								placeholder={t("search.presetPh")}
								className="h-7 text-xs bg-white flex-1"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleSavePreset(e as any);
									}
									if (e.key === "Escape") setIsAddingPreset(false);
								}}
							/>
							<Button
								type="button"
								size="sm"
								onClick={handleSavePreset}
								className="h-7 text-xs px-2.5"
							>
								{t("search.save")}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setIsAddingPreset(false)}
								className="h-7 text-xs px-2 text-neutral-500"
							>
								{t("common.cancel")}
							</Button>
						</div>
					)}
				</div>

				<form onSubmit={handleSubmit} className="space-y-5 pt-1">
					<div className="space-y-1.5">
						<Label
							htmlFor="search-title"
							className="text-xs font-medium text-neutral-700"
						>
							{t("search.roleKeywords")}
						</Label>
						<Input
							id="search-title"
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
								setActivePresetId(null);
							}}
							placeholder={t("search.titlePh")}
							className="h-10 text-sm"
							required
						/>
					</div>

					<div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
						<div className="space-y-1.5 flex-1 min-w-40">
							<Label
								htmlFor="search-country"
								className="text-xs font-medium text-neutral-700"
							>
								{t("search.country")}
							</Label>
							<select
								id="search-country"
								value={country}
								onChange={(e) => chooseCountry(e.target.value)}
								className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-neutral-900 cursor-pointer"
							>
								{COUNTRY_OPTIONS.map((option) => (
									<option key={option.code} value={option.code}>
										{option.name}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-1.5 flex-1 min-w-40">
							<Label
								htmlFor="search-loc"
								className="text-xs font-medium text-neutral-700"
							>
								{t("search.location")}
							</Label>
							<Input
								id="search-loc"
								value={location}
								onChange={(e) => {
									setLocation(e.target.value);
									setActivePresetId(null);
								}}
								placeholder={t("search.locationPh")}
								className="text-xs"
							/>
						</div>

						<div className="space-y-1.5 flex-1 min-w-40">
							<Label
								htmlFor="search-remote"
								className="text-xs font-medium text-neutral-700"
							>
								{t("search.workplace")}
							</Label>
							<select
								id="search-remote"
								value={remote}
								onChange={(e) => {
									setRemote(e.target.value as any);
									setActivePresetId(null);
								}}
								className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-neutral-900 cursor-pointer"
							>
								<option value="any">{t("search.anyWorkplace")}</option>
								<option value="remote">{t("search.remoteOnly")}</option>
								<option value="hybrid">{t("discover.workplace.hybrid")}</option>
								<option value="onsite">{t("discover.workplace.onsite")}</option>
							</select>
						</div>

						<div className="space-y-1.5 flex-1 min-w-40">
							<Label
								htmlFor="search-posted"
								className="text-xs font-medium text-neutral-700"
							>
								{t("search.posted")}
							</Label>
							<select
								id="search-posted"
								value={datePosted}
								onChange={(e) => {
									setDatePosted(e.target.value as any);
									setActivePresetId(null);
								}}
								className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-neutral-900 cursor-pointer"
							>
								<option value="any">{t("search.anyTime")}</option>
								<option value="24h">{t("search.last24h")}</option>
								<option value="week">{t("search.week")}</option>
								<option value="month">{t("search.month")}</option>
							</select>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex flex-col sm:flex-row gap-3">
							<div className="space-y-2 flex-1 min-w-0 rounded-2xl border border-blue-200 bg-blue-50/80 p-3 shadow-xs dark:border-blue-500/20 dark:bg-blue-500/8">
								<Label className="text-xs font-medium text-neutral-700">
									{t("search.apify")}{" "}
									<span className="font-normal text-neutral-400">
										({t("search.apifyHint")})
									</span>
								</Label>
								<div className="flex flex-wrap gap-1.5 overflow-y-auto pr-1">
									{orderApifyPicker(KNOWN_JOB_SOURCES, country).map(
										(source) => {
											const isSelected = selectedActors.includes(
												source.actorId,
											);
											const shortName = source.name.replace(
												/\s*\(.*\)\s*$/,
												"",
											);
											const covered = sourceCoversCountry(
												source.coverage,
												country,
											);
											const coverageLabel = sourceCoverageLabel(
												source.coverage,
												country,
											);
											return (
												<label
													key={source.id}
													title={`${source.tagline}${t("search.paidRun")}${covered ? "" : t("search.notTuned")}`}
													className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs cursor-pointer transition-colors ${
														isSelected
															? "border-blue-500 bg-blue-50/60 text-blue-900 font-medium"
															: "border-blue-200 bg-white text-neutral-700 hover:border-blue-300 hover:bg-blue-100/60 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-neutral-200 dark:hover:bg-blue-500/15"
													}`}
												>
													<input
														type="checkbox"
														checked={isSelected}
														onChange={() => toggleActor(source.actorId)}
														className="size-3.5 rounded border-neutral-300 cursor-pointer text-blue-600"
													/>
													<span>{shortName}</span>
													<span className="text-neutral-400 font-normal">
														{covered ? coverageLabel : t("search.other")}
													</span>
												</label>
											);
										},
									)}
								</div>
							</div>

							<div className="space-y-1.5 w-full sm:w-28 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-xs dark:border-white/10 dark:bg-white/5">
								<Label
									htmlFor="search-limit"
									className="text-xs font-medium text-neutral-700"
								>
									{t("search.limitEach")}
								</Label>
								<Input
									id="search-limit"
									type="number"
									min={1}
									max={50}
									value={limit}
									onChange={(e) => setLimit(Number(e.target.value))}
									className="text-xs"
								/>
							</div>
						</div>

						<div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/75 p-3 shadow-xs dark:border-emerald-500/20 dark:bg-emerald-500/8">
							<Label className="text-xs font-medium text-neutral-700">
								{t("search.freeSources")}{" "}
								<span className="font-normal text-neutral-400">
									({t("search.noApifyCost")})
								</span>
							</Label>
							{[0, 1, 2, 3].map((priority) => {
								const sources = orderFreeSources(country).filter(
									(source) =>
										sourceCoveragePriority(source.coverage, country) ===
										priority,
								);
								if (sources.length === 0) return null;
								return (
									<div
										key={priority}
										className="flex flex-wrap items-center gap-1.5"
									>
										<span className="text-xs text-neutral-400 font-medium w-full sm:w-auto sm:min-w-24">
											{sourceCoverageGroupTitle(priority, country, t)}
										</span>
										{sources.map((source) => {
											const isSelected = selectedFree.includes(source.id);
											const ready = freeReady[source.id] !== false;
											const covered = sourceCoversCountry(
												source.coverage,
												country,
											);
											const coverageLabel = sourceCoverageLabel(
												source.coverage,
												country,
											);
											const keyNote =
												source.id === "ats"
													? ready
														? t("search.boardsSet")
														: t("search.needsBoards")
													: source.needsKey
														? ready
															? t("search.keySet")
															: t("search.needsKey")
														: t("search.noKey");
											return (
												<label
													key={source.id}
													title={
														ready
															? `${source.tagline}${covered ? "" : t("search.notTuned")}`
															: `${source.tagline}${t("search.addKeys")}`
													}
													className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs cursor-pointer transition-colors ${
														isSelected
															? "border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium"
															: "border-emerald-200 bg-white text-neutral-700 hover:border-emerald-300 hover:bg-emerald-100/55 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-neutral-200 dark:hover:bg-emerald-500/15"
													}`}
												>
													<input
														type="checkbox"
														checked={isSelected}
														onChange={() => toggleFreeSource(source.id)}
														className="size-3.5 rounded border-neutral-300 cursor-pointer text-emerald-600"
													/>
													<span
														className={`size-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-400"}`}
														aria-hidden="true"
													/>
													<span>{source.name}</span>
													<span className="text-neutral-400 font-normal">
														{covered
															? `${coverageLabel} · ${keyNote}`
															: t("search.other")}
													</span>
												</label>
											);
										})}
									</div>
								);
							})}
						</div>

						{customActorIds.length > 0 ? (
							<div className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/75 p-3 shadow-xs dark:border-violet-500/20 dark:bg-violet-500/8">
								<Label className="text-xs font-medium text-neutral-700">
									{t("search.customActors")}{" "}
									<span className="font-normal text-neutral-400">
										{t("search.runsCredit")}
									</span>
								</Label>
								<div className="flex flex-wrap gap-1.5">
									{customActorIds.map((actor) => {
										const isSelected = selectedActors.includes(actor);
										return (
											<label
												key={actor}
												title={actor}
												className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs cursor-pointer transition-colors ${
													isSelected
														? "border-violet-500 bg-violet-50/70 text-violet-900 font-medium"
														: "border-violet-200 bg-white text-neutral-700 hover:border-violet-300 hover:bg-violet-100/55 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-neutral-200 dark:hover:bg-violet-500/15"
												}`}
											>
												<input
													type="checkbox"
													checked={isSelected}
													onChange={() => toggleActor(actor)}
													className="size-3.5 rounded border-neutral-300 cursor-pointer text-blue-600"
												/>
												<span className="font-mono">
													{actor.split("/")[1] || actor}
												</span>
											</label>
										);
									})}
								</div>
							</div>
						) : (
							<p className="rounded-2xl border border-violet-200 bg-violet-50/75 p-3 text-xs text-neutral-500 shadow-xs dark:border-violet-500/20 dark:bg-violet-500/8 dark:text-neutral-300">
								{t("search.customHint")}
							</p>
						)}
					</div>

					{error && (
						<p className="text-destructive text-xs font-medium">{error}</p>
					)}

					{summary && (
						<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 flex flex-col gap-2.5">
							<p className="text-sm font-semibold text-neutral-900">
								{summary.newJobs > 0
									? `${summary.newJobs} new role${summary.newJobs === 1 ? "" : "s"} added.`
									: "No new roles this run."}
							</p>
							<ul className="flex flex-col gap-1">
								{summary.lines.map((line) => (
									<li
										key={line.source}
										className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
									>
										<span className="font-medium text-neutral-700">
											{line.source}
										</span>
										<span className="text-neutral-500 tabular-nums">
											{line.discovered} found · {line.newJobs} new ·{" "}
											{line.duplicates} dupes
											{line.dismissed > 0
												? ` · ${line.dismissed} dismissed`
												: ""}
											{line.excluded > 0 ? ` · ${line.excluded} blocked` : ""}
										</span>
									</li>
								))}
								{summary.failures.map((failure) => (
									<li
										key={failure.source}
										className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
									>
										<span className="font-medium text-neutral-700">
											{failure.source}
										</span>
										<span className="text-red-600">
											{failure.error.slice(0, 120)}
										</span>
									</li>
								))}
							</ul>
							{needsProfileSetup && summary.newJobs > 0 && (
								<p className="text-xs text-neutral-500 leading-relaxed">
									{t("search.profileNeededAfterImport")}
								</p>
							)}
							{summary.allQuiet && (
								<p className="text-xs text-neutral-500 leading-relaxed">
									{summary.dismissed > 0 || summary.excluded > 0
										? "Matches were already dismissed or blocked by you earlier and stay hidden. "
										: ""}
									International boards rarely carry German-titled roles — try
									English keywords for them.
								</p>
							)}
							<div className="flex justify-end pt-1">
								<Button
									type="button"
									size="sm"
									onClick={onClose}
									className="text-xs h-8"
								>
									{t("common.done")}
								</Button>
							</div>
						</div>
					)}

					<div className="flex items-center justify-between pt-2 border-t border-neutral-100">
						<button
							type="button"
							onClick={() => {
								try {
									localStorage.removeItem(LAST_SEARCH_KEY);
									setTitle("Software Developer");
									setLocation("");
									setRemote("any");
									setLimit(10);
									setSelectedActors([]);
									setSelectedFree([]);
									setActivePresetId(null);
								} catch {}
							}}
							className="text-xs text-neutral-400 hover:text-neutral-600 flex items-center gap-1 cursor-pointer transition-colors"
							title={t("common.resetFields")}
						>
							<RotateCcw className="size-3" />
							<span>{t("common.resetFields")}</span>
						</button>

						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={onClose}
								className="text-xs"
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={
									loading ||
									(selectedActors.length === 0 && selectedFree.length === 0)
								}
								title={
									selectedActors.length === 0 && selectedFree.length === 0
										? "Select at least one Apify or free source"
										: undefined
								}
								className="text-xs shadow-xs"
							>
								{loading ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Search className="size-3.5" />
								)}
								<span>
									{loading
										? loadingPhase === "triaging"
											? t("search.triaging")
											: t("search.finding")
										: t("discover.findRoles")}
								</span>
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
