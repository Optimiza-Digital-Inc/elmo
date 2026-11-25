import { z } from "zod";
import { runStructuredResearchPrompt } from "./llm";
import { cleanSourceUrl, cleanUrl } from "./utils";

export const DETECT_BRAND_LOCATION_QUEUE = "detect-brand-location";
export const DETECT_BRAND_LOCATION_JOB_OPTIONS = {
	retryLimit: 1,
	retryDelay: 10,
	retryBackoff: false,
	expireInSeconds: 60 * 15,
};

export interface BrandLocation {
	country: string;
	city: string;
	serviceArea: string;
}

export interface BrandLocationSuggestion extends BrandLocation {
	sourceUrl: string | null;
}

const locationSchema = z.object({
	country: z.string().describe("Country the business serves. Empty if unclear or no single country applies."),
	city: z.string().describe("City of the relevant business location. Empty if unclear or no single city applies."),
	serviceArea: z
		.string()
		.describe("Explicitly stated customer coverage, including any regions served. Empty if unclear."),
	sourceUrl: z.string().describe("Public URL that supports the returned location fields. Empty if none was found."),
});

export async function detectBrandLocation({
	website,
	brandName,
}: {
	website: string;
	brandName?: string;
}): Promise<BrandLocationSuggestion> {
	const url = cleanUrl(website);
	if (!url) throw new Error(`Could not parse website "${website}"`);

	const result = await runStructuredResearchPrompt(
		`Find the customer market and business location for ${brandName || "the business"} at ${url}.
Use web search. Look for its contact, locations, service-area, or delivery pages and public listings that clearly match this business. Respect the specific branch or market if the URL points to one.
Use a public source that supports all populated fields. A street address can establish the city and country, but it does not establish the service area. Use explicitly stated coverage for the service area. Do not guess from the domain extension, language, or company name. If a field is uncertain, leave it empty.`,
		locationSchema,
	);
	const sourceUrl = cleanSourceUrl(result.sourceUrl);
	const country = result.country.trim().slice(0, 200);
	const city = result.city.trim().slice(0, 200);
	const serviceArea = result.serviceArea.trim().slice(0, 200);
	return sourceUrl && (country || city || serviceArea)
		? { country, city, serviceArea, sourceUrl }
		: { country: "", city: "", serviceArea: "", sourceUrl: null };
}
