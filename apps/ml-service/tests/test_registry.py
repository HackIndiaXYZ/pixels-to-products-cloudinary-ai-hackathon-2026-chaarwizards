"""Registry loader: unsupported sectors return the sentinel (never forestry
output), and weights load exactly once under concurrent load (§3.3, §4)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from src.registry import UNSUPPORTED, UnsupportedModel
from tests.conftest import CountingFactory, make_registry


def test_water_is_unsupported() -> None:
    registry = make_registry()
    assert registry.get_model("water") is UNSUPPORTED


def test_unknown_key_is_unsupported() -> None:
    registry = make_registry()
    assert isinstance(registry.get_model("does-not-exist"), UnsupportedModel)


def test_forestry_is_trained() -> None:
    registry = make_registry()
    model = registry.get_model("forestry")
    assert not isinstance(model, UnsupportedModel)
    assert model.version == "v1-placeholder"


def test_forestry_never_falls_back_to_another_sector() -> None:
    registry = make_registry()
    # A trained forestry request yields forestry; an unsupported one yields the
    # sentinel — the two never share a model instance.
    forestry = registry.get_model("forestry")
    assert registry.get_model("water") is UNSUPPORTED
    assert forestry is not UNSUPPORTED


def test_concurrent_calls_load_weights_once() -> None:
    factory = CountingFactory()
    registry = make_registry(factory)

    with ThreadPoolExecutor(max_workers=10) as pool:
        models = list(pool.map(lambda _: registry.get_model("forestry"), range(10)))

    assert factory.calls == 1
    assert registry.instantiation_count == 1
    # All ten callers share the one cached instance.
    assert all(m is models[0] for m in models)
