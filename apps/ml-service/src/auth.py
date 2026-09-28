"""Internal JWT verification (api-contracts.md §3, AGENTS.md §3.4).

The Node API mints a short-TTL HS256 token per call carrying ``sub``, ``org_id``
and ``job_id``; this service verifies it on every request and never accepts a
bare shared secret. A missing, malformed, or expired token is rejected 401 with
a persisted reason — the failure is never swallowed (§3.6).
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from src.config import Settings, get_settings

_ALGORITHM = "HS256"


@dataclass(frozen=True)
class InternalClaims:
    """The verified identity of an internal caller."""

    sub: str
    org_id: str
    job_id: str


def verify_internal_token(token: str, secret: str) -> InternalClaims:
    """Verify an internal HS256 token and return its claims.

    Raises:
        HTTPException: 401 if the token is missing a required claim, is signed
            with the wrong key, or has expired.
    """
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[_ALGORITHM],
            # exp is validated by python-jose; require it to be present so an
            # unbounded token can never be accepted.
            options={"require_exp": True, "verify_exp": True},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid internal token: {exc}",
        ) from exc

    missing = [claim for claim in ("sub", "org_id", "job_id") if not payload.get(claim)]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"internal token missing claims: {','.join(missing)}",
        )
    return InternalClaims(
        sub=str(payload["sub"]),
        org_id=str(payload["org_id"]),
        job_id=str(payload["job_id"]),
    )


async def require_internal_auth(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> InternalClaims:
    """FastAPI dependency: extract and verify the bearer token, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()
    return verify_internal_token(token, settings.internal_jwt_secret)
