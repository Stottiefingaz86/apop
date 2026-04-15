import type { FeatureStage } from "@prisma/client";
import type { FeatureAgent, AgentName } from "./types";
import { valueAnalystAgent } from "./value-analyst-agent";
import { prdWriterAgent } from "./prd-writer-agent";
import { designSpecAgent } from "./design-spec-agent";
import { buildAgent } from "./build-agent";
import { qaAgent } from "./qa-agent";
import { deploymentFixAgent } from "./deployment-fix-agent";

const AGENTS: FeatureAgent[] = [
  valueAnalystAgent,
  prdWriterAgent,
  designSpecAgent,
  buildAgent,
  qaAgent,
  deploymentFixAgent,
];

const byName = new Map<AgentName, FeatureAgent>(
  AGENTS.map((a) => [a.name, a]),
);

export function getAgent(name: AgentName): FeatureAgent | undefined {
  return byName.get(name);
}

export function getAgentForStage(stage: FeatureStage): FeatureAgent | undefined {
  return AGENTS.find((a) => a.stages.includes(stage));
}

export { AGENTS };
