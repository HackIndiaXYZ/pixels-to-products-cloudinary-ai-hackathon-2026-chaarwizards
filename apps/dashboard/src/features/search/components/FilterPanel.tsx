import { ASSET_PHASES, ASSET_TYPES, type AssetPhase, type AssetType } from '@panchnama/shared/rn';
import type { SearchFilters } from '../types';

/**
 * Filter panel exposing all seven search facets (BUILD_ORDER Phase 8): free
 * text, date range, tags, GPS-accuracy ceiling, asset type, and phase. The map
 * viewport supplies the `bbox` facet, so it has no manual control here. Each
 * control edits one field of the immutable `filters` object; clearing a control
 * removes its facet entirely rather than sending an empty value.
 */
export interface FilterPanelProps {
  readonly filters: SearchFilters;
  readonly onChange: (next: SearchFilters) => void;
}

function withoutKey<K extends keyof SearchFilters>(
  filters: SearchFilters,
  key: K,
): SearchFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  return (
    <form aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
      <label>
        Search
        <input
          type="search"
          aria-label="q"
          value={filters.q ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === '' ? withoutKey(filters, 'q') : { ...filters, q: e.target.value },
            )
          }
        />
      </label>

      <label>
        From
        <input
          type="date"
          aria-label="date_from"
          value={filters.dateFrom ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? withoutKey(filters, 'dateFrom')
                : { ...filters, dateFrom: e.target.value },
            )
          }
        />
      </label>

      <label>
        To
        <input
          type="date"
          aria-label="date_to"
          value={filters.dateTo ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? withoutKey(filters, 'dateTo')
                : { ...filters, dateTo: e.target.value },
            )
          }
        />
      </label>

      <label>
        Tags
        <input
          type="text"
          aria-label="tags"
          placeholder="tree,planting"
          value={(filters.tags ?? []).join(',')}
          onChange={(e) => {
            const tags = e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t !== '');
            onChange(tags.length === 0 ? withoutKey(filters, 'tags') : { ...filters, tags });
          }}
        />
      </label>

      <label>
        Max GPS accuracy (m)
        <input
          type="number"
          aria-label="gps_accuracy_max"
          min={0}
          value={filters.gpsAccuracyMax ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? withoutKey(filters, 'gpsAccuracyMax')
                : { ...filters, gpsAccuracyMax: Number(e.target.value) },
            )
          }
        />
      </label>

      <label>
        Asset type
        <select
          aria-label="asset_type"
          value={filters.assetType ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? withoutKey(filters, 'assetType')
                : { ...filters, assetType: e.target.value as AssetType },
            )
          }
        >
          <option value="">Any</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        Phase
        <select
          aria-label="phase"
          value={filters.phase ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? withoutKey(filters, 'phase')
                : { ...filters, phase: e.target.value as AssetPhase },
            )
          }
        >
          <option value="">Any</option>
          {ASSET_PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
