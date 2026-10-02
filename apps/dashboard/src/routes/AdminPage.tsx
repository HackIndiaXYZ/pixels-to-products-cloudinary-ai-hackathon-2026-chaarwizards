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
    <>
      <div className="page-header">
        <h1 className="page-title">Quarantine queue</h1>
      </div>
      <section className="card" aria-label="Admin queue">
        <div className="card-header">
          <h2 className="card-title">Flagged assets for review</h2>
          <span className="badge danger">Needs attention</span>
        </div>
        <AdminQueue
          status={status}
          data={data?.data}
          error={error}
          onRetry={() => void refetch()}
        />
      </section>
    </>
  );
}
