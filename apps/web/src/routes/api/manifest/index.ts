import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_ICON, DEFAULT_APP_THEME_COLOR } from "@workspace/config/constants";
import { getDeployment } from "@workspace/deployment";

interface ManifestIcon {
	src: string;
	sizes: string;
	type: string;
	purpose?: string;
}

function buildManifest(): object {
	const deployment = getDeployment();
	const { branding } = deployment;
	const hasCustomIcon = branding.icon !== DEFAULT_APP_ICON;

	const icons: ManifestIcon[] = hasCustomIcon
		? [{ src: branding.icon, sizes: "128x128", type: "image/png" }]
		: [
				{ src: DEFAULT_APP_ICON, sizes: "any", type: "image/svg+xml" },
				{ src: "/icons/localeyes/icon-192.png", sizes: "192x192", type: "image/png" },
				{ src: "/icons/localeyes/icon-512.png", sizes: "512x512", type: "image/png" },
				{
					src: "/icons/localeyes/icon-maskable-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			];

	const themeColor = hasCustomIcon ? "#000000" : DEFAULT_APP_THEME_COLOR;

	return {
		short_name: branding.name,
		name: `${branding.name} - AI Search Optimization`,
		icons,
		start_url: "/",
		scope: "/",
		display: "standalone",
		theme_color: themeColor,
		background_color: "#ffffff",
	};
}

export const Route = createFileRoute("/api/manifest/")({
	server: {
		handlers: {
			GET: () => {
				const manifest = buildManifest();
				return new Response(JSON.stringify(manifest, null, 2), {
					headers: {
						"Content-Type": "application/manifest+json",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
