import {
	type AnalyzeBrandOptions,
	analyzeBrand,
	type BrandLocationSuggestion,
	detectBrandLocation,
	type OnboardingSuggestion,
} from "@workspace/lib/onboarding";
import type { Job } from "pg-boss";

export interface AnalyzeBrandData extends AnalyzeBrandOptions {
	brandId: string;
}

/**
 * Run brand analysis as a background job.
 *
 * Brand analysis includes an LLM and web-search round trip that can outlast
 * reverse-proxy request timeouts. The web request returns after enqueueing and
 * polls the job's `output` via getJobById.
 *
 * The queue is registered with batchSize: 1, so `jobs` always holds exactly
 * one job and the returned suggestion becomes that job's output.
 */
export async function analyzeBrandJob(jobs: Job<AnalyzeBrandData>[]): Promise<OnboardingSuggestion> {
	const [job] = jobs;
	if (!job) {
		throw new Error("analyze-brand handler received an empty batch");
	}

	return analyzeBrand(job.data);
}

export async function detectBrandLocationJob(jobs: Job<AnalyzeBrandData>[]): Promise<BrandLocationSuggestion> {
	const [job] = jobs;
	if (!job) throw new Error("detect-brand-location handler received an empty batch");
	return detectBrandLocation(job.data);
}
