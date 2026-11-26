/**
 * Which saves have earned an immediate run.
 *
 * A platform or premium model that was just added has no run history, so its
 * target is due the moment it is saved — waiting out the cadence leaves the
 * customer looking at a setting that hasn't taken effect. Dropping one, or
 * saving with nothing changed, earns nothing: the cycle it would trigger is
 * paid provider calls for answers already on file.
 */

/**
 * Platforms `next` adds over `previous`. Null on either side means "every
 * configured target", which is what a brand with no explicit picks follows.
 */
export function addedPlatforms(previous: string[] | null, next: string[] | null, configured: string[]): string[] {
	const before = new Set(previous ?? configured);
	return (next ?? configured).filter((model) => !before.has(model));
}

export function promptsNeedingImmediateRun(
	before: Map<string, { enabled: boolean; premiumModels: string[] }>,
	after: { id: string; enabled: boolean; premiumModels: string[] }[],
): string[] {
	return after
		.filter((prompt) => {
			const previous = before.get(prompt.id);
			if (!prompt.enabled || !previous) return false;
			return !previous.enabled || prompt.premiumModels.some((model) => !previous.premiumModels.includes(model));
		})
		.map((prompt) => prompt.id);
}
