/**
 * Phase 5 — upload preset + retention policy.
 *
 * Asserts the `verified_capture` preset carries the server-side guarantees a
 * client cannot be trusted to set  and that the retention
 * policy excludes evidence from any Cloudinary-side auto-expiry (ARCHITECTURE.md
 * §3.2).
 */
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_UPLOAD_FORMATS,
  EVIDENCE_RETENTION_TAG,
  MAX_UPLOAD_BYTES,
  RETENTION_POLICY,
  buildUploadPresetDefinition,
} from './cloudinary-preset.js';

describe('verified_capture upload preset', () => {
  const def = buildUploadPresetDefinition('verified_capture', 'https://api.example.com/webhooks/cloudinary');

  it('is unsigned (the client never holds the API secret §3.5)', () => {
    expect(def.name).toBe('verified_capture');
    expect(def.unsigned).toBe(true);
  });

  it('disables overwrite and invalidate so an original is immutable (§3.1)', () => {
    expect(def.settings.overwrite).toBe(false);
    expect(def.settings.invalidate).toBe(false);
  });

  it('uploads originals as type authenticated', () => {
    expect(def.settings.type).toBe('authenticated');
  });

  it('bounds format and size', () => {
    expect(def.settings.allowed_formats).toBe(ALLOWED_UPLOAD_FORMATS.join(','));
    expect(def.settings.max_file_size).toBe(MAX_UPLOAD_BYTES);
  });

  it('enables AI tagging at ingest (copied into observations §3.9)', () => {
    expect(def.settings.categorization).toBe('google_tagging');
    expect(def.settings.detection).toBe('openimages');
  });

  it('wires the signed incoming webhook', () => {
    expect(def.settings.notification_url).toBe('https://api.example.com/webhooks/cloudinary');
  });
});

describe('retention policy', () => {
  it('retains evidence 7 years and never auto-expires it in Cloudinary', () => {
    expect(RETENTION_POLICY.evidenceRetentionYears).toBe(7);
    expect(RETENTION_POLICY.cloudinaryAutoExpiryEnabled).toBe(false);
    expect(RETENTION_POLICY.deletionOwner).toBe('reconciliation_job');
    expect(EVIDENCE_RETENTION_TAG).toBe('evidence_no_expiry');
  });
});
