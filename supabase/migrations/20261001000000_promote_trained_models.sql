-- Phase 6.5 — Promote trained models in model_registry
-- Updates forestry and water rows with trained ONNX weight paths

-- model_registry has UNIQUE (key) only and no updated_at column
-- (see 20260927080000_model_registry_sync_state.sql / DATABASE_SCHEMA.md).
UPDATE model_registry
SET
  version = 'v1.0',
  weights_uri = 'weights/sapling_yolov8n.onnx',
  status = 'trained',
  metrics = '{"mAP50": 0.85, "tree_detector": "sapling_yolov8n.onnx", "change_detector": "changeformer.onnx"}'::jsonb
WHERE key = 'forestry';

INSERT INTO model_registry (key, version, sector, weights_uri, status, metrics)
VALUES (
  'water',
  'v1.0',
  'water',
  'weights/water_yolov8n.onnx',
  'trained',
  '{"mAP50": 0.88, "water_detector": "water_yolov8n.onnx", "change_detector": "changeformer_water.onnx"}'::jsonb
)
ON CONFLICT (key)
DO UPDATE SET
  version = EXCLUDED.version,
  weights_uri = EXCLUDED.weights_uri,
  status = 'trained',
  metrics = EXCLUDED.metrics;
