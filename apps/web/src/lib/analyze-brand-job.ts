import {
	type AnalyzeBrandOptions,
	type BrandLocationSuggestion,
	cleanOnboardingUrl,
	DETECT_BRAND_LOCATION_QUEUE,
	type OnboardingSuggestion,
} from "@workspace/lib/onboarding";
import { getBoss } from "@/lib/boss-client";
import { cancelBrandJob, IN_FLIGHT_STATES, readBrandJob } from "@/lib/brand-jobs";

const queues = { location: DETECT_BRAND_LOCATION_QUEUE, analysis: "analyze-brand" } as const;

type BrandResearchStage = keyof typeof queues;

export interface BrandResearchJobRef {
	brandId: string;
	stage: BrandResearchStage;
	jobId: string;
}

interface BrandResearchInput extends AnalyzeBrandOptions {
	brandId: string;
	stage: BrandResearchStage;
}

export async function enqueueBrandResearch(input: BrandResearchInput): Promise<string> {
	const { brandId, stage, website, brandName, location, source } = input;
	const queue = queues[stage];
	const boss = await getBoss();
	const researchKey = JSON.stringify([
		cleanOnboardingUrl(website) || website,
		brandName ?? "",
		location ?? null,
		source ?? "website",
	]);
	const jobs = await boss.findJobs(queue, { data: { brandId, researchKey } });
	const inFlight = jobs.find((job) => IN_FLIGHT_STATES.has(job.state));
	if (inFlight) return inFlight.id;

	const jobId = await boss.send(queue, { ...input, researchKey });
	if (!jobId) throw new Error("Could not enqueue brand research.");
	return jobId;
}

export async function getBrandResearchStatus({ brandId, stage, jobId }: BrandResearchJobRef) {
	if (stage === "location") {
		const job = await readBrandJob<BrandLocationSuggestion>(
			queues.location,
			brandId,
			"Couldn't detect a location. Enter it below to continue.",
			jobId,
		);
		return job.status === "done" ? { status: "done" as const, stage, location: job.output } : job;
	}

	const job = await readBrandJob<OnboardingSuggestion>(
		queues.analysis,
		brandId,
		"Brand analysis failed. Please try again.",
		jobId,
	);
	return job.status === "done" ? { status: "done" as const, stage, suggestion: job.output } : job;
}

export async function cancelBrandResearch({ brandId, stage, jobId }: BrandResearchJobRef): Promise<void> {
	await cancelBrandJob(queues[stage], brandId, jobId);
}
