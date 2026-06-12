from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api"}


def test_deep_health_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/health/deep")

    assert response.status_code == 200
    assert response.json()["service"] == "api"
    assert "database_configured" in response.json()["checks"]
