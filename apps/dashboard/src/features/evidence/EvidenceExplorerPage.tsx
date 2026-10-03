import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EvidenceGrid } from '../../components/EvidenceGrid';
import { EvidenceInspector } from '../../components/EvidenceInspector';
import { EMPTY_FILTERS, type EvidenceFilters } from '../../lib/queries/evidence';

const PAGE_SIZE = 24;

export function EvidenceExplorerPage() {
  const { projectId, assetId: routeAssetId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EvidenceFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<EvidenceFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(routeAssetId ?? null);

  /* The route is the shareable address of an open asset, so a deep link opens the same drawer. */
  useEffect(() => {
    setSelected(routeAssetId ?? null);
  }, [routeAssetId]);

  const base = `/projects/${projectId ?? 'all'}/assets`;
  const open = (assetId: string | null): void => {
    setSelected(assetId);
    navigate(assetId === null ? base : `${base}/${assetId}`, { replace: true });
  };

  const apply = (): void => {
    setApplied(draft);
    setPage(0);
  };
  const reset = (): void => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  };
  const dirty =
    draft.text !== applied.text ||
    draft.dateFrom !== applied.dateFrom ||
    draft.dateTo !== applied.dateTo ||
    draft.gpsAccuracyMax !== applied.gpsAccuracyMax ||
    draft.assetType !== applied.assetType ||
    draft.phase !== applied.phase ||
    draft.tags.join(',') !== applied.tags.join(',');

  return (
    <div className="pn-stack-5">
      <header className="pn-page-head">
        <div>
          <h1 className="pn-page-title">Evidence explorer</h1>
          <p className="pn-page-lede">
            Search, filters, and pagination all run inside the <code>search_assets</code> RPC.
            Nothing is filtered in the browser.
          </p>
        </div>
      </header>

      <section className="pn-clay-card pn-stack-4" aria-label="Evidence filters">
        <div className="pn-filters">
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-text">
              Search
            </label>
            <input
              id="filter-text"
              className="pn-input"
              type="search"
              value={draft.text}
              placeholder="Caption, observation type, asset id"
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            />
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-from">
              Captured from
            </label>
            <input
              id="filter-from"
              className="pn-input"
              type="date"
              value={draft.dateFrom}
              onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })}
            />
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-to">
              Captured to
            </label>
            <input
              id="filter-to"
              className="pn-input"
              type="date"
              value={draft.dateTo}
              onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })}
            />
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-accuracy">
              Max GPS accuracy (m)
            </label>
            <input
              id="filter-accuracy"
              className="pn-input"
              type="number"
              min={0}
              value={draft.gpsAccuracyMax}
              aria-describedby="filter-accuracy-help"
              onChange={(event) => setDraft({ ...draft, gpsAccuracyMax: event.target.value })}
            />
            <p className="pn-help" id="filter-accuracy-help">
              Excludes assets whose GPS accuracy is NULL.
            </p>
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-type">
              Asset type
            </label>
            <select
              id="filter-type"
              className="pn-select"
              value={draft.assetType ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, assetType: event.target.value === '' ? null : (event.target.value as 'image' | 'video') })
              }
            >
              <option value="">Any</option>
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-phase">
              Phase
            </label>
            <select
              id="filter-phase"
              className="pn-select"
              value={draft.phase ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, phase: event.target.value === '' ? null : (event.target.value as 'before' | 'after') })
              }
            >
              <option value="">Any</option>
              <option value="before">before</option>
              <option value="after">after</option>
            </select>
          </div>
          <div className="pn-field">
            <label className="pn-label" htmlFor="filter-tags">
              Tags
            </label>
            <input
              id="filter-tags"
              className="pn-input"
              value={draft.tags.join(', ')}
              placeholder="comma separated ai_tags"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  tags: event.target.value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter((tag) => tag.length > 0),
                })
              }
            />
          </div>
        </div>
        <p className="pn-card-sub">
          <code>search_assets</code> accepts no project parameter, so project is not offered as a
          filter here. Use the project switcher on the change-event and report surfaces.
        </p>
        <div className="pn-row pn-row-wrap">
          <button type="button" className="pn-btn pn-btn-primary" onClick={apply} disabled={dirty === false}>
            Apply filters
          </button>
          <button type="button" className="pn-btn" onClick={reset}>
            Reset
          </button>
          {dirty === true ? (
            <span className="pn-note pn-note-info" style={{ padding: '4px 8px' }}>
              Filters changed — apply to re-query the server.
            </span>
          ) : null}
        </div>
      </section>

      <EvidenceGrid
        filters={applied}
        page={page}
        pageSize={PAGE_SIZE}
        selectedAssetId={selected}
        onSelect={open}
        onPageChange={setPage}
      />

      {selected === null ? null : (
        <>
          <div className="pn-scrim" onClick={() => open(null)} aria-hidden="true" />
          <EvidenceInspector assetId={selected} onClose={() => open(null)} />
        </>
      )}
      <p className="pn-visually-hidden" role="status">
        {selected === null ? 'No asset open' : `Asset ${selected} open`}
      </p>
    </div>
  );
}