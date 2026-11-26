import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns, prompts, runExtractions } from "@workspace/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export async function readCompetitorDiscovery(brandId: string, promptId?: string) {
	const [coverage, result] = await Promise.all([
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
		db.execute<{ name: string; mentions: number; position: number }>(sql`
				WITH subjects AS (
					SELECT name, aliases, true AS own FROM ${brands} WHERE id = ${brandId}
					UNION ALL
					SELECT name, aliases, false FROM ${competitors} WHERE brand_id = ${brandId}
				), names AS (
					SELECT DISTINCT ON (lower(trim(term))) lower(trim(term)) AS key, name, own
					FROM subjects, unnest(array_prepend(name, aliases)) term
					ORDER BY lower(trim(term)), own DESC, (term = name) DESC, name
				), per_answer AS (
					SELECT r.id, lower(coalesce(n.name, m.name)) AS key, min(coalesce(n.name, m.name)) AS name,
						sum(m.count) AS mentions, min(m.position) AS position
					FROM ${prompts} p JOIN ${promptRuns} r ON r.prompt_id = p.id
					JOIN ${runExtractions} e ON e.run_id = r.id
					CROSS JOIN LATERAL jsonb_to_recordset(e.business_mentions) AS m(name text, count int, position int)
					LEFT JOIN names n ON n.key = lower(m.name)
					WHERE p.brand_id = ${brandId} AND r.brand_id = ${brandId} AND n.own IS NOT TRUE
						${promptId ? sql`AND p.id = ${promptId}` : sql``}
					GROUP BY r.id, lower(coalesce(n.name, m.name))
				)
				SELECT min(name) AS name, sum(mentions)::float8 AS mentions, avg(position)::float8 AS position
				FROM per_answer GROUP BY key ORDER BY mentions DESC, position ASC, name
			`),
	]);
	return { prompts: coverage, businesses: result.rows };
}
