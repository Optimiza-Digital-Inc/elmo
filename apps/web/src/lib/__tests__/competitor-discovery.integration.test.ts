import { db } from "@workspace/lib/db/db";
import { brands, competitors, runExtractions } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readCompetitorDiscovery } from "@/lib/competitor-discovery-read";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

let brand: string;
let other: string;
let localPrompt: string;
let otherPrompt: string;

beforeAll(async () => {
	brand = await createBrand({ name: "Acme" });
	other = await createBrand();
	await db
		.update(brands)
		.set({ aliases: ["Acme Co"] })
		.where(eq(brands.id, brand));
	await db.insert(competitors).values({ brandId: brand, name: "Oak Bakery", aliases: ["Oak"] });
	localPrompt = await createPrompt(brand);
	const second = await createPrompt(brand);
	otherPrompt = await createPrompt(other);

	for (const [brandId, promptId, mentions] of [
		[
			brand,
			localPrompt,
			[
				["Acme Co", 1],
				["Oak", 2],
				["Oak Bakery", 1],
				["Elm", 1],
			],
		],
		[
			brand,
			localPrompt,
			[
				["Elm", 2],
				["Oak Bakery", 1],
			],
		],
		[brand, second, [["ELM", 3]]],
		[other, otherPrompt, [["Foreign Business", 5]]],
	] as const) {
		const run = await createRun(brandId, promptId, {
			at: "2026-01-01T00:00:00Z",
			text: "Answer",
			brandMentioned: false,
		});
		await db
			.update(runExtractions)
			.set({
				businessMentions: mentions.map(([name, count], i) => ({ name, count, position: i + 1 })),
			})
			.where(eq(runExtractions.runId, run.id));
	}
	await createRun(brand, localPrompt, { at: "2026-01-02T00:00:00Z", text: "Pending", brandMentioned: false });
});

afterAll(async () => {
	await deleteBrand(brand);
	await deleteBrand(other);
});

it("ranks total occurrences across all prompts and averages one position per answer", async () => {
	const result = await readCompetitorDiscovery(brand);
	expect(result.businesses.map((r) => ({ ...r, name: r.name.toLowerCase() }))).toEqual([
		{ name: "elm", mentions: 6, position: 2 },
		{ name: "oak bakery", mentions: 4, position: 2 },
	]);
	expect(result.prompts).toHaveLength(2);
	expect(result.prompts.find((p) => p.id === localPrompt)).toMatchObject({ processed: 2, total: 3 });
});

it("filters mentions to the selected prompt within the brand", async () => {
	expect((await readCompetitorDiscovery(brand, localPrompt)).businesses).toEqual([
		{ name: "Oak Bakery", mentions: 4, position: 2 },
		{ name: "Elm", mentions: 3, position: 2.5 },
	]);
	expect((await readCompetitorDiscovery(brand, otherPrompt)).businesses).toEqual([]);
});
