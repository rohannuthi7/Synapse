from fastapi import FastAPI

app = FastAPI(title="Synapse API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}