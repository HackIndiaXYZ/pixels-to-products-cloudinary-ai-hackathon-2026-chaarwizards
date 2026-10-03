"""@panchnama/ml-service — computer-vision ML service.

FastAPI service that turns verified before/after evidence into quantified,
versioned change metrics. Every number it returns originates from a model
resolved through ``model_registry`` — never from an LLM  — and
it refuses to borrow another sector's model (§3.3), returning
``{"status": "unsupported"}`` instead.
"""

ML_SERVICE_VERSION: str = "0.6.0"
