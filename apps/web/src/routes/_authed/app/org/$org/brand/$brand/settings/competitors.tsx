import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { CompetitorDiscovery } from "@/components/competitor-discovery";
import { type CompetitorEntry, CompetitorsEditor, newCompetitorEntry } from "@/components/competitors-editor";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { batchChartKeys } from "@/hooks/use-batch-chart-data";
import { useBrandId } from "@/hooks/use-brand-id";
import { brandKeys, useBrand, useCompetitors } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { promptRunsKeys } from "@/hooks/use-prompt-runs-only";
import { promptStatsKeys } from "@/hooks/use-prompt-stats";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateCompetitors } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/competitors")({
	staticData: { crumb: "Competitors" },
	head: pageHead({ description: "Manage your tracked competitors." }),
	component: CompetitorsSettingsPage,
});

function saveable(competitors: CompetitorEntry[]) {
	return competitors
		.filter((c) => c.name.trim())
		.map((c) => ({
			name: c.name.trim(),
			domains: c.domains.map((d) => d.trim()).filter(Boolean),
			profileLinks: c.profileLinks,
			aliases: c.aliases.map((a) => a.trim()).filter(Boolean),
		}));
}

function CompetitorsSettingsPage() {
	const brandId = useBrandId();
	const { data: brand, isLoading } = useBrand(brandId);
	const {
		data: existingCompetitors,
		isLoading: competitorsLoading,
		refetch: refetchCompetitors,
	} = useCompetitors(brandId);
	const queryClient = useQueryClient();
	const writeError = useWriteErrorMessage();

	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);

	const [seededFrom, setSeededFrom] = useState<unknown>(null);
	if (!competitorsLoading && existingCompetitors !== seededFrom) {
		setSeededFrom(existingCompetitors);
		setCompetitors(
			existingCompetitors.map((c) => ({
				_key: uuidv4(),
				name: c.name,
				domains: c.domains ?? [],
				profileLinks: c.profileLinks ?? [],
				aliases: c.aliases || [],
				expanded: false,
			})),
		);
	}

	const baseline = useMemo(
		() =>
			existingCompetitors.map((c) => ({
				name: c.name,
				domains: c.domains ?? [],
				profileLinks: c.profileLinks ?? [],
				aliases: c.aliases || [],
			})),
		[existingCompetitors],
	);
	const pending = saveable(competitors);
	const isDirty = JSON.stringify(pending) !== JSON.stringify(baseline);

	if (isLoading || competitorsLoading) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-destructive">Brand not found</p>
			</div>
		);
	}

	const save = async () => {
		setIsSaving(true);
		setError(null);
		try {
			await updateCompetitors({ data: { brandId: brand.id, competitors: pending } });

			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: batchChartKeys.brand(brand.id) });
			queryClient.invalidateQueries({ queryKey: promptStatsKeys.all });
			queryClient.invalidateQueries({ queryKey: promptRunsKeys.all });
			await refetchCompetitors();
			await queryClient.invalidateQueries({ queryKey: [...brandKeys.competitors(brand.id), "discovery"] });
		} catch (err) {
			setError(writeError(err, "Failed to save competitors."));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
			</div>

			<CompetitorDiscovery
				key={brand.id}
				brandId={brand.id}
				competitors={competitors}
				isSaving={isSaving}
				onAdd={(name, aliases) => setCompetitors((current) => [...current, newCompetitorEntry({ name, aliases })])}
			/>
			<h2 className="text-xl font-semibold">Tracked Competitors</h2>

			<p className="text-sm text-muted-foreground">
				Saving competitors updates visibility for previously collected responses in the background.
			</p>

			<CompetitorsEditor competitors={competitors} onChange={setCompetitors} disabled={isSaving} />

			<UnsavedChangesBar
				isDirty={isDirty}
				isSaving={isSaving}
				error={error}
				onSave={save}
				onDiscard={() => {
					setSeededFrom(null);
					setError(null);
				}}
			/>
		</div>
	);
}
