"""Endpoint tests: auth gating, the unsupported path, determinism, the diff
upload, and the classify / extract-signals contracts."""

from __future__ import annotations

from tests.conftest import (
    DictDownloader,
    RecordingUploader,
    auth_header,
    green_image,
    make_services,
    png_bytes,
)

BEFORE_URL = "https://res.cloudinary.com/testcloud/image/authenticated/before.jpg?__cld_token__=exp=99"
AFTER_URL = "https://res.cloudinary.com/testcloud/image/authenticated/after.jpg?__cld_token__=exp=99"


def _detect_body(sector: str = "forestry") -> dict[str, object]:
    return {
        "before_url": BEFORE_URL,
        "after_url": AFTER_URL,
        "sector": sector,
        "project_id": "proj-1",
    }


def _downloader_with_pair() -> DictDownloader:
    before = png_bytes(green_image(blobs=2))
    after = png_bytes(green_image(blobs=5))
    return DictDownloader({BEFORE_URL: before, AFTER_URL: after})


def test_health_needs_no_auth(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services())
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_detect_change_requires_auth(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services(downloader=_downloader_with_pair()))
    res = client.post("/v1/detect-change", json=_detect_body())
    assert res.status_code == 401


def test_detect_change_unsupported_sector(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services(downloader=_downloader_with_pair()))
    res = client.post("/v1/detect-change", json=_detect_body(sector="water"), headers=auth_header())
    assert res.status_code == 200
    assert res.json() == {"status": "unsupported"}


def test_detect_change_happy_path(client_factory) -> None:  # type: ignore[no-untyped-def]
    uploader = RecordingUploader()
    services = make_services(downloader=_downloader_with_pair(), uploader=uploader)
    client = client_factory(services)
    res = client.post("/v1/detect-change", json=_detect_body(), headers=auth_header())
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "v1-placeholder"
    assert body["change_type"] == "sapling_planting"
    assert body["change_metrics"]["saplings_planted"] == 3
    assert body["diff_url"] is not None
    # The diff was rendered and uploaded under the org/project/job public_id.
    assert uploader.uploads and uploader.uploads[0][0] == "org-1/proj-1/diff/job-1"


def test_detect_change_is_deterministic(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services(downloader=_downloader_with_pair()))
    r1 = client.post("/v1/detect-change", json=_detect_body(), headers=auth_header())
    client2 = client_factory(make_services(downloader=_downloader_with_pair()))
    r2 = client2.post("/v1/detect-change", json=_detect_body(), headers=auth_header())
    assert r1.json()["change_metrics"] == r2.json()["change_metrics"]
    assert r1.json()["confidence"] == r2.json()["confidence"]


def test_classify_activity(client_factory) -> None:  # type: ignore[no-untyped-def]
    url = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg?__cld_token__=exp=99"
    services = make_services(downloader=DictDownloader({url: png_bytes(green_image(blobs=4))}))
    client = client_factory(services)
    res = client.post(
        "/v1/classify-activity",
        json={"asset_url": url, "sector": "forestry"},
        headers=auth_header(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "v1-placeholder"
    assert body["indicators"]["saplings_visible"] == 4


def test_extract_signals(client_factory) -> None:  # type: ignore[no-untyped-def]
    url = "https://res.cloudinary.com/testcloud/image/authenticated/a.jpg?__cld_token__=exp=99"
    services = make_services(downloader=DictDownloader({url: png_bytes(green_image(blobs=4))}))
    client = client_factory(services)
    res = client.post(
        "/v1/extract-signals", json={"asset_url": url, "sector": "forestry"}, headers=auth_header()
    )
    assert res.status_code == 200
    body = res.json()
    assert body["model_version"] == "v1-placeholder"
    assert 0.0 <= body["vegetation_index"] <= 1.0


def test_model_info_unsupported(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services())
    res = client.get("/model-info", params={"key": "water"}, headers=auth_header())
    assert res.json() == {"status": "unsupported"}


def test_model_info_forestry(client_factory) -> None:  # type: ignore[no-untyped-def]
    client = client_factory(make_services())
    res = client.get("/model-info", params={"key": "forestry"}, headers=auth_header())
    body = res.json()
    assert body["status"] == "trained"
    assert body["version"] == "v1-placeholder"


def test_10_concurrent_detect_change_load_weights_once(client_factory) -> None:  # type: ignore[no-untyped-def]
    """Gate: 10 concurrent /detect-change calls instantiate the model once."""
    from concurrent.futures import ThreadPoolExecutor

    from tests.conftest import CountingFactory

    factory = CountingFactory()
    services = make_services(downloader=_downloader_with_pair(), factory=factory)
    client = client_factory(services)

    def call(_: int):  # type: ignore[no-untyped-def]
        return client.post("/v1/detect-change", json=_detect_body(), headers=auth_header())

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(call, range(10)))

    assert all(r.status_code == 200 for r in results)
    assert factory.calls == 1
    assert services.registry.instantiation_count == 1
