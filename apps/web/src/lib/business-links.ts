import { cleanAndValidateDomain, inDomainSet } from "@workspace/lib/citations/domain-categories";
import { z } from "zod";
import { validateWebsiteUrl } from "./brand-website";

const profilePlatforms = new Set([
	"facebook.com",
	"fb.com",
	"fb.me",
	"g.page",
	"instagram.com",
	"linkedin.com",
	"maps.app.goo.gl",
	"pinterest.com",
	"reddit.com",
	"share.google",
	"snapchat.com",
	"threads.com",
	"threads.net",
	"tiktok.com",
	"twitter.com",
	"x.com",
	"youtube.com",
	"youtu.be",
]);
const googleHost = /(?:^|\.)google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/;

function isSharedProfileHost(host: string): boolean {
	return inDomainSet(host, profilePlatforms) || (host.startsWith("maps.") && googleHost.test(host));
}

function isProfilePlatformUrl(input: string): boolean {
	const url = new URL(input);
	const { hostname, pathname, searchParams } = url;
	return (
		isSharedProfileHost(hostname) ||
		(hostname === "goo.gl" && /^\/maps(?:\/|$)/.test(pathname)) ||
		(googleHost.test(hostname) &&
			(/^\/maps(?:\/|$)/.test(pathname) || ["cid", "ludocid", "kgmid", "placeid"].some((key) => searchParams.has(key))))
	);
}

export function profileLinkNeedsReview(input: string): boolean {
	const validation = validateWebsiteUrl(input);
	if (!validation.isValid) return true;
	const url = new URL(validation.formattedUrl);
	return url.pathname === "/" && !url.search && isSharedProfileHost(url.hostname);
}

export function isGenericGoogleDomain(input: string): boolean {
	const validation = validateWebsiteUrl(input);
	if (!validation.isValid) return false;
	const url = new URL(validation.formattedUrl);
	return googleHost.test(url.hostname) && !isSharedProfileHost(url.hostname) && url.pathname === "/" && !url.search;
}

export function normalizeProfileLink(input: string): string | null {
	if (!/^https?:\/\//i.test(input.trim())) return null;
	const validation = validateWebsiteUrl(input);
	if (!validation.isValid) return null;
	const { hostname } = new URL(validation.formattedUrl);
	if (/^[\d.]+$|\.(?:local|localhost|internal)\.?$/i.test(hostname)) return null;
	return validation.formattedUrl;
}

export const profileLinksSchema = z.array(
	z.string().refine((value) => normalizeProfileLink(value) !== null, "Enter a full HTTP or HTTPS profile link"),
);

export function normalizeProfileLinks(values: string[]): string[] {
	return [...new Set(values.map(normalizeProfileLink).filter((link) => link !== null))];
}

export function normalizeBusinessWebsite(input: string | null | undefined) {
	if (!input?.trim()) return { ok: true, website: null, movedProfileLink: null } as const;
	const validation = validateWebsiteUrl(input);
	if (!validation.isValid) return { ok: false, error: validation.error } as const;
	const url = validation.formattedUrl;
	return isProfilePlatformUrl(url)
		? ({ ok: true, website: null, movedProfileLink: url } as const)
		: ({ ok: true, website: url, movedProfileLink: null } as const);
}

export function isSharedDomainInput(input: string): boolean {
	const validation = validateWebsiteUrl(input);
	return validation.isValid && isProfilePlatformUrl(validation.formattedUrl);
}

export function cleanOwnedDomain(input: string): string | null {
	return isSharedDomainInput(input) ? null : cleanAndValidateDomain(input);
}

export const ownedDomainInputsSchema = z.array(
	z
		.string()
		.refine((value) => !isSharedDomainInput(value), "Use profileLinks for Google Business Profile and social links"),
);
