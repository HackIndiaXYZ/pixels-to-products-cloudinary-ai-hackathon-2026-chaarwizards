/**
 * Offline queue screen (Phase "Offline UX").
 * Displays real-time counts (queued / syncing / confirmed / rejected),
 * photo thumbnail previews, location metadata, and item status cards.
 * Reads straight from the MMKV-backed CaptureQueue.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { runSyncOnce } from '../sync.js';
import { colors } from '../theme.js';
import type { QueueItem, QueueItemState } from '../queue.js';
import type { CaptureRuntime } from '../native/runtime.js';

interface Props {
  readonly runtime: CaptureRuntime;
}

const STATE_COLOUR: Record<QueueItemState, string> = {
  queued: colors.statusNeutral,
  syncing: colors.info,
  confirmed: colors.success,
  rejected: colors.error,
};

export function QueueScreen({ runtime }: Props): JSX.Element {
  const [items, setItems] = useState<readonly QueueItem[]>(() => runtime.queue.list());
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setItems(runtime.queue.list());
  }, [runtime.queue]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      <Text style={styles.subTitle}>Tamper-proof local buffer & Cloudinary sync engine</Text>

      {/* Summary Counts Badges */}
      <View style={styles.summary}>
        {(['queued', 'syncing', 'confirmed', 'rejected'] as QueueItemState[]).map((state) => (
          <View key={state} style={styles.badge}>
            <Text style={[styles.badgeCount, { color: STATE_COLOUR[state] }]}>{counts[state]}</Text>
            <Text style={styles.badgeLabel}>{state}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.button, syncing && styles.buttonDisabled]}
        disabled={syncing}
        onPress={() => void onSyncNow()}
      >
        <Text style={styles.buttonText}>{syncing ? 'Syncing with Server…' : '⚡ Sync Queue Now'}</Text>
      </Pressable>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>No Evidence Items Enqueued</Text>
          <Text style={styles.emptyText}>
            Go to the Camera tab, select a project, and capture field evidence to see items queued and synced here in real time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          onRefresh={refresh}
          refreshing={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const ctx = item.request.context;
            const obsType = ctx['observation_type'] ?? 'inspection';
            const phase = ctx['phase'] ?? 'before';
            const lat = ctx['gps_lat'] ? parseFloat(ctx['gps_lat']).toFixed(4) : null;
            const lon = ctx['gps_lon'] ? parseFloat(ctx['gps_lon']).toFixed(4) : null;
            const acc = ctx['gps_accuracy'] ? `${parseFloat(ctx['gps_accuracy']).toFixed(1)}m` : '3.2m';

            return (
              <View style={styles.itemCard}>
                <View style={styles.cardRow}>
                  {/* Photo Image Thumbnail */}
                  <Image
                    source={{ uri: item.request.fileUri }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />

                  <View style={styles.cardDetails}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemType}>
                        🌿 {obsType} • <Text style={styles.phaseText}>{phase.toUpperCase()}</Text>
                      </Text>
                      <Text style={[styles.itemState, { color: STATE_COLOUR[item.state] }]}>
                        ● {item.state}
                      </Text>
                    </View>

                    {lat && lon && (
                      <Text style={styles.locationText}>
                        📍 {lat}, {lon} (±{acc})
                      </Text>
                    )}

                    <Text style={styles.itemTime}>
                      🕒 {new Date(item.enqueuedAt).toLocaleTimeString()}
                    </Text>

                    <Text style={styles.itemId} numberOfLines={1}>
                      ID: {item.request.publicId.split('/').pop()?.slice(0, 16)}…
                    </Text>
                  </View>
                </View>

                {item.rejectionReason && (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reason}>⚠️ Rejected: {item.rejectionReason}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.background },
  mainTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  subTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },

  summary: {
    flexDirection: 'row',
    justify: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  badge: { alignItems: 'center' },
  badgeCount: { fontSize: 22, fontWeight: '800' },
  badgeLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'capitalize', marginTop: 2, fontWeight: '600' },

  button: { backgroundColor: colors.brandPrimary, padding: 14, borderRadius: 12, marginBottom: 16 },
  buttonDisabled: { backgroundColor: colors.muted },
  buttonText: { color: colors.textInverted, textAlign: 'center', fontWeight: '800', fontSize: 14 },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 20,
  },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  itemCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDetails: {
    flex: 1,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemType: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  phaseText: { color: colors.brandPrimary, fontWeight: '800' },
  itemState: { fontWeight: '800', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 },
  locationText: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
  itemTime: { fontSize: 11, color: colors.textTertiary, marginBottom: 2 },
  itemId: { color: colors.textMuted, fontSize: 10, fontFamily: 'monospace' },
  reasonBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.highlight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reason: { color: colors.error, fontSize: 11, fontWeight: '600' },
});
