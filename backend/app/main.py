import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import ingest, reports, admin, disputes, auth_router

app = FastAPI(title="Credit Reporting Mechanism API (CRMS)")

# Explicit origins from environment (strictly non-wildcard)
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [orig.strip() for orig in ALLOWED_ORIGINS_RAW.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(auth_router.router)
app.include_router(ingest.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(disputes.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
