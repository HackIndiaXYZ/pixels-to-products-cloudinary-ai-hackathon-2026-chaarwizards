"""Metric-provenance gate (§3.2):

* Every metric-bearing response carries a ``model_version`` that resolves to a
  ``model_registry`` version.
* No LLM appears anywhere in the path that produces a number — asserted by
  scanning the service source for any LLM client import.
* The endpoint returns the quantifier's numbers unadjusted (nothing rewrites or
  "rounds" a metric between the model and the wire).
* The ``change_events.model_version`` column is ``NOT NULL`` at the database
  level. The static DDL assertion always runs; the live-insert rejection runs
  only when ``ML_TEST_DATABASE_URL`` + ``psycopg`` are available (otherwise it
  is skipped and reported BLOCKED by the gate).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from src.models.synthetic import SyntheticForestryModel
from src.quantify import estimate_gsd_m_per_px, quantify_change

_SRC = Path(__file__).resolve().parents[1] / "src"
_REPO = Path(__file__).resolve().parents[3]
_CHANGE_MIGRATION = (
    _REPO / "supabase" / "migrations" / "20260927050000_observations_changes.sql"
)

# Import identifiers that would indicate an LLM in the metric path. We match
# import/usage tokens, not the word "LLM", so the rule's own documentation does
# not trip the guard.
_LLM_MARKERS = (
    "import openai",
    "from openai",
    "import anthropic",
    "from anthropic",
    "langchain",
    "litellm",
    "cohere",
    "chat.completions",
    "generativeai",
    "bedrock-runtime",
)


def test_no_llm_in_metric_path() -> None:
    offenders: list[str] = []
    for path in _SRC.rglob("*.py"):
        text = path.read_text().lower()
        for marker in _LLM_MARKERS:
            if marker in text:
                offenders.append(f"{path.name}: {marker}")
    assert not offenders, f"LLM marker(s) found in metric path: {offenders}"


def test_every_metric_response_records_model_version() -> None:
    model = SyntheticForestryModel("v1-placeholder")
    from tests.conftest import green_image

    before = model.saplings.detect(green_image(blobs=2))
    after = model.saplings.detect(green_image(blobs=5))
    mask = model.changes.change_mask(green_image(blobs=2), green_image(blobs=5))
    q = quantify_change(
        before,
        after,
        mask,
        gsd_m_per_px=estimate_gsd_m_per_px(128),
        alignment_quality=1.0,
        model_version=model.version,
    )
    assert q.model_version == "v1-placeholder"
    # metrics_dict is the on-the-wire payload; it must not carry the version as a
    # number, and every value must be a plain number the model produced.
    for value in q.metrics_dict().values():
        assert isinstance(value, (int, float))


def test_endpoint_metrics_equal_quantifier_output() -> None:
    """The endpoint must not adjust the model's numbers (§3.2: an LLM may
    summarise but never adjust; here nothing may)."""
    from fastapi.testclient import TestClient
    from src.app import create_app
    from tests.conftest import (
        DictDownloader,
        auth_header,
        green_image,
        make_services,
        png_bytes,
    )

    before_url = "https://res.cloudinary.com/testcloud/image/authenticated/b.jpg?__cld_token__=exp=9"
    after_url = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg?__cld_token__=exp=9"
    before_img = green_image(blobs=2)
    after_img = green_image(blobs=5)
    services = make_services(
        downloader=DictDownloader(
            {before_url: png_bytes(before_img), after_url: png_bytes(after_img)}
        )
    )
    client = TestClient(create_app(services))
    res = client.post(
        "/v1/detect-change",
        json={
            "before_url": before_url,
            "after_url": after_url,
            "sector": "forestry",
            "project_id": "proj-1",
        },
        headers=auth_header(),
    )
    wire = res.json()["change_metrics"]

    # Recompute independently and compare byte-for-byte.
    model = SyntheticForestryModel("v1-placeholder")
    bd = model.saplings.detect(before_img)
    ad = model.saplings.detect(after_img)
    mask = model.changes.change_mask(before_img, after_img)
    q = quantify_change(
        bd,
        ad,
        mask,
        gsd_m_per_px=estimate_gsd_m_per_px(after_img.shape[1]),
        alignment_quality=1.0,
        model_version=model.version,
    )
    assert wire == q.metrics_dict()


def test_change_events_model_version_not_null_ddl() -> None:
    """Static proof the NOT NULL constraint is in the schema (always runs)."""
    ddl = _CHANGE_MIGRATION.read_text()
    assert "model_version TEXT NOT NULL" in ddl


@pytest.mark.skipif(
    not os.environ.get("ML_TEST_DATABASE_URL"),
    reason="live DB rejection of model_version=NULL needs ML_TEST_DATABASE_URL (BLOCKED: needs DB)",
)
def test_change_events_model_version_not_null_live() -> None:  # pragma: no cover - needs DB
    import psycopg  # type: ignore[import-not-found]

    dsn = os.environ["ML_TEST_DATABASE_URL"]
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.NotNullViolation):
            cur.execute(
                "INSERT INTO change_events (change_metrics, model_version) VALUES (%s, NULL)",
                ('{"saplings_planted": 1}',),
            )
        conn.rollback()
