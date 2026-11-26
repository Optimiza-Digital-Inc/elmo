import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resolveResearchProvider, runStructuredCompletionPrompt, runStructuredResearchPrompt } from "./llm";

const ENV_KEYS = [
	"ONBOARDING_LLM_TARGET",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"OPENROUTER_API_KEY",
	"OLOSTEP_API_KEY",
	"BRIGHTDATA_API_TOKEN",
	"OXYLABS_USERNAME",
	"OXYLABS_PASSWORD",
	"MISTRAL_API_KEY",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	vi.restoreAllMocks();
	for (const key of ENV_KEYS) {
		const v = savedEnv[key];
		if (v === undefined) delete process.env[key];
		else process.env[key] = v;
	}
});

describe("DeepSeek research through OpenRouter", () => {
	it.each([true, false])("restricts inference to DeepSeek with web search set to %s", async (webSearch) => {
		process.env.OPENAI_API_KEY = "openai-key";
		process.env.OPENROUTER_API_KEY = "openrouter-key";
		process.env.ONBOARDING_LLM_TARGET = "deepseek:openrouter";
		const answer = { name: "Acme" };
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
		const schema = z.object({ name: z.string() });

		const object = webSearch
			? await runStructuredResearchPrompt("Find the brand", schema)
			: (await runStructuredCompletionPrompt("Summarize the brand", schema)).object;

		expect(object).toEqual(answer);
		const [url, request] = fetchMock.mock.calls[0];
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
		const body = JSON.parse(String(request?.body));
		expect(body).toMatchObject({
			model: "deepseek/deepseek-v4-pro-0813",
			provider: { only: ["deepseek"] },
			response_format: { type: "json_object" },
		});
		expect(body.tools).toEqual(
			webSearch ? [{ type: "openrouter:web_search", parameters: { engine: "exa" } }] : undefined,
		);
	});
});

describe("resolveResearchProvider", () => {
	it("uses the explicit env override when set", () => {
		process.env.ANTHROPIC_API_KEY = "x";
		const provider = resolveResearchProvider({
			ANTHROPIC_API_KEY: "x",
			ONBOARDING_LLM_TARGET: "claude:anthropic-api",
		});
		expect(provider.id).toBe("anthropic-api");
	});

	it("throws when ONBOARDING_LLM_TARGET points at an unconfigured provider", () => {
		expect(() =>
			resolveResearchProvider({
				ONBOARDING_LLM_TARGET: "chatgpt:openai-api:gpt-5-mini",
			}),
		).toThrow(/isn't configured/);
	});

	it("throws when ONBOARDING_LLM_TARGET points at a scraper", () => {
		process.env.OLOSTEP_API_KEY = "x";
		expect(() =>
			resolveResearchProvider({
				OLOSTEP_API_KEY: "x",
				ONBOARDING_LLM_TARGET: "gemini:olostep:online",
			}),
		).toThrow(/does not support structured research/);
	});

	it("prefers OpenAI direct first when configured", () => {
		// provider.isConfigured() reads from process.env, not the function's
		// env arg — set both so ONBOARDING_LLM_TARGET lookup and the
		// per-provider config probe see the same world.
		process.env.OPENAI_API_KEY = "a";
		process.env.OPENROUTER_API_KEY = "b";
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const provider = resolveResearchProvider();
		expect(provider.id).toBe("openai-api");
	});

	it("falls back to OpenRouter when OpenAI direct isn't configured", () => {
		process.env.OPENROUTER_API_KEY = "b";
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const provider = resolveResearchProvider();
		expect(provider.id).toBe("openrouter");
	});

	it("falls back to Anthropic when OpenAI / OpenRouter aren't configured", () => {
		process.env.ANTHROPIC_API_KEY = "c";
		process.env.MISTRAL_API_KEY = "d";
		const provider = resolveResearchProvider();
		expect(provider.id).toBe("anthropic-api");
	});

	it("falls back to Mistral when only Mistral is set", () => {
		process.env.MISTRAL_API_KEY = "x";
		const provider = resolveResearchProvider();
		expect(provider.id).toBe("mistral-api");
	});

	it("ignores scraper providers entirely", () => {
		process.env.OLOSTEP_API_KEY = "x";
		process.env.BRIGHTDATA_API_TOKEN = "y";
		expect(() => resolveResearchProvider({ OLOSTEP_API_KEY: "x", BRIGHTDATA_API_TOKEN: "y" })).toThrow(
			/at least one direct LLM API/,
		);
	});

	it("throws when no provider is configured", () => {
		expect(() => resolveResearchProvider({})).toThrow(/at least one direct LLM API/);
	});
});
