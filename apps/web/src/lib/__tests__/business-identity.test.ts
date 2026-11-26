import { describe, expect, it } from "vitest";
import { resolveBusinessNames } from "@/lib/business-identity";

describe("competitor names", () => {
	it("recognizes the tracked brand through bilingual renderings and a learned spelling", () => {
		const names = [
			"Lotus vale | وادي اللوتس",
			"وادي اللوتس (Lotus Vale)",
			"وادي اللوتس | Lotus vale",
			"وادي اللوتس",
			"Lotus Vale Kitchen",
		];
		const identities = resolveBusinessNames(names, [{ name: "Lotus Vale", aliases: [], own: true }]);

		expect(identities.filter(({ own }) => own).map(({ surface }) => surface)).toEqual(names.slice(0, 4));
		expect(identities[4]).toMatchObject({ name: "Lotus Vale Kitchen", own: false });
	});

	it("uses one name for a business across scripts, word order, and punctuation", () => {
		const names = [
			"Jasmine Harbor Restaurant",
			"مطعم ميناء الياسمين Jasmine Harbor Restaurant",
			"Jasmine Harbor Restaurant – ميناء الياسمين",
			"ميناء الياسمين",
			"Ｊａｓｍｉｎｅ　Ｈａｒｂｏｒ　Ｒｅｓｔａｕｒａｎｔ",
		];
		const identities = resolveBusinessNames(names, []);
		expect(new Set(identities.map(({ key }) => key))).toEqual(new Set(["jasmine harbor restaurant"]));
	});

	it("recognizes translations in two non-Latin scripts", () => {
		const names = ["Кафе Луна | Καφέ Λούνα", "Καφέ Λούνα", "Кафе Луна"];
		const identities = resolveBusinessNames(names, []);
		expect(new Set(identities.map(({ key }) => key)).size).toBe(1);
	});

	it("keeps separate businesses with a shared translated name and leaves the shared name ambiguous", () => {
		const identities = resolveBusinessNames(["Blue Moon | שוק כחול", "Blue Market | שוק כחול", "שוק כחול"], []);
		expect(new Set(identities.map(({ key }) => key)).size).toBe(3);
	});

	it("keeps explicitly tracked competitors distinct from the brand", () => {
		const names = ["Lotus Vale", "وادي اللوتس", "Lotus Vale | وادي اللوتس"];
		const subjects = [
			{ name: "Lotus Vale", aliases: [], own: true },
			{ name: "وادي اللوتس", aliases: [], own: false },
		];
		const identities = resolveBusinessNames(names, subjects);
		expect(identities.filter(({ own }) => own).map(({ surface }) => surface)).toEqual(["Lotus Vale"]);
		expect(identities[1]).toMatchObject({ name: "وادي اللوتس", own: false });
	});
});
