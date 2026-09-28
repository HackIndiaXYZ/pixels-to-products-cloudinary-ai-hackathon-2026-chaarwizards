/**
 * Project picker screen (BUILD_ORDER Phase 4 "Project picker"). Renders the
 * hierarchical project tree, resolves each project's observation types (with the
 * two-level inheritance proven by the unit tests), and lets the worker pick a
 * project, observation type, and phase before capturing.
 */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  PHASE_OPTIONS,
  buildProjectTree,
  resolveObservationTypes,
  validateSelection,
  type CaptureSelection,
  type ProjectNode,
} from '../projects.js';
import type { AssetPhase, Project } from '@impact/shared/rn';

interface Props {
  readonly projects: readonly Project[];
  readonly onSelected: (selection: CaptureSelection) => void;
}

interface FlatRow {
  readonly project: Project;
  readonly depth: number;
}

function flatten(nodes: readonly ProjectNode[], depth = 0): FlatRow[] {
  return nodes.flatMap((node) => [
    { project: node.project, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

export function ProjectPickerScreen({ projects, onSelected }: Props): JSX.Element {
  const rows = useMemo(() => flatten(buildProjectTree(projects)), [projects]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [observationType, setObservationType] = useState<string | null>(null);
  const [phase, setPhase] = useState<AssetPhase | null>(null);

  const observationTypes = useMemo(
    () => (projectId !== null ? resolveObservationTypes(projects, projectId) : []),
    [projects, projectId],
  );

  const canConfirm =
    projectId !== null &&
    observationType !== null &&
    phase !== null &&
    validateSelection(projects, { projectId, observationType, phase }).ok;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Select project</Text>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.project.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.project.id === projectId && styles.rowActive]}
            onPress={() => {
              setProjectId(item.project.id);
              setObservationType(null);
              setPhase(null);
            }}
          >
            <Text style={{ marginLeft: item.depth * 16 }}>{item.project.name}</Text>
          </Pressable>
        )}
      />

      {projectId !== null && (
        <>
          <Text style={styles.heading}>Observation type</Text>
          {observationTypes.length === 0 ? (
            <Text style={styles.muted}>No observation types configured for this project.</Text>
          ) : (
            observationTypes.map((t) => (
              <Pressable
                key={t.type}
                style={[styles.chip, t.type === observationType && styles.chipActive]}
                onPress={() => setObservationType(t.type)}
              >
                <Text>{t.type}</Text>
              </Pressable>
            ))
          )}

          <Text style={styles.heading}>Phase</Text>
          {PHASE_OPTIONS.map((p) => (
            <Pressable
              key={p}
              style={[styles.chip, p === phase && styles.chipActive]}
              onPress={() => setPhase(p)}
            >
              <Text>{p}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Pressable
        disabled={!canConfirm}
        style={[styles.confirm, !canConfirm && styles.confirmDisabled]}
        onPress={() => {
          if (projectId !== null && observationType !== null && phase !== null) {
            onSelected({ projectId, observationType, phase });
          }
        }}
      >
        <Text style={styles.confirmText}>Continue to camera</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  muted: { color: '#888' },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowActive: { backgroundColor: '#e6f0ff' },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 6,
  },
  chipActive: { backgroundColor: '#e6f0ff', borderColor: '#3b82f6' },
  confirm: { marginTop: 24, backgroundColor: '#3b82f6', padding: 14, borderRadius: 10 },
  confirmDisabled: { backgroundColor: '#9db8e8' },
  confirmText: { color: 'white', textAlign: 'center', fontWeight: '600' },
});
