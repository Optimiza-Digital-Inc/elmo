import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
	wordmarkClassName?: string;
}

interface BrandLogoProps extends LogoProps {
	branding?: { name?: string; icon?: string };
	crossOrigin?: ComponentPropsWithoutRef<"img">["crossOrigin"];
}

export function BrandLogo({
	branding,
	className,
	iconClassName,
	textClassName,
	wordmarkClassName,
	crossOrigin,
	...props
}: BrandLogoProps) {
	const name = branding?.name || DEFAULT_APP_NAME;
	const icon = branding?.icon || DEFAULT_APP_ICON;
	const usesDefaultLogo = name === DEFAULT_APP_NAME && icon === DEFAULT_APP_ICON;

	return (
		<div {...props} className={cn("flex items-center gap-2", className)}>
			{usesDefaultLogo ? (
				<img
					src="/icons/localeyes/wordmark.svg"
					alt={name}
					width={2116}
					height={321}
					className={cn("h-6 w-auto", wordmarkClassName)}
				/>
			) : (
				<>
					<img
						src={icon}
						alt={`${name} logo`}
						className={cn("size-5 object-contain", iconClassName)}
						crossOrigin={crossOrigin}
					/>
					<span className={cn("text-base font-semibold", textClassName)}>{name}</span>
				</>
			)}
		</div>
	);
}

export function Logo(props: LogoProps) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	return <BrandLogo branding={context.clientConfig?.branding} {...props} />;
}
