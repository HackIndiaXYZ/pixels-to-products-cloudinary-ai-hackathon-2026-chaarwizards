-- Phase 6.5 — Promote trained models in model_registry
-- Updates forestry and water rows with trained ONNX weight paths

UPDATE model_registry
SET
  version = 'v1.0',
  weights_uri = 'weights/sapling_yolov8n.onnx',
  status = 'trained',
  metrics = '{"mAP50": 0.85, "tree_detector": "sapling_yolov8n.onnx", "change_detector": "changeformer.onnx"}'::jsonb,
  updated_at = now()
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
ON CONFLICT (key, version)
DO UPDATE SET
  weights_uri = EXCLUDED.weights_uri,
  status = 'trained',
  metrics = EXCLUDED.metrics,
  updated_at = now();
