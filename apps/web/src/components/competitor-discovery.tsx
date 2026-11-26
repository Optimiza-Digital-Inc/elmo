import { useQuery } from "@tanstack/react-query";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import type { CompetitorEntry } from "@/components/competitors-editor";
import { brandKeys } from "@/hooks/use-brands";
import { getCompetitorDiscovery } from "@/server/competitor-discovery";

interface Props {
	brandId: string;
	competitors: CompetitorEntry[];
	isSaving: boolean;
	onAdd: (name: string) => void;
}

export function CompetitorDiscovery({ brandId, competitors, isSaving, onAdd }: Props) {
	const [promptId, setPromptId] = useState("");
	const query = useQuery({
		queryKey: [...brandKeys.competitors(brandId), "discovery", promptId],
		queryFn: () => getCompetitorDiscovery({ data: { brandId, promptId: promptId || undefined } }),
		staleTime: 30_000,
		refetchInterval: (q) => (q.state.data?.prompts.some((p) => p.processed < p.total) ? 60_000 : false),
	});
	const coverage = (query.data?.prompts ?? []).filter((p) => !promptId || p.id === promptId);
	const total = coverage.reduce((sum, p) => sum + p.total, 0);
	const processed = coverage.reduce((sum, p) => sum + p.processed, 0);

	return (
		<section className="space-y-3" aria-labelledby="competitor-discovery-heading">
			<h2 id="competitor-discovery-heading" className="text-xl font-semibold">
				Competitor Suggestions
			</h2>
			<p className="text-sm text-muted-foreground">
				Each mention counts, including repeats in one response. Average position shows when a business first appears
				among the businesses named in each response.
			</p>
			<label className="flex flex-col gap-1 text-sm font-medium">
				Prompt
				<select
					className="h-9 w-full rounded-md border bg-background px-2"
					value={promptId}
					onChange={(e) => setPromptId(e.target.value)}
				>
					<option value="">All Prompts</option>
					{query.data?.prompts.map((p) => (
						<option key={p.id} value={p.id}>
							{p.value}
						</option>
					))}
				</select>
			</label>
			{query.isPending ? (
				<p className="text-sm text-muted-foreground">Loading mentions…</p>
			) : query.isError ? (
				<p role="alert" className="text-sm text-destructive">
					Couldn’t load competitor mentions.{" "}
					<button type="button" className="underline" onClick={() => query.refetch()}>
						Try Again
					</button>
				</p>
			) : (
				<>
					<p className="text-sm text-muted-foreground">
						{processed.toLocaleString()} of {total.toLocaleString()} responses analyzed.
					</p>
					{query.data.businesses.length ? (
						<DiscoveryTable
							key={promptId}
							businesses={query.data.businesses}
							competitors={competitors}
							isSaving={isSaving}
							onAdd={onAdd}
						/>
					) : (
						<p className="text-sm">
							{processed < total
								? "Suggestions will appear as responses are analyzed."
								: "No competing businesses found in these responses."}
						</p>
					)}
				</>
			)}
		</section>
	);
}

function DiscoveryTable({
	businesses,
	competitors,
	isSaving,
	onAdd,
}: Omit<Props, "brandId"> & {
	businesses: Awaited<ReturnType<typeof getCompetitorDiscovery>>["businesses"];
}) {
	const [sort, setSort] = useState<"mentions" | "position">("mentions");
	const [limit, setLimit] = useState(10);
	const rows = [...businesses];
	if (sort === "position")
		rows.sort((a, b) => a.position - b.position || b.mentions - a.mentions || a.name.localeCompare(b.name));
	const tracked = new Set(competitors.flatMap((c) => [c.name, ...c.aliases]).map((name) => name.trim().toLowerCase()));
	return (
		<>
			<div className="overflow-x-auto rounded-md border">
				<table className="w-full text-sm">
					<thead className="border-b bg-muted/40 text-left">
						<tr>
							<th className="p-2">Rank</th>
							<th className="p-2">Business</th>
							<th className="p-2 text-right" aria-sort={sort === "mentions" ? "descending" : "none"}>
								<button
									type="button"
									className="underline decoration-dotted underline-offset-4"
									onClick={() => setSort("mentions")}
								>
									Mentions
								</button>
							</th>
							<th className="p-2 text-right" aria-sort={sort === "position" ? "ascending" : "none"}>
								<button
									type="button"
									className="underline decoration-dotted underline-offset-4"
									onClick={() => setSort("position")}
								>
									Avg. Position
								</button>
							</th>
							<th className="p-2">
								<span className="sr-only">Tracking</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.slice(0, limit).map((row, index) => (
							<tr key={row.name} className="border-b last:border-0">
								<td className="p-2 text-muted-foreground tabular-nums">{index + 1}</td>
								<th scope="row" className="p-2 text-left font-medium">
									{row.name}
								</th>
								<td className="p-2 text-right tabular-nums">{row.mentions.toLocaleString()}</td>
								<td className="p-2 text-right tabular-nums">{row.position.toFixed(1)}</td>
								<td className="p-2 text-right">
									{tracked.has(row.name.toLowerCase()) ? (
										<span className="text-muted-foreground">In List</span>
									) : (
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={isSaving || competitors.length >= MAX_COMPETITORS}
											onClick={() => onAdd(row.name)}
											aria-label={`Add ${row.name} to competitors`}
										>
											Add
										</Button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{rows.length > limit && (
				<Button type="button" size="sm" variant="outline" onClick={() => setLimit(limit + 10)}>
					Show More
				</Button>
			)}
		</>
	);
}
