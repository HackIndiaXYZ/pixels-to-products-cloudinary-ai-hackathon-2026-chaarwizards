/**
 * App root (Panchnama AI Media Intelligence Platform - Capture App).
 * Bootstraps the native capture runtime, enforces strict Supabase authentication & RLS,
 * loads organization projects directly from the API/Supabase DB, and renders screens
 * themed with the official Panchnama AI color palette.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CAPTURE_APP_VERSION } from './src/index.js';
import { CameraScreen } from './src/screens/CameraScreen.js';
import { ProjectPickerScreen } from './src/screens/ProjectPickerScreen.js';
import { QueueScreen } from './src/screens/QueueScreen.js';
import { LoginScreen } from './src/screens/LoginScreen.js';
import { createCaptureRuntime, registerSyncTriggers, type CaptureRuntime } from './src/native/index.js';
import { getSessionToken, clearSessionToken } from './src/native/session.js';
import { fetchProjects } from './src/api.js';
import { colors } from './src/theme.js';
import { base64Decode } from './src/utils/base64.js';
import type { CaptureSelection } from './src/projects.js';
import type { Project } from '@panchnama/shared/rn';

type Screen = 'login' | 'picker' | 'camera' | 'queue';

/** Extract org_id from JWT payload claims safely without using atob  */
function extractOrgIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const decodedStr = base64Decode(parts[1]);
    if (!decodedStr) return null;
    const payload = JSON.parse(decodedStr);
    const appMeta = payload.app_metadata ?? {};
    return appMeta.org_id ?? payload.org_id ?? null;
  } catch {
    return null;
  }
}

async function loadProjects(token: string | null): Promise<Project[]> {
  if (!token) return [];

  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) return [];

  try {
    return await fetchProjects({ baseUrl: base, token });
  } catch {
    return [];
  }
}

export default function App(): JSX.Element {
  const [runtime, setRuntime] = useState<CaptureRuntime | null>(null);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selection, setSelection] = useState<CaptureSelection | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const rt = await createCaptureRuntime();
        setRuntime(rt);
        unsubscribe = await registerSyncTriggers(rt);

        const token = await getSessionToken();
        setSessionTokenState(token);
        if (!token) {
          setScreen('login');
          setProjects([]);
        } else {
          setProjects(await loadProjects(token));
          setScreen('picker');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => unsubscribe?.();
  }, []);

  const handleLogout = async () => {
    await clearSessionToken();
    setSessionTokenState(null);
    setUserEmail(null);
    setProjects([]);
    setSelection(null);
    setScreen('login');
  };

  const handleLoginSuccess = async (token: string, email: string) => {
    try {
      setSessionTokenState(token);
      setUserEmail(email);
      const loaded = await loadProjects(token);
      setProjects(loaded);
      setScreen('picker');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  if (error !== null) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.errorHeader}>Startup Error</Text>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (runtime === null) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.brandPrimary} />
        <Text style={styles.loadingText}>Starting Panchnama Capture {CAPTURE_APP_VERSION}…</Text>
      </View>
    );
  }

  const derivedOrgId = extractOrgIdFromJwt(sessionToken) ?? process.env.EXPO_PUBLIC_ORG_ID ?? '00000000-0000-4000-8000-0000000000aa';

  const SCREEN_ICONS: Record<Screen, string> = {
    login: '🔑',
    picker: '📋',
    camera: '📷',
    queue: '⚡',
  };

  const isAuthenticated = sessionToken !== null;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Top App Bar Header */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerBrand}>Panchnama AI</Text>
          <Text style={styles.headerSub}>
            {isAuthenticated && userEmail ? `👤 ${userEmail}` : 'Media Intelligence Platform'}
          </Text>
        </View>
        {isAuthenticated ? (
          <Pressable style={styles.logoutChip} onPress={() => void handleLogout()}>
            <Text style={styles.logoutChipText}>Log Out</Text>
          </Pressable>
        ) : (
          <View style={styles.guestChip}>
            <Text style={styles.guestChipText}>🔒 Sign In Required</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {!isAuthenticated ? (
          <LoginScreen
            initialEmail={userEmail}
            onLoginSuccess={(token, email) => void handleLoginSuccess(token, email)}
          />
        ) : (
          <>
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
                orgId={derivedOrgId}
                appVersion={CAPTURE_APP_VERSION}
                onCaptured={() => setScreen('queue')}
              />
            )}
            {screen === 'queue' && <QueueScreen runtime={runtime} />}
          </>
        )}
      </View>

      {/* Navigation Tab Bar - Gated on authentication */}
      {isAuthenticated && (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 40 },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary, marginTop: 12, fontSize: 14, fontWeight: '500' },
  errorHeader: { color: colors.error, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  error: { color: colors.textSecondary, textAlign: 'center', fontSize: 13 },
  
  headerBar: {
    height: 54,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.brandSecondary, fontWeight: '600', marginTop: 1 },

  logoutChip: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  logoutChipText: { color: colors.error, fontSize: 11, fontWeight: '700' },

  guestChip: {
    backgroundColor: colors.softAccent,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  guestChipText: { color: colors.brandPrimary, fontSize: 11, fontWeight: '700' },

  tabbar: {
    height: 60,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  tabIcon: { fontSize: 16 },
  tabLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize', marginTop: 2 },
  tabLabelActive: { color: colors.brandPrimary, fontWeight: '800' },
  tabActiveIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandPrimary,
  },
});
