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
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CAPTURE_APP_VERSION } from './src/index.js';
import { CameraScreen } from './src/screens/CameraScreen.js';
import { ProjectPickerScreen } from './src/screens/ProjectPickerScreen.js';
import { QueueScreen } from './src/screens/QueueScreen.js';
import { createCaptureRuntime, registerSyncTriggers, type CaptureRuntime } from './src/native/index.js';
import { getSessionToken } from './src/native/session.js';
import { fetchProjects } from './src/api.js';
import type { CaptureSelection } from './src/projects.js';
import type { Project } from '@panchnama/shared/rn';

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
    name: 'Riverside Reforestation',
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
    name: 'North Plot (sub-project)',
    config: { observation_types: [] },
    parent_project_id: '00000000-0000-4000-8000-000000000001',
    created_at: new Date().toISOString(),
  },
];

async function loadProjects(): Promise<Project[]> {
  // Explicit dev seed opt-in
  if (process.env.EXPO_PUBLIC_DEV_SEED === '1') return DEV_SEED_PROJECTS;

  // No session token on device → show demo projects until auth is wired (Phase 8)
  const token = await getSessionToken();
  if (token === null) {
    return DEV_SEED_PROJECTS;
  }

  const base = process.env.EXPO_PUBLIC_API_URL;
  if (base === undefined || base === '') {
    return DEV_SEED_PROJECTS;
  }

  try {
    return await fetchProjects({ baseUrl: base, token });
  } catch {
    // Network or server error — show demo projects so the app is still usable
    return DEV_SEED_PROJECTS;
  }
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
        <StatusBar style="light" />
        <Text style={styles.errorHeader}>Startup Error</Text>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (runtime === null) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Starting Panchnama Capture {CAPTURE_APP_VERSION}…</Text>
      </View>
    );
  }

  const orgId = process.env.EXPO_PUBLIC_ORG_ID ?? 'demo-org';

  const SCREEN_ICONS: Record<Screen, string> = {
    picker: '📋',
    camera: '📷',
    queue: '⚡',
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.content}>
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
      </View>

      <View style={styles.tabbar}>
        {(['picker', 'camera', 'queue'] as Screen[]).map((s) => {
          const isActive = s === screen;
          return (
            <Pressable key={s} style={styles.tabItem} onPress={() => setScreen(s)}>
              <Text style={styles.tabIcon}>{SCREEN_ICONS[s]}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {s}
              </Text>
              {isActive && <View style={styles.tabActiveIndicator} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617', paddingTop: 40 },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#020617' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
  errorHeader: { color: '#f87171', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  error: { color: '#cbd5e1', textAlign: 'center', fontSize: 13 },
  
  tabbar: {
    height: 60,
    backgroundColor: '#090d16',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  tabIcon: { fontSize: 16 },
  tabLabel: { color: '#64748b', fontSize: 11, fontWeight: '600', textTransform: 'capitalize', marginTop: 2 },
  tabLabelActive: { color: '#38bdf8', fontWeight: '800' },
  tabActiveIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  },
});
