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
import { getSessionToken } from './src/native/session.js';
import { fetchProjects } from './src/api.js';
import type { CaptureSelection } from './src/projects.js';
import type { Project } from '@impact/shared/rn';

type Screen = 'picker' | 'camera' | 'queue';

/**
 * DEV-ONLY seed. Explorable UI before a Supabase login exists (Phase 8). Gated
 * behind an explicit `EXPO_PUBLIC_DEV_SEED=1` opt-in — NOT "API unset" — so a
 * real build can never silently show fake projects. Never a production data
 * source: with a real session the app loads projects from the API.
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
  // Explicit dev opt-in only, so the UI is explorable without a backend/login.
  if (process.env.EXPO_PUBLIC_DEV_SEED === '1') return DEV_SEED_PROJECTS;

  const base = process.env.EXPO_PUBLIC_API_URL;
  if (base === undefined || base === '') {
    throw new Error('EXPO_PUBLIC_API_URL is not set — cannot load projects');
  }
  // org_id/auth come from the verified Supabase JWT (AGENTS.md §3.4), never from
  // env or a request body. No session → no projects, not a silent fallback.
  const token = await getSessionToken();
  if (token === null) {
    throw new Error('Not signed in — a Supabase session is required to load projects');
  }
  return fetchProjects({ baseUrl: base, token });
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
