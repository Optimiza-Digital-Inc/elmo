import type { Meta } from "@storybook/react";
import {
	DEFAULT_APP_ICON,
	DEFAULT_APP_NAME,
	DEFAULT_APP_THEME_COLOR,
	DEFAULT_CHART_COLORS,
} from "@workspace/config/constants";
import { Logo } from "@/components/logo";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const localEyesConfig: ClientConfig = {
	mode: "local",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
	},
	branding: {
		name: DEFAULT_APP_NAME,
		icon: DEFAULT_APP_ICON,
		chartColors: DEFAULT_CHART_COLORS.map((c) => c),
	},
	analytics: {},
	defaultDelayHours: 24,
	canRegister: false,
	hasUsers: true,
};

const whitelabelConfig: ClientConfig = {
	mode: "whitelabel",
	features: {
		readOnly: false,
		showOptimizeButton: true,
		canCreateBrands: false,
	},
	branding: {
		name: "BrandMonitor Pro",
		icon: "https://api.dicebear.com/9.x/shapes/svg?seed=brand",
		parentName: "AgencyCo",
		parentUrl: "https://agency.example.com",
		chartColors: DEFAULT_CHART_COLORS.map((c) => c),
	},
	analytics: {},
	defaultDelayHours: 24,
	canRegister: false,
	hasUsers: true,
};

export default {
	title: "Brand Kit",
} satisfies Meta;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="mb-10">
			<h2 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">{title}</h2>
			{children}
		</div>
	);
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
	return (
		<div className="flex flex-col items-center gap-1">
			<div className="w-12 h-12 rounded-lg border shadow-sm" style={{ backgroundColor: color }} />
			<span className="text-xs text-muted-foreground font-mono">{color}</span>
			{label && <span className="text-xs text-muted-foreground">{label}</span>}
		</div>
	);
}

export const LocalEyesBrandKit = () => {
	setMockClientConfig(localEyesConfig);
	setMockRouteContext({ clientConfig: localEyesConfig });

	return (
		<div className="p-8 max-w-4xl mx-auto space-y-2">
			<h1 className="text-2xl font-bold text-foreground mb-8">LocalEyes Brand Kit</h1>

			<Section title="Logo">
				<Logo />
			</Section>

			<Section title="App Icons">
				<div className="flex items-center gap-8">
					<img src={DEFAULT_APP_ICON} alt="LocalEyes Favicon" width={64} height={64} />
					<img src="/icons/localeyes/icon-maskable-512.png" alt="LocalEyes Maskable Icon" width={64} height={64} />
				</div>
			</Section>

			<Section title="Brand Colors">
				<div className="flex gap-6 flex-wrap">
					<ColorSwatch color={DEFAULT_APP_THEME_COLOR} label="Blue" />
					<ColorSwatch color="#00273d" label="Navy" />
					<ColorSwatch color="#3d3b3a" label="Charcoal" />
					<ColorSwatch color="#8d8d8d" label="Gray" />
					<ColorSwatch color="#e00016" label="Red" />
					<ColorSwatch color="#ffffff" label="White" />
				</div>
			</Section>

			<Section title="Chart Color Palette">
				<div className="flex flex-wrap gap-2">
					{DEFAULT_CHART_COLORS.map((color, i) => (
						<div key={color} className="flex flex-col items-center gap-1">
							<div className="w-8 h-8 rounded border shadow-sm" style={{ backgroundColor: color }} />
							<span className="text-[10px] text-muted-foreground font-mono">{i + 1}</span>
						</div>
					))}
				</div>
			</Section>
		</div>
	);
};

export const WhitelabelBrandPreview = () => {
	setMockClientConfig(whitelabelConfig);
	setMockRouteContext({ clientConfig: whitelabelConfig });

	return (
		<div className="p-8 max-w-4xl mx-auto space-y-2">
			<h1 className="text-2xl font-bold text-foreground mb-8">Whitelabel Brand Preview</h1>

			<Section title="Logo">
				<div className="flex items-center gap-8">
					<div className="flex flex-col items-center gap-2">
						<div className="bg-background border rounded-lg p-6">
							<Logo />
						</div>
						<span className="text-xs text-muted-foreground">Light background</span>
					</div>
					<div className="flex flex-col items-center gap-2">
						<div className="bg-gray-900 rounded-lg p-6">
							<Logo textClassName="text-gray-100" />
						</div>
						<span className="text-xs text-muted-foreground">Dark background</span>
					</div>
				</div>
			</Section>

			<Section title="Icon (128×128)">
				<div className="flex items-center gap-4">
					<div className="border rounded-lg p-2 bg-background">
						<img
							src={whitelabelConfig.branding.icon}
							alt="Whitelabel icon"
							width={128}
							height={128}
							style={{ width: 128, height: 128 }}
						/>
					</div>
					<div className="text-sm text-muted-foreground">
						<p>Single icon at 128×128 from environment variable.</p>
						<p className="font-mono text-xs mt-1">VITE_APP_ICON={whitelabelConfig.branding.icon}</p>
					</div>
				</div>
			</Section>

			<Section title="Branding Details">
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span className="text-muted-foreground">Name:</span>
						<span className="ml-2 font-medium">{whitelabelConfig.branding.name}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Parent:</span>
						<span className="ml-2 font-medium">{whitelabelConfig.branding.parentName}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Parent URL:</span>
						<span className="ml-2 font-mono text-xs">{whitelabelConfig.branding.parentUrl}</span>
					</div>
				</div>
			</Section>
		</div>
	);
};
