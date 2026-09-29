import { describe, expect, it } from 'vitest';
import { buildSearchQuery } from './api';
import type { SearchFilters } from './types';

/**
 * Every facet is asserted individually (BUILD_ORDER Phase 8 gate): a single
 * happy-path search proves nothing when seven filters can each be silently
 * dropped or leak into one another. Each case sets exactly one facet and
 * asserts (a) it maps to the right query param and (b) no other facet appears.
 */
describe('buildSearchQuery — per-facet mapping', () => {
  it('maps q, trimming whitespace, and sends nothing else', () => {
    const q = buildSearchQuery({ q: '  planting  ' });
    expect(q).toEqual({ q: 'planting' });
  });

  it('omits q entirely when blank (no empty-string filter)', () => {
    expect(buildSearchQuery({ q: '   ' })).toEqual({});
  });

  it('maps bbox to a comma-joined string', () => {
    const q = buildSearchQuery({ bbox: [72.8, 19.1, 72.9, 19.2] });
    expect(q).toEqual({ bbox: '72.8,19.1,72.9,19.2' });
  });

  it('maps the date range to date_from / date_to', () => {
    expect(buildSearchQuery({ dateFrom: '2024-01-01' })).toEqual({ date_from: '2024-01-01' });
    expect(buildSearchQuery({ dateTo: '2024-01-31' })).toEqual({ date_to: '2024-01-31' });
  });

  it('maps tags to a comma-joined list and omits an empty array', () => {
    expect(buildSearchQuery({ tags: ['tree', 'sapling'] })).toEqual({ tags: 'tree,sapling' });
    expect(buildSearchQuery({ tags: [] })).toEqual({});
  });

  it('maps gps_accuracy_max, including 0', () => {
    expect(buildSearchQuery({ gpsAccuracyMax: 10 })).toEqual({ gps_accuracy_max: 10 });
    expect(buildSearchQuery({ gpsAccuracyMax: 0 })).toEqual({ gps_accuracy_max: 0 });
  });

  it('maps asset_type', () => {
    expect(buildSearchQuery({ assetType: 'video' })).toEqual({ asset_type: 'video' });
  });

  it('maps phase', () => {
    expect(buildSearchQuery({ phase: 'before' })).toEqual({ phase: 'before' });
  });

  it('composes all seven facets without one overwriting another', () => {
    const filters: SearchFilters = {
      q: 'planting',
      bbox: [72.8, 19.1, 72.9, 19.2],
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
      tags: ['tree'],
      gpsAccuracyMax: 5,
      assetType: 'image',
      phase: 'after',
    };
    expect(buildSearchQuery(filters)).toEqual({
      q: 'planting',
      bbox: '72.8,19.1,72.9,19.2',
      date_from: '2024-01-01',
      date_to: '2024-01-31',
      tags: 'tree',
      gps_accuracy_max: 5,
      asset_type: 'image',
      phase: 'after',
    });
  });

  it('never emits an org_id — org scope is the JWT, not a query param (§3.4)', () => {
    const q = buildSearchQuery({ q: 'x', phase: 'before', tags: ['a'] });
    expect(Object.keys(q)).not.toContain('org_id');
    expect(Object.keys(q)).not.toContain('user_id');
  });
});
