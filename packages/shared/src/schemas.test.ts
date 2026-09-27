import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AssetSchema,
  ChangeEventSchema,
  ObservationTypeConfigSchema,
  OrgSchema,
  ProjectConfigSchema,
  ProjectSchema,
} from './schemas.js';

const validOrg = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Forest Trust',
  type: 'ngo',
  quota_bytes: 53687091200,
  bytes_used: 0,
  retention_years: 7,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('OrgSchema failure paths', () => {
  it('accepts a well-formed org and applies the settings default', () => {
    const org = OrgSchema.parse(validOrg);
    expect(org.settings).toEqual({});
  });

  it('throws on a wrong-typed field', () => {
    expect(() => OrgSchema.parse({ ...validOrg, quota_bytes: 'lots' })).toThrow(z.ZodError);
  });

  it('throws on a missing required field', () => {
    const { name: _name, ...rest } = validOrg;
    expect(() => OrgSchema.parse(rest)).toThrow(z.ZodError);
  });

  it('throws on an out-of-enum org type', () => {
    expect(() => OrgSchema.parse({ ...validOrg, type: 'corporation' })).toThrow(z.ZodError);
  });

  it('strips an unknown key', () => {
    const org = OrgSchema.parse({ ...validOrg, hacked: true }) as Record<string, unknown>;
    expect(org).not.toHaveProperty('hacked');
  });
});

describe('ObservationTypeConfigSchema — Phase 1 config invariant', () => {
  const valid = { type: 'planting', model: 'forestry', gps_radius: 10 };

  it('accepts an entry with type, model, and gps_radius', () => {
    expect(ObservationTypeConfigSchema.parse(valid).model).toBe('forestry');
  });

  it('rejects an entry missing model', () => {
    const { model: _model, ...rest } = valid;
    expect(() => ObservationTypeConfigSchema.parse(rest)).toThrow(z.ZodError);
  });

  it('rejects an entry missing gps_radius', () => {
    const { gps_radius: _r, ...rest } = valid;
    expect(() => ObservationTypeConfigSchema.parse(rest)).toThrow(z.ZodError);
  });

  it('rejects a non-positive gps_radius', () => {
    expect(() => ObservationTypeConfigSchema.parse({ ...valid, gps_radius: 0 })).toThrow(
      z.ZodError,
    );
  });
});

describe('ProjectConfigSchema', () => {
  it('defaults observation_types to an empty array', () => {
    expect(ProjectConfigSchema.parse({}).observation_types).toEqual([]);
  });

  it('rejects a config whose observation type is malformed', () => {
    expect(() =>
      ProjectConfigSchema.parse({ observation_types: [{ type: 'x' }] }),
    ).toThrow(z.ZodError);
  });
});

describe('ProjectSchema', () => {
  it('parses a project and defaults config', () => {
    const project = ProjectSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      org_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Restoration',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(project.config.observation_types).toEqual([]);
  });
});

describe('AssetSchema', () => {
  const validAsset = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    project_id: '550e8400-e29b-41d4-a716-446655440001',
    org_id: '550e8400-e29b-41d4-a716-446655440002',
    cloudinary_public_id: 'org/project/abc',
    device_capture_timestamp: '2026-01-01T00:00:00.000Z',
    device_commit_hash: 'a'.repeat(64),
    device_id: 'device-1',
    device_public_key: 'pk',
    capture_signature: 'sig',
    exif_hash: 'b'.repeat(64),
    sha256_hash: 'c'.repeat(64),
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('defaults upload_status to pending', () => {
    expect(AssetSchema.parse(validAsset).upload_status).toBe('pending');
  });

  it('rejects an out-of-enum phase', () => {
    expect(() => AssetSchema.parse({ ...validAsset, phase: 'midway' })).toThrow(z.ZodError);
  });
});

describe('ChangeEventSchema — metric provenance (§3.2)', () => {
  const validEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    change_metrics: { saplings: 49 },
    model_version: 'forestry@1.0.0',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('accepts an event carrying a model_version', () => {
    expect(ChangeEventSchema.parse(validEvent).model_version).toBe('forestry@1.0.0');
  });

  it('rejects an event with no model_version (metric without provenance)', () => {
    const { model_version: _mv, ...rest } = validEvent;
    expect(() => ChangeEventSchema.parse(rest)).toThrow(z.ZodError);
  });
});
