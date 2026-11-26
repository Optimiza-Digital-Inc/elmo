import { discoverBusinessMentions } from "@workspace/lib/business-mentions";
import { db } from "@workspace/lib/db/db";
import { runExtractions } from "@workspace/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export const DISCOVER_BUSINESSES_QUEUE = "discover-businesses";

export async function discoverBusinessesJob(): Promise<void> {
	const deadline = Date.now() + 50_000;
	do {
		const lease = new Date(Date.now() + 30 * 60_000);
		const { rows } = await db.execute<{ run_id: string; text_content: string }>(sql`
			WITH pending AS (
				SELECT run_id FROM ${runExtractions}
				WHERE business_mentions IS NULL AND text_content IS NOT NULL
					AND coalesce(discovery_after, '-infinity'::timestamptz) <= now()
				ORDER BY coalesce(discovery_after, '-infinity'::timestamptz), run_id
				LIMIT 4 FOR UPDATE SKIP LOCKED
			)
			UPDATE ${runExtractions} e SET discovery_after = ${lease.toISOString()}
			FROM pending WHERE e.run_id = pending.run_id
			RETURNING e.run_id, e.text_content
		`);
		if (!rows.length) return;
		const results = await Promise.allSettled(
			rows.map(async (row) => {
				const mentions = await discoverBusinessMentions(row.text_content);
				await db
					.update(runExtractions)
					.set({ businessMentions: mentions, discoveryAfter: null })
					.where(and(eq(runExtractions.runId, row.run_id), eq(runExtractions.discoveryAfter, lease)));
			}),
		);
		for (const result of results) {
			if (result.status === "rejected") throw result.reason;
		}
	} while (Date.now() < deadline);
}
