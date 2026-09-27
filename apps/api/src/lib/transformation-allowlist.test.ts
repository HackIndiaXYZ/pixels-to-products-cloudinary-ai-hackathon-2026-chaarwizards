import { describe, expect, it } from 'vitest';
import { rejectUnsafeTransformation, NAMED_TRANSFORMS } from './transformation-allowlist.js';

describe('transformation allowlist', () => {
  it('accepts each named transform', () => {
    for (const named of NAMED_TRANSFORMS) {
      expect(rejectUnsafeTransformation(named)).toBeNull();
    }
  });

  it('accepts a chain of safe delivery parameters', () => {
    expect(rejectUnsafeTransformation('c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco')).toBeNull();
    expect(rejectUnsafeTransformation('w_800,h_600,f_auto,q_auto,dpr_2.0')).toBeNull();
  });

  it('rejects an arbitrary / gen-AI transformation string', () => {
    expect(rejectUnsafeTransformation('e_gen_remove:prompt_car')).not.toBeNull();
    expect(rejectUnsafeTransformation('b_gen_fill')).not.toBeNull();
    expect(rejectUnsafeTransformation('l_evil_overlay')).not.toBeNull();
    expect(rejectUnsafeTransformation('c_crop')).toBe('c_crop'); // unknown crop mode
    expect(rejectUnsafeTransformation('')).toBe('');
  });

  it('does not allow a named transform smuggled inside a chain', () => {
    expect(rejectUnsafeTransformation('w_100,report_full')).toBe('report_full');
  });
});
