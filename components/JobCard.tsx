"use client";

import React from "react";
import { Bookmark, BookmarkCheck, Trash2, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
	ScoreRing,
	displayMatchScore,
	isAiCalibrated,
} from "@/components/ScoreRing";
import { CompanyLogo } from "@/components/CompanyLogo";
import { useI18n } from "@/components/I18nProvider";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

export interface JobCardProps {
	job: {
		id: string;
		title: string;
		company: string;
		companyWebsite?: string | null;
		companyLogo?: string | null;
		location?: string | null;
		remoteType: string;
		salaryMin?: number | null;
		salaryMax?: number | null;
		salaryCurrency?: string | null;
		technologies?: string | null;
		postedAt?: string | Date | null;
		viewCount?: number | null;
		source?: string | null;
		sourceLabels?: string[];
		match?: {
			matchScore: number;
			strongMatches: string;
			possibleIssues: string;
			missingSkills: string;
			aiInterpretation?: string | null;
			triageStatus?: string | null;
			triageReason?: string | null;
		} | null;
		application?: {
			status: string;
		} | null;
	};
	onSaveToggle?: (jobId: string, isSaved: boolean) => void;
	onDelete?: (jobId: string) => void;
	onOpen?: (jobId: string) => void;
}

function parseJsonArray(str?: string | null): string[] {
	if (!str) return [];
	try {
		return JSON.parse(str);
	} catch {
		return [];
	}
}

function JobCardInner({ job, onSaveToggle, onDelete, onOpen }: JobCardProps) {
	const { t } = useI18n();
	const confirm = useConfirm();
	const isSaved = job.application?.status === "SAVED";

	const strongMatches = parseJsonArray(job.match?.strongMatches);
	const techs = parseJsonArray(job.technologies);

	const open = (e?: React.SyntheticEvent) => {
		e?.stopPropagation();
		onOpen?.(job.id);
	};

	const handleSave = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const newStatus = isSaved ? "NEW" : "SAVED";
		try {
			const res = await fetch("/api/applications", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jobId: job.id, status: newStatus }),
			});
			if (res.ok && onSaveToggle) {
				onSaveToggle(job.id, !isSaved);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const handleDelete = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
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
			const res = await fetch(`/api/jobs/${job.id}`, {
				method: "DELETE",
			});
			if (res.ok && onDelete) {
				onDelete(job.id);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const hasScore = Boolean(job.match);
	const score = displayMatchScore(job.match);
	const calibrated = isAiCalibrated(job.match);
	const triageStatus = job.match?.triageStatus || "UNREVIEWED";
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

	let salaryStr = "";
	if (job.salaryMin || job.salaryMax) {
		const curr = job.salaryCurrency || "USD";
		if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
			salaryStr = `${formatCurrency(job.salaryMin, curr)} – ${formatCurrency(job.salaryMax, curr)}`;
		} else {
			salaryStr = formatCurrency(job.salaryMax || job.salaryMin, curr);
		}
	}

	const remoteLabel =
		job.remoteType !== "unknown"
			? job.remoteType === "remote"
				? t("discover.workplace.remote")
				: job.remoteType === "hybrid"
					? t("discover.workplace.hybrid")
					: t("discover.workplace.onsite")
			: null;

	// One context line carries the verdict + the most useful explanation.
	const contextText =
		job.match?.triageReason ||
		job.match?.aiInterpretation ||
		(strongMatches.length > 0
			? `${t("jobcard.strongMatchFor")} ${strongMatches.slice(0, 3).join(", ")}`
			: null);

	return (
		<article
			onClick={() => onOpen?.(job.id)}
			onKeyDown={(e) => {
				const tag = (e.target as HTMLElement).tagName;
				if (
					e.key === "Enter" &&
					tag !== "BUTTON" &&
					tag !== "INPUT" &&
					tag !== "A"
				) {
					e.preventDefault();
					onOpen?.(job.id);
				}
			}}
			tabIndex={0}
			aria-label={`${job.title} at ${job.company}${hasScore ? `, match ${score} percent` : ""}. ${t("jobcard.view")}`}
			className={cn(
				"rounded-3xl border border-border bg-card p-5 cursor-pointer outline-none",
				"shadow-[0_12px_40px_-24px_rgba(19,20,23,0.25)]",
				"motion-safe:transition-colors motion-safe:duration-150 hover:border-primary/25 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring",
				triageStatus === "SKIP" && "opacity-75",
			)}
		>
			<div className="flex items-center gap-3.5">
				<CompanyLogo
					company={job.company}
					website={job.companyWebsite}
					directLogoUrl={job.companyLogo}
					size={44}
					className="rounded-2xl"
				/>
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-heading text-base lg:text-[20px] font-bold text-foreground">
						{job.title}
					</h3>
					<p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
						<span className="truncate font-medium">{job.company}</span>
						{job.location && (
							<span className="inline-flex min-w-0 items-center gap-1">
								<MapPin className="size-3 shrink-0" aria-hidden="true" />
								<span className="truncate">{job.location}</span>
							</span>
						)}
						{remoteLabel && <span className="shrink-0">· {remoteLabel}</span>}
					</p>
				</div>
				{hasScore ? (
					<ScoreRing score={score} size={44} calibrated={calibrated} />
				) : (
					<span className="shrink-0 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
						{t("jobcard.unscored")}
					</span>
				)}
			</div>

			{(salaryStr || techs.length > 0) && (
				<div className="mt-3.5 flex flex-wrap items-center gap-2">
					{salaryStr && (
						<span className="text-sm font-bold tabular-nums tracking-tight">
							{salaryStr}
						</span>
					)}
					{techs.slice(0, 4).map((tech) => (
						<span
							key={tech}
							className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
						>
							{tech}
						</span>
					))}
				</div>
			)}

			{(triageLabel || contextText) && (
				<p className="mt-3 flex min-w-0 items-baseline gap-1.5 text-[13px] leading-relaxed">
					{triageLabel && (
						<>
							<span
								aria-hidden="true"
								className={cn(
									"size-1.5 shrink-0 self-center rounded-full",
									triageLabel.dot,
								)}
							/>
							<span
								className={cn("shrink-0 font-semibold", triageLabel.className)}
							>
								{triageLabel.text}
							</span>
						</>
					)}
					{contextText && (
						<span className="min-w-0 flex-1 truncate text-muted-foreground">
							{contextText}
						</span>
					)}
				</p>
			)}

			<div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/70 pt-3.5">
				<p className="text-xs tabular-nums text-muted-foreground">
					{t("jobcard.viewed", {
						count: job.viewCount || 0,
						unit: t(job.viewCount === 1 ? "jobcard.time" : "jobcard.times"),
					})}
				</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleSave}
						aria-label={isSaved ? t("jobcard.unsave") : t("jobcard.save")}
						aria-pressed={isSaved}
						title={isSaved ? t("jobcard.unsave") : t("jobcard.save")}
						className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
						className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 motion-safe:transition-colors cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Trash2 className="size-5" aria-hidden="true" />
					</button>
					<button
						type="button"
						onClick={open}
						className="ml-1 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 motion-safe:transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none touch-manipulation"
					>
						{t("jobcard.view")}
					</button>
				</div>
			</div>
		</article>
	);
}

export const JobCard = React.memo(JobCardInner);
