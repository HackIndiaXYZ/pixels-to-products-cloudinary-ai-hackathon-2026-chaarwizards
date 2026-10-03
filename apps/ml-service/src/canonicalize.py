"""RFC 8785 — JSON Canonicalization Scheme (JCS), Python port.

Byte-identical to the TypeScript canonicalizer in ``packages/shared`` so the
same logical value hashes to the same digest in both languages .
The shared conformance vectors live in
``packages/shared/fixtures/jcs-cross-language.json`` and are asserted against by
both implementations.

Conformance notes:
- Object member names are ordered by their UTF-16 code units (RFC 8785 §3.2.3).
  JavaScript's ``Array.prototype.sort`` compares by UTF-16 code unit, so we
  reproduce that ordering here by sorting on the UTF-16 big-endian encoding
  rather than on Python's default (Unicode code point) ordering, which differs
  for astral-plane characters.
- Numbers are serialized with the ECMAScript ``Number::toString`` algorithm
  (RFC 8785 §3.2.2.2), reimplemented from the shortest round-trip digit string.
  ``json`` in CPython yields the shortest round-trip ``repr`` for floats, which
  is the same digit string ECMAScript uses; only the placement of the decimal
  point / exponent differs, and that is what ``_es_number`` fixes.
- Strings reuse ``json.dumps(..., ensure_ascii=False)``, whose escaping matches
  RFC 8785 §3.2.2.1 (minimal escaping, lowercase ``\\uXXXX`` for control
  characters, no escaping of the forward slash).
- Non-finite numbers are rejected: JSON cannot represent them and silently
  coercing to ``null`` would corrupt a signed payload.
"""

from __future__ import annotations

import hashlib
import json
from typing import Union

JsonValue = Union[  # noqa: UP007 - recursive alias with forward refs reads clearest as Union
    None, bool, int, float, str, list["JsonValue"], dict[str, "JsonValue"]
]


class CanonicalizationError(ValueError):
    """Raised when a value cannot be represented as canonical JSON."""


def _es_number(value: float) -> str:
    """Serialize a float using the ECMAScript ``Number::toString`` algorithm.

    Mirrors ``String(n)`` in V8, which RFC 8785 §3.2.2.2 mandates. Given a
    finite non-zero number we recover the shortest decimal digit string ``s``
    (length ``k``) and an exponent ``n`` such that ``value == s x 10^(n-k)`` and
    ``10^(k-1) <= s < 10^k``, then apply the ECMAScript formatting rules for
    where the decimal point / exponent go.
    """
    if value != value or value in (float("inf"), float("-inf")):  # NaN / +-Inf
        raise CanonicalizationError(f"cannot canonicalize non-finite number: {value!r}")

    # String(-0) === '0' in ECMAScript; and 0.0 must render as '0', not '0.0'.
    if value == 0.0:
        return "0"

    sign = "-" if value < 0.0 else ""
    r = repr(abs(value))  # shortest round-trip decimal

    # Parse ``r`` into a digit string and a base-10 exponent so that
    # value == int(digits) * 10**point_exp.
    if "e" in r or "E" in r:
        mantissa, exp_part = r.lower().split("e")
        exp = int(exp_part)
    else:
        mantissa, exp = r, 0

    if "." in mantissa:
        int_part, frac_part = mantissa.split(".")
    else:
        int_part, frac_part = mantissa, ""

    digits = int_part + frac_part
    point_exp = exp - len(frac_part)

    # Strip leading zeros (they do not change the integer value of ``digits``).
    digits = digits.lstrip("0") or "0"
    # Strip trailing zeros, compensating the exponent so the value is unchanged.
    while len(digits) > 1 and digits.endswith("0"):
        digits = digits[:-1]
        point_exp += 1

    s = digits
    k = len(s)
    n = point_exp + k  # value == s x 10^(n-k)

    if k <= n <= 21:
        # Integer with trailing zeros, e.g. 100.
        return sign + s + "0" * (n - k)
    if 0 < n <= 21:
        # Decimal point inside the digits, e.g. 1.5.
        return sign + s[:n] + "." + s[n:]
    if -6 < n <= 0:
        # Small magnitude, e.g. 0.002.
        return sign + "0." + "0" * (-n) + s
    # Exponential notation, e.g. 1e+30 / 1.23e-27.
    exponent = n - 1
    exp_sign = "+" if exponent >= 0 else "-"
    exp_str = f"e{exp_sign}{abs(exponent)}"
    if k == 1:
        return sign + s + exp_str
    return sign + s[0] + "." + s[1:] + exp_str


def _serialize(value: JsonValue) -> str:
    if value is None:
        return "null"
    # ``bool`` is a subclass of ``int`` in Python — check it first.
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _es_number(value)
    if isinstance(value, str):
        # json's escaping is RFC 8785-conformant for the string body.
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_serialize(item) for item in value) + "]"
    if isinstance(value, dict):
        # UTF-16 code-unit ordering of member names (RFC 8785 §3.2.3).
        keys = sorted(value.keys(), key=lambda key: key.encode("utf-16-be"))
        members = [
            f"{json.dumps(key, ensure_ascii=False)}:{_serialize(value[key])}" for key in keys
        ]
        return "{" + ",".join(members) + "}"
    raise CanonicalizationError(f"cannot canonicalize type: {type(value).__name__}")


def canonicalize(value: JsonValue) -> str:
    """Serialize a JSON value to its RFC 8785 canonical form.

    Raises:
        CanonicalizationError: if the value contains a non-finite number or a
            non-JSON type.
    """
    return _serialize(value)


def sha256_canonical(value: JsonValue) -> str:
    """Return the lowercase hex SHA-256 of the canonical JSON of ``value``."""
    return hashlib.sha256(canonicalize(value).encode("utf-8")).hexdigest()
