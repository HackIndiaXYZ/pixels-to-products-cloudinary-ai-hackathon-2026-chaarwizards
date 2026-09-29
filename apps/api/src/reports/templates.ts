/**
 * Report template registry (BUILD_ORDER Phase 9 "Template"). Handlebars
 * templates render the report HTML from a fully-resolved model: cover, project
 * summary, metrics tables, before/after pairs, a map, video clips, and the
 * integrity appendix.
 *
 * Determinism (Phase 9 "Determinism"): a template is pinned by `version`.
 * Changing a template's markup MUST bump its version, because the version is
 * folded into the artifact and two reports built from different template
 * versions must never collide. Handlebars rendering is a pure function of
 * (template source, model), so identical inputs yield identical bytes.
 *
 * The templates never reference a remote URL — every image is an inlined data
 * URI supplied in the model — so a rendered report needs no network (Phase 9
 * "Self-contained artifact").
 */
import Handlebars from 'handlebars';
import type { MetricRow } from '../lib/report-metrics.js';

/** A model asset element already resolved to an inlined data URI. */
export interface ReportImage {
  readonly dataUri: string;
  readonly caption: string | null;
  readonly capturedAt: string | null;
  readonly observationType: string | null;
}

export interface ReportPair {
  readonly beforeOrdinal: number;
  readonly afterOrdinal: number;
  readonly before: ReportImage;
  readonly after: ReportImage;
  readonly diff: { readonly dataUri: string; readonly ordinal: number } | null;
  readonly metrics: readonly MetricRow[];
  readonly modelVersion: string;
  readonly changeType: string | null;
  readonly gpsDistanceMeters: string | null;
  readonly timeDifferenceHours: string | null;
}

export interface ReportVideoClip {
  readonly posterDataUri: string;
  readonly posterOrdinal: number;
  /** The clip transformation string, recorded in the manifest — NOT a live URL. */
  readonly clipTransformation: string;
  readonly caption: string | null;
}

/** Per-asset integrity summary for the appendix (Phase 9 "Integrity appendix"). */
export interface AppendixAsset {
  readonly assetId: string;
  readonly currentHash: string | null;
  readonly signatureStatus: string;
  readonly exifStatus: string;
  readonly captionStatus: string;
  readonly deviceCaptureTimestamp: string;
  readonly serverUploadTimestamp: string | null;
  readonly clockDriftSeconds: string | null;
  readonly modelVersions: readonly string[];
}

export interface AppendixChainRow {
  readonly assetId: string;
  readonly action: string;
  readonly previousHash: string | null;
  readonly currentHash: string;
}

export interface ManifestView {
  readonly ordinal: number;
  readonly role: string;
  readonly cloudinaryPublicId: string | null;
  readonly derivativePublicId: string | null;
  readonly sha256Hash: string | null;
  readonly verified: boolean;
}

export interface ReportModel {
  readonly title: string;
  readonly templateVersion: string;
  readonly project: {
    readonly name: string;
    readonly sector: string;
    readonly id: string;
    readonly dateFrom: string | null;
    readonly dateTo: string | null;
    readonly pairCount: number;
    readonly assetCount: number;
  };
  /** Raw @font-face CSS with inlined font bytes, empty when no font is embedded. */
  readonly fontFaceCss: string;
  readonly pairs: readonly ReportPair[];
  readonly map: { readonly dataUri: string; readonly ordinal: number } | null;
  readonly videoClips: readonly ReportVideoClip[];
  readonly appendix: {
    readonly include: boolean;
    readonly assets: readonly AppendixAsset[];
    readonly chain: readonly AppendixChainRow[];
    readonly manifest: readonly ManifestView[];
  };
}

/** A registered template: pinned version plus its compiled render function. */
export interface RegisteredTemplate {
  readonly key: string;
  readonly version: string;
  readonly sector: string;
  readonly name: string;
  render(model: ReportModel): string;
}

// A private Handlebars environment so global helper registration elsewhere can
// never change how a report renders (determinism).
const hb = Handlebars.create();

const FORESTRY_DONOR_SOURCE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{{title}}</title>
<style>
{{{fontFaceCss}}}
* { font-family: 'Inter', system-ui, sans-serif; }
body { margin: 0; color: #14231b; }
.cover { padding: 96px 64px; }
.cover h1 { font-size: 40px; margin: 0 0 8px; }
.muted { color: #5a6b60; }
.section { padding: 32px 64px; page-break-inside: avoid; }
.section h2 { font-size: 24px; border-bottom: 2px solid #cfe3d6; padding-bottom: 6px; }
.pair { display: flex; gap: 16px; page-break-inside: avoid; }
.pair figure { flex: 1; margin: 0; }
.pair img, .diff img, .map img, .clip img { max-width: 100%; border: 1px solid #cfe3d6; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #cfe3d6; padding: 6px 10px; text-align: left; font-size: 13px; }
.model-version { font-family: ui-monospace, monospace; font-size: 12px; color: #5a6b60; }
.hash { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
</style></head>
<body>
<section class="cover">
  <h1>{{title}}</h1>
  <p class="muted">Project: {{project.name}} · Sector: {{project.sector}}</p>
  <p class="muted">Observation window: {{#if project.dateFrom}}{{project.dateFrom}}{{else}}—{{/if}} to {{#if project.dateTo}}{{project.dateTo}}{{else}}—{{/if}}</p>
  <p class="muted">Template: {{templateVersion}}</p>
</section>

<section class="section">
  <h2>Project Summary</h2>
  <table>
    <tr><th>Project ID</th><td class="hash">{{project.id}}</td></tr>
    <tr><th>Sector</th><td>{{project.sector}}</td></tr>
    <tr><th>Before/after pairs</th><td>{{project.pairCount}}</td></tr>
    <tr><th>Assets included</th><td>{{project.assetCount}}</td></tr>
  </table>
</section>

{{#if map}}
<section class="section map">
  <h2>Site Map</h2>
  <img alt="site map" src="{{map.dataUri}}">
</section>
{{/if}}

<section class="section">
  <h2>Before / After Evidence</h2>
  {{#each pairs}}
  <div class="pair">
    <figure>
      <img alt="before" src="{{before.dataUri}}">
      <figcaption class="muted">Before · {{#if before.capturedAt}}{{before.capturedAt}}{{/if}}{{#if before.caption}} · {{before.caption}}{{/if}}</figcaption>
    </figure>
    <figure>
      <img alt="after" src="{{after.dataUri}}">
      <figcaption class="muted">After · {{#if after.capturedAt}}{{after.capturedAt}}{{/if}}{{#if after.caption}} · {{after.caption}}{{/if}}</figcaption>
    </figure>
  </div>
  {{#if diff}}
  <div class="diff"><img alt="change diff" src="{{diff.dataUri}}"></div>
  {{/if}}
  <table>
    <thead><tr><th>Metric</th><th>Value</th></tr></thead>
    <tbody>
    {{#each metrics}}
      <tr><td>{{key}}</td><td>{{value}}</td></tr>
    {{/each}}
    </tbody>
  </table>
  <p class="model-version">Computed by model {{modelVersion}}{{#if changeType}} · {{changeType}}{{/if}}</p>
  {{/each}}
</section>

{{#if videoClips.length}}
<section class="section">
  <h2>Video Evidence</h2>
  {{#each videoClips}}
  <div class="clip">
    <img alt="video keyframe" src="{{posterDataUri}}">
    <p class="muted">{{#if caption}}{{caption}} · {{/if}}Clip transformation: <span class="model-version">{{clipTransformation}}</span></p>
  </div>
  {{/each}}
</section>
{{/if}}

{{#if appendix.include}}
<section class="section">
  <h2>Integrity Appendix</h2>
  <h3>Per-asset verification</h3>
  <table>
    <thead><tr><th>Asset</th><th>Signature</th><th>EXIF</th><th>Caption</th><th>Capture time</th><th>Server time</th><th>Clock drift (s)</th><th>Models</th></tr></thead>
    <tbody>
    {{#each appendix.assets}}
      <tr>
        <td class="hash">{{assetId}}</td>
        <td>{{signatureStatus}}</td>
        <td>{{exifStatus}}</td>
        <td>{{captionStatus}}</td>
        <td>{{deviceCaptureTimestamp}}</td>
        <td>{{#if serverUploadTimestamp}}{{serverUploadTimestamp}}{{else}}unknown{{/if}}</td>
        <td>{{#if clockDriftSeconds}}{{clockDriftSeconds}}{{else}}unknown{{/if}}</td>
        <td class="model-version">{{#each modelVersions}}{{this}} {{/each}}</td>
      </tr>
    {{/each}}
    </tbody>
  </table>

  <h3>Hash chain excerpt</h3>
  <table>
    <thead><tr><th>Asset</th><th>Action</th><th>Previous hash</th><th>Current hash</th></tr></thead>
    <tbody>
    {{#each appendix.chain}}
      <tr>
        <td class="hash">{{assetId}}</td>
        <td>{{action}}</td>
        <td class="hash">{{#if previousHash}}{{previousHash}}{{else}}(genesis){{/if}}</td>
        <td class="hash">{{currentHash}}</td>
      </tr>
    {{/each}}
    </tbody>
  </table>

  <h3>Media manifest</h3>
  <table>
    <thead><tr><th>#</th><th>Role</th><th>Public ID</th><th>Derivative</th><th>SHA-256 (embedded bytes)</th><th>Verified</th></tr></thead>
    <tbody>
    {{#each appendix.manifest}}
      <tr>
        <td>{{ordinal}}</td>
        <td>{{role}}</td>
        <td class="hash">{{#if cloudinaryPublicId}}{{cloudinaryPublicId}}{{else}}—{{/if}}</td>
        <td class="hash">{{#if derivativePublicId}}{{derivativePublicId}}{{else}}—{{/if}}</td>
        <td class="hash">{{#if sha256Hash}}{{sha256Hash}}{{else}}—{{/if}}</td>
        <td>{{#if verified}}yes{{else}}no{{/if}}</td>
      </tr>
    {{/each}}
    </tbody>
  </table>
</section>
{{/if}}
</body></html>`;

const REGISTRY: Record<string, RegisteredTemplate> = {};

function register(key: string, version: string, sector: string, name: string, source: string): void {
  const compiled = hb.compile(source, { strict: false, noEscape: false });
  REGISTRY[key] = {
    key,
    version,
    sector,
    name,
    render: (model) => compiled(model),
  };
}

register(
  'forestry_donor',
  'forestry_donor@1',
  'forestry',
  'Forestry Donor Report',
  FORESTRY_DONOR_SOURCE,
);

/** All built-in templates, optionally filtered by sector. */
export function listBuiltInTemplates(sector?: string): RegisteredTemplate[] {
  const all = Object.values(REGISTRY);
  return sector === undefined ? all : all.filter((t) => t.sector === sector);
}

/** Resolve a built-in template by its key, or null if unknown. */
export function getBuiltInTemplate(key: string): RegisteredTemplate | null {
  return REGISTRY[key] ?? null;
}

/**
 * Compile an org-authored template stored in `report_templates`. Its version is
 * pinned as `key@vN`, where the row id and an explicit config version fold in so
 * a markup edit that is not accompanied by a version bump still changes the
 * pinned string (guarding the determinism contract).
 */
export function compileCustomTemplate(
  key: string,
  version: string,
  sector: string,
  name: string,
  source: string,
): RegisteredTemplate {
  const compiled = hb.compile(source, { strict: false, noEscape: false });
  return { key, version, sector, name, render: (model) => compiled(model) };
}
