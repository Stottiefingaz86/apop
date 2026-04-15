import { competitiveLandscapeStructuredForLlm } from "@/lib/domain/competitive-landscape";
import { getApopDeliveryTarget } from "@/lib/domain/delivery-target";
import {
  SITE_APOP_APP_ROUTES,
  SITE_APOP_GLOBAL_SHELL,
  SITE_APOP_PRODUCT_VERTICALS,
  SITE_APOP_STACK,
  siteApopDesignSystemForLlm,
  siteApopDnaSummary,
} from "@/lib/delivery-site/site-apop-dna";
import { shadcnPortalBriefPlain } from "@/lib/ui-agent/shadcn-portal";

/**
 * Bundled context for PRD/design LLMs — delivery repo (site-apop) + portal UI rules.
 * Not a live git clone; DNA is curated in `site-apop-dna.ts`.
 */
export function deliverySiteContextForLlm(): Record<string, unknown> {
  const delivery = getApopDeliveryTarget();
  return {
    deliveryRepository: delivery.repositoryWebUrl,
    productionUrl: delivery.productionUrl,
    dnaSummary: siteApopDnaSummary(),
    appRoutes: SITE_APOP_APP_ROUTES,
    productVerticals: SITE_APOP_PRODUCT_VERTICALS,
    stack: SITE_APOP_STACK,
    globalShell: SITE_APOP_GLOBAL_SHELL,
    /** Delivery site-apop library: shadcn inventory, custom components, brand tokens, dependency versions */
    siteApopDesignSystem: siteApopDesignSystemForLlm(),
    apopPortalShadcnRules: shadcnPortalBriefPlain(),
    competitiveLandscape: competitiveLandscapeStructuredForLlm(),
  };
}
