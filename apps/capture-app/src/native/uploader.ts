/**
 * Native adapter: Cloudinary uploader (Phase "Sync engine"; §3.5,
 * §3.9, §3.11). Uploads one queued item's bytes and signed context to Cloudinary
 * through the **unsigned** `verified_capture` preset. No API secret ever reaches
 * the client (§3.5): only the public cloud name and preset name are used, and the
 * preset (server-configured) is what pins `type: authenticated`, allowed formats,
 * and `max_file_size`.
 *
 * Failure mapping is honest : a 2xx with a `public_id` is
 * `confirmed`; a 4xx is a `rejected` outcome carrying Cloudinary's reason (the
 * sync engine persists it and never retries); a 5xx or a thrown network error is
 * an `interrupted` outcome, leaving the item resumable and never `confirmed`.
 */
import type { UploadOutcome, UploadRequest, Uploader } from '../ports.js';

export interface CloudinaryUploadConfig {
  readonly cloudName: string;
  /** Unsigned preset name — public, never the API secret (§3.5). */
  readonly uploadPreset: string;
}

/** Serialise the flat context map into Cloudinary's `key=value|key=value` form. */
function encodeContext(context: Readonly<Record<string, string>>): string {
  return Object.entries(context)
    .map(([k, v]) => `${k}=${String(v).replace(/([|=])/g, '\\$1')}`)
    .join('|');
}

export class CloudinaryUploader implements Uploader {
  constructor(private readonly config: CloudinaryUploadConfig) {}

  async upload(item: UploadRequest): Promise<UploadOutcome> {
    const resourceType = item.context['asset_type'] === 'video' ? 'video' : 'image';
    const endpoint = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/${resourceType}/upload`;

    const form = new FormData();
    // React Native FormData accepts a { uri, name, type } file part.
    form.append('file', {
      uri: item.fileUri,
      name: `${item.publicId.split('/').pop() ?? 'capture'}`,
      type: resourceType === 'video' ? 'video/mp4' : 'image/jpeg',
    } as unknown as Blob);
    form.append('upload_preset', this.config.uploadPreset);
    form.append('public_id', item.publicId);
    const combinedContext: Record<string, string> = { ...item.context };
    const exif = item.metadata['exif'];
    if (exif !== undefined) {
      combinedContext['exif'] = JSON.stringify(exif);
    }
    form.append('context', encodeContext(combinedContext));

    const response = await fetch(endpoint, { method: 'POST', body: form });

    if (response.ok) {
      const body = (await response.json()) as { public_id?: string };
      if (typeof body.public_id === 'string') {
        return { kind: 'confirmed', cloudinaryPublicId: body.public_id };
      }
      return { kind: 'interrupted', reason: 'cloudinary 2xx without public_id' };
    }

    // 4xx = the request itself is bad (bad preset, size/format rejected). Do not
    // retry forever — persist the reason and mark rejected.
    if (response.status >= 400 && response.status < 500) {
      const text = await response.text().catch(() => '');
      return { kind: 'rejected', reason: `cloudinary ${response.status}: ${text.slice(0, 500)}` };
    }

    // 5xx = transient; leave the item resumable.
    return { kind: 'interrupted', reason: `cloudinary ${response.status}` };
  }
}
