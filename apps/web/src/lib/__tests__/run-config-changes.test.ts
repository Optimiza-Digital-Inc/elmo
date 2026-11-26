import { describe, expect, it } from "vitest";
import { addedPlatforms, promptsNeedingImmediateRun } from "@/lib/run-config-changes";

const CONFIGURED = ["chatgpt", "perplexity", "gemini"];

describe("addedPlatforms", () => {
	it("reports a newly picked platform", () => {
		expect(addedPlatforms(["chatgpt"], ["chatgpt", "gemini"], CONFIGURED)).toEqual(["gemini"]);
	});

	it("reports nothing when a platform is dropped", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("reports nothing when the selection is unchanged", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["gemini", "chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so narrowing adds nothing", () => {
		expect(addedPlatforms(null, ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so widening adds the rest", () => {
		expect(addedPlatforms(["chatgpt"], null, CONFIGURED)).toEqual(["perplexity", "gemini"]);
	});
});

describe("promptsNeedingImmediateRun", () => {
	const before = new Map([
		["kept", { enabled: true, premiumModels: ["claude"] }],
		["grew", { enabled: true, premiumModels: ["claude"] }],
		["shrank", { enabled: true, premiumModels: ["claude", "grok"] }],
	]);

	it("reports only the prompts that gained a model", () => {
		const after = [
			{ id: "kept", enabled: true, premiumModels: ["claude"] },
			{ id: "grew", enabled: true, premiumModels: ["claude", "grok"] },
			{ id: "shrank", enabled: true, premiumModels: ["claude"] },
		];
		expect(promptsNeedingImmediateRun(before, after)).toEqual(["grew"]);
	});

	it("ignores prompts created by the same save", () => {
		expect(promptsNeedingImmediateRun(before, [{ id: "fresh", enabled: true, premiumModels: ["claude"] }])).toEqual([]);
	});

	it("starts tracking a saved prompt only when it is enabled", () => {
		const saved = { enabled: false, premiumModels: [] };
		const before = new Map([
			["enable", saved],
			["leave-off", saved],
		]);
		expect(
			promptsNeedingImmediateRun(before, [
				{ ...saved, id: "enable", enabled: true },
				{ ...saved, id: "leave-off", premiumModels: ["claude"] },
			]),
		).toEqual(["enable"]);
	});
});
