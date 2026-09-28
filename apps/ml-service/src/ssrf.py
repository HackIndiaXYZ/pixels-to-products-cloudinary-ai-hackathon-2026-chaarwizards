"""SSRF guard for asset URLs (Phase 6 task: "Accept only Cloudinary URLs
carrying a genuine ``exp``; reject private IP ranges").

The ML service only ever downloads bytes from Cloudinary delivery URLs that the
API signed. Every inbound ``before_url`` / ``after_url`` / ``asset_url`` is
validated here before a single byte is fetched:

1. The scheme must be ``https``.
2. The host must be the Cloudinary delivery host (``res.cloudinary.com``).
3. The URL must carry a genuine, unexpired ``exp`` — proof it came through the
   API's ``auth_token`` signing path, not a hand-crafted link.
4. The host must not resolve to a private / loopback / link-local IP range,
   which blocks DNS-rebinding attempts to reach internal services.

Any failure raises ``SsrfError`` with a specific reason; the caller turns that
into a 4xx and persists it (§3.6).
"""

from __future__ import annotations

import ipaddress
import socket
import time
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

# Injectable so tests need not touch DNS. Returns a list of resolved IP strings.
Resolver = Callable[[str], list[str]]


class SsrfError(ValueError):
    """Raised when a URL fails the SSRF policy."""


def _default_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    return [info[4][0] for info in infos]


def _extract_exp(query: str) -> int | None:
    """Pull the Cloudinary ``auth_token`` expiry out of the query string.

    Cloudinary encodes the token as ``__cld_token__=st=..~exp=<unix>~hmac=..``;
    some URLs also carry a bare ``exp=`` parameter. Return the first ``exp`` we
    can parse as an integer, else ``None``.
    """
    params = parse_qs(query)
    token = params.get("__cld_token__", [None])[0]
    if token:
        for part in token.split("~"):
            if part.startswith("exp="):
                try:
                    return int(part[len("exp=") :])
                except ValueError:
                    return None
    if "exp" in params:
        try:
            return int(params["exp"][0])
        except (ValueError, IndexError):
            return None
    return None


def validate_asset_url(
    url: str,
    *,
    cloudinary_host: str = "res.cloudinary.com",
    resolver: Resolver = _default_resolver,
    now: Callable[[], float] = time.time,
) -> str:
    """Validate ``url`` against the SSRF policy, returning it unchanged if safe.

    Raises:
        SsrfError: naming the specific rule that failed.
    """
    parsed = urlparse(url)

    if parsed.scheme != "https":
        raise SsrfError(f"scheme must be https, got {parsed.scheme!r}")

    host = parsed.hostname
    if host is None:
        raise SsrfError("url has no host")
    if host.lower() != cloudinary_host:
        raise SsrfError(f"host not allowed: {host!r} (only {cloudinary_host})")

    exp = _extract_exp(parsed.query)
    if exp is None:
        raise SsrfError("url is missing a Cloudinary auth_token exp")
    if exp <= int(now()):
        raise SsrfError("url auth_token has expired")

    # Even with a fixed host allowlist, resolve and reject private ranges to
    # defeat DNS rebinding to an internal address.
    try:
        addresses = resolver(host)
    except OSError as exc:
        raise SsrfError(f"could not resolve host {host!r}: {exc}") from exc
    if not addresses:
        raise SsrfError(f"host {host!r} resolved to no addresses")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise SsrfError(f"host {host!r} resolves to a blocked address {address}")

    return url
