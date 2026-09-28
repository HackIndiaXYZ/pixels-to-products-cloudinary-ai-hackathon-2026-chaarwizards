/**
 * One-time operational setup (BUILD_ORDER Phase 5: "Preset setup"). Provisions
 * the unsigned `verified_capture` upload preset with the server-side guarantees
 * a client cannot be trusted to set (overwrite disabled, authenticated originals,
 * AI tagging, the signed incoming webhook). Run once per environment.
 */
import { loadConfig } from '../config.js';
import { createCloudinaryAdmin } from '../plugins/cloudinary-admin.js';
import { buildUploadPresetDefinition } from '../lib/cloudinary-preset.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const admin = createCloudinaryAdmin(config);

  // The webhook URL the API exposes; Cloudinary signs its notifications and the
  // API re-verifies that signature (§3.11).
  const notificationUrl = `${process.env.API_PUBLIC_URL ?? ''}/webhooks/cloudinary`;
  const definition = buildUploadPresetDefinition(config.CLOUDINARY_UPLOAD_PRESET, notificationUrl);

  await admin.ensureUploadPreset(definition);
  console.log(
    JSON.stringify({ msg: 'upload_preset_ensured', preset: definition.name, unsigned: true }),
  );
}

main().catch((err) => {
  console.error('preset setup failed', err);
  process.exit(1);
});
