/**
 * Pure, deterministic report assembly (Phase). Given every media
 * element already fetched as bytes, this module:
 *
 *  1. inlines each element as a base64 `data:` URI (Phase 9 "Self-contained
 *     artifact" — a finalized report renders offline, with no network and no
 *     token);
 *  2. computes the SHA-256 of the exact bytes it embeds, so the manifest row's
 *     hash matches what is actually in the artifact (Phase 9 Manifest gate);
 *  3. renders the HTML through the pinned Handlebars template.
 *
 * It is deliberately pure and free of I/O and wall-clock time: assembling the
 * same inputs twice produces byte-identical HTML (Phase 9 "Determinism"). All
 * fetching, transforming, uploading, and persistence lives in the service layer.
 */
import { createHash } from 'node:crypto';
import { serializeMetrics } from '../lib/report-metrics.js';
import { formatMetricValue } from '../lib/report-metrics.js';
import type {
  AppendixAsset,
  AppendixChainRow,
  ManifestView,
  RegisteredTemplate,
  ReportModel,
  ReportPair,
  ReportVideoClip,
} from './templates.js';

export type ManifestRole = 'photo' | 'diff' | 'map' | 'chart' | 'video_clip' | 'qr';

/** A media element already resolved to raw bytes, ready to inline. */
export interface InlinedMedia {
  readonly cloudinaryPublicId: string | null;
  readonly derivativePublicId: string | null;
  readonly bytes: Buffer;
  readonly mime: string;
}

export interface AssemblePairInput {
  readonly before: {
    readonly media: InlinedMedia;
    readonly caption: string | null;
    readonly capturedAt: string | null;
    readonly observationType: string | null;
  };
  readonly after: {
    readonly media: InlinedMedia;
    readonly caption: string | null;
    readonly capturedAt: string | null;
    readonly observationType: string | null;
  };
  readonly diff: InlinedMedia | null;
  readonly metrics: Record<string, unknown>;
  readonly modelVersion: string;
  readonly changeType: string | null;
  readonly gpsDistanceMeters: number | null;
  readonly timeDifferenceHours: number | null;
}

export interface AssembleVideoClipInput {
  readonly poster: InlinedMedia;
  readonly clipTransformation: string;
  readonly caption: string | null;
}

export interface AssembleInput {
  readonly template: RegisteredTemplate;
  readonly title: string;
  readonly project: {
    readonly name: string;
    readonly sector: string;
    readonly id: string;
    readonly dateFrom: string | null;
    readonly dateTo: string | null;
  };
  readonly fontFaceCss: string;
  readonly pairs: readonly AssemblePairInput[];
  readonly map: InlinedMedia | null;
  readonly videoClips: readonly AssembleVideoClipInput[];
  readonly appendix: {
    readonly include: boolean;
    readonly assets: readonly AppendixAsset[];
    readonly chain: readonly AppendixChainRow[];
  };
}

/** One manifest row the service will persist to `report_manifest_entries`. */
export interface AssembledManifestEntry {
  readonly ordinal: number;
  readonly role: ManifestRole;
  readonly cloudinaryPublicId: string | null;
  readonly derivativePublicId: string | null;
  readonly sha256Hash: string;
  readonly byteSize: number;
  readonly verified: boolean;
}

export interface AssembleResult {
  readonly html: string;
  readonly model: ReportModel;
  readonly manifest: readonly AssembledManifestEntry[];
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toDataUri(media: InlinedMedia): string {
  return `data:${media.mime};base64,${media.bytes.toString('base64')}`;
}

/**
 * Assemble the self-contained report. Ordinals are assigned in document order
 * (map, then each pair's before/after/diff, then video posters) so the manifest
 * mirrors the reading order of the artifact.
 */
export function assembleReport(input: AssembleInput): AssembleResult {
  const manifest: AssembledManifestEntry[] = [];
  let ordinal = 0;

  function inline(media: InlinedMedia, role: ManifestRole): { dataUri: string; ordinal: number } {
    ordinal += 1;
    const dataUri = toDataUri(media);
    manifest.push({
      ordinal,
      role,
      cloudinaryPublicId: media.cloudinaryPublicId,
      derivativePublicId: media.derivativePublicId,
      sha256Hash: sha256Hex(media.bytes),
      byteSize: media.bytes.length,
      verified: true,
    });
    return { dataUri, ordinal };
  }

  const map =
    input.map !== null ? { ...inline(input.map, 'map') } : null;

  const pairs: ReportPair[] = input.pairs.map((p) => {
    const before = inline(p.before.media, 'photo');
    const after = inline(p.after.media, 'photo');
    const diff = p.diff !== null ? inline(p.diff, 'diff') : null;
    return {
      beforeOrdinal: before.ordinal,
      afterOrdinal: after.ordinal,
      before: {
        dataUri: before.dataUri,
        caption: p.before.caption,
        capturedAt: p.before.capturedAt,
        observationType: p.before.observationType,
      },
      after: {
        dataUri: after.dataUri,
        caption: p.after.caption,
        capturedAt: p.after.capturedAt,
        observationType: p.after.observationType,
      },
      diff: diff !== null ? { dataUri: diff.dataUri, ordinal: diff.ordinal } : null,
      metrics: serializeMetrics(p.metrics),
      modelVersion: p.modelVersion,
      changeType: p.changeType,
      gpsDistanceMeters: p.gpsDistanceMeters === null ? null : formatMetricValue(p.gpsDistanceMeters),
      timeDifferenceHours:
        p.timeDifferenceHours === null ? null : formatMetricValue(p.timeDifferenceHours),
    };
  });

  const videoClips: ReportVideoClip[] = input.videoClips.map((c) => {
    const poster = inline(c.poster, 'video_clip');
    return {
      posterDataUri: poster.dataUri,
      posterOrdinal: poster.ordinal,
      clipTransformation: c.clipTransformation,
      caption: c.caption,
    };
  });

  const manifestView: ManifestView[] = manifest.map((m) => ({
    ordinal: m.ordinal,
    role: m.role,
    cloudinaryPublicId: m.cloudinaryPublicId,
    derivativePublicId: m.derivativePublicId,
    sha256Hash: m.sha256Hash,
    verified: m.verified,
  }));

  const model: ReportModel = {
    title: input.title,
    templateVersion: input.template.version,
    project: {
      name: input.project.name,
      sector: input.project.sector,
      id: input.project.id,
      dateFrom: input.project.dateFrom,
      dateTo: input.project.dateTo,
      pairCount: pairs.length,
      assetCount: pairs.length * 2,
    },
    fontFaceCss: input.fontFaceCss,
    pairs,
    map,
    videoClips,
    appendix: {
      include: input.appendix.include,
      assets: input.appendix.assets,
      chain: input.appendix.chain,
      manifest: input.appendix.include ? manifestView : [],
    },
  };

  const html = input.template.render(model);
  return { html, model, manifest };
}

/** Re-export for callers building appendix rows. */
export type { AppendixAsset, AppendixChainRow };
