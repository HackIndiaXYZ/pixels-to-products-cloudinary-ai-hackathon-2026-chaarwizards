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
import { colors } from '../theme.js';
import type { AssetPhase, Project } from '@panchnama/shared/rn';

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
      <Text style={styles.mainTitle}>Select Inspection Project</Text>
      <Text style={styles.subTitle}>Choose your assigned location and evidence scope</Text>

      <Text style={styles.heading}>Active Projects</Text>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.project.id}
        renderItem={({ item }) => {
          const isSelected = item.project.id === projectId;
          return (
            <Pressable
              style={[styles.card, isSelected && styles.cardActive]}
              onPress={() => {
                setProjectId(item.project.id);
                setObservationType(null);
                setPhase(null);
              }}
            >
              <View style={{ marginLeft: item.depth * 16 }}>
                <Text style={[styles.cardTitle, isSelected && styles.cardTitleActive]}>
                  {item.depth > 0 ? '↳ ' : ''}{item.project.name}
                </Text>
                <Text style={styles.cardOrg}>ID: {item.project.id.slice(0, 18)}…</Text>
              </View>
              {isSelected && <Text style={styles.checkIcon}>✓</Text>}
            </Pressable>
          );
        }}
      />

      {projectId !== null && (
        <View style={styles.selectionSection}>
          <Text style={styles.heading}>Observation Type</Text>
          <View style={styles.chipRow}>
            {observationTypes.length === 0 ? (
              <Text style={styles.muted}>No observation types configured for this project.</Text>
            ) : (
              observationTypes.map((t) => (
                <Pressable
                  key={t.type}
                  style={[styles.chip, t.type === observationType && styles.chipActive]}
                  onPress={() => setObservationType(t.type)}
                >
                  <Text style={[styles.chipText, t.type === observationType && styles.chipTextActive]}>
                    🌿 {t.label ?? t.type} ({t.model})
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <Text style={styles.heading}>Phase</Text>
          <View style={styles.chipRow}>
            {PHASE_OPTIONS.map((p) => (
              <Pressable
                key={p}
                style={[styles.chip, p === phase && styles.chipActive]}
                onPress={() => setPhase(p)}
              >
                <Text style={[styles.chipText, p === phase && styles.chipTextActive]}>
                  {p === 'before' ? '⏪ Before' : '⏩ After'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
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
        <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]}>
          Continue to Camera 📷
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.background },
  mainTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  subTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  heading: { fontSize: 12, fontWeight: '700', color: colors.brandPrimary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 12 },
  
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.softAccent },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  cardTitleActive: { color: colors.textPrimary, fontWeight: '800' },
  cardOrg: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  checkIcon: { color: colors.brandPrimary, fontWeight: '800', fontSize: 16 },

  selectionSection: { marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipActive: { backgroundColor: colors.highlight, borderColor: colors.brandPrimary },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: colors.brandPrimary, fontWeight: '800' },

  confirm: { marginTop: 24, backgroundColor: colors.brandPrimary, padding: 14, borderRadius: 12 },
  confirmDisabled: { backgroundColor: colors.muted },
  confirmText: { color: colors.textInverted, textAlign: 'center', fontWeight: '800', fontSize: 14 },
  confirmTextDisabled: { color: colors.textMuted },
});
