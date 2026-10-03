-- Phase 1 — Model Registry seed
-- Source: PRD.md §ML Model Routing, ARCHITECTURE.md §3.4,
--         docs/planning/FINE_TUNING_STRATEGY.md
--
-- forestry is a TRAINED placeholder (no weights exist yet — weights_uri NULL).
-- Every other sector is 'unsupported' so the ML service returns
-- {"status":"unsupported"} rather than borrowing forestry's numbers
-- . Reference data, so it lives in a migration, not seed.sql.

INSERT INTO model_registry (key, version, sector, weights_uri, status, metrics) VALUES
  ('forestry',       'v1-placeholder', 'forestry',       NULL, 'trained',     '{}'),
  ('water',          'v0',             'water',          NULL, 'unsupported', '{}'),
  ('infrastructure', 'v0',             'infrastructure', NULL, 'unsupported', '{}'),
  ('agriculture',    'v0',             'agriculture',    NULL, 'unsupported', '{}');
