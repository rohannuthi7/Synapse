from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_allows_vite_dev_origin() -> None:
    origin = "http://localhost:5173"
    response = client.get("/api/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin
