/**
 * Centralised TanStack Query key factory.
 *
 * Every query and every Realtime-driven invalidation references these builders
 * so a key can never drift between the place it is set and the place it is
 * invalidated (BUILD_ORDER Phase 8 — "invalidation on Realtime events" must be
 * mapped, not guessed). Keys are structured hierarchically so a broad
 * invalidation (`projects`) also clears everything nested under it.
 */

export type AssetSearchFilters = Readonly<Record<string, unknown>>;

export const queryKeys = {
  projects: {
    all: () => ['projects'] as const,
    tree: () => ['projects', 'tree'] as const,
    detail: (projectId: string) => ['projects', projectId] as const,
    assets: (projectId: string, filters: AssetSearchFilters = {}) =>
      ['projects', projectId, 'assets', filters] as const,
    changeEvents: (projectId: string) => ['projects', projectId, 'change-events'] as const,
  },
  assets: {
    integrity: (assetId: string) => ['assets', assetId, 'integrity'] as const,
    derivatives: (assetId: string) => ['assets', assetId, 'derivatives'] as const,
    auditTrail: (assetId: string) => ['assets', assetId, 'audit-trail'] as const,
    verifyChain: (assetId: string) => ['assets', assetId, 'verify-chain'] as const,
  },
  reports: {
    verification: (reportId: string) => ['reports', reportId, 'verification'] as const,
  },
  search: (filters: AssetSearchFilters = {}) => ['search', filters] as const,
  admin: {
    quarantine: (projectId?: string): readonly unknown[] =>
      projectId ? ['admin', 'quarantine', projectId] : ['admin', 'quarantine'],
  },
} as const;
