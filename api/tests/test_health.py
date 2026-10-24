from fastapi.testclient import TestClient

from app.main import API_VERSION, app

client = TestClient(app)


def test_health_returns_status_version_and_commit(monkeypatch) -> None:
    monkeypatch.setenv("SYNAPSE_COMMIT", "3fa1c2e")
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": API_VERSION,
        "commit": "3fa1c2e",
    }


def test_health_reports_unknown_commit_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("SYNAPSE_COMMIT", raising=False)
    response = client.get("/api/health")
    assert response.json()["commit"] == "unknown"
