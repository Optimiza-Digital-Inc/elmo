/**
 * The web app enqueues the work and then polls the job's result *by brand* —
 * callers prove access to the brand before reading a job's output.
 *
 * Callers can select a specific job within a brand or the most recent one.
 */

import type { JobWithMetadata } from "pg-boss";
import { getBoss } from "@/lib/boss-client";

export const IN_FLIGHT_STATES = new Set(["created", "active", "retry"]);

export type BrandJob = JobWithMetadata<Record<string, unknown>>;

export type BrandJobStatus<T> =
	| { status: "pending" }
	| { status: "done"; output: T }
	| { status: "failed"; error: string };

/** Newest first. Bounded by the queue's retention, so a brand only ever has a handful. */
export async function brandJobs(queue: string, brandId: string): Promise<BrandJob[]> {
	const boss = await getBoss();
	const jobs = await boss.findJobs<Record<string, unknown>>(queue, { data: { brandId } });
	return jobs.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());
}

export async function latestBrandJob(queue: string, brandId: string): Promise<BrandJob | undefined> {
	const [latest] = await brandJobs(queue, brandId);
	return latest;
}

async function findBrandJob(queue: string, brandId: string, jobId?: string): Promise<BrandJob | undefined> {
	if (!jobId) return latestBrandJob(queue, brandId);
	const boss = await getBoss();
	const [job] = await boss.findJobs<Record<string, unknown>>(queue, { id: jobId, data: { brandId } });
	return job;
}

/**
 * `failureMessage` is shown to the user when a job ends in a failed/cancelled
 * state. The real error (provider messages, stack traces) is already captured
 * server-side by the worker's Sentry wrapper; we never forward it to the browser.
 */
export async function readBrandJob<T>(
	queue: string,
	brandId: string,
	failureMessage: string,
	jobId?: string,
): Promise<BrandJobStatus<T>> {
	const job = await findBrandJob(queue, brandId, jobId);

	if (!job) return jobId ? { status: "failed", error: failureMessage } : { status: "pending" };
	if (job.state === "completed") return { status: "done", output: job.output as T };
	if (job.state === "failed" || job.state === "cancelled") {
		console.error(`[${queue}] job ended without a result`, { brandId, jobId: job.id, state: job.state });
		return { status: "failed", error: failureMessage };
	}
	return { status: "pending" };
}

export async function cancelBrandJob(queue: string, brandId: string, jobId?: string): Promise<void> {
	const job = await findBrandJob(queue, brandId, jobId);
	if (!job || !IN_FLIGHT_STATES.has(job.state)) return;
	const boss = await getBoss();
	try {
		await boss.cancel(queue, job.id);
	} catch {
		// Job may have completed between the read and the cancel — nothing to do.
	}
}
