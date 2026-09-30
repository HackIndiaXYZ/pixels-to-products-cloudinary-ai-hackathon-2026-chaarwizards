"""MVP exit criterion 6 (MVP_EXIT_CRITERIA.md #6):

"A single project with 3 observation types routes to the correct ML models" —
each ``observation_type`` resolves to its OWN ``model_registry`` key and hits the
right model, and (the mandatory negative half) an unregistered type returns
``{"status": "unsupported"}`` and NEVER falls back to another sector's model
(§3.3, §3.2).

The ML service selects a model by the request ``sector`` field, which is the
``model`` key a project pins on each ``observation_type`` (ProjectConfigSchema:
``{type, model, gps_radius}``). This test drives three observation types through
their pinned keys against the real registry seed (mirrored by ``FakeRowSource``):
forestry is trained; water and infrastructure are registered but ``unsupported``.
That is the honest state of the registry — only forestry has a trained model
(PRD §ML Model Routing), so "routes correctly" means each type reaches its OWN
row and a not-yet-trained sector returns ``unsupported`` rather than borrowing
forestry's numbers. Fabricating trained water/infrastructure models to make the
test greener would be exactly the §3.3 violation this criterion guards against.
"""

from __future__ import annotations

from src.registry import UNSUPPORTED, UnsupportedModel
from tests.conftest import (
    DictDownloader,
    RecordingUploader,
    auth_header,
    green_image,
    make_registry,
    make_services,
    png_bytes,
)

# A project with three observation types, each pinning its own registry key.
OBSERVATION_TYPE_TO_MODEL = {
    "tree_planting": "forestry",
    "river_cleanup": "water",
    "road_building": "infrastructure",
}
UNREGISTERED_TYPE_MODEL = "glacier_survey_no_such_sector"


def test_each_observation_type_resolves_to_its_own_registry_key() -> None:
    registry = make_registry()
    for _obs_type, key in OBSERVATION_TYPE_TO_MODEL.items():
        row = registry.resolve(key)
        assert row is not None, f"{key} must be a registered model_registry row"
        # Routes to its OWN sector — never re-pointed at another sector.
        assert row.sector == key


def test_trained_type_gets_its_model_untrained_types_get_unsupported_not_fallback() -> None:
    registry = make_registry()

    # forestry is trained → its own model, tagged with its own version.
    forestry = registry.get_model("forestry")
    assert not isinstance(forestry, UnsupportedModel)
    assert forestry.version == "v1-placeholder"

    # water and infrastructure are registered but not trained → UNSUPPORTED.
    # Crucially they do NOT resolve to the forestry model (no cross-sector fallback).
    for key in ("water", "infrastructure"):
        model = registry.get_model(key)
        assert model is UNSUPPORTED, f"{key} must be unsupported, never a fallback"
        assert model is not forestry


def test_unregistered_observation_type_is_unsupported_never_a_fallback() -> None:
    registry = make_registry()
    model = registry.get_model(UNREGISTERED_TYPE_MODEL)
    assert isinstance(model, UnsupportedModel)
    # It must be the shared sentinel, not some other sector's model.
    assert model is UNSUPPORTED


def _detect_body(model_key: str) -> dict[str, object]:
    before = "https://res.cloudinary.com/testcloud/image/authenticated/b.jpg?__cld_token__=exp=9"
    after = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg?__cld_token__=exp=9"
    return {
        "before_url": before,
        "after_url": after,
        "sector": model_key,
        "project_id": "proj-multi-obs",
    }


def _pair_downloader() -> DictDownloader:
    before = "https://res.cloudinary.com/testcloud/image/authenticated/b.jpg?__cld_token__=exp=9"
    after = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg?__cld_token__=exp=9"
    return DictDownloader(
        {
            before: png_bytes(green_image(blobs=2)),
            after: png_bytes(green_image(blobs=5)),
        }
    )


def test_endpoint_routes_trained_type_to_metrics(client_factory) -> None:  # type: ignore[no-untyped-def]
    services = make_services(downloader=_pair_downloader(), uploader=RecordingUploader())
    client = client_factory(services)
    res = client.post("/v1/detect-change", json=_detect_body("forestry"), headers=auth_header())
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "v1-placeholder"
    assert body["change_metrics"]  # non-empty metrics from forestry's own model


def test_endpoint_routes_untrained_types_to_unsupported(client_factory) -> None:  # type: ignore[no-untyped-def]
    for key in ("water", "infrastructure"):
        services = make_services(downloader=_pair_downloader())
        client = client_factory(services)
        res = client.post("/v1/detect-change", json=_detect_body(key), headers=auth_header())
        assert res.status_code == 200
        assert res.json() == {"status": "unsupported"}, f"{key} must not borrow another model"


def test_negative_unregistered_type_returns_unsupported_with_no_metrics(client_factory) -> None:  # type: ignore[no-untyped-def]
    """The mandatory negative case: an unregistered observation_type must return
    unsupported and carry NO metrics or model_version — proving there is no
    cross-sector fallback (§3.3). This assertion fails the moment a fallback is
    introduced."""
    services = make_services(downloader=_pair_downloader())
    client = client_factory(services)
    res = client.post(
        "/v1/detect-change", json=_detect_body(UNREGISTERED_TYPE_MODEL), headers=auth_header()
    )
    assert res.status_code == 200
    body = res.json()
    assert body == {"status": "unsupported"}
    # Explicitly: no forestry number leaked into the unsupported response.
    assert "change_metrics" not in body
    assert "model_version" not in body
