import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetMedia } from './AssetMedia';

export interface BeforeAfterSliderProps {
  beforeAssetId: string | null;
  afterAssetId: string | null;
}

/** Step 7's BEFORE | AFTER viewer. Only a genuinely paired event — both asset ids non-null — can
 *  be compared. With either side missing the component says so instead of showing a half pair. */
export function BeforeAfterSlider({ beforeAssetId, afterAssetId }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const surface = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number): void => {
    const element = surface.current;
    if (element === null) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0) return;
    const ratio = (clientX - bounds.left) / bounds.width;
    setPosition(Math.min(100, Math.max(0, ratio * 100)));
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (dragging.current === false) return;
      setFromClientX(event.clientX);
    };
    const up = (): void => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setFromClientX]);

  if (beforeAssetId === null || afterAssetId === null) {
    return (
      <div className="pn-slider" style={{ display: 'grid', placeItems: 'center', padding: 'var(--pn-space-4)' }}>
        <div className="pn-stack-3">
          <p className="pn-state-headline">Unpaired change event</p>
          <p className="pn-state-body">
            A comparison needs both <code>before_asset_id</code> and <code>after_asset_id</code>.
            This event has
            {beforeAssetId === null ? ' no before asset' : ' no after asset'}, so there is nothing to
            show side by side.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pn-slider"
      ref={surface}
      onPointerDown={(event) => {
        dragging.current = true;
        setFromClientX(event.clientX);
      }}
    >
      <div className="pn-slider-pane">
        <AssetMedia assetId={afterAssetId} maxWidth={1200} maxHeight={900} alt="After evidence" fill />
      </div>
      <div className="pn-slider-pane" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <AssetMedia assetId={beforeAssetId} maxWidth={1200} maxHeight={900} alt="Before evidence" fill />
      </div>
      <span className="pn-slider-label pn-slider-label-before">Before</span>
      <span className="pn-slider-label pn-slider-label-after">After</span>
      <div className="pn-slider-handle" style={{ left: `${position}%` }} aria-hidden="true">
        <span className="pn-slider-grip">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" />
          </svg>
        </span>
      </div>
      <label className="pn-visually-hidden" htmlFor="before-after-position">
        Before and after reveal position
      </label>
      <input
        id="before-after-position"
        type="range"
        min={0}
        max={100}
        value={Math.round(position)}
        onChange={(event) => setPosition(Number(event.target.value))}
        style={{ position: 'absolute', insetInline: 0, bottom: 'var(--pn-space-2)', width: '100%' }}
      />
      <span className="pn-visually-hidden" role="status">
        Reveal {Math.round(position)} percent of the before frame
      </span>
    </div>
  );
}