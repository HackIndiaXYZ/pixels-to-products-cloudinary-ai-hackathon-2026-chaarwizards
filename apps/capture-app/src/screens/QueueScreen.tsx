/**
 * Offline queue screen (BUILD_ORDER Phase 4 "Offline UX"). Shows clear
 * queued / syncing / confirmed / rejected counts and per-item rejection reasons,
 * and offers a manual drain. Read straight from the queue, which reads from the
 * MMKV store, so the view is restart-safe.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { runSyncOnce } from '../sync.js';
import type { QueueItem, QueueItemState } from '../queue.js';
import type { CaptureRuntime } from '../native/runtime.js';

interface Props {
  readonly runtime: CaptureRuntime;
}

const STATE_COLOUR: Record<QueueItemState, string> = {
  queued: '#6b7280',
  syncing: '#2563eb',
  confirmed: '#16a34a',
  rejected: '#b91c1c',
};

export function QueueScreen({ runtime }: Props): JSX.Element {
  const [items, setItems] = useState<readonly QueueItem[]>(() => runtime.queue.list());
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setItems(runtime.queue.list()), [runtime.queue]);

  const onSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await runSyncOnce(runtime.queue, runtime.network, runtime.uploader);
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [runtime, refresh]);

  const counts = runtime.queue.counts();

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        {(Object.keys(counts) as QueueItemState[]).map((state) => (
          <View key={state} style={styles.badge}>
            <Text style={[styles.badgeCount, { color: STATE_COLOUR[state] }]}>{counts[state]}</Text>
            <Text style={styles.badgeLabel}>{state}</Text>
          </View>
        ))}
      </View>

      <Pressable style={[styles.button, syncing && styles.buttonDisabled]} disabled={syncing} onPress={() => void onSyncNow()}>
        <Text style={styles.buttonText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>

      <FlatList
        data={items}
        onRefresh={refresh}
        refreshing={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={[styles.itemState, { color: STATE_COLOUR[item.state] }]}>{item.state}</Text>
            <Text style={styles.itemId} numberOfLines={1}>{item.request.publicId}</Text>
            {item.rejectionReason && <Text style={styles.reason}>{item.rejectionReason}</Text>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  summary: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  badge: { alignItems: 'center' },
  badgeCount: { fontSize: 22, fontWeight: '700' },
  badgeLabel: { fontSize: 12, color: '#6b7280' },
  button: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 10, marginBottom: 16 },
  buttonDisabled: { backgroundColor: '#9db8e8' },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: '600' },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemState: { fontWeight: '600', textTransform: 'uppercase', fontSize: 12 },
  itemId: { color: '#374151' },
  reason: { color: '#b91c1c', fontSize: 12, marginTop: 4 },
});
