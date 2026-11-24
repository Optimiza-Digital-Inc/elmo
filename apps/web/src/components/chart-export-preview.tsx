import type { Competitor } from "@workspace/lib/db/schema";
import { Badge } from "@workspace/ui/components/badge";
import type { ChartDataPoint, ChartSubject } from "@/lib/chart-utils";
import { visibilityBadgeProps } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { BaseChart } from "./base-chart";
import { BrandLogo } from "./logo";

interface ChartExportBranding {
	name?: string;
	icon?: string;
	parentUrl?: string;
	isWhitelabel: boolean;
	chartColors: string[];
}

export interface ChartExportPreviewProps {
	promptName: string;
	visibility: number | null;
	data: ChartDataPoint[];
	lookback: LookbackPeriod;
	brand: ChartSubject;
	competitors: Competitor[];
	branding: ChartExportBranding;
}

const EXPORT_W = 1200;
const EXPORT_H = 628;

const HEADER_H = 56;
const HEADER_TOP = 16;
const GAP_HEADER_CARD = 16;
const CARD_PADDING_Y = 24;
const FOOTER_REGION = 80;
const CHART_H = EXPORT_H - HEADER_TOP - HEADER_H - GAP_HEADER_CARD - CARD_PADDING_Y - FOOTER_REGION;

export function ChartExportPreview({
	promptName,
	visibility,
	data,
	lookback,
	brand,
	competitors,
	branding,
}: ChartExportPreviewProps) {
	const domain =
		branding.parentUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? (branding.isWhitelabel ? "" : "localeyes.ai");

	return (
		<div
			style={{ width: EXPORT_W, height: EXPORT_H, paddingTop: HEADER_TOP, fontSize: 16 }}
			className="bg-white overflow-hidden flex flex-col"
		>
			<div
				style={{ height: HEADER_H, marginBottom: GAP_HEADER_CARD }}
				className="flex items-center justify-between px-10 gap-6 shrink-0"
			>
				<h2 className="font-semibold text-gray-900 truncate flex-1 min-w-0" style={{ fontSize: 22 }} title={promptName}>
					{promptName}
				</h2>
				{visibility !== null && (
					<Badge
						variant={visibilityBadgeProps(visibility).variant}
						className={`${visibilityBadgeProps(visibility).className} shrink-0`}
						style={{ fontSize: 16, padding: "4px 14px" }}
					>
						{visibility}% Visibility
					</Badge>
				)}
			</div>

			<div className="px-8 shrink-0">
				<div
					className="rounded-xl border border-gray-200 overflow-hidden pl-0"
					style={{ paddingRight: 12, paddingTop: 12, paddingBottom: 8 }}
				>
					<BaseChart
						data={data}
						lookback={lookback}
						brand={brand}
						competitors={competitors}
						chartColors={branding.chartColors}
						chartHeight={`${CHART_H}px`}
					/>
				</div>
			</div>

			{/* Branding footer — fills remaining space, content vertically centered */}
			<div className="flex-1 flex items-center justify-between px-10 min-h-0">
				<BrandLogo
					branding={branding}
					className="gap-3"
					iconClassName="size-7"
					textClassName="text-lg text-muted-foreground"
					crossOrigin="anonymous"
				/>
				<span style={{ fontSize: 18 }} className="text-gray-400 font-medium">
					{domain}
				</span>
			</div>
		</div>
	);
}
