"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	Loader2,
	Bookmark,
	BookmarkCheck,
	Trash2,
	Sparkles,
	MapPin,
	ArrowUpRight,
	Check,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
	ScoreRing,
	displayMatchScore,
	isAiCalibrated,
} from "@/components/ScoreRing";
import { CompanyLogo } from "@/components/CompanyLogo";
import { FormattedDescription } from "@/components/FormattedDescription";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/I18nProvider";
import { useConfirm } from "@/components/ConfirmDialog";
import { notify } from "@/components/AppNotifications";
import { cn } from "@/lib/utils";

function parseJsonArray(str?: string | null): string[] {
	if (!str) return [];
	try {
		const v = JSON.parse(str);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

interface JobDrawerProps {
	jobId: string | null;
	onClose: () => void;
	/** Refresh the underlying list (counts, saved state). */
	onChanged?: () => void;
	/** Remove the job from the underlying list after delete. */
	onDeleted?: (jobId: string) => void;
}

export function JobDrawer({
	jobId,
	onClose,
	onChanged,
	onDeleted,
}: JobDrawerProps) {
	const { t, locale } = useI18n();
	const router = useRouter();
	const confirm = useConfirm();
	const [job, setJob] = useState<any>(null);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [preparing, setPreparing] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);

	const fetchJob = useCallback(async (id: string) => {
		setLoading(true);
		setLoadError(null);
		try {
			const res = await fetch(`/api/jobs/${id}?trackView=1`);
			if (!res.ok) throw new Error(`Server responded ${res.status}`);
			const data = await res.json();
			setJob(data.job);
		} catch (err) {
			setLoadError((err as Error).message);
			setJob(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (jobId) fetchJob(jobId);
		else {
			setJob(null);
			setLoadError(null);
		}
	}, [jobId, fetchJob]);

	const isSaved = job?.application?.status === "SAVED";
	const hasScore = Boolean(job?.match);
	const score = displayMatchScore(job?.match);
	const calibrated = isAiCalibrated(job?.match);
	const strongMatches = parseJsonArray(job?.match?.strongMatches);
	const missingSkills = parseJsonArray(job?.match?.missingSkills);
	const techs = parseJsonArray(job?.technologies);

	let salaryStr = "";
	if (job?.salaryMin || job?.salaryMax) {
		const curr = job.salaryCurrency || "USD";
		if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
			salaryStr = `${formatCurrency(job.salaryMin, curr)} – ${formatCurrency(job.salaryMax, curr)}`;
		} else {
			salaryStr = formatCurrency(job.salaryMax || job.salaryMin, curr);
		}
	}

	const remoteLabel =
		job && job.remoteType !== "unknown"
			? job.remoteType === "remote"
				? t("discover.workplace.remote")
				: job.remoteType === "hybrid"
					? t("discover.workplace.hybrid")
					: t("discover.workplace.onsite")
			: null;

	const triageStatus = job?.match?.triageStatus || "UNREVIEWED";
	const triageLabel =
		triageStatus === "WORTH_APPLYING"
			? {
					text: t("jobcard.triageWorth"),
					className: "text-emerald-700 dark:text-emerald-300",
					dot: "bg-emerald-500",
				}
			: triageStatus === "MAYBE"
				? {
						text: t("jobcard.triageMaybe"),
						className: "text-amber-700 dark:text-amber-300",
						dot: "bg-amber-500",
					}
				: triageStatus === "SKIP"
					? {
							text: t("jobcard.triageSkip"),
							className: "text-destructive",
							dot: "bg-destructive/60",
						}
					: null;

	const handleSave = async () => {
		if (!job) return;
		try {
			const res = await fetch("/api/applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jobId: job.id,
					status: isSaved ? "NEW" : "SAVED",
				}),
			});
			if (res.ok) {
				setJob({
					...job,
					application: {
						...(job.application || {}),
						status: isSaved ? "NEW" : "SAVED",
					},
				});
				onChanged?.();
			}
		} catch (err) {
			console.error(err);
		}
	};

	const handleStatusChange = async (status: string) => {
		if (!job) return;
		setStatusSaving(true);
		try {
			const res = await fetch("/api/applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jobId: job.id, status }),
			});
			if (res.ok) {
				setJob({ ...job, application: { ...(job.application || {}), status } });
				onChanged?.();
			}
		} catch (err) {
			console.error(err);
		} finally {
			setStatusSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!job) return;
		const ok = await confirm({
			title: t("jobcard.deleteConfirm", {
				title: job.title,
				company: job.company,
			}),
			confirmLabel: t("jobcard.delete"),
			tone: "danger",
		});
		if (!ok) return;
		try {
			const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
			if (res.ok) {
				onDeleted?.(job.id);
				onChanged?.();
				onClose();
			}
		} catch (err) {
			console.error(err);
		}
	};

	const handlePrepare = async () => {
		if (!job) return;
		const alreadyPrepared =
			Array.isArray(job.application?.documents) &&
			job.application.documents.length > 0;
		if (alreadyPrepared) {
			const ok = await confirm({
				title: t("drafts.regenConfirm"),
				confirmLabel: t("drafts.regenerateShort"),
			});
			if (!ok) return;
		}
		setPreparing(true);
		try {
			const res = await fetch(`/api/jobs/${job.id}/prepare`, {
				method: "POST",
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data.success === false) {
				notify({
					title: data.error || t("jobdetail.prepareFailed"),
					type: "error",
				});
				return;
			}
			onChanged?.();
			onClose();
			router.push("/prepared");
		} catch (err) {
			notify({ title: (err as Error).message, type: "error" });
		} finally {
			setPreparing(false);
		}
	};

	return (
		<Sheet
			open={Boolean(jobId)}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent className="sm:max-w-2xl lg:max-w-3xl w-full p-0 gap-0">
				{loading || (!job && !loadError) ? (
					<div
						className="flex flex-col gap-4 p-6 sm:p-8"
						role="status"
						aria-label={t("discover.loading")}
					>
						<div className="flex items-center gap-4">
							<Skeleton className="size-14 shrink-0 rounded-2xl" />
							<div className="flex flex-1 flex-col gap-2">
								<Skeleton className="h-5 w-2/3" />
								<Skeleton className="h-4 w-1/3" />
							</div>
						</div>
						<Skeleton className="h-24 w-full rounded-2xl" />
						<Skeleton className="h-40 w-full rounded-2xl" />
					</div>
				) : loadError || !job ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
						<p className="text-sm font-semibold">
							{loadError || "Job not found."}
						</p>
						<Button variant="outline" onClick={onClose}>
							Close
						</Button>
					</div>
				) : (
					<>
						<SheetHeader className="p-5 sm:p-6 pb-4 border-b border-border text-left">
							<div className="flex items-start gap-4 pr-10">
								<CompanyLogo
									company={job.company}
									website={job.companyWebsite}
									directLogoUrl={job.companyLogo}
									size={52}
									className="rounded-2xl"
								/>
								<div className="min-w-0 flex-1">
									<SheetTitle className="text-xl font-bold tracking-tight text-balance leading-tight">
										{job.title}
									</SheetTitle>
									<SheetDescription className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
										<span className="font-medium">{job.company}</span>
										{job.location && (
											<span className="inline-flex items-center gap-1">
												· <MapPin className="size-3.5" aria-hidden="true" />{" "}
												{job.location}
											</span>
										)}
										{remoteLabel && <span>· {remoteLabel}</span>}
									</SheetDescription>
									{(salaryStr || techs.length > 0) && (
										<div className="mt-2.5 flex flex-wrap items-center gap-2">
											{salaryStr && (
												<span className="text-sm font-bold tabular-nums tracking-tight">
													{salaryStr}
												</span>
											)}
											{techs.slice(0, 5).map((tech: string) => (
												<span
													key={tech}
													className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
												>
													{tech}
												</span>
											))}
										</div>
									)}
								</div>
								{hasScore && (
									<ScoreRing
										score={score}
										size={56}
										calibrated={calibrated}
										className="shrink-0"
									/>
								)}
							</div>
						</SheetHeader>

						<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 lg:px-9 py-5 flex flex-col gap-6">
							{(triageLabel || job.match?.triageReason) && (
								<div className="rounded-2xl bg-muted/60 px-4 py-3">
									{triageLabel && (
										<p className="flex items-center gap-1.5 text-sm">
											<span
												aria-hidden="true"
												className={cn(
													"size-1.5 shrink-0 rounded-full",
													triageLabel.dot,
												)}
											/>
											<span
												className={cn("font-semibold", triageLabel.className)}
											>
												{triageLabel.text}
											</span>
										</p>
									)}
									{job.match?.triageReason && (
										<p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
											{job.match.triageReason}
										</p>
									)}
								</div>
							)}
							{hasScore &&
								(strongMatches.length > 0 ||
									missingSkills.length > 0 ||
									job.match?.aiInterpretation) && (
									<section>
										<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											{t("jobdetail.why")}
										</h3>
										{job.match?.aiInterpretation && (
											<p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
												{job.match.aiInterpretation}
											</p>
										)}
										{strongMatches.length > 0 && (
											<div className="mt-2.5 flex flex-wrap gap-2">
												{strongMatches
													.slice(0, 8)
													.map((m: string, i: number) => (
														<span
															key={i}
															className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 h-8 text-[13px] font-medium text-primary-foreground"
														>
															<Check className="size-3.5" aria-hidden="true" />
															{m}
														</span>
													))}
											</div>
										)}
										{missingSkills.length > 0 && (
											<div className="mt-2.5 flex flex-wrap gap-2">
												{missingSkills
													.slice(0, 8)
													.map((m: string, i: number) => (
														<span
															key={i}
															className="inline-flex items-center rounded-full border border-border px-3 h-8 text-[13px] font-medium text-muted-foreground"
														>
															{m}
														</span>
													))}
											</div>
										)}
									</section>
								)}

							{job.description && (
								<section className="min-w-0">
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										{t("jobdetail.about")}
									</h3>
									<div className="mt-2 text-sm leading-relaxed">
										<FormattedDescription text={job.description} />
									</div>
								</section>
							)}

							<section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
								{(job.viewCount || 0) > 0 && (
									<span>
										{t("jobcard.viewed", {
											count: job.viewCount,
											unit: t(
												job.viewCount === 1 ? "jobcard.time" : "jobcard.times",
											),
										})}
									</span>
								)}
								{job.postedAt && (
									<span>
										{new Date(job.postedAt).toLocaleDateString(locale)}
									</span>
								)}
								{job.application?.status &&
									job.application.status !== "NEW" && (
										<span>
											{t("jobcard.status")}{" "}
											<strong className="font-medium lowercase">
												{String(job.application.status).replace("_", " ")}
											</strong>
										</span>
									)}
							</section>
						</div>

						<SheetFooter className="p-4 sm:px-6 border-t border-border bg-popover flex-col gap-2">
							<div className="flex items-center gap-2">
								<Button
									size="lg"
									onClick={handlePrepare}
									disabled={preparing}
									className="flex-1"
								>
									{preparing ? (
										<Loader2
											className="size-4 animate-spin"
											aria-hidden="true"
										/>
									) : (
										<Sparkles className="size-4" aria-hidden="true" />
									)}
									{preparing
										? t("material.preparing")
										: t("material.prepareApplication")}
								</Button>
								<button
									type="button"
									onClick={handleSave}
									aria-label={isSaved ? t("jobcard.unsave") : t("jobcard.save")}
									aria-pressed={isSaved}
									title={isSaved ? t("jobcard.unsave") : t("jobcard.save")}
									className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									{isSaved ? (
										<BookmarkCheck
											className="size-5 text-primary"
											aria-hidden="true"
										/>
									) : (
										<Bookmark className="size-5" aria-hidden="true" />
									)}
								</button>
								<button
									type="button"
									onClick={handleDelete}
									aria-label={t("jobcard.delete")}
									title={t("jobcard.delete")}
									className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<Trash2 className="size-5" aria-hidden="true" />
								</button>
							</div>
							<div className="flex items-center gap-2">
								<label htmlFor="drawer-status" className="sr-only">
									{t("tracker.statusAria")}
								</label>
								<select
									id="drawer-status"
									value={job.application?.status || "NEW"}
									onChange={(e) => handleStatusChange(e.target.value)}
									disabled={statusSaving}
									className="h-10 flex-1 rounded-2xl border border-border bg-transparent px-3 text-sm font-medium cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
								>
									<option value="NEW">{t("jobdetail.unapplied")}</option>
									<option value="SAVED">{t("discover.tabs.saved")}</option>
									<option value="READY">{t("drafts.statusReady")}</option>
									<option value="APPLIED">{t("tracker.colApplied")}</option>
									<option value="INTERVIEW">{t("tracker.colInterview")}</option>
									<option value="REJECTED">{t("tracker.colRejected")}</option>
									<option value="OFFER">{t("tracker.colOffer")}</option>
								</select>
								<Link
									href={`/jobs/${job.id}`}
									onClick={onClose}
									className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl px-3 text-sm font-semibold text-muted-foreground hover:text-primary hover:bg-primary/[0.07] motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-manipulation"
								>
									{t("jobcard.viewFull")}
									<ArrowUpRight className="size-4" aria-hidden="true" />
								</Link>
							</div>
						</SheetFooter>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
