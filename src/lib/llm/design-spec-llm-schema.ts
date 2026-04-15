import { z } from "zod";

export const designSpecLlmSchema = z.object({
  uxPatterns: z.array(z.string()),
  componentRecommendations: z.array(z.string()),
  cursorImplementationNarrative: z.string(),
  stateAndEdgeCases: z.string(),
  /** One line for roadmap / portfolio: why this work matters */
  roadmapValueAngle: z.string(),
  accessibilityNotes: z.string().optional().default(""),
});

export type DesignSpecLlmParsed = z.infer<typeof designSpecLlmSchema>;
