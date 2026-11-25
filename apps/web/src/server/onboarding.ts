/**
 * Exports server functions only: any other export would drag server-only code
 * into the client bundle. Plain functions belong in ./onboarding-core.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cancelBrandResearch, enqueueBrandResearch, getBrandResearchStatus } from "@/lib/analyze-brand-job";
import { requireBrandSession } from "@/lib/auth/helpers";
import { saveWizardOnboarding, wizardOnboardingInputSchema } from "@/server/onboarding-core";

const researchStage = z.enum(["location", "analysis"]);
const researchJobRef = z.object({ brandId: z.string().min(1), stage: researchStage, jobId: z.uuid() });
const place = z.string().trim().max(200);

export const startAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1),
			stage: researchStage,
			website: z.string().min(1),
			brandName: z.string().optional(),
			location: z.object({ country: place, city: place, serviceArea: place }).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return { jobId: await enqueueBrandResearch(data) };
	});

/** POST so no cache can hold on to an early `pending`. */
export const getAnalyzeBrandStatusFn = createServerFn({ method: "POST" })
	.validator(researchJobRef)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return getBrandResearchStatus(data);
	});

export const cancelAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(researchJobRef)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await cancelBrandResearch(data);
		return { ok: true };
	});

export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.validator(wizardOnboardingInputSchema)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return saveWizardOnboarding(data);
	});
