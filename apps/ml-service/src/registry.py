"""Model registry loader (Phase 6 task: "Resolve ``model`` key → ``model_registry``
row → cached weights; cache by ``(key, version)``").

Enforces the two hard rules around model provenance:

* **Status gate (§3.3).** A key whose ``model_registry.status != 'trained'``
  yields ``UNSUPPORTED`` — the caller returns ``{"status":"unsupported"}`` and
  never borrows another sector's model.
* **Load once (§4).** The weights for a ``(key, version)`` are instantiated
  exactly once, behind a lock, and cached on the registry. Concurrent requests
  share the one instance; ``instantiation_count`` lets a test prove it.

The registry reads ``model_registry`` rows through an injectable
``RegistryRowSource`` so it can run against Supabase in production and a fake in
tests, and builds a model through an injectable ``ModelFactory``.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from src.models.base import SectorModel


@dataclass(frozen=True)
class ModelRow:
    """A row of ``model_registry`` (the columns the loader needs)."""

    key: str
    version: str
    sector: str
    status: str
    weights_uri: str | None


class RegistryRowSource(Protocol):
    """Fetches a ``model_registry`` row by its unique ``key``."""

    def get(self, key: str) -> ModelRow | None: ...


# Builds a loaded model for a *trained* row. Raised failures propagate.
ModelFactory = Callable[[ModelRow], SectorModel]


class UnsupportedModel:
    """Sentinel: the requested sector has no trained model (§3.3)."""


UNSUPPORTED = UnsupportedModel()


class ModelRegistry:
    def __init__(self, source: RegistryRowSource, factory: ModelFactory) -> None:
        self._source = source
        self._factory = factory
        self._cache: dict[tuple[str, str], SectorModel] = {}
        self._lock = threading.Lock()
        # Number of times the factory actually built a model — the gate asserts
        # this stays at 1 under concurrent load.
        self.instantiation_count = 0

    def resolve(self, key: str) -> ModelRow | None:
        """Return the ``model_registry`` row for ``key`` (or ``None``)."""
        return self._source.get(key)

    def get_model(self, key: str) -> SectorModel | UnsupportedModel:
        """Resolve ``key`` to a loaded model, or ``UNSUPPORTED``.

        Never falls back to another sector (§3.3). Loads weights once per
        ``(key, version)`` behind a lock (§4).
        """
        row = self.resolve(key)
        if row is None or row.status != "trained":
            return UNSUPPORTED

        cache_key = (row.key, row.version)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        with self._lock:
            # Re-check inside the lock: a concurrent caller may have built it.
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached
            model = self._factory(row)
            self.instantiation_count += 1
            self._cache[cache_key] = model
            return model


def default_factory(weights_dir: Path) -> ModelFactory:
    """Production factory: learned weights when present, deterministic baseline
    while ``weights_uri`` is NULL (the forestry placeholder state)."""

    def build(row: ModelRow) -> SectorModel:
        if row.weights_uri:
            from src.models.forestry import YoloForestryModel

            return YoloForestryModel(row.version, weights_dir)
        from src.models.synthetic import SyntheticForestryModel

        return SyntheticForestryModel(row.version)

    return build
