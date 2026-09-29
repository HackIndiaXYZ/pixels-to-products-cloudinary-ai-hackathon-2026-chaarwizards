import { useNavigate } from 'react-router-dom';
import { AsyncView } from '../shared/components/QueryBoundary';
import { useProjectTree } from '../features/projects/hooks/useProjects';
import { ProjectTree } from '../features/projects/components/ProjectTree';
import type { ProjectTreeNode } from '../features/projects/api';

/** Dashboard home: the hierarchical project picker with observation badges. */
export function HomePage() {
  const navigate = useNavigate();
  const { status, data, error, refetch } = useProjectTree();

  return (
    <section aria-label="Projects home">
      <h2>Projects</h2>
      <AsyncView<readonly ProjectTreeNode[]>
        status={status}
        data={data}
        error={error}
        isEmpty={(d) => d.length === 0}
        emptyLabel="No projects yet."
        onRetry={() => void refetch()}
      >
        {(nodes) => (
          <ProjectTree
            nodes={nodes}
            onSelect={(project) => navigate(`/search?project=${project.id}`)}
          />
        )}
      </AsyncView>
    </section>
  );
}
