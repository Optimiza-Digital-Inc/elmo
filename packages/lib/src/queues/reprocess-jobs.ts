export const REPROCESS_QUEUE = "reprocess";

export const REPROCESS_QUEUE_OPTIONS = {
	policy: "stately",
	retryLimit: 2,
	retryDelay: 60,
	retryBackoff: true,
	expireInSeconds: 60 * 10,
} as const;

export interface ReprocessData {
	brandId: string;
	layers: ("extraction" | "interpretation")[];
}
