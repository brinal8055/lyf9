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
    assert response.json()["checks"]["ai_provider"] == "mock"


def test_deep_health_uses_selected_ai_provider(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL_EXTRACTION", "gemini-2.5-flash")
    monkeypatch.setenv("GEMINI_MODEL_EXPLANATION", "gemini-2.5-flash")

    response = TestClient(app).get("/health/deep")

    assert response.json()["checks"]["ai_provider"] == "gemini"
    assert response.json()["checks"]["ai_configured"] is True
