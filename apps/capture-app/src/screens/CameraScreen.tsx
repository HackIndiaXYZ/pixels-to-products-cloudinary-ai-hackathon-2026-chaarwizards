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

  if (!permission) return <View style={styles.center}><Text>Checking camera permission…</Text></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.status}>Camera access is required to capture evidence.</Text>
        <Pressable style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Grant camera access</Text>
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
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="picture" />
      {status && <Text style={styles.status}>{status}</Text>}
      <View style={styles.controls}>
        <Pressable style={styles.button} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
          <Text style={styles.buttonText}>Flip</Text>
        </Pressable>
        <Pressable style={styles.shutter} onPress={() => void onShutter()}>
          <Text style={styles.buttonText}>Photo</Text>
        </Pressable>
        <Pressable style={[styles.button, recording && styles.recording]} onPress={() => void onRecordToggle()}>
          <Text style={styles.buttonText}>{recording ? 'Stop' : 'Video'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  camera: { flex: 1 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 20 },
  button: { backgroundColor: '#333', padding: 14, borderRadius: 10 },
  recording: { backgroundColor: '#b91c1c' },
  shutter: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 40 },
  buttonText: { color: 'white', fontWeight: '600' },
  status: { color: 'white', textAlign: 'center', padding: 8 },
});
