import { useSearch } from '../features/search/hooks/useSearch';
import { AdminQueue } from '../features/admin/components/AdminQueue';

/**
 * Admin quarantine queue: flagged assets pulled from search and filtered to
 * `upload_status = 'flagged'`. These are visible for review here and excluded
 * from every report selection (AGENTS.md §3.1).
 */
export function AdminPage() {
  const { status, data, error, refetch } = useSearch({});
  return (
    <section aria-label="Admin queue">
      <h2>Quarantine queue</h2>
      <AdminQueue
        status={status}
        data={data?.data}
        error={error}
        onRetry={() => void refetch()}
      />
    </section>
  );
}
