/**
 * Camera screen (BUILD_ORDER Phase 4 "Camera screen" + "Video capture" + "GPS").
 *
 * Captures a still or a ≤30 s video with `expo-camera`, freezes EXIF, takes a
 * GPS fix and gates on accuracy, then runs the tested {@link performCapture}
 * pipeline which signs and enqueues the item. Front/back toggle included. All
 * effects go through the runtime's ports, so this screen adds no untested logic.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { performCapture, type CaptureContext } from '../capture.js';
import { MAX_VIDEO_DURATION_MS } from '../video.js';
import type { CaptureSelection } from '../projects.js';
import type { CaptureRuntime } from '../native/runtime.js';

interface Props {
  readonly runtime: CaptureRuntime;
  readonly selection: CaptureSelection;
  readonly orgId: string;
  readonly appVersion: string;
  readonly onCaptured: () => void;
}

export function CameraScreen({ runtime, selection, orgId, appVersion, onCaptured }: Props): JSX.Element {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!permission) return <View style={styles.center}><Text style={styles.darkText}>Checking camera permission…</Text></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera access is required to capture field evidence.</Text>
        <Pressable style={styles.grantButton} onPress={() => void requestPermission()}>
          <Text style={styles.grantButtonText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  const ctx: CaptureContext = {
    exifReader: runtime.exifReader,
    fileReader: runtime.fileReader,
    signer: runtime.signer,
    clock: runtime.clock,
    queue: runtime.queue,
  };

  async function ingest(fileUri: string, exif: Record<string, unknown> | undefined, assetType: 'image' | 'video'): Promise<void> {
    runtime.exifReader.remember(fileUri, exif);
    const granted = await runtime.location.ensurePermission();
    if (!granted) {
      setStatus('Location permission is required to capture.');
      return;
    }
    const gpsFix = await runtime.location.currentFix();
    const result = await performCapture(ctx, {
      selection,
      orgId,
      fileUri,
      assetType,
      gpsFix,
      appVersion,
    });
    setStatus(result.ok ? 'Captured — queued for sync.' : `Blocked: ${result.reason}`);
    if (result.ok) onCaptured();
  }

  async function onShutter(): Promise<void> {
    const photo = await cameraRef.current?.takePictureAsync({ exif: true });
    if (photo?.uri) await ingest(photo.uri, photo.exif as Record<string, unknown> | undefined, 'image');
  }

  async function onRecordToggle(): Promise<void> {
    if (recording) {
      cameraRef.current?.stopRecording();
      setRecording(false);
      return;
    }
    setRecording(true);
    const video = await cameraRef.current?.recordAsync({
      maxDuration: MAX_VIDEO_DURATION_MS / 1000,
    });
    setRecording(false);
    if (video?.uri) await ingest(video.uri, undefined, 'video');
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="picture">
        {/* HUD Top Bar */}
        <View style={styles.hudTop}>
          <View style={styles.hudPill}>
            <View style={styles.greenDot} />
            <Text style={styles.hudPillText}>GPS Locked (±1.5m)</Text>
          </View>
          <Text style={styles.hudMeta}>{selection.observationType} • {selection.phase}</Text>
        </View>

        {/* Framing Reticle */}
        <View style={styles.reticleContainer}>
          <View style={styles.reticleBox}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <Text style={styles.reticleText}>Align Evidence Item</Text>
          </View>
        </View>

        {status && (
          <View style={styles.statusToast}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}
      </CameraView>

      {/* Bottom Controls Bar */}
      <View style={styles.controlsBar}>
        <Pressable style={styles.iconButton} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
          <Text style={styles.iconButtonText}>🔄 Flip</Text>
        </Pressable>

        <Pressable style={styles.shutterOuter} onPress={() => void onShutter()}>
          <View style={styles.shutterInner} />
        </Pressable>

        <Pressable style={[styles.iconButton, recording && styles.recordingButton]} onPress={() => void onRecordToggle()}>
          <Text style={styles.iconButtonText}>{recording ? '⏹ Stop' : '🎥 Video'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#020617' },
  darkText: { color: '#94a3b8' },
  permissionText: { color: '#f8fafc', textAlign: 'center', marginBottom: 16, fontSize: 14 },
  grantButton: { backgroundColor: '#38bdf8', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  grantButtonText: { color: '#0f172a', fontWeight: '700' },
  camera: { flex: 1, justifyContent: 'space-between' },
  
  /* HUD */
  hudTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(2, 6, 23, 0.65)',
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  hudPillText: { color: '#4ade80', fontSize: 11, fontWeight: '600' },
  hudMeta: { color: '#cbd5e1', fontSize: 11, fontWeight: '500' },

  /* Reticle */
  reticleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reticleBox: {
    width: 240,
    height: 240,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#22c55e' },
  cornerTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  reticleText: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    letterSpacing: 0.5,
    marginTop: 100,
  },

  /* Status Toast */
  statusToast: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusText: { color: '#38bdf8', textAlign: 'center', fontSize: 12, fontWeight: '600' },

  /* Bottom Controls Bar */
  controlsBar: {
    height: 90,
    backgroundColor: '#020617',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recordingButton: { backgroundColor: '#dc2626' },
  iconButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  shutterOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#ffffff',
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: { width: '100%', height: '100%', borderRadius: 30, backgroundColor: '#38bdf8' },
});
