import { describe, expect, it } from 'vitest';
import { isQuarantined, selectQuarantined, selectReportSelectable } from './selectors';
import type { AssetSearchResultRow } from '../search/types';

function row(id: string, status: AssetSearchResultRow['upload_status']): AssetSearchResultRow {
  return {
    id,
    project_id: 'p1',
    cloudinary_public_id: `org/p1/${id}`,
    asset_type: 'image',
    device_capture_timestamp: '2024-01-15T09:30:00Z',
    gps_point: null,
    gps_accuracy_meters: null,
    gps_provider: null,
    caption: null,
    ai_tags: [],
    observation_type: null,
    phase: null,
    upload_status: status,
  };
}

/**
 * BUILD_ORDER Phase 8 gate — a quarantined asset is visible in the admin queue
 * AND absent from report selection.
 */
describe('quarantine selectors', () => {
  const assets = [row('a', 'verified'), row('b', 'flagged'), row('c', 'pending')];

  it('isQuarantined is true only for flagged', () => {
    expect(isQuarantined(row('x', 'flagged'))).toBe(true);
    expect(isQuarantined(row('x', 'verified'))).toBe(false);
  });

  it('the queue surfaces the flagged asset', () => {
    expect(selectQuarantined(assets).map((a) => a.id)).toEqual(['b']);
  });

  it('report selection excludes the flagged asset (§3.1)', () => {
    const ids = selectReportSelectable(assets).map((a) => a.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
  });
});
