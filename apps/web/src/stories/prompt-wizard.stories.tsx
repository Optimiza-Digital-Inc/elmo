/**
 * The storybook alias in .storybook/main.ts swaps `@/server/onboarding` and
 * `@/server/brands` for the mocks in src/stories/_mocks at bundle time.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import type { BrandLocationSuggestion, OnboardingSuggestion } from "@workspace/lib/onboarding";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import BrandOnboarding from "@/components/brand-onboarding";
import PromptWizard from "@/components/prompt-wizard";
import { setMockOnboardingPlatformState } from "./_mocks/server-brands";
import {
	setMockOnboardingDelay,
	setMockOnboardingError,
	setMockOnboardingLocation,
	setMockOnboardingSuggestion,
	updateOnboardedBrandFn,
} from "./_mocks/server-onboarding";
import { setMockBrand } from "./_mocks/use-brands";

const RICH_SUGGESTION: OnboardingSuggestion = {
	brandName: "Acme",
	website: "acme.com",
	additionalDomains: ["acme.co.uk", "acme.de"],
	aliases: ["Acme Inc", "Acme Corporation"],
	competitors: [
		{ name: "Globex", domains: ["globex.com", "globex.de"], aliases: ["Globex Corp"] },
		{ name: "Initech", domains: ["initech.com"], aliases: ["Initech Industries"] },
		{ name: "Soylent", domains: ["soylent.com"], aliases: [] },
	],
	suggestedPrompts: [
		{ prompt: "best widgets", tags: ["best-of"] },
		{ prompt: "best widgets for small business", tags: ["best-of", "use-case"] },
		{ prompt: "widgets vs alternatives", tags: ["comparison"] },
		{ prompt: "where to buy widgets", tags: ["transactional"] },
		{ prompt: "acme alternative", tags: ["alternative", "branded"] },
		{ prompt: "acme review", tags: ["informational", "branded"] },
		{ prompt: "is acme worth it", tags: ["informational", "branded"] },
		{ prompt: "best industrial supplies for startups", tags: ["best-of", "persona"] },
		{ prompt: "globex vs acme", tags: ["comparison", "branded"] },
		{ prompt: "alternatives to globex", tags: ["alternative"] },
	],
};

const MOCK_BRAND = {
	id: "mock-brand-id",
	name: "Acme",
	website: "https://acme.com",
	prompts: [],
	competitors: [],
};

function useWizardSetup({
	brand,
	suggestion,
	delayMs = 0,
	error = null,
	location = null,
}: {
	brand: typeof MOCK_BRAND;
	suggestion: OnboardingSuggestion | null;
	delayMs?: number;
	error?: string | null;
	location?: BrandLocationSuggestion | null;
}) {
	setMockBrand(brand);
	useEffect(() => {
		setMockOnboardingSuggestion(suggestion);
		setMockOnboardingDelay(delayMs);
		setMockOnboardingError(error);
		setMockOnboardingLocation(location);
		return () => {
			setMockOnboardingSuggestion(null);
			setMockOnboardingDelay(0);
			setMockOnboardingError(null);
			setMockOnboardingLocation(null);
		};
	}, [brand, suggestion, delayMs, error, location]);
}

export default {
	title: "Onboarding / Prompt wizard",
} satisfies Meta;

function AutoAnalyze() {
	useEffect(() => {
		const id = window.setTimeout(() => {
			const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
			const analyze = buttons.find((b) => /analyze brand/i.test(b.textContent ?? ""));
			analyze?.click();
		}, 0);
		return () => window.clearTimeout(id);
	}, []);
	return null;
}

async function analyzeWithoutLocation(canvasElement: HTMLElement) {
	const canvas = within(canvasElement);
	await userEvent.click(await canvas.findByRole("button", { name: "Analyze Brand" }));
	await userEvent.click(await canvas.findByRole("button", { name: "Continue Without a Location" }));
	return canvas;
}

/**
 * The platform-state mock is set during render (not in an effect): the
 * component fetches it on mount, and child effects run before the story's
 * own would.
 */
export const Setup = () => {
	setMockOnboardingPlatformState(null);
	return <BrandOnboarding organizationSlug="mock-org" brandId="mock-brand-id" brandName="Acme" platformState={null} />;
};

const CLOUD_PLATFORM_STATE = {
	available: [
		{ model: "chatgpt", provider: "openai", webSearch: true },
		{ model: "google-ai-overview", provider: "dataforseo", webSearch: true },
		{ model: "copilot", provider: "dataforseo", webSearch: true },
		{ model: "perplexity", provider: "openrouter", webSearch: true },
		{ model: "gemini", provider: "openrouter", webSearch: false },
	],
	platformPicks: 4,
	defaultSelected: ["chatgpt", "google-ai-overview", "copilot", "perplexity"],
};

/**
 * Cloud plans insert a platform-selection step between the website form and
 * brand creation: plan defaults pre-selected, extra options disabled at the
 * pick limit.
 */
export const SetupPlatformStep: StoryObj = {
	render: () => {
		setMockOnboardingPlatformState(CLOUD_PLATFORM_STATE);
		return (
			<BrandOnboarding
				organizationSlug="mock-org"
				brandId="mock-brand-id"
				brandName="Acme"
				platformState={CLOUD_PLATFORM_STATE}
			/>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(await canvas.findByLabelText("Website (Optional)"), "acme.com");
		await userEvent.click(await canvas.findByRole("button", { name: /continue/i }));

		expect(await canvas.findByRole("checkbox", { name: /chatgpt/i })).toBeChecked();
		// Gemini is the fifth option on a 4-pick plan: unchecked and disabled.
		const gemini = canvas.getByRole("checkbox", { name: /gemini/i });
		expect(gemini).not.toBeChecked();
		expect(gemini).toHaveAttribute("aria-disabled", "true");
		expect(canvas.getByText("4 of 4 selected")).toBeInTheDocument();
		expect(canvas.getByRole("button", { name: /complete setup/i })).toBeEnabled();
	},
};

/**
 * A single-platform menu (Starter) shows the pick locked in rather than a
 * one-checkbox chooser.
 */
export const SetupSinglePlatformPlan: StoryObj = {
	render: () => {
		const state = {
			available: [{ model: "chatgpt", provider: "openai", webSearch: true }],
			platformPicks: 1,
			defaultSelected: ["chatgpt"],
		};
		setMockOnboardingPlatformState(state);
		return (
			<BrandOnboarding organizationSlug="mock-org" brandId="mock-brand-id" brandName="Acme" platformState={state} />
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(await canvas.findByLabelText("Website (Optional)"), "acme.com");
		await userEvent.click(await canvas.findByRole("button", { name: /continue/i }));

		const checkbox = await canvas.findByRole("checkbox", { name: /chatgpt/i });
		expect(checkbox).toBeChecked();
		expect(checkbox).toHaveAttribute("aria-disabled", "true");
		expect(canvas.getByRole("button", { name: /complete setup/i })).toBeEnabled();
	},
};

export const SetupWithProfileLink: StoryObj = {
	render: () => (
		<BrandOnboarding organizationSlug="mock-org" brandId="mock-brand-id" brandName="Acme" platformState={null} />
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const website = await canvas.findByLabelText("Website (Optional)");
		const profileLink = "https://maps.app.goo.gl/ExampleBusiness";
		await userEvent.type(website, profileLink);
		await userEvent.tab();
		expect(website).toHaveValue("");
		await expect(canvas.findByText(profileLink)).resolves.toBeVisible();
		expect(canvas.getByRole("status")).toHaveTextContent("Moved to Profile Links.");
		expect(canvas.getByRole("button", { name: "Complete Setup" })).toBeEnabled();
	},
};

export const ManualSetupWithoutWebsite: StoryObj = {
	render: () => {
		setMockBrand({ ...MOCK_BRAND, website: null });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Set Up Manually" }));
		expect(await canvas.findByDisplayValue("Acme")).toBeVisible();
		expect(canvas.getByLabelText("Website (Optional)")).toHaveValue("");
		await userEvent.click(canvas.getByRole("button", { name: "Add Competitor" }));
		await userEvent.type(canvas.getByPlaceholderText("Competitor name"), "Example Cake Shop");
		expect(canvas.getByText(`1/${MAX_COMPETITORS}`)).toBeVisible();
		expect(canvas.getByRole("button", { name: "Finish Setup" })).toBeEnabled();
	},
};

export const Idle = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
	return <PromptWizard onComplete={() => {}} />;
};

/** Analyze is mocked to take 5s so the loader stays visible. */
export const Analyzing = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION, delayMs: 5_000 });
	return (
		<>
			<PromptWizard onComplete={() => {}} />
			<AutoAnalyze />
		</>
	);
};

export const Review: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		await expect(await canvas.findByDisplayValue("Acme")).toBeVisible();
		await expect(canvas.getAllByDisplayValue("best widgets").length).toBeGreaterThan(0);
		await expect(
			canvas.getByRole("button", { name: `Start Tracking (${RICH_SUGGESTION.suggestedPrompts.length} New Prompts)` }),
		).toBeEnabled();
	},
};

export const SavePromptsForLater: StoryObj = {
	render: Review.render,
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		await canvas.findByDisplayValue("Acme");
		await userEvent.click(canvas.getByRole("checkbox", { name: "Select all prompts" }));
		await userEvent.click(canvas.getByRole("button", { name: "Disable" }));
		await expect(canvas.getByRole("button", { name: "Finish Setup" })).toBeEnabled();
		await userEvent.click(canvas.getAllByRole("switch", { name: "Enable prompt" })[0]!);
		updateOnboardedBrandFn.mockClear();
		await userEvent.click(canvas.getByRole("button", { name: "Start Tracking (1 New Prompt)" }));
		await waitFor(() =>
			expect(updateOnboardedBrandFn).toHaveBeenCalledWith({
				data: expect.objectContaining({
					prompts: RICH_SUGGESTION.suggestedPrompts.map(({ prompt, tags }, index) => ({
						value: prompt,
						tags,
						enabled: index === 0,
					})),
				}),
			}),
		);
	},
};

const DETECTED_LOCATION = {
	country: "Iraq",
	city: "Erbil",
	serviceArea: "",
	sourceUrl: "https://acme.example/contact",
};

const LOCAL_SUGGESTION = {
	...RICH_SUGGESTION,
	competitors: [
		{
			name: "Globex",
			domains: ["globex.example"],
			aliases: [],
			localEvidence: {
				reason: "Delivers widgets across Erbil Governorate.",
				sourceUrl: "https://globex.example/delivery",
			},
		},
	],
	suggestedPrompts: [{ prompt: "where to buy widgets in erbil governorate", tags: ["widgets"] }],
};

export const ConfirmLocalMarket: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: LOCAL_SUGGESTION, location: DETECTED_LOCATION });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Analyze Brand" }));
		await expect(await canvas.findByLabelText("Country")).toHaveValue("Iraq");
		await expect(canvas.getByLabelText("City")).toHaveValue("Erbil");
		await expect(canvas.getByRole("link", { name: "View Location Source" })).toHaveAttribute(
			"href",
			DETECTED_LOCATION.sourceUrl,
		);
		await expect(canvas.queryByText("Globex")).not.toBeInTheDocument();
		await userEvent.type(canvas.getByLabelText("Service Area"), "Erbil Governorate");
		await userEvent.click(canvas.getByRole("button", { name: "Find Competitors and Prompts" }));
		await expect(await canvas.findByRole("link", { name: "View source for Globex" })).toHaveAttribute(
			"href",
			"https://globex.example/delivery",
		);
		expect(canvas.getAllByDisplayValue("where to buy widgets in erbil governorate").length).toBeGreaterThan(0);
	},
};

export const ReviewRejectsCoveredDomain: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await canvas.findByText("Brand details");
		const domainsInput = within(canvas.getByRole("group", { name: "Additional Domains" })).getByRole("combobox");
		await userEvent.click(domainsInput);

		const search = await documentBody.findByPlaceholderText("Add domain...");
		await userEvent.type(search, "blog.acme.com");
		await userEvent.keyboard("{Enter}");

		await expect(documentBody.findByText(/already covered by acme\.com/i)).resolves.toBeVisible();
		expect(canvas.queryByText("blog.acme.com")).toBeNull();

		await userEvent.clear(search);
		await userEvent.type(search, "acme.io");
		await userEvent.keyboard("{Enter}");

		await expect(canvas.findByText("acme.io")).resolves.toBeVisible();
		expect(documentBody.queryByText(/already covered/i)).toBeNull();
	},
};

export const ReviewPasteSkipsCoveredDomains: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await canvas.findByText("Brand details");
		const domainsInput = within(canvas.getByRole("group", { name: "Additional Domains" })).getByRole("combobox");
		await userEvent.click(domainsInput);
		await userEvent.click(await documentBody.findByPlaceholderText("Add domain..."));
		await userEvent.paste("blog.acme.com, acme.io, shop.acme.io");

		await expect(documentBody.findByText(/"blog\.acme\.com" is already covered by acme\.com/i)).resolves.toBeVisible();
		await expect(canvas.findByText("acme.io")).resolves.toBeVisible();
		expect(canvas.queryByText("blog.acme.com")).toBeNull();
		expect(canvas.queryByText("shop.acme.io")).toBeNull();
	},
};

export const ReviewDropsCoveredSuggestions: StoryObj = {
	render: () => {
		useWizardSetup({
			brand: MOCK_BRAND,
			suggestion: { ...RICH_SUGGESTION, additionalDomains: ["acme.co.uk", "blog.acme.com", "eu.acme.co.uk"] },
		});
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		await canvas.findByText("Brand details");
		await expect(canvas.findByText("acme.co.uk")).resolves.toBeVisible();
		expect(canvas.queryByText("blog.acme.com")).toBeNull();
		expect(canvas.queryByText("eu.acme.co.uk")).toBeNull();
	},
};

/**
 * The provider/stack detail stays server-side and is never forwarded to the
 * browser, so the wizard shows a generic message.
 */
export const AnalyzeError: StoryObj = {
	render: () => {
		useWizardSetup({
			brand: MOCK_BRAND,
			suggestion: RICH_SUGGESTION,
			error: "Brand analysis failed. Please try again.",
		});
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = await analyzeWithoutLocation(canvasElement);
		await expect(await canvas.findByText("Brand analysis failed. Please try again.")).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Continue Without a Location" })).toBeEnabled();
	},
};

export const Cancel: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION, delayMs: 60_000 });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(await canvas.findByRole("button", { name: /analyze brand/i }));

		await userEvent.click(await canvas.findByRole("button", { name: /^cancel$/i }));

		await waitFor(() => {
			expect(canvas.getByRole("button", { name: /analyze brand/i })).toBeEnabled();
		});
		expect(canvas.queryByRole("button", { name: /^cancel$/i })).toBeNull();
	},
};
