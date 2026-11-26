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

it("excludes the brand when the answer changes its punctuation, spacing, or business label", () => {
	const names = [
		"LOTUS-VALE",
		"Lotus—Vale",
		"Lotus  Vale",
		"LotusVale",
		"LotusVale (Restaurant)",
		"LOTUSVALE",
		"Lotus Vale Restaurant",
		"Restaurant — Lotus Vale",
		"Lotus Vale (Restaurant)",
		"Lotus-Vale–وادي اللوتس",
		"Lotus Vale Kitchen",
	];
	const identities = resolveBusinessNames(names, [{ name: "Lotus Vale", aliases: [], own: true }]);
	expect(identities.filter(({ own }) => own).map(({ surface }) => surface)).toEqual(names.slice(0, -1));
	expect(identities.at(-1)?.name).toBe("Lotus Vale Kitchen");
});

it("groups punctuation and business labels under the plain discovered name", () => {
	const names = [
		"Jasmine Harbor",
		"Jasmine—Harbor",
		"JASMINE HARBOR",
		"Jasmine Harbor (Restaurant)",
		"مطعم Jasmine Harbor",
	];
	expect(new Set(resolveBusinessNames(names, []).map(({ name }) => name))).toEqual(new Set(["Jasmine Harbor"]));
});

it("keeps configured names distinct from longer forms and preserves case-only matches", () => {
	const subjects = [
		{ name: "Lotus Vale", aliases: [], own: true },
		{ name: "Lotus Vale Restaurant", aliases: [], own: false },
	];
	const names = ["Lotus Vale Restaurant", "Marta’s Bakery", "Martas Bakery", "McKay", "MCKAY"];
	const resolved = resolveBusinessNames(names, subjects);
	expect(resolved[0]).toMatchObject({ name: "Lotus Vale Restaurant", own: false });
	expect(resolved[1].key).toBe(resolved[2].key);
	expect(resolved[3].key).toBe(resolved[4].key);
});
