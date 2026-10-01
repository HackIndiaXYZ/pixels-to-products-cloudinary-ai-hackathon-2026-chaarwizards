import type { ChangeEvent } from '@panchnama/shared/rn';
import { apiRequest } from '../../shared/api/client';

export interface ChangeEventListResponse {
  readonly data: readonly ChangeEvent[];
}

/** List change events for a project (org-scoped by RLS via the JWT). */
export async function listChangeEvents(projectId: string): Promise<ChangeEventListResponse> {
  return apiRequest<ChangeEventListResponse>(`/v1/projects/${projectId}/change-events`);
}
