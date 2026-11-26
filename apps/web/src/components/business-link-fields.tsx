import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { useId, useState } from "react";
import {
	isGenericGoogleDomain,
	normalizeBusinessWebsite,
	normalizeProfileLink,
	profileLinkNeedsReview,
} from "@/lib/business-links";

export function GoogleDomainReview({ domains }: { domains: string[] }) {
	if (!domains.some(isGenericGoogleDomain)) return null;
	return (
		<p className="text-xs text-muted-foreground">
			If the Google domain came from a business listing, replace it with the full listing URL under Profile Links.
		</p>
	);
}

export function ProfileLinksField({
	links,
	onChange,
	disabled,
}: {
	links: string[];
	onChange: (links: string[]) => void;
	disabled?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<Label>Profile Links (Optional)</Label>
			<TagsInput
				value={links}
				onValueChange={onChange}
				placeholder="Add a Profile Link"
				searchPlaceholder="https://…"
				pasteSplitter={/[\n\t]+/}
				normalizeValue={(value) => normalizeProfileLink(value) ?? value.trim()}
				onValidate={(value) => Boolean(normalizeProfileLink(value)) || "Enter a full HTTP or HTTPS profile link"}
				disabled={disabled}
			/>
			<p className="text-xs text-muted-foreground">
				Add links to Google Business Profile, social accounts, or other public profiles.
			</p>
			{links.some(profileLinkNeedsReview) && (
				<p className="text-xs text-muted-foreground">
					Replace any platform homepage with a link to your specific business profile.
				</p>
			)}
		</div>
	);
}

export interface BusinessLinkValues {
	website: string;
	profileLinks: string[];
}

export function BusinessLinkFields({
	value,
	onChange,
	disabled,
}: {
	value: BusinessLinkValues;
	onChange: (value: BusinessLinkValues) => void;
	disabled?: boolean;
}) {
	const websiteId = useId();
	const [moved, setMoved] = useState(false);
	return (
		<>
			<div className="space-y-1.5">
				<Label htmlFor={websiteId}>Website (Optional)</Label>
				<Input
					id={websiteId}
					name="website"
					type="text"
					placeholder="example.com"
					disabled={disabled}
					value={value.website}
					onChange={(event) => {
						setMoved(false);
						onChange({ website: event.target.value, profileLinks: value.profileLinks });
					}}
					onBlur={() => {
						const result = normalizeBusinessWebsite(value.website);
						if (result.ok && result.movedProfileLink) {
							onChange({ website: "", profileLinks: [...new Set([...value.profileLinks, result.movedProfileLink])] });
							setMoved(true);
						}
					}}
				/>
				{moved && (
					<p role="status" className="text-xs text-muted-foreground">
						Moved to Profile Links.
					</p>
				)}
			</div>
			<ProfileLinksField
				links={value.profileLinks}
				onChange={(profileLinks) => onChange({ website: value.website, profileLinks })}
				disabled={disabled}
			/>
		</>
	);
}
