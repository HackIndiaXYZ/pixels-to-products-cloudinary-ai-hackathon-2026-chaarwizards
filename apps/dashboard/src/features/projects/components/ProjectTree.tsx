import type { Project } from '@impact/shared/rn';
import type { ProjectTreeNode } from '../api';

/**
 * Hierarchical project picker with observation-type badges (BUILD_ORDER
 * Phase 8). Each node renders the badges from its `config.observation_types[]`
 * so a reviewer can see at a glance which sectors a project captures, and
 * nested sub-projects are indented under their parent.
 */
export interface ProjectTreeProps {
  readonly nodes: readonly ProjectTreeNode[];
  readonly selectedProjectId?: string;
  readonly onSelect: (project: Project) => void;
}

function ObservationTypeBadges({ project }: { readonly project: Project }) {
  const types = project.config.observation_types;
  if (types.length === 0) {
    return null;
  }
  return (
    <span data-testid="observation-badges">
      {types.map((t) => (
        <span key={t.type} className="badge" data-testid="observation-badge">
          {t.label ?? t.type}
        </span>
      ))}
    </span>
  );
}

function TreeNode({
  node,
  depth,
  selectedProjectId,
  onSelect,
}: {
  readonly node: ProjectTreeNode;
  readonly depth: number;
  readonly selectedProjectId: string | undefined;
  readonly onSelect: (project: Project) => void;
}) {
  const isSelected = node.project.id === selectedProjectId;
  return (
    <li>
      <button
        type="button"
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onSelect(node.project)}
        style={{ paddingLeft: `${depth * 16}px` }}
        data-testid="project-node"
      >
        <span>{node.project.name}</span>
        <ObservationTypeBadges project={node.project} />
      </button>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.project.id}
              node={child}
              depth={depth + 1}
              selectedProjectId={selectedProjectId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ProjectTree({ nodes, selectedProjectId, onSelect }: ProjectTreeProps) {
  return (
    <nav aria-label="Projects">
      <ul>
        {nodes.map((node) => (
          <TreeNode
            key={node.project.id}
            node={node}
            depth={0}
            selectedProjectId={selectedProjectId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}
