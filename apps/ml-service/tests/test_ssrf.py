"""SSRF guard: only signed Cloudinary URLs with a genuine, unexpired exp are
accepted; private ranges and foreign hosts are rejected."""

from __future__ import annotations

import time

import pytest
from src.ssrf import SsrfError, validate_asset_url

_PUBLIC = ["8.8.8.8"]


def _future() -> int:
    return int(time.time()) + 3600


def _url(host: str = "res.cloudinary.com", exp: int | None = None, scheme: str = "https") -> str:
    exp = exp if exp is not None else _future()
    return f"{scheme}://{host}/testcloud/image/authenticated/a.jpg?__cld_token__=st=1~exp={exp}~hmac=deadbeef"


def test_valid_cloudinary_url_passes() -> None:
    url = _url()
    assert validate_asset_url(url, resolver=lambda h: _PUBLIC) == url


def test_non_cloudinary_host_rejected() -> None:
    with pytest.raises(SsrfError, match="host not allowed"):
        validate_asset_url(_url(host="evil.example.com"), resolver=lambda h: _PUBLIC)


def test_http_scheme_rejected() -> None:
    with pytest.raises(SsrfError, match="https"):
        validate_asset_url(_url(scheme="http"), resolver=lambda h: _PUBLIC)


def test_missing_exp_rejected() -> None:
    url = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg"
    with pytest.raises(SsrfError, match="missing a Cloudinary auth_token exp"):
        validate_asset_url(url, resolver=lambda h: _PUBLIC)


def test_expired_exp_rejected() -> None:
    with pytest.raises(SsrfError, match="expired"):
        validate_asset_url(_url(exp=int(time.time()) - 10), resolver=lambda h: _PUBLIC)


def test_private_ip_rejected() -> None:
    with pytest.raises(SsrfError, match="blocked address"):
        validate_asset_url(_url(), resolver=lambda h: ["10.0.0.5"])


def test_loopback_rejected() -> None:
    with pytest.raises(SsrfError, match="blocked address"):
        validate_asset_url(_url(), resolver=lambda h: ["127.0.0.1"])
