ALTER TABLE "brands" ALTER COLUMN "website" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "profile_links" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitors" ADD COLUMN "profile_links" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE FUNCTION pg_temp.is_business_profile_link(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
	SELECT value ~* '^(https?://)?([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me|g\.page|instagram\.com|linkedin\.com|maps\.app\.goo\.gl|pinterest\.com|reddit\.com|share\.google|snapchat\.com|threads\.com|threads\.net|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|maps\.google\.(com|[a-z]{2}|(com|co)\.[a-z]{2}))([/:?#]|$)'
		OR value ~* '^(https?://)?([a-z0-9-]+\.)*(google\.(com|[a-z]{2}|(com|co)\.[a-z]{2})|goo\.gl)/maps([/?#]|$)'
		OR value ~* '^(https?://)?([a-z0-9-]+\.)*google\.(com|[a-z]{2}|(com|co)\.[a-z]{2})/[^#]*[?&](cid|ludocid|kgmid|placeid)=';
$$;
--> statement-breakpoint
UPDATE "brands"
SET
	"profile_links" = ARRAY(
		SELECT DISTINCT CASE WHEN entry ~* '^https?://' THEN entry ELSE 'https://' || entry END
		FROM unnest(array_prepend("website", "additional_domains")) AS entry
		WHERE pg_temp.is_business_profile_link(entry)
	),
	"website" = CASE WHEN pg_temp.is_business_profile_link("website") OR btrim("website") = '' THEN NULL ELSE "website" END,
	"additional_domains" = ARRAY(
		SELECT entry FROM unnest("additional_domains") WITH ORDINALITY AS entries(entry, position)
		WHERE NOT pg_temp.is_business_profile_link(entry)
		ORDER BY position
	)
WHERE btrim("website") = '' OR EXISTS (
	SELECT FROM unnest(array_prepend("website", "additional_domains")) AS entry
	WHERE pg_temp.is_business_profile_link(entry)
);
--> statement-breakpoint
UPDATE "competitors"
SET
	"profile_links" = ARRAY(
		SELECT DISTINCT CASE WHEN entry ~* '^https?://' THEN entry ELSE 'https://' || entry END
		FROM unnest("domains") AS entry WHERE pg_temp.is_business_profile_link(entry)
	),
	"domains" = ARRAY(
		SELECT entry FROM unnest("domains") WITH ORDINALITY AS entries(entry, position)
		WHERE NOT pg_temp.is_business_profile_link(entry)
		ORDER BY position
	)
WHERE EXISTS (
	SELECT FROM unnest("domains") AS entry WHERE pg_temp.is_business_profile_link(entry)
);
--> statement-breakpoint
DROP FUNCTION pg_temp.is_business_profile_link(text);
