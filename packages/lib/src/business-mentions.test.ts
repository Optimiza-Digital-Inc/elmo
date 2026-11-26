import { describe, expect, it } from "vitest";
import { discoverBusinessMentions } from "./business-mentions";

describe("competitor discovery", () => {
	it("counts repeated visible names and ranks businesses by first appearance", async () => {
		const answer =
			"[Cedar Pharmacy](https://cedar.example/Cedar-Pharmacy) compares well with مطعم نور. CEDAR PHARMACY is open late. Try مطعم نور again.";
		const result = await discoverBusinessMentions(answer, async () => [
			"مطعم نور",
			"Cedar Pharmacy",
			"Cedar",
			"Missing",
		]);
		expect(result).toEqual([
			{ name: "Cedar Pharmacy", position: 1, count: 2 },
			{ name: "مطعم نور", position: 2, count: 2 },
		]);
	});

	it("ignores citation destinations and substrings in other names", async () => {
		expect(await discoverBusinessMentions("Places to shop [1](https://ace.example).", async () => ["Ace"])).toEqual([]);
	});

	it("counts matches once across overlapping chunks of a long answer", async () => {
		const answer = `${"more ".repeat(4799)}North Bakery recommends South Bakery.`;
		const result = await discoverBusinessMentions(answer, async (chunk) =>
			["South Bakery", "North Bakery"].filter((name) => chunk.includes(name)),
		);
		expect(result).toEqual([
			{ name: "North Bakery", position: 1, count: 1 },
			{ name: "South Bakery", position: 2, count: 1 },
		]);
	});
});
