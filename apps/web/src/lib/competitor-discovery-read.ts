import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns, prompts, runExtractions } from "@workspace/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { resolveBusinessNames } from "./business-identity";

export async function readCompetitorDiscovery(brandId: string, promptId?: string) {
	const mentions = sql`
		SELECT r.id, p.id AS prompt_id, m.name, m.count, m.position
		FROM ${prompts} p JOIN ${promptRuns} r ON r.prompt_id = p.id
		JOIN ${runExtractions} e ON e.run_id = r.id
		CROSS JOIN LATERAL jsonb_to_recordset(e.business_mentions) AS m(name text, count int, position int)
		WHERE p.brand_id = ${brandId} AND r.brand_id = ${brandId}
	`;
	const [coverage, subjects, surfaces] = await Promise.all([
		db
			.select({
				id: prompts.id,
				value: prompts.value,
				processed: sql<number>`count(${runExtractions.businessMentions})::int`,
				total: sql<number>`count(${runExtractions.textContent})::int`,
			})
			.from(prompts)
			.leftJoin(promptRuns, and(eq(promptRuns.promptId, prompts.id), eq(promptRuns.brandId, brandId)))
			.leftJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
			.where(eq(prompts.brandId, brandId))
			.groupBy(prompts.id)
			.orderBy(asc(prompts.value), asc(prompts.id)),
		db.execute<{ name: string; aliases: string[]; own: boolean }>(sql`
			SELECT name, aliases, true AS own FROM ${brands} WHERE id = ${brandId}
			UNION ALL
			SELECT name, aliases, false FROM ${competitors} WHERE brand_id = ${brandId}
		`),
		db.execute<{ name: string }>(sql`SELECT DISTINCT name FROM (${mentions}) detected`),
	]);

	const names = resolveBusinessNames(
		surfaces.rows.map(({ name }) => name),
		subjects.rows,
	);
	if (!names.length) return { prompts: coverage, businesses: [] };

	const result = await db.execute<{ name: string; mentions: number; position: number }>(sql`
		WITH per_answer AS (
			SELECT m.id, n.key, min(n.name) AS name, sum(m.count) AS mentions, min(m.position) AS position
			FROM (${mentions}) m
			JOIN jsonb_to_recordset(${JSON.stringify(names)}::jsonb)
				AS n(surface text, key text, name text, own boolean) ON n.surface = m.name
			WHERE NOT n.own
				${promptId ? sql`AND m.prompt_id = ${promptId}` : sql``}
			GROUP BY m.id, n.key
		)
		SELECT min(name) AS name, sum(mentions)::float8 AS mentions, avg(position)::float8 AS position
		FROM per_answer GROUP BY key ORDER BY mentions DESC, position ASC, name
	`);
	const aliases = new Map<string, Map<string, string>>();
	for (const { surface, name, own } of names) {
		const key = surface.toLowerCase();
		if (own || key === name.toLowerCase()) continue;
		const variants = aliases.get(name) ?? new Map<string, string>();
		variants.set(key, surface);
		aliases.set(name, variants);
	}
	return {
		prompts: coverage,
		businesses: result.rows.map((row) => ({
			...row,
			aliases: [...(aliases.get(row.name)?.values() ?? [])]
				.sort((a, b) => a.length - b.length || a.localeCompare(b))
				.slice(0, 10),
		})),
	};
}
