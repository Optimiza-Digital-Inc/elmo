/** Split from onboarding.ts so a client component importing a server function
 * does not transitively pull in drizzle and pg. */

import { slugify } from "@workspace/lib/app-urls";
import { dedupeAliases, dedupeDomains } from "@workspace/lib/citations/domain-categories";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { ensureOrganization } from "@workspace/lib/db/provisioning";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { claimNewBrandSlug, findUnusedBrandSlug } from "@workspace/lib/db/unique-names";
import {
	assertCanAddPrompts,
	assertCompetitorCap,
	getBrandOrganizationId,
	withQuotaLock,
} from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { normalizeBrandUpdate } from "@/lib/brand-settings";
import { normalizeProfileLinks, ownedDomainInputsSchema, profileLinksSchema } from "@/lib/business-links";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

export class BrandConflictError extends Error {
	constructor(public readonly brandId: string) {
		super(`Brand "${brandId}" already exists.`);
		this.name = "BrandConflictError";
	}
}

export class BrandNotFoundError extends Error {
	constructor(public readonly brandId: string) {
		super(`Brand "${brandId}" not found.`);
		this.name = "BrandNotFoundError";
	}
}

const competitorInputSchema = z.object({
	name: z.string().trim().min(1),
	domains: ownedDomainInputsSchema.optional().default([]),
	profileLinks: profileLinksSchema.optional(),
	aliases: z.array(z.string()).optional().default([]),
});

const promptInputSchema = z.object({
	value: z.string().min(1),
	tags: z.array(z.string()).optional().default([]),
	enabled: z.boolean().optional().default(true),
});

type CompetitorInput = z.infer<typeof competitorInputSchema>;
type PromptInput = z.infer<typeof promptInputSchema>;

export const createBrandInputSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1),
	domains: ownedDomainInputsSchema.optional(),
	profileLinks: profileLinksSchema.optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
	/** Omitted, an admin key provisions a new organization — the only way to
	 * create one over the API. */
	organizationId: z.string().min(1).optional(),
});

export const updateBrandBodySchema = z.object({
	brandName: z.string().min(1).optional(),
	domains: ownedDomainInputsSchema.optional(),
	profileLinks: profileLinksSchema.optional(),
	aliases: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
});

export const wizardOnboardingInputSchema = z.object({
	brandId: z.string().min(1),
	brandName: z.string().min(1).optional(),
	website: z.string().nullish(),
	profileLinks: profileLinksSchema.optional(),
	additionalDomains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
	competitors: z.array(competitorInputSchema).optional(),
	prompts: z.array(promptInputSchema).optional(),
});

export interface CreateBrandInput {
	id: string;
	name: string;
	website: string | null;
	additionalDomains?: string[];
	profileLinks?: string[];
	aliases?: string[];
	competitors?: CompetitorInput[];
	prompts?: PromptInput[];
	/** Null provisions one named after the brand id, which is right for an admin
	 * key standing up a tenant and wrong inside an existing workspace. */
	organizationId?: string | null;
	conn?: DbConnection;
	afterCommit?: (task: () => Promise<unknown>) => void;
}

export interface UpdateBrandInput {
	brandId: string;
	brandName?: string;
	website?: string | null;
	additionalDomains?: string[];
	profileLinks?: string[];
	aliases?: string[];
	enabled?: boolean;
}

export type WizardOnboardingInput = z.infer<typeof wizardOnboardingInputSchema>;

export interface BrandResult {
	id: string;
	name: string;
	organizationId: string;
	domains: string[];
	profileLinks: string[];
	aliases: string[];
	enabled: boolean;
	onboarded: boolean;
	enabledModels: string[] | null;
	delayOverrideHours: number | null;
	createdAt: Date;
	updatedAt: Date;
}

export function buildBrandResult(row: typeof brands.$inferSelect): BrandResult {
	const websiteHost = row.website ? new URL(row.website).hostname.replace(/^www\./, "") : null;
	return {
		id: row.id,
		name: row.name,
		organizationId: row.organizationId,
		domains: [websiteHost, ...row.additionalDomains].filter((domain) => domain !== null),
		profileLinks: row.profileLinks,
		aliases: row.aliases,
		enabled: row.enabled,
		onboarded: row.onboarded,
		enabledModels: row.enabledModels,
		delayOverrideHours: row.delayOverrideHours,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export class InvalidDomainsError extends Error {
	constructor(message = "domains: provide valid owned domains or an empty array") {
		super(message);
		this.name = "InvalidDomainsError";
	}
}

function splitDomainsForStorage(domains: string[]): { website: string | null; additionalDomains: string[] } {
	const cleaned = dedupeDomains(domains);
	if (domains.length > 0 && cleaned.length === 0) throw new InvalidDomainsError();
	const [primary, ...rest] = cleaned;
	return { website: primary ? `https://${primary}` : null, additionalDomains: rest };
}

export function apiCreateInputToInternal(input: z.infer<typeof createBrandInputSchema>): CreateBrandInput {
	const { website, additionalDomains } = splitDomainsForStorage(input.domains ?? []);
	return {
		id: input.id,
		name: input.name,
		website,
		additionalDomains,
		profileLinks: input.profileLinks,
		aliases: input.aliases,
		competitors: input.competitors,
		prompts: input.prompts,
		organizationId: input.organizationId ?? null,
	};
}

export function apiUpdateInputToInternal(
	brandId: string,
	input: z.infer<typeof updateBrandBodySchema>,
): UpdateBrandInput {
	const result: UpdateBrandInput = {
		brandId,
		brandName: input.brandName,
		profileLinks: input.profileLinks,
		aliases: input.aliases,
		enabled: input.enabled,
	};
	if (input.domains !== undefined) {
		const { website, additionalDomains } = splitDomainsForStorage(input.domains);
		result.website = website;
		result.additionalDomains = additionalDomains;
	}
	return result;
}

async function insertCompetitors(args: {
	brandId: string;
	websiteHost: string | null;
	source: CompetitorInput[];
	conn?: DbConnection;
}): Promise<number> {
	if (args.source.length === 0) return 0;
	const conn = args.conn ?? db;

	const existing = await conn.query.competitors.findMany({
		where: eq(competitors.brandId, args.brandId),
	});
	const existingDomains = new Set(existing.flatMap((c) => c.domains));

	const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
	const toInsert: (typeof competitors.$inferInsert)[] = [];
	for (const c of args.source) {
		const cleaned = dedupeDomains(c.domains).filter((d) => d !== args.websiteHost);
		if (c.domains.length > 0 && cleaned.length === 0) continue;
		const name = c.name.trim();
		if (cleaned.length === 0 && existingNames.has(name.toLowerCase())) continue;
		if (cleaned.some((d) => existingDomains.has(d))) continue;
		existingNames.add(name.toLowerCase());
		for (const domain of cleaned) existingDomains.add(domain);
		toInsert.push({
			brandId: args.brandId,
			name,
			domains: cleaned,
			profileLinks: normalizeProfileLinks(c.profileLinks ?? []),
			aliases: dedupeAliases(c.aliases),
		});
	}
	if (toInsert.length === 0) return 0;

	await assertCompetitorCap(args.brandId, toInsert.length, conn);

	await conn.insert(competitors).values(toInsert);
	return toInsert.length;
}

async function insertPrompts(args: {
	brandId: string;
	brandName: string;
	website: string | null;
	source: { value: string; tags: string[]; enabled: boolean }[];
	dedupeAgainstExisting: boolean;
	conn?: DbConnection;
	/** The brand row may still be uncommitted, so a lookup would find nothing. */
	organizationId?: string;
}): Promise<string[]> {
	if (args.source.length === 0) return [];
	const conn = args.conn ?? db;

	const seen = new Set<string>();
	if (args.dedupeAgainstExisting) {
		const existing = await conn.query.prompts.findMany({
			where: eq(prompts.brandId, args.brandId),
		});
		for (const p of existing) seen.add(p.value.toLowerCase());
	}

	const rows: Array<{
		brandId: string;
		value: string;
		enabled: boolean;
		tags: string[];
		systemTags: string[];
	}> = [];
	for (const p of args.source) {
		const value = p.value.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push({
			brandId: args.brandId,
			value,
			enabled: p.enabled,
			tags: p.tags,
			systemTags: computeSystemTags(value, args.brandName, args.website),
		});
	}
	if (rows.length === 0) return [];

	const organizationId = args.organizationId ?? (await getBrandOrganizationId(args.brandId));
	await assertCanAddPrompts(organizationId, rows.filter((r) => r.enabled).length, args.conn);

	const inserted = await conn.insert(prompts).values(rows).returning({ id: prompts.id, enabled: prompts.enabled });
	return inserted.filter((row) => row.enabled).map((row) => row.id);
}

export async function createBrand(input: CreateBrandInput): Promise<BrandResult> {
	const websiteHost = input.website ? new URL(input.website).hostname.replace(/^www\./, "") : null;

	const additionalDomains = dedupeDomains(input.additionalDomains ?? []).filter((d) => d !== websiteHost);
	const aliases = dedupeAliases(input.aliases ?? []);

	// One transaction for the whole aggregate: a brand with none of its prompts
	// cannot be retried past BrandConflictError.
	const organizationId = input.organizationId ?? input.id;
	const write = async (tx: DbConnection) => {
		if (!input.organizationId) {
			await ensureOrganization({ id: input.id, name: input.name }, tx);
		}
		const slug = await findUnusedBrandSlug(organizationId, slugify(input.name, "brand"), tx);

		const [inserted] = await tx
			.insert(brands)
			.values({
				id: input.id,
				organizationId,
				name: input.name,
				slug,
				website: input.website,
				additionalDomains,
				profileLinks: normalizeProfileLinks(input.profileLinks ?? []),
				aliases,
				enabled: true,
				onboarded: true,
			})
			.onConflictDoNothing({ target: brands.id })
			.returning({ id: brands.id });
		if (!inserted) throw new BrandConflictError(input.id);

		await insertCompetitors({
			brandId: input.id,
			websiteHost,
			source: input.competitors ?? [],
			conn: tx,
		});

		return await insertPrompts({
			brandId: input.id,
			brandName: input.name,
			website: input.website,
			source: (input.prompts ?? []).map((p) => ({
				value: p.value,
				tags: sanitizeUserTags(p.tags ?? []),
				enabled: p.enabled ?? true,
			})),
			dedupeAgainstExisting: false,
			conn: tx,
			organizationId,
		});
	};
	const promptIds = input.conn ? await write(input.conn) : await claimNewBrandSlug(() => db.transaction(write));

	// A scheduler for a rolled-back prompt would outlive it, and it queries
	// through the pool.
	const schedule = () => createMultiplePromptJobSchedulers(promptIds);
	if (input.afterCommit) input.afterCommit(schedule);
	else await schedule();

	const refreshed = await (input.conn ?? db).query.brands.findFirst({ where: eq(brands.id, input.id) });
	return buildBrandResult(refreshed!);
}

async function updateBrandRow(input: UpdateBrandInput, tx: DbConnection) {
	const normalized = normalizeBrandUpdate({
		name: input.brandName,
		website: input.website,
		additionalDomains: input.additionalDomains,
		profileLinks: input.profileLinks,
		aliases: input.aliases,
	});
	if (!normalized.ok) throw new Error(normalized.error);
	const [existing] = await tx.select().from(brands).where(eq(brands.id, input.brandId)).for("update");
	if (!existing) throw new BrandNotFoundError(input.brandId);

	const updates = normalized.updates;
	const website = updates.website === undefined ? existing.website : updates.website;
	const websiteHost = website ? new URL(website).hostname.replace(/^www\./, "") : null;
	if (updates.additionalDomains) updates.additionalDomains = updates.additionalDomains.filter((d) => d !== websiteHost);
	if (normalized.movedProfileLink) {
		updates.profileLinks = normalizeProfileLinks([...existing.profileLinks, normalized.movedProfileLink]);
	}

	const [updated] = await tx
		.update(brands)
		.set({ ...updates, enabled: input.enabled, updatedAt: new Date() })
		.where(eq(brands.id, input.brandId))
		.returning();
	return updated;
}

export async function updateBrand(input: UpdateBrandInput): Promise<BrandResult> {
	const updated = await db.transaction((tx) => updateBrandRow(input, tx));
	return buildBrandResult(updated);
}

export async function saveWizardOnboarding(input: WizardOnboardingInput): Promise<BrandResult> {
	const organizationId = await getBrandOrganizationId(input.brandId);
	return withQuotaLock(organizationId, async (tx, afterCommit) => {
		const brand = await updateBrandRow(input, tx);
		const websiteHost = brand.website ? new URL(brand.website).hostname.replace(/^www\./, "") : null;
		await insertCompetitors({
			brandId: input.brandId,
			websiteHost,
			source: input.competitors ?? [],
			conn: tx,
		});

		const promptIds = await insertPrompts({
			brandId: input.brandId,
			brandName: brand.name,
			website: brand.website,
			source: (input.prompts ?? []).map((p) => ({
				value: p.value,
				tags: sanitizeUserTags(p.tags ?? []),
				enabled: p.enabled ?? true,
			})),
			dedupeAgainstExisting: true,
			conn: tx,
			organizationId,
		});
		const [updated] = await tx.update(brands).set({ onboarded: true }).where(eq(brands.id, input.brandId)).returning();
		afterCommit(() => createMultiplePromptJobSchedulers(promptIds));
		return buildBrandResult(updated);
	});
}

export interface ListBrandsFilters {
	limit?: number;
	offset?: number;
	scope?: SQL;
}

export async function listBrands(filters: ListBrandsFilters): Promise<{ data: BrandResult[]; total: number }> {
	const where = filters.scope;
	const [totals] = await db.select({ count: count() }).from(brands).where(where);
	let query = db.select().from(brands).where(where).orderBy(desc(brands.createdAt)).$dynamic();
	if (filters.limit !== undefined) query = query.limit(filters.limit).offset(filters.offset ?? 0);
	const rows = await query;

	return { data: rows.map(buildBrandResult), total: totals?.count ?? 0 };
}
