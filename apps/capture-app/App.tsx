/**
 * App root (BUILD_ORDER Phase 4). Bootstraps the native capture runtime,
 * registers sync triggers, loads the org's projects, and switches between the
 * picker, camera, and queue screens. Deliberately minimal navigation (no router
 * dependency) — the substance of the phase is the capture pipeline, not routing.
 *
 * Auth (the Supabase session that yields the real `org_id`) is Phase 3/8 work; a
 * capture's `org_id` here is only a `public_id` path component and is never used
 * for authorization — the API re-derives org from the verified JWT (§3.4).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CAPTURE_APP_VERSION } from './src/index.js';
import { CameraScreen } from './src/screens/CameraScreen.js';
import { ProjectPickerScreen } from './src/screens/ProjectPickerScreen.js';
import { QueueScreen } from './src/screens/QueueScreen.js';
import { createCaptureRuntime, registerSyncTriggers, type CaptureRuntime } from './src/native/index.js';
import type { CaptureSelection } from './src/projects.js';
import type { Project } from '@impact/shared/rn';

type Screen = 'picker' | 'camera' | 'queue';

/**
 * DEV-ONLY seed. Used purely so the picker → camera → queue flow is explorable
 * on a device/emulator before the real API (Phase 5) is wired. Never a
 * production data source: the moment `EXPO_PUBLIC_API_URL` is set, the app loads
 * projects from the API and this is ignored.
 */
const DEV_SEED_PROJECTS: Project[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    org_id: '00000000-0000-4000-8000-0000000000aa',
    name: 'DEV — Riverside Reforestation',
    config: {
      observation_types: [
        { type: 'sapling_survival', label: 'Sapling survival', model: 'forestry_v1', gps_radius: 25 },
      ],
    },
    parent_project_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    org_id: '00000000-0000-4000-8000-0000000000aa',
    name: 'DEV — North Plot (sub-project)',
    config: { observation_types: [] },
    parent_project_id: '00000000-0000-4000-8000-000000000001',
    created_at: new Date().toISOString(),
  },
];

async function loadProjects(): Promise<Project[]> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  // No API configured → DEV seed, so the UI is explorable before Phase 5 wires
  // the real /v1/projects endpoint. This is a dev affordance, not silent
  // degradation of the evidence pipeline (AGENTS.md §3.6): captures still sign,
  // hash, and queue exactly as in production.
  if (base === undefined || base === '') return DEV_SEED_PROJECTS;
  const response = await fetch(`${base}/v1/projects`);
  if (!response.ok) throw new Error(`GET /v1/projects failed: ${response.status}`);
  const body = (await response.json()) as { data?: Project[] };
  return body.data ?? [];
}

export default function App(): JSX.Element {
  const [runtime, setRuntime] = useState<CaptureRuntime | null>(null);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selection, setSelection] = useState<CaptureSelection | null>(null);
  const [screen, setScreen] = useState<Screen>('picker');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const rt = await createCaptureRuntime();
        setRuntime(rt);
        unsubscribe = await registerSyncTriggers(rt);
        setProjects(await loadProjects());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => unsubscribe?.();
  }, []);

  if (error !== null) {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <Text style={styles.error}>Startup error: {error}</Text>
      </View>
    );
  }

  if (runtime === null) {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <ActivityIndicator />
        <Text>Starting Impact Capture {CAPTURE_APP_VERSION}…</Text>
      </View>
    );
  }

  const orgId = process.env.EXPO_PUBLIC_ORG_ID ?? 'demo-org';

  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      {screen === 'picker' && (
        <ProjectPickerScreen
          projects={projects}
          onSelected={(s) => {
            setSelection(s);
            setScreen('camera');
          }}
        />
      )}
      {screen === 'camera' && selection !== null && (
        <CameraScreen
          runtime={runtime}
          selection={selection}
          orgId={orgId}
          appVersion={CAPTURE_APP_VERSION}
          onCaptured={() => setScreen('queue')}
        />
      )}
      {screen === 'queue' && <QueueScreen runtime={runtime} />}

      <View style={styles.tabbar}>
        {(['picker', 'camera', 'queue'] as Screen[]).map((s) => (
          <Text
            key={s}
            style={[styles.tab, s === screen && styles.tabActive]}
            onPress={() => setScreen(s)}
          >
            {s}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b91c1c', textAlign: 'center' },
  tabbar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  tab: { color: '#6b7280', textTransform: 'capitalize' },
  tabActive: { color: '#3b82f6', fontWeight: '700' },
});
