"""Internal JWT verification (§3.4): a missing, expired, or wrong-key token is
rejected 401; a valid token yields the caller's claims."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from src.auth import verify_internal_token
from tests.conftest import TEST_SECRET, mint_token


def test_valid_token_returns_claims() -> None:
    token = mint_token(sub="u", org_id="o", job_id="j")
    claims = verify_internal_token(token, TEST_SECRET)
    assert (claims.sub, claims.org_id, claims.job_id) == ("u", "o", "j")


def test_expired_token_rejected() -> None:
    token = mint_token(ttl_seconds=-1)
    with pytest.raises(HTTPException) as exc:
        verify_internal_token(token, TEST_SECRET)
    assert exc.value.status_code == 401


def test_wrong_secret_rejected() -> None:
    token = mint_token(secret="not-the-secret")
    with pytest.raises(HTTPException) as exc:
        verify_internal_token(token, TEST_SECRET)
    assert exc.value.status_code == 401


def test_missing_claim_rejected() -> None:
    # Mint a token without job_id by signing a bare payload.
    import time

    from jose import jwt

    now = int(time.time())
    token = jwt.encode(
        {"sub": "u", "org_id": "o", "exp": now + 60}, TEST_SECRET, algorithm="HS256"
    )
    with pytest.raises(HTTPException) as exc:
        verify_internal_token(token, TEST_SECRET)
    assert exc.value.status_code == 401


def test_token_without_exp_rejected() -> None:
    from jose import jwt

    token = jwt.encode({"sub": "u", "org_id": "o", "job_id": "j"}, TEST_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        verify_internal_token(token, TEST_SECRET)
    assert exc.value.status_code == 401
