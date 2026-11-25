import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { cleanAndValidateDomain, validateAdditionalDomain } from "@workspace/lib/citations/domain-categories";
import type { BrandLocation } from "@workspace/lib/onboarding";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { AlertCircle, Play, Rocket } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type CompetitorEntry, CompetitorsEditor, newCompetitorEntry } from "@/components/competitors-editor";
import { type EditablePrompt, newPromptEntry, PromptsListEditor } from "@/components/prompts-list-editor";
import { WriteErrorMessage } from "@/components/write-error-message";
import { brandKeys, useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { usePolledBrandJob } from "@/hooks/use-polled-brand-job";
import { promptsSummaryKeys } from "@/hooks/use-prompts-summary";
import type { BrandResearchJobRef } from "@/lib/analyze-brand-job";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	cancelAnalyzeBrandFn,
	getAnalyzeBrandStatusFn,
	startAnalyzeBrandFn,
	updateOnboardedBrandFn,
} from "@/server/onboarding";

interface PromptWizardProps {
	onComplete: () => void;
}

interface WizardData {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: CompetitorEntry[];
	prompts: EditablePrompt[];
}

const DOMAIN_PASTE_SPLITTER = /[\n,\t]+/;
const normalizeDomain = (raw: string) => cleanAndValidateDomain(raw) ?? raw.trim();
const LOCATION_FIELDS = [
	{ key: "country", label: "Country", placeholder: "Iraq" },
	{ key: "city", label: "City", placeholder: "Erbil" },
	{ key: "serviceArea", label: "Service Area", placeholder: "Erbil Governorate" },
] as const;

const EditableTagsInput = memo(
	({
		items,
		onValueChange,
		placeholder = "Add item...",
		maxItems = 10,
		normalizeValue,
		pasteSplitter,
		onValidate,
	}: {
		items: string[];
		onValueChange: (value: string[]) => void;
		placeholder?: string;
		maxItems?: number;
		normalizeValue?: (raw: string) => string;
		pasteSplitter?: RegExp;
		onValidate?: (value: string, current: string[]) => true | string;
	}) => (
		<div className="space-y-2">
			<TagsInput
				value={items}
				onValueChange={onValueChange}
				placeholder={placeholder}
				searchPlaceholder={placeholder}
				maxItems={maxItems}
				normalizeValue={normalizeValue}
				pasteSplitter={pasteSplitter}
				onValidate={onValidate}
			/>
			<p className="text-xs text-muted-foreground">
				<strong>
					{items.length}/{maxItems}
				</strong>{" "}
				{items.length >= maxItems ? "items added. Remove an item to add a new one." : "items entered."}
			</p>
		</div>
	),
);
EditableTagsInput.displayName = "EditableTagsInput";

function BrandResearchForm({
	step,
	website,
	location,
	locationSourceUrl,
	error,
	running,
	onLocationChange,
	onAnalyze,
	onCancel,
	onEnterManually,
}: {
	step: "start" | "location";
	website: string | undefined;
	location: BrandLocation;
	locationSourceUrl: string | null | undefined;
	error: string | null;
	running: boolean;
	onLocationChange: (location: BrandLocation) => void;
	onAnalyze: () => void;
	onCancel: () => void;
	onEnterManually: () => void;
}) {
	const hasLocation = Object.values(location).some((value) => value.trim());

	return (
		<form
			className="max-w-2xl mx-auto space-y-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!running && website) onAnalyze();
			}}
		>
			{step === "start" ? (
				<p className="text-sm text-muted-foreground">
					We'll look up where <strong>{website}</strong> serves customers so you can confirm the market before we
					suggest competitors and AI tracking prompts.
				</p>
			) : (
				<>
					<h3 className="text-xl font-semibold">Confirm Your Market</h3>
					<p className="text-sm text-muted-foreground">
						Enter where you serve customers. If you leave the service area blank, we'll use the city or country you
						provide.
					</p>
					{locationSourceUrl && (
						<a className="text-sm text-primary underline" href={locationSourceUrl} target="_blank" rel="noreferrer">
							View Location Source
						</a>
					)}
					{locationSourceUrl === null && (
						<p className="text-sm text-muted-foreground">We couldn't confirm a location from public sources.</p>
					)}
					<div className="grid gap-3 sm:grid-cols-2">
						{LOCATION_FIELDS.map(({ key, label, placeholder }) => (
							<div key={key} className={key === "serviceArea" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
								<Label htmlFor={`brand-${key}`}>{label}</Label>
								<Input
									id={`brand-${key}`}
									value={location[key]}
									onChange={(event) => onLocationChange({ ...location, [key]: event.target.value })}
									placeholder={placeholder}
									maxLength={200}
									disabled={running}
								/>
							</div>
						))}
					</div>
				</>
			)}
			{error && (
				<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
					<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
					<span>
						<WriteErrorMessage message={error} />
					</span>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={!website || running} className="flex items-center gap-2 cursor-pointer">
					{running ? (
						<>
							<Spinner /> {step === "start" ? "Detecting location…" : "Analyzing brand…"}
						</>
					) : (
						<>
							<Play className="h-4 w-4" />
							{step === "start"
								? "Analyze Brand"
								: hasLocation
									? "Find Competitors and Prompts"
									: "Continue Without a Location"}
						</>
					)}
				</Button>
				{running && (
					<Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">
						Cancel
					</Button>
				)}
				{step === "start" && !running && (
					<Button type="button" variant="ghost" onClick={onEnterManually}>
						Enter Location Manually
					</Button>
				)}
			</div>
		</form>
	);
}

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { data: brand } = useBrand();
	const queryClient = useQueryClient();
	const router = useRouter();
	const writeError = useWriteErrorMessage();
	const [step, setStep] = useState<"start" | "location" | "review">("start");
	const [location, setLocation] = useState<BrandLocation>({ country: "", city: "", serviceArea: "" });
	const [locationSourceUrl, setLocationSourceUrl] = useState<string | null>();
	const research = useRef<Promise<BrandResearchJobRef> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [data, setData] = useState<WizardData>({
		brandName: "",
		website: "",
		additionalDomains: [],
		aliases: [],
		competitors: [],
		prompts: [],
	});

	const brandId = brand?.id;
	const hasLocation = Object.values(location).some((value) => value.trim());

	const analysis = usePolledBrandJob({
		queryKey: ["analyze-brand", brandId],
		start: () => {
			if (!brand?.id || !brand.website) throw new Error("Brand isn't loaded yet.");
			const stage = step === "start" ? "location" : "analysis";
			const job = { brandId: brand.id, stage } as const;
			research.current = startAnalyzeBrandFn({
				data: {
					...job,
					website: brand.website,
					brandName: brand.name,
					location: stage === "analysis" ? location : undefined,
				},
			}).then(({ jobId }) => ({ ...job, jobId }));
			return research.current;
		},
		poll: async () => {
			if (!research.current) return { status: "pending" as const };
			return getAnalyzeBrandStatusFn({ data: await research.current });
		},
		cancel: async () => {
			if (research.current) await cancelAnalyzeBrandFn({ data: await research.current });
		},
		onDone: (result) => {
			if (result.stage === "location") {
				const { sourceUrl, ...detected } = result.location;
				setLocation(detected);
				setLocationSourceUrl(sourceUrl);
				setStep("location");
				return;
			}
			const { suggestion } = result;
			const website = brand?.website || suggestion.website || "";
			setData({
				brandName: suggestion.brandName || brand?.name || "",
				website,
				additionalDomains: suggestion.additionalDomains.reduce<string[]>(
					(kept, domain) => (validateAdditionalDomain(domain, [website, ...kept]) === true ? [...kept, domain] : kept),
					[],
				),
				aliases: suggestion.aliases,
				competitors: suggestion.competitors.map((c) =>
					newCompetitorEntry({
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
						localEvidence: c.localEvidence,
						expanded: false,
					}),
				),
				prompts: suggestion.suggestedPrompts.map((p) =>
					newPromptEntry({ value: p.prompt, tags: p.tags, enabled: true }),
				),
			});
			setStep("review");
			trackEvent("onboarding_analyzed", {
				competitor_count: suggestion.competitors.length,
				prompt_count: suggestion.suggestedPrompts.length,
			});
		},
		onError: (message) => {
			setError(message);
			if (step === "start") setStep("location");
		},
		startErrorFallback: step === "start" ? "Couldn't start location detection." : "Couldn't start brand analysis.",
		timeoutMessage: step === "start" ? "Location detection timed out." : "Brand analysis timed out. Please try again.",
	});

	const handleAnalyze = () => {
		if (!brand?.website || !brand?.id) return;
		setError(null);
		analysis.run();
	};

	const updateBrandName = useCallback((brandName: string) => setData((p) => ({ ...p, brandName })), []);
	const updateWebsite = useCallback((website: string) => setData((p) => ({ ...p, website })), []);
	const updateAliases = useCallback((aliases: string[]) => setData((p) => ({ ...p, aliases })), []);
	const updateAdditionalDomains = useCallback(
		(additionalDomains: string[]) => setData((p) => ({ ...p, additionalDomains })),
		[],
	);
	const updateCompetitors = useCallback(
		(competitors: CompetitorEntry[]) => setData((p) => ({ ...p, competitors })),
		[],
	);
	const updatePrompts = useCallback((prompts: EditablePrompt[]) => setData((p) => ({ ...p, prompts })), []);

	const validateDomain = useCallback(
		(val: string, current: string[]) =>
			validateAdditionalDomain(val, [data.website.trim() || brand?.website, ...current]),
		[data.website, brand?.website],
	);

	const previewCounts = useMemo(() => {
		const enabled = data.prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;
		return { totalNew: enabled };
	}, [data.prompts]);

	const handleSubmit = useCallback(async () => {
		if (!brand?.id) return;
		setSubmitError(null);
		setIsSaving(true);
		try {
			const competitorsPayload = data.competitors
				.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
				.map((c) => ({
					name: c.name.trim(),
					domains: c.domains.filter((d) => d.trim()),
					aliases: c.aliases,
				}));

			const promptsPayload = data.prompts
				.filter((p) => p.enabled && p.value.trim())
				.map((p) => ({ value: p.value.trim(), tags: p.tags, enabled: true }));

			await updateOnboardedBrandFn({
				data: {
					brandId: brand.id,
					brandName: data.brandName.trim() || brand.name,
					website: data.website.trim() || brand.website,
					additionalDomains: data.additionalDomains,
					aliases: data.aliases,
					competitors: competitorsPayload,
					prompts: promptsPayload,
				},
			});

			trackEvent("wizard_completed", {
				prompts_created: promptsPayload.length,
				competitors_created: competitorsPayload.length,
				skipped: false,
			});

			// Deployments without an onboardingRedirectUrlTemplate (e.g. local mode) skip the full reload, so caches fetched while !onboarded must be busted explicitly.
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: promptsSummaryKeys.all });
			// The $brand route loader feeds `brand` into AppSidebar; invalidate it so the sidebar picks up onboarded=true.
			await router.invalidate();

			onComplete();
		} catch (err) {
			setSubmitError(writeError(err, "Failed to save"));
		} finally {
			setIsSaving(false);
		}
	}, [brand, data, queryClient, router, onComplete, writeError]);

	if (step !== "review") {
		return (
			<BrandResearchForm
				step={step}
				website={brand?.website ?? undefined}
				location={location}
				locationSourceUrl={locationSourceUrl}
				error={error}
				running={analysis.running}
				onLocationChange={setLocation}
				onAnalyze={handleAnalyze}
				onCancel={analysis.cancel}
				onEnterManually={() => setStep("location")}
			/>
		);
	}

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">Brand details</h2>
				<p className="text-muted-foreground">
					Confirm the brand identity, additional domains, and aliases used for tracking.
				</p>
				<div className="space-y-3">
					<div>
						<p className="text-xs text-muted-foreground">Brand name</p>
						<Input value={data.brandName} onChange={(e) => updateBrandName(e.target.value)} placeholder="Brand name" />
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Website URL</p>
						<Input
							type="url"
							value={data.website}
							onChange={(e) => updateWebsite(e.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Additional domains</p>
						<EditableTagsInput
							items={data.additionalDomains}
							onValueChange={updateAdditionalDomains}
							placeholder="Add domain..."
							maxItems={10}
							normalizeValue={normalizeDomain}
							pasteSplitter={DOMAIN_PASTE_SPLITTER}
							onValidate={validateDomain}
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Aliases</p>
						<EditableTagsInput
							items={data.aliases}
							onValueChange={updateAliases}
							placeholder="Add alias..."
							maxItems={10}
						/>
					</div>
				</div>
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Competitors</h2>
					<p className="text-muted-foreground">Companies you want tracked alongside your brand.</p>
				</div>
				{hasLocation && data.competitors.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No competitors with evidence of serving your market were found. You can add any you know below.
					</p>
				)}
				<CompetitorsEditor competitors={data.competitors} onChange={updateCompetitors} disabled={isSaving} />
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Prompts</h2>
					<p className="text-muted-foreground">
						Pick which AI tracking prompts to start with. Untick any you don't want, edit tags, or add your own at the
						bottom.
					</p>
				</div>
				<PromptsListEditor prompts={data.prompts} onChange={updatePrompts} showSystemTags={false} />
			</div>

			{submitError && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
					<AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
					<div className="text-sm">
						<WriteErrorMessage message={submitError} />
					</div>
				</div>
			)}

			<Button
				onClick={handleSubmit}
				disabled={isSaving || previewCounts.totalNew === 0}
				className="flex items-center gap-2 cursor-pointer"
			>
				{isSaving ? (
					<>
						<Spinner /> Saving…
					</>
				) : (
					<>
						<Rocket className="h-4 w-4" /> Start tracking ({previewCounts.totalNew} new prompts)
					</>
				)}
			</Button>
		</div>
	);
}
