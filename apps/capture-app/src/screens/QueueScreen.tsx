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
  queued: '#94a3b8',
  syncing: '#38bdf8',
  confirmed: '#4ade80',
  rejected: '#f87171',
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
      <Text style={styles.mainTitle}>Evidence Sync Queue</Text>
      <Text style={styles.subTitle}>Offline tamper-proof local storage buffer</Text>

      <View style={styles.summary}>
        {(Object.keys(counts) as QueueItemState[]).map((state) => (
          <View key={state} style={styles.badge}>
            <Text style={[styles.badgeCount, { color: STATE_COLOUR[state] }]}>{counts[state]}</Text>
            <Text style={styles.badgeLabel}>{state}</Text>
          </View>
        ))}
      </View>

      <Pressable style={[styles.button, syncing && styles.buttonDisabled]} disabled={syncing} onPress={() => void onSyncNow()}>
        <Text style={styles.buttonText}>{syncing ? 'Syncing with Server…' : '⚡ Sync Now'}</Text>
      </Pressable>

      <FlatList
        data={items}
        onRefresh={refresh}
        refreshing={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemState, { color: STATE_COLOUR[item.state] }]}>● {item.state}</Text>
              <Text style={styles.itemTime}>{new Date(item.enqueuedAt).toLocaleTimeString()}</Text>
            </View>
            <Text style={styles.itemId} numberOfLines={1}>Public ID: {item.request.publicId}</Text>
            {item.rejectionReason && <Text style={styles.reason}>Reason: {item.rejectionReason}</Text>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#020617' },
  mainTitle: { fontSize: 22, fontWeight: '800', color: '#f8fafc', marginBottom: 2 },
  subTitle: { fontSize: 13, color: '#94a3b8', marginBottom: 16 },

  summary: {
    flexDirection: 'row',
    justify: 'space-around',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  badge: { alignItems: 'center' },
  badgeCount: { fontSize: 20, fontWeight: '800' },
  badgeLabel: { fontSize: 11, color: '#64748b', textTransform: 'capitalize', marginTop: 2, fontWeight: '500' },

  button: { backgroundColor: '#38bdf8', padding: 14, borderRadius: 12, marginBottom: 16 },
  buttonDisabled: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  buttonText: { color: '#0f172a', textAlign: 'center', fontWeight: '800', fontSize: 14 },

  itemCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemState: { fontWeight: '700', textTransform: 'uppercase', fontSize: 11 },
  itemTime: { fontSize: 11, color: '#64748b' },
  itemId: { color: '#cbd5e1', fontSize: 12, fontFamily: 'monospace' },
  reason: { color: '#f87171', fontSize: 12, marginTop: 4 },
});
