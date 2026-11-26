import { z } from "zod";
import { getCredential } from "../../secrets";
import { type Citation, normalizeCitationTitle } from "../../text-extraction";
import {
	API_PROVIDER_MAX_OUTPUT_TOKENS,
	configuredWhen,
	RESEARCH_WEB_SEARCH_MAX_USES,
	reportedWebQueries,
	warnIfOutputCapped,
} from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { jsonSchemaResponseFormat, parseSchemaJson } from "./ai-sdk";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_API_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
const DEFAULT_RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";
const DEEPSEEK_RESEARCH_MODEL = "deepseek/deepseek-v4-pro-0813";
const DEEPSEEK_EXTRACTION_TIMEOUT_MS = 45_000;

function openrouterHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getCredential("OPENROUTER_API_KEY")}`,
		"Content-Type": "application/json",
		"HTTP-Referer": process.env.APP_URL ?? "https://github.com/elmohq/elmo",
		"X-Title": "Elmo AEO",
	};
}

function researchSearchOptions(isDeepSeek: boolean): Record<string, unknown> {
	const tools = [{ type: "openrouter:web_search", parameters: { engine: isDeepSeek ? "exa" : "native" } }];
	if (isDeepSeek) return { tools, max_tool_calls: RESEARCH_WEB_SEARCH_MAX_USES };
	// The only host with native search that enforces response_format after searching.
	return { tools, provider: { only: ["anthropic"] } };
}

function extractCitationsFromOpenRouterResponse(data: any): Citation[] {
	const citations: Citation[] = [];
	let idx = 0;
	const seen = new Set<string>();
	const annotations = data?.choices?.[0]?.message?.annotations ?? [];
	for (const ann of annotations) {
		if (ann?.type !== "url_citation") continue;
		// OpenRouter nests citation data under url_citation, but also support flat layout
		const cite = ann.url_citation ?? ann;
		const url = cite.url;
		if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
		if (seen.has(url)) continue;
		seen.add(url);
		try {
			const parsed = new URL(url);
			citations.push({
				url,
				title: normalizeCitationTitle(cite.title),
				domain: parsed.hostname.replace(/^www\./, ""),
				citationIndex: idx++,
			});
		} catch (e) {
			console.warn(`OpenRouter: skipping invalid citation URL: ${url}`, e);
		}
	}
	return citations;
}

export const openrouter: Provider = {
	id: "openrouter",
	name: "OpenRouter",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("OPENROUTER_API_KEY"),

	async runStructuredResearch<T>({
		prompt,
		schema,
		model,
		version,
		disableReasoning,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const isDeepSeek = model === "deepseek";
		const isDeepSeekExtraction = isDeepSeek && disableReasoning === true;
		const modelVersion = isDeepSeek ? (version ?? DEEPSEEK_RESEARCH_MODEL) : DEFAULT_RESEARCH_MODEL;
		const messages = [{ role: "user", content: prompt }];
		if (isDeepSeek) {
			// DeepSeek's first-party OpenRouter endpoint accepts JSON mode but rejects JSON Schema.
			messages.unshift({
				role: "system",
				content: `Return a JSON object conforming to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
			});
		}
		// Raw fetch: the AI SDK's OpenAI-compat path drops `tools` and `provider`.
		const body: Record<string, unknown> = {
			model: modelVersion,
			messages,
			response_format: isDeepSeek ? { type: "json_object" } : jsonSchemaResponseFormat(schema),
			...(webSearch ? researchSearchOptions(isDeepSeek) : {}),
		};
		if (isDeepSeek) body.provider = { only: ["deepseek"] };
		if (isDeepSeekExtraction) {
			body.reasoning = { effort: "none" };
			body.max_tokens = API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter;
		}
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: openrouterHeaders(),
			body: JSON.stringify(body),
			signal: isDeepSeekExtraction ? AbortSignal.timeout(DEEPSEEK_EXTRACTION_TIMEOUT_MS) : undefined,
		});
		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}
		const data: any = await res.json();
		const choice = data?.choices?.[0];
		if (isDeepSeekExtraction && choice?.finish_reason === "length") {
			throw new Error(`OpenRouter business extraction exceeded the output limit (model=${modelVersion})`);
		}
		const content = choice?.message?.content;
		if (typeof content !== "string") {
			throw new Error(`OpenRouter returned no JSON content (model=${modelVersion})`);
		}
		return {
			object: parseSchemaJson(schema, content),
			// The alias we sent, not the dated version OpenRouter resolved, as the other direct APIs report.
			modelVersion,
		};
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const version = options?.version;
		if (!version) {
			throw new Error(
				`OpenRouter requires a version slug in SCRAPE_TARGETS. ` +
					`Example: ${model}:openrouter:openai/gpt-5-mini:online`,
			);
		}

		const modelSlug = version.replace(/:online$/, "");

		const body: Record<string, unknown> = {
			model: modelSlug,
			messages: [{ role: "user", content: prompt }],
			max_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter,
		};
		// Perplexity always searches and has no tool-use endpoint.
		if (options?.webSearch && !modelSlug.startsWith("perplexity/")) {
			body.tools = [{ type: "openrouter:web_search" }];
		}
		// xAI ignores OpenRouter's search caps and runs eight or more searches per
		// grounded answer, so reasoning effort is the only lever on Grok's cost.
		if (modelSlug.startsWith("x-ai/")) body.reasoning = { effort: "minimal" };

		// Raw fetch: the SDK's ChatAssistantMessage schema strips the annotations
		// that carry web search citations.
		const res = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: openrouterHeaders(),
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
		}

		const data: any = await res.json();

		warnIfOutputCapped("openrouter", modelSlug, data?.choices?.[0]?.finish_reason);

		const citations = extractCitationsFromOpenRouterResponse(data);

		return {
			rawOutput: data,
			// OpenRouter doesn't expose the search queries the model made internally.
			webQueries: reportedWebQueries([], { searchProven: citations.length > 0 }),
			modelVersion: data?.model ?? modelSlug,
		};
	},
};
