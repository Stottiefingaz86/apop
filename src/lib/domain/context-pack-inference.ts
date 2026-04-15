import type { ContextPack } from "@/lib/domain/context-pack";

/**
 * Fills missing context-pack fields from title + description only (no LLM).
 * Does not override anything the user already stored or answered.
 */
export function enrichContextPackFromFeature(
  pack: ContextPack,
  feature: { title: string; description: string },
): ContextPack {
  const next: ContextPack = { ...pack };
  const text = `${feature.title}\n${feature.description}`.trim().toLowerCase();

  if (!text) return next;

  if (!next.productArea?.trim()) {
    if (/\b(in\s+the\s+)?main\s+nav(igation)?\b|\bprimary\s+navigation\b|\btop\s*nav\b|\bnavbar\b|\bnav\s+bar\b/.test(text)) {
      next.productArea = "Main navigation";
    } else if (/\bheader\b|\bsite\s+header\b/.test(text)) {
      next.productArea = "Header / site chrome";
    } else if (/\bsidebar\b/.test(text)) {
      next.productArea = "Sidebar";
    } else if (/\bfooter\b/.test(text)) {
      next.productArea = "Footer";
    } else if (/\bcheckout\b|\bcart\b/.test(text)) {
      next.productArea = "Checkout / cart";
    } else if (/\bonboarding\b|\bregistration\b|\bsign[-\s]?up\b/.test(text)) {
      next.productArea = "Onboarding / account";
    } else if (/\bsettings\b|\bpreferences\b/.test(text)) {
      next.productArea = "Settings";
    } else if (/\bdashboard\b|\bhome\s+page\b|\bhomepage\b|\blanding\b/.test(text)) {
      next.productArea = "Core product surface (home / dashboard)";
    } else if (/\bnav(?:igation)?\b|\bmenu\b/.test(text)) {
      next.productArea = "Navigation";
    }
  }

  if (!next.targetAudience?.trim()) {
    const area = next.productArea?.toLowerCase() ?? "";
    const looksGlobalChrome =
      /nav|header|menu|footer|sidebar|chrome|sitewide|global|main\s+nav/.test(area) ||
      /\b(all|every)\s+users\b|\b(end\s+)?users\b|\bplayers\b|\bcustomers\b|\bvisitors\b/.test(text);

    if (looksGlobalChrome || /\b(title|label|rename|wording|copy|text|string)\b/.test(text)) {
      next.targetAudience =
        "All users who see this part of the product (sitewide or broad surface — see description for specifics)";
    }
  }

  if (!next.primaryKpi?.trim()) {
    if (/\brevenue\b|\barpu\b|\bmargin\b/.test(text)) {
      next.primaryKpi = "Revenue / monetization";
    } else if (/\bconversion\b|\bctr\b|\bclick[-\s]?through\b/.test(text)) {
      next.primaryKpi = "Conversion";
    } else if (/\bengagement\b|\bretention\b|\btime\s+on\b|\bdaus?\b|\bmaus?\b/.test(text)) {
      next.primaryKpi = "Engagement / retention";
    } else if (/\btrust\b|\bbrand\b|\bcompliance\b|\bkyc\b/.test(text)) {
      next.primaryKpi = "Brand trust / compliance confidence";
    } else if (
      /\b(title|label|rename|wording|copy|text|navigation|nav|menu|ia\b|information\s+architecture)\b/.test(
        text,
      )
    ) {
      next.primaryKpi = "Navigation clarity & findability (correct labeling, less friction)";
    }
  }

  return next;
}
