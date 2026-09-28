/**
 * Phase 5 gate — transformation catalogue.
 *
 * The authoritative source is `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md`.
 * These tests assert that every verified-real §1 parameter is accepted by the
 * Cloudinary SDK without error (the gate's first bullet), that the named and
 * generative transform strings match §5 verbatim, and that the video clip helper
 * only emits verified `so_`/`eo_`/`du_` parameters.
 */
import { describe, expect, it } from 'vitest';
import { v2 as cloudinary } from 'cloudinary';
import {
  GENERATIVE_TRANSFORMS,
  NAMED_TRANSFORMS,
  STREAMING_PROFILE,
  VERIFIED_TRANSFORM_PARAMS,
  isGenerativeTransformation,
  resolveTransformation,
  videoClipTransformation,
} from './transformations.js';

cloudinary.config({ cloud_name: 'demo', api_key: 'k', api_secret: 's', secure: true });

describe('Phase 5 gate — every §1 verified param is accepted by the SDK', () => {
  it('builds a URL for each verified transformation parameter without throwing', () => {
    for (const param of VERIFIED_TRANSFORM_PARAMS) {
      const resourceType = /^(so_|eo_|du_|sp_)/.test(param) ? 'video' : 'image';
      const url = cloudinary.url('org/proj/sha', {
        resource_type: resourceType,
        transformation: [{ raw_transformation: param }],
      });
      expect(url, `param ${param} produced no URL`).toContain(param);
    }
  });

  it('builds a signed URL for each named transform without throwing', () => {
    for (const [name, str] of Object.entries(NAMED_TRANSFORMS)) {
      const url = cloudinary.url('org/proj/sha', {
        resource_type: 'image',
        type: 'upload',
        sign_url: true,
        transformation: [{ raw_transformation: str }],
      });
      expect(url, `named transform ${name}`).toContain('s--');
    }
  });
});

describe('named + generative transform strings match §5 verbatim', () => {
  it('named transforms carry f_auto + q_auto:eco', () => {
    for (const str of Object.values(NAMED_TRANSFORMS)) {
      expect(str).toContain('f_auto');
      expect(str).toContain('q_auto:eco');
    }
  });

  it('report_thumb never upscales (c_lfill, not c_fill/c_auto)', () => {
    expect(NAMED_TRANSFORMS.report_thumb).toContain('c_lfill');
    expect(NAMED_TRANSFORMS.report_thumb).not.toContain('c_auto');
  });

  it('landscape expand uses b_gen_fill with a pad crop, not e_gen_expand', () => {
    expect(GENERATIVE_TRANSFORMS.landscape_expand).toBe('ar_16:9,c_pad,b_gen_fill');
    for (const str of Object.values(GENERATIVE_TRANSFORMS)) {
      expect(str).not.toContain('e_gen_expand');
      expect(str).not.toContain('e_gen_caption');
      expect(str).not.toContain('e_diff');
    }
  });
});

describe('generative detection', () => {
  it('flags e_gen_* and b_gen_fill', () => {
    expect(isGenerativeTransformation('e_gen_remove:prompt_person')).toBe(true);
    expect(isGenerativeTransformation('ar_16:9,c_pad,b_gen_fill')).toBe(true);
    expect(isGenerativeTransformation('e_gen_background_replace')).toBe(true);
  });
  it('does not flag ordinary report transforms', () => {
    expect(isGenerativeTransformation(NAMED_TRANSFORMS.report_full)).toBe(false);
    expect(isGenerativeTransformation('c_lfill,g_auto,w_400')).toBe(false);
  });
});

describe('resolveTransformation', () => {
  it('resolves a named transform to its exact string', () => {
    expect(resolveTransformation('report_full')).toBe(NAMED_TRANSFORMS.report_full);
  });
  it('passes an arbitrary string through unchanged', () => {
    expect(resolveTransformation('c_limit,w_800')).toBe('c_limit,w_800');
  });
});

describe('video clip helper (so_/eo_/du_ only)', () => {
  it('builds a bounded clip', () => {
    expect(videoClipTransformation({ startSeconds: 0, endSeconds: 5 })).toBe('so_0,eo_5');
    expect(videoClipTransformation({ startSeconds: 2, durationSeconds: 3 })).toBe('so_2,du_3');
  });
  it('requires a bound', () => {
    expect(() => videoClipTransformation({ startSeconds: 0 })).toThrow();
  });
  it('rejects an end before the start', () => {
    expect(() => videoClipTransformation({ startSeconds: 5, endSeconds: 2 })).toThrow();
  });
  it('exposes the verified streaming profile', () => {
    expect(STREAMING_PROFILE).toBe('sp_auto');
  });
});
