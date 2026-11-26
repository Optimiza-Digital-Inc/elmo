import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";

import { readCompetitorDiscovery } from "@/lib/competitor-discovery-read";

export const getCompetitorDiscovery = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), promptId: z.string().uuid().optional() }))
	.handler(async ({ data: { brandId, promptId } }) => {
		await requireBrandSession(brandId);
		return readCompetitorDiscovery(brandId, promptId);
	});
