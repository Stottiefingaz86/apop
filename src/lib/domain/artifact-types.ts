/** Logical artifact kinds stored in Artifact.type */
export const ARTIFACT_TYPES = {
  VALUE_ANALYSIS: "value_analysis",
  PRD: "prd",
  DESIGN_SPEC: "design_spec",
  AGENT_QUESTIONS: "agent_questions",
  BUILD_PLACEHOLDER: "build_placeholder",
  QA_PLACEHOLDER: "qa_placeholder",
} as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[keyof typeof ARTIFACT_TYPES];
