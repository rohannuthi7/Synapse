from fastapi import FastAPI

from app.routers import inferences

app = FastAPI(title="Synapse API")
app.include_router(inferences.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}