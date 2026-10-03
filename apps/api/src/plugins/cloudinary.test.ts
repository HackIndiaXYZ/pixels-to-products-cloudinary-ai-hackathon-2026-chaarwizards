/** Cloudinary signing uses SDK helpers; Free-plan signed URLs have no expiry. */
import { describe, expect, it } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import { createCloudinaryAdapter, isEagerPending } from './cloudinary.js';
import { testConfig } from '../testing/fakes.js';

const config = testConfig({
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: '123456789',
  CLOUDINARY_API_SECRET: 'abcdefghijklmnop',
});

describe('Cloudinary signing is SDK-produced (§3.11)', () => {
  const adapter = createCloudinaryAdapter(config);

  it('signRequest matches the SDK helper exactly (not string concat + digest)', () => {
    const params = { public_id: 'org/proj/sha', timestamp: 1700000000 };
    const fromAdapter = adapter.signRequest(params);
    const fromSdk = cloudinary.utils.api_sign_request(params, config.CLOUDINARY_API_SECRET);
    expect(fromAdapter).toBe(fromSdk);
    // A real SHA-1 hex signature, not an ad-hoc token.
    expect(fromAdapter).toMatch(/^[0-9a-f]{40}$/);
  });

  it('a derivative URL carries an SDK s-- signature segment', () => {
    const url = adapter.signedDerivativeUrl('org/proj/sha', 'c_limit,w_800');
    expect(url).toContain('/image/upload/');
    expect(url).toMatch(/s--[^/]+--/);
  });
});

describe('Authenticated originals use SDK signatures without token-based expiry', () => {
  const adapter = createCloudinaryAdapter(config);

  it('an authenticated original has a signed URL and no auth token', () => {
    const url = adapter.originalUrl('org/proj/sha', 'image');
    expect(url).toContain('/image/authenticated/');
    expect(url).toMatch(/\/s--[^/]+--\//);
    expect(url).not.toContain('__cld_token__');
  });

  it('uses the video resource type for authenticated video originals', () => {
    const url = adapter.originalUrl('org/proj/video', 'video');
    expect(url).toContain('/video/authenticated/');
    expect(url).toMatch(/\/s--[^/]+--\//);
  });

  it('the v{} segment is a cache-buster, never treated as a deadline', () => {
    const url = adapter.signedDerivativeUrl('org/proj/sha', 'c_limit,w_800');
    // If a version segment is present it is a plain integer counter, not a TTL.
    const match = url.match(/\/v(\d+)\//);
    if (match !== null) {
      expect(Number(match[1])).toBeGreaterThan(0);
    }
    // The signed derivative URL is type upload and carries no auth_token expiry.
    expect(url).not.toContain('__cld_token__');
  });
});

describe('async generative eager status classification (§3.11, §3.6)', () => {
  // Regression: the live Cloudinary account returns `status: 'processing'` (with
  // the destination URL already populated) for an async `e_gen_*` transform,
  // BEFORE the bytes exist. Classifying that as ready would serve a URL that is
  // still generating. Only 'complete', or a status-less synchronous eager with a
  // URL, is ready.
  it('treats a still-generating "processing" entry as pending even with a URL', () => {
    expect(
      isEagerPending({ status: 'processing', secure_url: 'https://res/x.jpg' }),
    ).toBe(true);
  });

  it('treats "pending" as pending', () => {
    expect(isEagerPending({ status: 'pending' })).toBe(true);
  });

  it('treats "failed" as not-ready (never served as ready)', () => {
    expect(isEagerPending({ status: 'failed', secure_url: 'https://res/x.jpg' })).toBe(true);
  });

  it('treats a missing eager entry as pending', () => {
    expect(isEagerPending(undefined)).toBe(true);
  });

  it('treats "complete" with a URL as ready', () => {
    expect(isEagerPending({ status: 'complete', secure_url: 'https://res/x.jpg' })).toBe(false);
  });

  it('treats a synchronous eager (no status, has URL) as ready', () => {
    expect(isEagerPending({ secure_url: 'https://res/x.jpg' })).toBe(false);
  });
});
