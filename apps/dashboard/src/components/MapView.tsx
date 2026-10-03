import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { Project, SearchAssetsRow } from '../types/database';
import type { EvidencePage } from '../lib/queries/evidence';
import { type DataState } from '../lib/state';
import { partitionProjectWaypoints, toProjectWaypointModels } from '../lib/models';
import { AssetMedia } from './AssetMedia';
import { Icon } from './Icon';
import { PhaseBadge, UploadStatusBadge } from './StatusBadge';
import {
  ProjectCard,
  applyProjectMarkerSelection,
  projectLabel,
  projectMapEmptyState,
  projectMapNotices,
  reconcileProjectMarkers,
  type MarkerCtor,
  type ProjectMarker,
} from './ProjectWaypoints';

export interface MapViewProps {
  /** First page of `search_assets`. Evidence dots come from these rows and from nothing else. */
  evidence: DataState<EvidencePage>;
  /** Project tags come from `projects.geometry`, independent of whether any asset is mapped. */
  projects: DataState<Project[]>;
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
  onOpenProject: (projectId: string) => void;
}

type Basemap = 'street' | 'satellite';

const env: Record<string, string | undefined> = import.meta.env;
const STREET_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© OpenStreetMap contributors';

/** Card placement, in container pixels: beside its tag, clamped so it never leaves the map. */
const CARD_INSET = 10;
const CARD_OFFSET = 14;

export interface ProjectedAsset {
  assetId: string;
  lon: number;
  lat: number;
  title: string;
  assetType: string;
  phase: 'before' | 'after' | null;
  uploadStatus: 'pending' | 'verified' | 'flagged';
  accuracy: number | null;
  provider: string | null;
}

interface PointCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { assetId: string };
  }[];
}

export function projectRows(rows: SearchAssetsRow[]): ProjectedAsset[] {
  const out: ProjectedAsset[] = [];
  for (const row of rows) {
    const point = row.gps_point;
    if (point === null || point.type !== 'Point') continue;
    const [lon, lat] = point.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({
      assetId: row.id,
      lon,
      lat,
      title:
        row.caption !== null && row.caption.trim().length > 0 ? row.caption : (row.observation_type ?? row.id),
      assetType: row.asset_type,
      phase: row.phase,
      uploadStatus: row.upload_status,
      accuracy: row.gps_accuracy_meters,
      provider: row.gps_provider,
    });
  }
  return out;
}

function toCollection(points: ProjectedAsset[]): PointCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] as [number, number] },
      properties: { assetId: point.assetId },
    })),
  };
}

function buildStyle(basemap: Basemap): StyleSpecification {
  const satelliteUrl = env.VITE_SATELLITE_TILE_URL;
  const tiles = basemap === 'satellite' && satelliteUrl !== undefined && satelliteUrl.length > 0
    ? satelliteUrl
    : STREET_TILES;
  const attribution = basemap === 'satellite' ? 'Imagery provider' : ATTRIBUTION;
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [tiles], tileSize: 256, attribution } },
    layers: [{ id: 'basemap', type: 'raster', source: 'base' }],
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Step 3 of the brief. Evidence markers exist only for real `gps_point` values, project tags only
 *  for real `projects.geometry` polygons, clustering happens in the map source, and both popups
 *  reuse the same evidence and project facts the rest of the console shows. MapLibre is imported
 *  dynamically, so a viewer without the runtime gets an honest explanation instead of a blank
 *  canvas. */
export function MapView({ evidence, projects, selectedAssetId, onSelect, onOpenProject }: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelect);
  const openProjectRef = useRef(onOpenProject);
  const markerCtorRef = useRef<MarkerCtor | null>(null);
  const markersRef = useRef<Map<string, ProjectMarker>>(new Map());
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastOpenedRef = useRef<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('street');
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const appliedStyleRef = useRef<Basemap | null>(null);

  selectRef.current = onSelect;
  openProjectRef.current = onOpenProject;
  const satelliteUrl = env.VITE_SATELLITE_TILE_URL;
  const satelliteAvailable = satelliteUrl !== undefined && satelliteUrl.length > 0;

  const evidencePage = evidence.status === 'ready' ? evidence.data : null;
  const points = useMemo(() => (evidencePage === null ? [] : projectRows(evidencePage.rows)), [evidencePage]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  /* Project tags come from each project's own polygon, so they do not depend on the evidence page:
     a project with no geotagged asset still gets its waypoint. */
  const { located, unlocated } = useMemo(() => {
    const rows = projects.status === 'ready' ? projects.data : [];
    return partitionProjectWaypoints(toProjectWaypointModels(rows));
  }, [projects]);

  const selected = points.find((entry) => entry.assetId === selectedAssetId) ?? null;
  const selectedProject = located.find((entry) => entry.id === selectedProjectId) ?? null;
  const selectedProjectRef = useRef(selectedProject);
  selectedProjectRef.current = selectedProject;

  const selectProject = useCallback((projectId: string): void => {
    setSelectedProjectId((current) => (current === projectId ? null : projectId));
  }, []);

  /* `setStyle` drops every layer, so the evidence source and layers are rebuilt on every style
     change. The callback is stable and reads rows through a ref, so switching the basemap back to
     Street restores the same map instead of an empty canvas. Project tags are DOM markers rather
     than layers, so a style swap leaves them untouched. */
  const attachLayers = useCallback((instance: MapLibreMap): void => {
    instance.addSource('evidence', {
      type: 'geojson',
      data: toCollection(pointsRef.current) as never,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 46,
    });
    instance.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'evidence',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': 'rgba(99, 102, 241, 0.26)',
        'circle-stroke-color': '#818cf8',
        'circle-stroke-width': 1.5,
        'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 90, 30],
      },
    });
    instance.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'evidence',
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
      paint: { 'text-color': '#eef1ff' },
    });
    instance.addLayer({
      id: 'evidence-points',
      type: 'circle',
      source: 'evidence',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#34d399',
        'circle-stroke-color': '#052e22',
        'circle-stroke-width': 1.5,
        'circle-radius': 6,
      },
    });
    /* `attachLayers` runs again after every `setStyle`. Without this, the layer-scoped handler would
       be registered a second time on the same map and fire `onSelect` twice per click. */
    instance.off('click', 'evidence-points');
    instance.on('click', 'evidence-points', (event) => {
      const feature = event.features === undefined ? undefined : event.features[0];
      const id = feature?.properties?.assetId;
      if (typeof id === 'string') selectRef.current(id);
    });
  }, []);

  useEffect(() => {
    const element = container.current;
    if (element === null || mapRef.current !== null) return undefined;
    let disposed = false;
    let map: MapLibreMap | null = null;

    void import('maplibre-gl')
      .then(({ Map: MapConstructor, Marker: MarkerConstructor, NavigationControl, FullscreenControl }) => {
        if (disposed === true || element === null) return;
        markerCtorRef.current = MarkerConstructor as unknown as MarkerCtor;
        map = new MapConstructor({ container: element, style: buildStyle('street'), center: [0, 20], zoom: 1.4 });
        map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(new FullscreenControl(), 'top-right');
        map.on('load', () => {
          if (map === null || disposed === true) return;
          attachLayers(map);
          appliedStyleRef.current = 'street';
          mapRef.current = map;
          setLoaded(true);
        });
        /* A click on the canvas dismisses an open project card. Tag clicks never reach the canvas,
           because a tag is a DOM marker above it. */
        map.on('click', () => setSelectedProjectId(null));
      })
      .catch(() => setFailure('The map library could not be loaded.'));

    return () => {
      disposed = true;
      for (const entry of markersRef.current.values()) entry.marker.remove();
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
    // Initialised once. Row and project updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || loaded === false) return;
    const source = map.getSource('evidence') as GeoJSONSource | undefined;
    source?.setData(toCollection(points) as never);
    /* Both layers take part in the fit: a viewport framed on evidence alone would leave project
       tags off screen, and one framed on projects alone would cut off the dots. */
    const lons = [...points.map((point) => point.lon), ...located.map((project) => project.lon)];
    const lats = [...points.map((point) => point.lat), ...located.map((project) => project.lat)];
    if (lons.length === 0 || lats.length === 0) return;
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    if (west === east && south === north) {
      map.flyTo({ center: [west, south], zoom: 11, duration: 0 });
      return;
    }
    map.fitBounds([[west, south], [east, north]], { padding: 56, maxZoom: 12, duration: 0 });
  }, [points, located, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    const MarkerConstructor = markerCtorRef.current;
    if (map === null || MarkerConstructor === null || loaded === false) return;
    reconcileProjectMarkers(map, MarkerConstructor, markersRef.current, located, selectProject);
    applyProjectMarkerSelection(markersRef.current, selectedProjectId);
  }, [located, loaded, selectedProjectId, selectProject]);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || loaded === false) return;
    if (appliedStyleRef.current === basemap) return;
    appliedStyleRef.current = basemap;
    map.setStyle(buildStyle(basemap));
    map.once('style.load', () => {
      if (mapRef.current === null) return;
      attachLayers(mapRef.current);
      const source = mapRef.current.getSource('evidence') as GeoJSONSource | undefined;
      source?.setData(toCollection(pointsRef.current) as never);
    });
  }, [basemap, loaded, attachLayers]);

  /* The card is anchored to its tag by projecting the waypoint into container pixels on every move
     and resize. The position is written straight to the element, so panning never re-renders React. */
  const positionCard = useCallback((): void => {
    const map = mapRef.current;
    const card = cardRef.current;
    const waypoint = selectedProjectRef.current;
    if (map === null || card === null || waypoint === null) return;
    const containerBox = map.getContainer();
    const anchor = map.project([waypoint.lon, waypoint.lat]);
    const maxX = Math.max(CARD_INSET, containerBox.clientWidth - card.offsetWidth - CARD_INSET);
    const maxY = Math.max(CARD_INSET, containerBox.clientHeight - card.offsetHeight - CARD_INSET);
    const x = clamp(anchor.x + CARD_OFFSET, CARD_INSET, maxX);
    const y = clamp(anchor.y - card.offsetHeight - CARD_OFFSET, CARD_INSET, maxY);
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || loaded === false || selectedProject === null) return undefined;
    const handle = (): void => {
      positionCard();
    };
    map.on('move', handle);
    map.on('resize', handle);
    handle();
    return () => {
      map.off('move', handle);
      map.off('resize', handle);
    };
  }, [loaded, positionCard, selectedProject]);

  /* Focus moves into the card when it opens and back to the tag that opened it, so the popup is
     reachable without a pointer and Escape always has somewhere to act from. */
  useEffect(() => {
    if (selectedProject !== null) {
      lastOpenedRef.current = selectedProjectId;
      cardRef.current?.focus();
      return;
    }
    const previous = lastOpenedRef.current;
    lastOpenedRef.current = null;
    if (previous !== null) markersRef.current.get(previous)?.element.focus();
  }, [selectedProject, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelectedProjectId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedProjectId]);

  const emptyState =
    failure === null && points.length === 0
      ? projectMapEmptyState(projects, located.length, unlocated.length)
      : null;
  const notices = projectMapNotices(evidence, unlocated.length);

  return (
    <div className="pn-map">
      <div ref={container} style={{ width: '100%', height: '100%' }} aria-label="Evidence map" role="application" />
      <div className="pn-map-toolbar" role="group" aria-label="Basemap">
        <button
          type="button"
          className="pn-btn pn-btn-sm"
          aria-pressed={basemap === 'street'}
          onClick={() => setBasemap('street')}
        >
          <Icon name="street" size={14} />
          Street
        </button>
        <button
          type="button"
          className="pn-btn pn-btn-sm"
          aria-pressed={basemap === 'satellite'}
          disabled={satelliteAvailable === false}
          title={satelliteAvailable === false ? 'No imagery provider configured (VITE_SATELLITE_TILE_URL)' : 'Satellite imagery'}
          onClick={() => setBasemap('satellite')}
        >
          <Icon name="satellite" size={14} />
          Satellite
        </button>
      </div>
      <div className="pn-map-legend">
        <span className="pn-map-legend-row">
          <span className="pn-map-legend-tag" aria-hidden="true" />
          {located.length} project waypoint{located.length === 1 ? '' : 's'}
        </span>
        <span className="pn-map-legend-row">
          <span className="pn-map-legend-swatch" style={{ color: '#34d399' }} />
          {points.length} geotagged on this page
        </span>
        <span className="pn-map-legend-row">
          <span className="pn-map-legend-swatch" style={{ color: '#818cf8' }} />
          Cluster
        </span>
      </div>
      {notices.length === 0 ? null : (
        <div className="pn-map-notices">
          {notices.map((notice) => (
            <p key={notice} className="pn-note pn-note-warn pn-map-notice">
              {notice}
            </p>
          ))}
        </div>
      )}
      {failure !== null ? (
        <div className="pn-map-overlay">
          <div className="pn-stack-3">
            <p className="pn-state-headline">{failure}</p>
            <p className="pn-state-body">
              Map rendering needs the maplibre-gl runtime. Every other surface in this view still works.
            </p>
          </div>
        </div>
      ) : null}
      {emptyState === null ? null : (
        <div className="pn-map-overlay">
          <div className="pn-stack-3">
            <p className="pn-state-headline">{emptyState.title}</p>
            <p className="pn-state-body">{emptyState.body}</p>
          </div>
        </div>
      )}
      {selected === null ? null : (
        <MapPopup
          point={selected}
          totalMatched={evidencePage === null ? 0 : evidencePage.totalMatched}
          truncated={evidencePage !== null && evidencePage.truncated}
          onView={selectRef.current}
        />
      )}
      {selectedProject === null ? null : (
        <ProjectCard
          cardRef={cardRef}
          waypoint={selectedProject}
          onOpenProject={openProjectRef.current}
          onClose={() => setSelectedProjectId(null)}
        />
      )}
      <p className="pn-visually-hidden" role="status">
        {selectedProject === null ? 'No project open' : `${projectLabel(selectedProject)} project open`}
      </p>
    </div>
  );
}

function MapPopup({
  point,
  totalMatched,
  truncated,
  onView,
}: {
  point: ProjectedAsset;
  totalMatched: number;
  truncated: boolean;
  onView: (assetId: string) => void;
}) {
  return (
    <div className="pn-clay-inset pn-stack-3" style={{ margin: 'var(--pn-space-3)', maxWidth: 340 }}>
      <AssetMedia assetId={point.assetId} maxWidth={320} maxHeight={200} alt={point.title} ratio="16 / 10" />
      <div className="pn-stack-3">
        <p className="pn-evidence-name">{point.title}</p>
        <p className="pn-evidence-meta pn-mono">{point.assetId}</p>
        <div className="pn-cluster pn-cluster-tight">
          <span className="pn-chip">{point.assetType}</span>
          <PhaseBadge phase={point.phase} />
          <UploadStatusBadge status={point.uploadStatus} />
        </div>
        <p className="pn-evidence-meta">
          {point.lat.toFixed(5)}, {point.lon.toFixed(5)} · accuracy{' '}
          {point.accuracy === null ? 'Unknown' : `${point.accuracy} m`} · {point.provider ?? 'Unknown'}
        </p>
        <p className="pn-unknown pn-evidence-meta">
          Verification is not part of a search_assets row — open the asset to read the verified column.
        </p>
        <div className="pn-row pn-row-wrap">
          <button type="button" className="pn-btn pn-btn-sm pn-btn-primary" onClick={() => onView(point.assetId)}>
            View project assets
          </button>
          <span className="pn-card-sub">
            {totalMatched}
            {truncated === true ? '+ matched' : ' matched'}
          </span>
        </div>
      </div>
    </div>
  );
}