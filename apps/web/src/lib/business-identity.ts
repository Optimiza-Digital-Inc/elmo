interface TrackedBusiness {
	name: string;
	aliases: string[];
	own: boolean;
}

interface BusinessIdentity {
	key: string;
	name: string;
	own: boolean;
}

function businessNameKey(name: string): string {
	return name
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\p{Default_Ignorable_Code_Point}/gu, "")
		.replace(/(?<=\p{L})['’ʼ](?=\p{L})/gu, "")
		.replace(/[^\p{L}\p{M}\p{N}&+]+/gu, " ")
		.trim();
}

const scripts = [
	"Latin",
	"Arabic",
	"Han",
	"Hiragana",
	"Katakana",
	"Hangul",
	"Cyrillic",
	"Greek",
	"Hebrew",
	"Thai",
	"Lao",
	"Khmer",
	"Myanmar",
	"Devanagari",
	"Bengali",
	"Gujarati",
	"Gurmukhi",
	"Tamil",
	"Telugu",
	"Kannada",
	"Malayalam",
	"Oriya",
	"Sinhala",
	"Tibetan",
	"Armenian",
	"Georgian",
	"Ethiopic",
].map((script) => new RegExp(`\\p{Script=${script}}`, "u"));

function writingSystems(value: string): Set<number> {
	const found = new Set<number>();
	scripts.forEach((script, i) => {
		if (script.test(value)) found.add(i);
	});
	return found;
}

function differentScripts(first: string, second: string): boolean {
	const left = writingSystems(first);
	const right = writingSystems(second);
	return left.size > 0 && right.size > 0 && [...left].every((script) => !right.has(script));
}

function delimitedParts(name: string): [string, string][] {
	const pairs: [string, string][] = [];
	const parenthetical = /^(.+?)\s*[(（]([^()（）]+)[)）]\s*$/u.exec(name);
	if (parenthetical) pairs.push([parenthetical[1].trim(), parenthetical[2].trim()]);
	for (const separator of name.matchAll(/[|｜\p{Dash_Punctuation}−]/gu)) {
		pairs.push([name.slice(0, separator.index).trim(), name.slice(separator.index + 1).trim()]);
	}
	return pairs;
}

const businessTypes = new Set([
	"bakery",
	"barbershop",
	"cafe",
	"café",
	"clinic",
	"hotel",
	"pharmacy",
	"restaurant",
	"salon",
	"مطعم",
	"مخبز",
	"فندق",
	"عيادة",
	"صيدلية",
	"مقهى",
	"restaurante",
	"ristorante",
	"boulangerie",
	"apotheke",
	"ресторан",
	"кафе",
	"レストラン",
	"餐厅",
]);

function bilingualParts(name: string): string[] {
	return (
		delimitedParts(name).find(
			([left, right]) =>
				!businessTypes.has(businessNameKey(left)) &&
				!businessTypes.has(businessNameKey(right)) &&
				differentScripts(left, right),
		) ?? []
	);
}

function findBase(key: string, known: Map<string, BusinessIdentity>): BusinessIdentity | undefined {
	const firstSpace = key.indexOf(" ");
	const lastSpace = key.lastIndexOf(" ");
	if (firstSpace === -1) return;

	const prefix = key.slice(0, firstSpace);
	const suffix = key.slice(lastSpace + 1);
	const bases = [
		businessTypes.has(prefix) ? known.get(key.slice(firstSpace + 1)) : undefined,
		businessTypes.has(suffix) ? known.get(key.slice(0, lastSpace)) : undefined,
	].filter((identity): identity is BusinessIdentity => !!identity);
	const [base] = bases;
	return base && bases.every((identity) => identity.key === base.key) ? base : undefined;
}

function trackedNames(subjects: TrackedBusiness[]): Map<string, BusinessIdentity> {
	const names = new Map<string, BusinessIdentity>();
	for (const subject of subjects) {
		const key = businessNameKey(subject.name);
		for (const name of [subject.name, ...subject.aliases, ...bilingualParts(subject.name)]) {
			const alias = businessNameKey(name);
			const previous = names.get(alias);
			if (alias && (!previous || subject.own || (!previous.own && alias === key))) {
				names.set(alias, { key, name: subject.name, own: subject.own });
			}
		}
	}
	return names;
}

function compareForms(a: string, b: string): number {
	return Number(scripts[0].test(b)) - Number(scripts[0].test(a)) || a.localeCompare(b, "en");
}

function matchUnseparatedForm(name: string, known: Map<string, BusinessIdentity>): BusinessIdentity | undefined {
	const tokens = businessNameKey(name).split(" ");
	const matches = new Map<string, BusinessIdentity>();
	for (let i = 1; i < tokens.length; i++) {
		const left = tokens.slice(0, i).join(" ");
		const right = tokens.slice(i).join(" ");
		if (!differentScripts(left, right)) continue;
		for (const key of [left, right]) {
			const identity = known.get(key);
			if (identity) matches.set(identity.key, identity);
		}
	}
	return matches.size === 1 ? matches.values().next().value : undefined;
}

interface BusinessForm {
	name: string;
	key: string;
	parts: string[];
}

function linkBilingualForms(
	forms: BusinessForm[],
	tracked: Map<string, BusinessIdentity>,
	preferred: Map<string, string>,
): Map<string, BusinessIdentity> {
	const links = new Map(tracked);
	const aliases = new Map<string, Map<string, BusinessIdentity>>();

	for (const { key, parts } of forms.filter((form) => form.parts.length > 0)) {
		if (tracked.has(key)) continue;
		const keys = parts.map(businessNameKey);
		const configured = keys.flatMap((part) => tracked.get(part) ?? []);
		if (configured.length === 2 && configured[0].key !== configured[1].key) continue;

		const [primary] = [...parts].sort(compareForms);
		const primaryKey = businessNameKey(primary);
		const identity = configured[0] ?? { key: primaryKey, name: preferred.get(primaryKey) ?? primary, own: false };

		links.set(key, identity);
		for (const alias of keys) {
			const choices = aliases.get(alias) ?? new Map<string, BusinessIdentity>();
			choices.set(identity.key, identity);
			aliases.set(alias, choices);
		}
	}

	// A spelling shared by separate identities is too ambiguous to use as an alias.
	for (const [alias, choices] of aliases) {
		const [identity] = choices.values();
		if (choices.size === 1 && !links.has(alias)) links.set(alias, identity);
	}
	return links;
}

function linkSpacingVariants(
	forms: BusinessForm[],
	known: Map<string, BusinessIdentity>,
	links: Map<string, BusinessIdentity>,
) {
	const candidates = new Map<string, Map<string, BusinessIdentity>>();
	for (const { name, key } of forms) {
		if (links.has(key)) continue;
		const spacedKey = businessNameKey(name.replace(/(\p{Ll})(\p{Lu}\p{Ll})/gu, "$1 $2"));
		if (key === spacedKey) continue;
		const identity = known.get(spacedKey) ?? findBase(spacedKey, known);
		if (!identity) continue;
		const choices = candidates.get(key) ?? new Map<string, BusinessIdentity>();
		choices.set(identity.key, identity);
		candidates.set(key, choices);
	}

	const names = new Map(known);
	for (const [key, choices] of candidates) {
		const [identity] = choices.values();
		if (choices.size === 1) names.set(key, identity);
	}

	return names;
}

function displayPreference(name: string): number {
	const plain = /^[\p{L}\p{M}\p{N}&+ ]+$/u.test(name) && name === name.normalize("NFKC");
	const mixedCase = /\p{Lu}/u.test(name) && /\p{Ll}/u.test(name);
	return Number(plain) * 2 + Number(mixedCase);
}

export function resolveBusinessNames(names: string[], subjects: TrackedBusiness[]) {
	const forms = names.map((name) => ({ name, key: businessNameKey(name), parts: bilingualParts(name) }));
	const preferred = new Map(
		[...forms]
			.sort((a, b) => displayPreference(a.name) - displayPreference(b.name) || b.name.localeCompare(a.name, "en"))
			.map(({ key, name }) => [key, name]),
	);
	const links = linkBilingualForms(forms, trackedNames(subjects), preferred);
	const standalone = new Map<string, BusinessIdentity>();
	for (const { key, name } of forms) {
		if (key && writingSystems(name).size === 1)
			standalone.set(key, { key, name: preferred.get(key) ?? name, own: false });
	}
	const known = new Map([...standalone, ...links]);
	const spellings = linkSpacingVariants(forms, known, links);
	const formatted = new Map(spellings);
	for (const { key } of forms) {
		if (links.has(key)) continue;
		const baseKey = spellings.get(key)?.key ?? key;
		if (links.has(baseKey)) continue;
		const base = findBase(baseKey, spellings);
		if (base) formatted.set(key, base);
	}

	return forms.map(({ name, key, parts }) => ({
		surface: name,
		...(formatted.get(key) ??
			(parts.length ? undefined : matchUnseparatedForm(name, formatted)) ?? {
				key,
				name: preferred.get(key) ?? name,
				own: false,
			}),
	}));
}
