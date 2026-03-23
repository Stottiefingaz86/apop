/**
 * App route map — Kanban, feature workspace, future admin.
 */
export const ROUTES = {
  home: "/",
  pipeline: "/pipeline",
  feature: (id: string) => `/features/${id}`,
  api: {
    features: "/api/features",
    feature: (id: string) => `/api/features/${id}`,
    featureRun: (id: string) => `/api/features/${id}/run`,
    featureAnswer: (id: string) => `/api/features/${id}/answer`,
    featureDesignInputs: (id: string) => `/api/features/${id}/design-inputs`,
  },
} as const;
