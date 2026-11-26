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
		.replace(/[^\p{L}\p{M}\p{N}&+'’]+/gu, " ")
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

function bilingualParts(name: string): string[] {
	const divided = name.split(/\s*[|｜]\s*|\s+[–—-]\s+/u);
	const parenthetical = /^(.+?)\s*[(（]([^()（）]+)[)）]\s*$/u.exec(name);
	const pair = divided.length === 2 ? divided : parenthetical?.slice(1);
	return pair && differentScripts(pair[0], pair[1]) ? pair.map((part) => part.trim()) : [];
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

export function resolveBusinessNames(names: string[], subjects: TrackedBusiness[]) {
	const forms = names.map((name) => ({ name, key: businessNameKey(name), parts: bilingualParts(name) }));
	const preferred = new Map(
		[...forms].sort((a, b) => b.name.localeCompare(a.name, "en")).map(({ key, name }) => [key, name]),
	);
	const links = linkBilingualForms(forms, trackedNames(subjects), preferred);
	const standalone = new Map<string, BusinessIdentity>();
	for (const { key, name } of forms) {
		if (key && writingSystems(name).size === 1)
			standalone.set(key, { key, name: preferred.get(key) ?? name, own: false });
	}
	const known = new Map([...standalone, ...links]);

	return forms.map(({ name, key, parts }) => ({
		surface: name,
		...(known.get(key) ??
			(parts.length ? undefined : matchUnseparatedForm(name, known)) ?? {
				key,
				name: preferred.get(key) ?? name,
				own: false,
			}),
	}));
}
