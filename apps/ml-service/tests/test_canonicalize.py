"""Cross-language JCS conformance: the Python canonicalizer must reproduce the
same canonical bytes and SHA-256 as the TypeScript implementation in
``packages/shared`` for every shared fixture (AGENTS.md §3.8)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from src.canonicalize import CanonicalizationError, canonicalize, sha256_canonical

_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "shared"
    / "fixtures"
    / "jcs-cross-language.json"
)


def _vectors() -> list[dict[str, object]]:
    data = json.loads(_FIXTURE.read_text())
    return list(data["vectors"])


@pytest.mark.parametrize("vector", _vectors(), ids=lambda v: str(v["name"]))
def test_canonical_matches_typescript(vector: dict[str, object]) -> None:
    assert canonicalize(vector["input"]) == vector["canonical"]  # type: ignore[arg-type]


@pytest.mark.parametrize("vector", _vectors(), ids=lambda v: str(v["name"]))
def test_sha256_matches_typescript(vector: dict[str, object]) -> None:
    assert sha256_canonical(vector["input"]) == vector["sha256"]  # type: ignore[arg-type]


def test_non_finite_rejected() -> None:
    with pytest.raises(CanonicalizationError):
        canonicalize({"x": float("nan")})
    with pytest.raises(CanonicalizationError):
        canonicalize({"x": float("inf")})


def test_negative_zero_is_zero() -> None:
    assert canonicalize({"x": -0.0}) == '{"x":0}'
