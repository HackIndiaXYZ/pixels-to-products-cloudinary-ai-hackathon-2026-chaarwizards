from src import ML_SERVICE_VERSION
from src.config import service_banner


def test_version_constant() -> None:
    assert ML_SERVICE_VERSION == "0.0.0"


def test_banner_reports_version() -> None:
    assert service_banner() == "impact-ml-service 0.0.0"
