from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import ingest, reports, admin, disputes

app = FastAPI(title="Credit Reporting Mechanism API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(ingest.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(disputes.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
