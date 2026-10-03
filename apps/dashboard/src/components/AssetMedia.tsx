import type { CSSProperties } from 'react';
import { useAssetMedia } from '../hooks/useAssetMedia';
import { buildDeliveryUrl, mediaAspectRatio, type AssetMediaRef } from '../lib/media';
import { LOADING_COPY, UNAVAILABLE_COPY } from '../lib/state';
import { Icon } from './Icon';
import type { AssetType } from '../types/database';

export interface AssetMediaProps {
  /** The client asks by asset id only — never by Cloudinary public id. */
  assetId: string;
  assetType?: AssetType;
  maxWidth?: number;
  maxHeight?: number;
  alt?: string;
  ratio?: string;
  /** Fills its positioned parent instead of reserving an aspect-ratio box (before/after panes). */
  fill?: boolean;
}

const FILL_STYLE: CSSProperties = { position: 'absolute', inset: 0, aspectRatio: 'auto' };

/** Resolves media through the API route under RLS and composes the delivery URL with
 *  `@cloudinary/url-gen`. The container takes the asset's measured intrinsic ratio, so a
 *  content-bearing image is never cropped or distorted. */
export function AssetMedia({ assetId, assetType, maxWidth = 960, maxHeight = 720, alt, ratio, fill = false }: AssetMediaProps) {
  const state = useAssetMedia(assetId, assetType);
  const frameStyle: CSSProperties | undefined = fill
    ? FILL_STYLE
    : ratio === undefined
      ? undefined
      : ({ '--pn-media-ratio': ratio } as CSSProperties);

  if (state.status === 'loading') {
    return (
      <div className="pn-media-frame" style={frameStyle}>
        <span className="pn-media-frame-caption">{LOADING_COPY}</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="pn-media-frame" style={frameStyle}>
        <span className="pn-media-frame-caption">{UNAVAILABLE_COPY}</span>
        {state.retry === undefined ? null : (
          <button type="button" className="pn-btn pn-btn-sm" onClick={state.retry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (state.status !== 'ready' || state.data === null) {
    return (
      <div className="pn-media-frame" style={frameStyle}>
        <span className="pn-unknown pn-media-frame-caption">{UNAVAILABLE_COPY}</span>
      </div>
    );
  }
  return <MediaBody media={state.data} maxWidth={maxWidth} maxHeight={maxHeight} alt={alt} style={frameStyle} fill={fill} />;
}

function MediaBody({
  media,
  maxWidth,
  maxHeight,
  alt,
  style,
  fill,
}: {
  media: AssetMediaRef;
  maxWidth: number;
  maxHeight: number;
  alt?: string;
  style?: CSSProperties;
  fill: boolean;
}) {
  const url = buildDeliveryUrl(media, { maxWidth, maxHeight });
  const intrinsic = mediaAspectRatio(media);
  const merged: CSSProperties | undefined =
    fill === true
      ? FILL_STYLE
      : intrinsic === null
        ? style
        : ({ ...style, '--pn-media-ratio': intrinsic } as CSSProperties);

  if (url === null) {
    return (
      <div className="pn-media-frame" style={merged}>
        <span className="pn-unknown pn-media-frame-caption">{UNAVAILABLE_COPY}</span>
      </div>
    );
  }

  if (media.assetType === 'video') {
    return (
      <div className="pn-media-frame" style={merged}>
        <video
          controls
          preload="metadata"
          src={url}
          aria-label={alt ?? `Evidence video for asset ${media.assetId}`}
        />
      </div>
    );
  }

  return (
    <div className="pn-media-frame" style={merged}>
      <img src={url} alt={alt ?? `Evidence image for asset ${media.assetId}`} loading="lazy" />
    </div>
  );
}

/** Non-media placeholder used inside dense cards and popups. */
export function MediaPlaceholder({ label }: { label: string }) {
  return (
    <span className="pn-media-frame-caption pn-row">
      <Icon name="evidence" size={14} />
      {label}
    </span>
  );
}