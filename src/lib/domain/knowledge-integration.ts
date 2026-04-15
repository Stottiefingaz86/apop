export type KnowledgeIntegrationProvider = "intercom" | "mixpanel" | "saga" | "other";

export type KnowledgeIntegrationEnvVar = { label: string; envVarName: string };

export type KnowledgeIntegrationMeta = {
  provider: KnowledgeIntegrationProvider;
  /** When provider is `other` */
  providerLabel?: string;
  /** Optional docs / dashboard link */
  docsUrl?: string;
  /** Human labels + **environment variable names** only — never store secret values here */
  envVars: KnowledgeIntegrationEnvVar[];
  /** Non-secret ids: Mixpanel project id, Intercom workspace id, etc. */
  publicWorkspaceId?: string;
  /** How agents / engineers should use this integration */
  notes?: string;
};

export const KNOWLEDGE_INTEGRATION_PROVIDERS: {
  value: KnowledgeIntegrationProvider | "";
  label: string;
}[] = [
  { value: "", label: "No third-party tool" },
  { value: "intercom", label: "Intercom" },
  { value: "mixpanel", label: "Mixpanel" },
  { value: "saga", label: "Saga" },
  { value: "other", label: "Other" },
];

export const INTEGRATION_PRESET: Record<
  KnowledgeIntegrationProvider,
  { envVars: KnowledgeIntegrationEnvVar[]; docsUrl: string; hint: string }
> = {
  intercom: {
    envVars: [{ label: "Access token (server-side only)", envVarName: "INTERCOM_ACCESS_TOKEN" }],
    docsUrl: "https://developers.intercom.com/",
    hint: "Create an app in Intercom Developer Hub; store the token in `.env` or your host secret store — not in this form.",
  },
  mixpanel: {
    envVars: [
      { label: "Project token (often client-safe)", envVarName: "MIXPANEL_PROJECT_TOKEN" },
      { label: "API secret (server / export only)", envVarName: "MIXPANEL_API_SECRET" },
    ],
    docsUrl: "https://developer.mixpanel.com/",
    hint: "Never put the API secret in the database. Reference env names here; set values in deployment secrets.",
  },
  saga: {
    envVars: [
      { label: "API key", envVarName: "SAGA_API_KEY" },
      { label: "Base URL (if applicable)", envVarName: "SAGA_API_BASE_URL" },
    ],
    docsUrl: "",
    hint: "Adjust variable names to match your Saga product’s docs; values live only in environment/secrets.",
  },
  other: {
    envVars: [],
    docsUrl: "",
    hint: "Add one row per credential: a clear label and the **environment variable name** (e.g. STRIPE_SECRET_KEY), not the secret itself.",
  },
};

export function formatIntegrationForAgentsBlock(i: KnowledgeIntegrationMeta): string {
  const name =
    i.provider === "other" && i.providerLabel?.trim()
      ? i.providerLabel.trim()
      : KNOWLEDGE_INTEGRATION_PROVIDERS.find((p) => p.value === i.provider)?.label ?? i.provider;

  const lines: string[] = [`**Integration:** ${name}`];
  if (i.docsUrl?.trim()) {
    lines.push(`**Docs:** ${i.docsUrl.trim()}`);
  }
  if (i.publicWorkspaceId?.trim()) {
    lines.push(`**Workspace / project id (non-secret):** ${i.publicWorkspaceId.trim()}`);
  }
  if (i.envVars.length) {
    lines.push(
      "**Env vars (set values in `.env` / secret manager — agents only see names):**",
      ...i.envVars.map((r) => `- ${r.label}: \`${r.envVarName}\``),
    );
  }
  if (i.notes?.trim()) {
    lines.push(`**Integration notes:** ${i.notes.trim()}`);
  }
  return lines.join("\n");
}
