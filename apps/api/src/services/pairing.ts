/**
 * Pure before/after pairing (ARCHITECTURE.md §4.2, BUILD_ORDER Phase 7).
 *
 * The algorithm is deliberately side-effect-free so it is exhaustively
 * unit-testable without a DB, a queue, or the ML service. The worker
 * (`services/pair-assets.ts`) loads the inputs and dispatches the outputs; this
 * module only decides which assets pair with which.
 *
 * Order is mandated by the architecture and each step is load-bearing:
 *   1. Filter by observation_type FIRST (ADL-08). A 10 m water radius and a 3 m
 *      infrastructure radius cannot share a clustering pass, so two observation
 *      types in one project can NEVER land in the same cluster — that is what
 *      keeps a wrong-sector number out of a report (§3.3).
 *   2. Grid-bucket by that type's gps_radius so clustering is not a global O(n²)
 *      sweep (ARCHITECTURE.md §Scaling row 7). The bucket size IS the radius —
 *      never a hard-coded constant (BUILD_ORDER Phase 7 "pair-assets worker").
 *   3. Cluster: connected components where an edge exists iff the haversine
 *      distance is ≤ the radius. Assets farther apart than the radius are never
 *      clustered together.
 *   4. Sort each cluster by device_capture_timestamp.
 *   5. Split by phase and pair each `before` with the next later `after`.
 */
import type { AssetPhase } from '@impact/shared';

/** The minimal asset shape pairing needs. Coordinates are extracted from `gps_point`. */
export interface PairingAsset {
  readonly id: string;
  readonly observation_type: string | null;
  readonly phase: AssetPhase | null;
  readonly device_capture_timestamp: string;
  readonly gps_lat: number | null;
  readonly gps_lon: number | null;
}

/** One observation type's clustering radius, resolved from `projects.config`. */
export interface ObservationTypeRadius {
  readonly type: string;
  readonly gps_radius: number;
}

export interface CandidatePair {
  readonly observation_type: string;
  readonly before_asset_id: string;
  readonly after_asset_id: string;
  readonly gps_distance_meters: number;
  readonly time_difference_hours: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres between two lat/lon points. */
export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres of latitude per degree is ~constant; used to size the grid cell. */
const METERS_PER_DEG_LAT = 111_320;

interface Located extends PairingAsset {
  readonly gps_lat: number;
  readonly gps_lon: number;
}

function hasLocation(a: PairingAsset): a is Located {
  return a.gps_lat !== null && a.gps_lon !== null;
}

/**
 * Grid-bucket by the radius, then union assets whose haversine distance is
 * within the radius. Only same-and-adjacent buckets are compared, so a dense
 * project does not pay the full O(n²) cost, yet correctness is unchanged: two
 * points within `radius` can differ by at most one cell in each axis.
 */
function clusterByRadius(assets: readonly Located[], radius: number): Located[][] {
  const cell = radius; // one cell ≈ one radius on a side
  const key = (a: Located): string => {
    const gx = Math.floor((a.gps_lat * METERS_PER_DEG_LAT) / cell);
    // Longitude metres shrink with latitude; use the point's own latitude.
    const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((a.gps_lat * Math.PI) / 180);
    const gy = Math.floor((a.gps_lon * metersPerDegLon) / cell);
    return `${gx}:${gy}`;
  };

  const buckets = new Map<string, Located[]>();
  for (const a of assets) {
    const k = key(a);
    const list = buckets.get(k) ?? [];
    list.push(a);
    buckets.set(k, list);
  }

  // Union-find over indices.
  const parent = assets.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    let c = i;
    while (parent[c] !== c) {
      const next = parent[c] as number;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (i: number, j: number): void => {
    parent[find(i)] = find(j);
  };

  const indexOf = new Map<Located, number>();
  assets.forEach((a, i) => indexOf.set(a, i));

  for (const a of assets) {
    const gxBase = Math.floor((a.gps_lat * METERS_PER_DEG_LAT) / cell);
    const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((a.gps_lat * Math.PI) / 180);
    const gyBase = Math.floor((a.gps_lon * metersPerDegLon) / cell);
    const ai = indexOf.get(a) as number;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const neighbours = buckets.get(`${gxBase + dx}:${gyBase + dy}`);
        if (neighbours === undefined) continue;
        for (const b of neighbours) {
          if (b === a) continue;
          if (haversineMeters(a.gps_lat, a.gps_lon, b.gps_lat, b.gps_lon) <= radius) {
            union(ai, indexOf.get(b) as number);
          }
        }
      }
    }
  }

  const groups = new Map<number, Located[]>();
  assets.forEach((a, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(a);
    groups.set(root, list);
  });
  return [...groups.values()];
}

/** Pair each `before` with the next chronologically-later `after` in a cluster. */
function pairCluster(
  observationType: string,
  cluster: readonly Located[],
): CandidatePair[] {
  const sorted = [...cluster].sort(
    (a, b) =>
      Date.parse(a.device_capture_timestamp) - Date.parse(b.device_capture_timestamp),
  );
  const pairs: CandidatePair[] = [];
  let pendingBefore: Located | null = null;
  for (const a of sorted) {
    if (a.phase === 'before') {
      // A later `before` supersedes an earlier unmatched one (closest baseline).
      pendingBefore = a;
    } else if (a.phase === 'after' && pendingBefore !== null) {
      const before = pendingBefore;
      const distance = haversineMeters(before.gps_lat, before.gps_lon, a.gps_lat, a.gps_lon);
      const hours =
        (Date.parse(a.device_capture_timestamp) -
          Date.parse(before.device_capture_timestamp)) /
        3_600_000;
      pairs.push({
        observation_type: observationType,
        before_asset_id: before.id,
        after_asset_id: a.id,
        gps_distance_meters: Number(distance.toFixed(3)),
        time_difference_hours: Number(hours.toFixed(4)),
      });
      pendingBefore = null; // consumed
    }
  }
  return pairs;
}

/**
 * Produce every before/after candidate pair for a project. `radii` is the set of
 * observation types configured on the project, each with its own `gps_radius`;
 * an asset whose observation_type is not configured is never paired (no radius
 * means no defensible cluster).
 */
export function pairAssets(
  assets: readonly PairingAsset[],
  radii: readonly ObservationTypeRadius[],
): CandidatePair[] {
  const radiusByType = new Map(radii.map((r) => [r.type, r.gps_radius]));
  const out: CandidatePair[] = [];

  for (const { type, gps_radius } of radii) {
    // Step 1: filter by observation_type FIRST (ADL-08).
    const ofType = assets.filter(
      (a): a is Located => a.observation_type === type && hasLocation(a),
    );
    if (ofType.length === 0) continue;
    // Steps 2–3: grid-bucket + cluster within this type's radius only.
    const clusters = clusterByRadius(ofType, gps_radius);
    // Steps 4–5: order and pair inside each cluster.
    for (const cluster of clusters) {
      out.push(...pairCluster(type, cluster));
    }
  }

  // Defensive: never emit a pair for an unconfigured type.
  return out.filter((p) => radiusByType.has(p.observation_type));
}
