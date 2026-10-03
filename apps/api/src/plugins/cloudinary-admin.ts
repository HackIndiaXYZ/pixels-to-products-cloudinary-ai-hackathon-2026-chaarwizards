/**
 * Cloudinary Admin API adapter — the ONLY place `api.resources()` /
 * `resources_by_*` is called . Two legitimate uses live here and
 * nowhere else:
 *   1. the nightly reconciliation job's one-way integrity listing, and
 *   2. operational provisioning of the unsigned `verified_capture` upload preset.
 *
 * Neither serves a product request. A product read that reached for this listing
 * would leak every org's assets — the Admin listing has no `org_id` filter — so
 * it is quarantined in this file and consumed only by `services/reconciliation.ts`.
 */
import { v2 as cloudinary } from 'cloudinary';
import type { Config } from '../config.js';
import type { CloudinaryAdminPort, CloudinaryResource } from '../ports.js';
import type { UploadPresetDefinition } from '../lib/cloudinary-preset.js';
import { configureCloudinary } from './cloudinary.js';

interface RawResource {
  readonly public_id: string;
  readonly asset_id?: string;
  readonly bytes?: number;
  readonly created_at?: string;
  readonly resource_type?: string;
}

export function createCloudinaryAdmin(config: Config): CloudinaryAdminPort {
  configureCloudinary(config);

  return {
    async listAllResources(): Promise<CloudinaryResource[]> {
      // Reconciliation only. Paginate the full account listing via next_cursor;
      // this is a one-way integrity check, not a query the product ever serves.
      const out: CloudinaryResource[] = [];
      let nextCursor: string | undefined;
      do {
        const page = (await cloudinary.api.resources({
          max_results: 500,
          ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
        })) as { resources?: RawResource[]; next_cursor?: string };
        for (const r of page.resources ?? []) {
          out.push({
            public_id: r.public_id,
            asset_id: r.asset_id ?? null,
            bytes: r.bytes ?? 0,
            created_at: r.created_at ?? '',
            resource_type: r.resource_type ?? 'image',
          });
        }
        nextCursor = page.next_cursor;
      } while (nextCursor !== undefined);
      return out;
    },

    async ensureUploadPreset(definition: UploadPresetDefinition): Promise<void> {
      // Operational setup. Create the preset; if it already exists, update it so
      // the server-side guarantees (overwrite:false, authenticated, tagging,
      // notification_url) stay authoritative.
      const settings = {
        name: definition.name,
        unsigned: definition.unsigned,
        ...definition.settings,
      };
      try {
        await cloudinary.api.create_upload_preset(settings);
      } catch {
        await cloudinary.api.update_upload_preset(definition.name, settings);
      }
    },
  };
}
