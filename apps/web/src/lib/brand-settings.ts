import { cleanOwnedDomain, normalizeBusinessWebsite, normalizeProfileLinks } from "@/lib/business-links";

/**
 * Pure normalization/validation for the "edit brand settings" flow, kept out of
 * the updateBrand server function so the rules can be unit-tested without a
 * database or auth session. The server function applies auth and
 * persistence; this owns the field-level rules:
 *
 *  - name: trimmed; must be non-empty when provided
 *  - website: empty clears it; a recognized profile moves to profile links
 *  - additionalDomains: each cleaned/validated (hard error listing the invalid
 *    ones), then de-duplicated
 *  - aliases: trimmed, empties dropped, de-duplicated
 *
 * Only keys present on the input are touched, so a partial edit leaves the rest
 * of the brand untouched.
 */
export interface BrandUpdateInput {
	name?: string;
	website?: string | null;
	additionalDomains?: string[];
	profileLinks?: string[];
	aliases?: string[];
}

export type NormalizeBrandUpdateResult =
	| { ok: true; updates: BrandUpdateInput; movedProfileLink?: string }
	| { ok: false; error: string };

export function normalizeBrandUpdate(input: BrandUpdateInput): NormalizeBrandUpdateResult {
	const updates: BrandUpdateInput = {};
	let movedProfileLink: string | null = null;

	if (input.name !== undefined) {
		if (!input.name.trim()) {
			return { ok: false, error: "Brand name must be a non-empty string" };
		}
		updates.name = input.name.trim();
	}

	if (input.website !== undefined) {
		const result = normalizeBusinessWebsite(input.website);
		if (!result.ok) return result;
		updates.website = result.website;
		movedProfileLink = result.movedProfileLink;
	}

	if (input.profileLinks !== undefined) {
		updates.profileLinks = normalizeProfileLinks([
			...input.profileLinks,
			...(movedProfileLink ? [movedProfileLink] : []),
		]);
		movedProfileLink = null;
	}

	if (input.additionalDomains !== undefined) {
		const cleaned = input.additionalDomains.map(cleanOwnedDomain);
		const invalid = input.additionalDomains.filter((_, i) => !cleaned[i]);
		if (invalid.length > 0) {
			return { ok: false, error: `Invalid domain(s): ${invalid.join(", ")}` };
		}
		updates.additionalDomains = [...new Set(cleaned.filter(Boolean) as string[])];
	}

	if (input.aliases !== undefined) {
		updates.aliases = [...new Set(input.aliases.map((a) => a.trim()).filter(Boolean))];
	}

	return { ok: true, updates, ...(movedProfileLink && { movedProfileLink }) };
}
