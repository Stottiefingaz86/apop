import {
  SITE_APOP_PRODUCTION_URL,
  siteApopRepositoryWebUrl,
} from "@/lib/delivery-site/site-apop-dna";

/**
 * Where implementation work lands (site-apop) and where users see it in prod.
 * Override with env when you fork or use another delivery repo.
 */
export type ApopDeliveryTarget = {
  repositoryWebUrl: string;
  productionUrl: string;
};

export function getApopDeliveryTarget(): ApopDeliveryTarget {
  return {
    repositoryWebUrl:
      process.env.APOP_DELIVERY_REPO_URL?.trim() || siteApopRepositoryWebUrl(),
    productionUrl:
      process.env.APOP_DELIVERY_PRODUCTION_URL?.trim() || SITE_APOP_PRODUCTION_URL,
  };
}
