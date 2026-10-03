import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Project } from '../types/database';
import type { EvidencePage } from '../lib/queries/evidence';
import type { LocatedProjectWaypoint } from '../lib/models';
import { EMPTY_COPY, LOADING_COPY, UNKNOWN_COPY, formatNumber, type DataState } from '../lib/state';
import { useProjectAssetCount } from '../hooks/useProjectAssetCount';
import type { RefObject } from 'react';
import { Icon } from './Icon';

/** Project waypoints on the evidence map.
 *
 *  A tag is placed from `projects.geometry` and nothing else: the polygon centroid computed by
 *  `toProjectWaypointModel` in `lib/models`. The asset total in the card is the exact `assets` row
 *  count for that project, filtered by PostgREST under row-level security, read when the card opens
 *  rather than for every project on the map. */

export type MarkerCtor = new (options: { element: HTMLElement; anchor?: string }) => Marker;

export interface ProjectMarker {
  marker: Marker;
  element: HTMLButtonElement;
}

export function projectLabel(project: { name: string }): string {
  return project.name.trim().length > 0 ? project.name : UNKNOWN_COPY;
}

/** The tag itself: a pill carrying the project name with a locator dot, built as a real button so
 *  it is reachable by keyboard and announced as a control rather than as decoration. */
export function createProjectTag(
  project: LocatedProjectWaypoint,
  onSelect: (projectId: string) => void,
): HTMLButtonElement {
  const label = projectLabel(project);
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'pn-map-tag';
  element.dataset.projectId = project.id;
  element.title = label;
  element.setAttribute('aria-label', `${label} — project waypoint`);
  element.setAttribute('aria-haspopup', 'dialog');
  element.setAttribute('aria-expanded', 'false');

  const dot = document.createElement('span');
  dot.className = 'pn-map-tag-dot';
  dot.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'pn-map-tag-name';
  name.textContent = label;
  element.append(dot, name);
  element.addEventListener('click', () => onSelect(project.id));
  return element;
}

/* Tags are DOM markers owned by the map, so they are reconciled imperatively rather than by
 *  React: created once per project, moved when a project's geometry changes, and removed when the
 *  project leaves the read. */
export function reconcileProjectMarkers(
  map: MapLibreMap,
  MarkerConstructor: MarkerCtor,
  existing: Map<string, ProjectMarker>,
  located: readonly LocatedProjectWaypoint[],
  onSelect: (projectId: string) => void,
): void {
  const wanted = new Set(located.map((project) => project.id));
  for (const [id, entry] of existing) {
    if (wanted.has(id) === false) {
      entry.marker.remove();
      existing.delete(id);
    }
  }
  for (const project of located) {
    const current = existing.get(project.id);
    if (current === undefined) {
      const element = createProjectTag(project, onSelect);
      /* `anchor: 'bottom'` puts the point at the pill's lower edge, where the tag's pointer tip
         lands, so the tag reads as a waypoint rather than as a label floating over the map. */
      const marker = new MarkerConstructor({ element, anchor: 'bottom' })
        .setLngLat([project.lon, project.lat])
        .addTo(map);
      existing.set(project.id, { marker, element });
    } else {
      current.marker.setLngLat([project.lon, project.lat]);
      const label = projectLabel(project);
      current.element.title = label;
      current.element.setAttribute('aria-label', `${label} — project waypoint`);
    }
  }
}

/** Selection is carried by the tag itself, so the map still shows which project is open after the
 *  card is dismissed. */
export function applyProjectMarkerSelection(
  existing: Map<string, ProjectMarker>,
  selectedId: string | null,
): void {
  for (const [id, entry] of existing) {
    const isSelected = id === selectedId;
    entry.element.classList.toggle('is-selected', isSelected);
    entry.element.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
  }
}

/** Why the map has nothing at all to show. Every branch names the read that failed, so a missing
 *  layer is never mistaken for an empty database. */
export function projectMapEmptyState(
  projects: DataState<Project[]>,
  locatedCount: number,
  unlocated: number,
): { title: string; body: string } | null {
  if (locatedCount > 0) return null;
  switch (projects.status) {
    case 'loading':
      return { title: LOADING_COPY, body: 'Reading project geometry from Postgres.' };
    case 'error':
      return {
        title: 'Project locations unavailable',
        body: 'The projects read failed, so no project waypoint could be placed. Reads stay subject to row-level security.',
      };
    case 'unauthorized':
      return {
        title: 'Project locations restricted',
        body: 'Your role cannot read projects, so no waypoint is placed on the map.',
      };
    case 'empty':
      return {
        title: EMPTY_COPY.projects,
        body: 'No project row is visible to this account, so there is nothing to place on the map.',
      };
    case 'unknown':
      return {
        title: UNKNOWN_COPY,
        body: 'The backend could not return project geometry, so no waypoint was placed.',
      };
    default:
      return {
        title: 'No readable project geometry',
        body: `${unlocated} project${unlocated === 1 ? '' : 's'} carr${unlocated === 1 ? 'ies' : 'y'} a projects.geometry value with no readable coordinate pair, so nothing was placed on the map.`,
      };
  }
}

/** Short, honest lines for the states that do not stop the map from rendering. A layer that could
 *  not be read is reported beside the map instead of hiding the layers that did load. */
export function projectMapNotices(
  evidence: DataState<EvidencePage>,
  unlocated: number,
): string[] {
  const notices: string[] = [];
  if (unlocated > 0) {
    notices.push(
      `${unlocated} project${unlocated === 1 ? '' : 's'} not placed: projects.geometry has no readable coordinate pair.`,
    );
  }
  if (evidence.status === 'error') {
    notices.push('Evidence dots unavailable: the search_assets read failed.');
  }
  if (evidence.status === 'empty') {
    notices.push(
      'No geotagged evidence on this page. Project tags come from projects.geometry, not from assets.',
    );
  }
  return notices;
}

interface ProjectCardProps {
  cardRef: RefObject<HTMLDivElement | null>;
  waypoint: LocatedProjectWaypoint;
  onOpenProject: (projectId: string) => void;
  onClose: () => void;
}

/** What a project tag opens: how many evidence assets that project holds. Deliberately small —
 *  the tag already names the project, so the card answers the one question the tag cannot: the
 *  count. Sector, dates, and the centroid coordinate stayed off it on purpose; they are project
 *  attributes, not asset facts, and they turned a glance into a scroll.
 *
 *  While the count is loading, or if it cannot be determined, the card says so instead of showing a
 *  number. The provenance line is kept because the figure is exact and RLS-filtered, and a bare
 *  number would read as a figure from anywhere. */
export function ProjectCard({ cardRef, waypoint, onOpenProject, onClose }: ProjectCardProps) {
  const label = projectLabel(waypoint);
  const assetCount = useProjectAssetCount(waypoint.id);
  const countValue =
    assetCount.status === 'ready'
      ? formatNumber(assetCount.data)
      : assetCount.status === 'loading'
        ? LOADING_COPY
        : UNKNOWN_COPY;
  const plural = assetCount.status === 'ready' && assetCount.data === 1 ? '' : 's';
  const countNote =
    assetCount.status === 'error'
      ? 'count failed'
      : assetCount.status === 'unknown'
        ? 'count undetermined'
        : assetCount.status === 'loading'
          ? 'counting'
          : null;

  return (
    <div className="pn-map-card" role="dialog" aria-label={`${label} project`} tabIndex={-1} ref={cardRef}>
      <div className="pn-map-card-head">
        <span className="pn-evidence-name pn-map-card-name">{label}</span>
        <button type="button" className="pn-icon-btn pn-map-card-close" aria-label="Close project card" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="pn-map-card-count">
        <span className={assetCount.status === 'ready' ? 'pn-map-card-count-value' : 'pn-map-card-count-value is-text'}>
          {countValue}
        </span>
        <span className="pn-evidence-meta">asset{plural}</span>
      </p>
      <p className="pn-evidence-meta">
        in this project · assets · Content-Range{countNote === null ? '' : ` · ${countNote}`}
      </p>
      <button
        type="button"
        className="pn-btn pn-btn-sm pn-btn-primary pn-map-card-action"
        onClick={() => onOpenProject(waypoint.id)}
      >
        View project assets
      </button>
      {/* Focus moves into the card when it opens; this announces the count as it settles, so a
          reader hears the number arrive without having to reopen the tag. */}
      <p className="pn-visually-hidden" role="status">
        {countValue} asset{plural} in this project
      </p>
    </div>
  );
}