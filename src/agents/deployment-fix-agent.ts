import type { FeatureAgent, AgentRunResult } from "./types";
import { ARTIFACT_TYPES } from "@/lib/domain/artifact-types";

function extractFileHints(log: string): string[] {
  const paths = new Set<string>();
  const re = /(?:\/[\w.-]+)+\.(?:tsx?|jsx?|mjs|cjs|json|css)\b|(?:\.\/|\.\.\/)[\w./-]+\.(?:tsx?|jsx?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(log)) !== null) {
    const p = m[0];
    if (p.length < 400) paths.add(p);
    if (paths.size >= 25) break;
  }
  return [...paths];
}

export const deploymentFixAgent: FeatureAgent = {
  name: "deployment-fix-agent",
  stages: ["IN_BUILD"],
  async run(ctx): Promise<AgentRunResult> {
    const d = ctx.deploymentDiagnostics;
    if (!d) {
      return { kind: "failed", error: "Missing deployment diagnostics context" };
    }

    const hints = extractFileHints(d.buildLogExcerpt + (d.errorMessage ?? ""));
    const contentJson = {
      releaseId: d.releaseId,
      vercelDeploymentId: d.vercelDeploymentId,
      errorMessage: d.errorMessage,
      inspectorUrl: d.inspectorUrl,
      suspectedPaths: hints,
      remediationSteps: [
        "Open the Vercel deployment inspector and confirm the failing step (install, build, or runtime).",
        "Reproduce locally with the same Node version Vercel uses (see project Settings → General).",
        "Fix TypeScript or ESLint errors at the paths referenced in the log; redeploy from APOP.",
        "If the failure is environmental, align env vars between Vercel and `.env.example` in site-apop.",
      ],
    };

    const md = [
      `# Deployment failure remediation`,
      ``,
      `**Deployment:** \`${d.vercelDeploymentId}\``,
      d.inspectorUrl ? `**Inspector:** ${d.inspectorUrl}` : "",
      d.errorMessage ? `\n## Vercel error\n\`\`\`text\n${d.errorMessage}\n\`\`\`` : "",
      `\n## Build log (excerpt, auto-fetched)\n\`\`\`text\n${d.buildLogExcerpt.slice(0, 12_000)}\n\`\`\``,
      hints.length
        ? `\n## Paths mentioned in logs\n${hints.map((p) => `- \`${p}\``).join("\n")}`
        : "",
      `\n## Suggested next actions\n`,
      ...contentJson.remediationSteps.map((s) => `- ${s}`),
      ``,
      `_This artifact was generated automatically from Vercel API logs — no manual copy-paste._`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      kind: "artifact",
      type: ARTIFACT_TYPES.DEPLOYMENT_REMEDIATION,
      contentJson,
      contentMarkdown: md,
      needsReview: true,
    };
  },
};
