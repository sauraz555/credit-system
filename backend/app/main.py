import os
import logging
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import engine
from app.routers import ingest, reports, admin, disputes, auth_router

# Initialize Sentry if configured (optional)
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.2")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.2")),
            environment=os.getenv("ENVIRONMENT", "production"),
        )
        logging.getLogger("uvicorn").info("Sentry APM integration initialized.")
    except Exception as e:
        logging.getLogger("uvicorn").warning(f"Failed to initialize Sentry: {e}")

app = FastAPI(
    title="Credit Reporting Mechanism API (CRMS)",
    version="1.0.0",
    description="Enterprise Credit Scoring & Bitemporal Reporting Platform per Privacy Act 1988 Part IIIA and Privacy (Credit Reporting) Code 2014"
)

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
    # Production migration governance: create_all() is strictly disabled in favor of Alembic
    logger = logging.getLogger("uvicorn")
    logger.info("CRMS Backend initialized without create_all(). Schema managed via Alembic baseline migrations.")

app.include_router(auth_router.router)
app.include_router(ingest.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(disputes.router)

@app.get("/health")
def health_check(response: Response):
    """
    Production health check verifying database and Redis cache connectivity.
    """
    db_status = "disconnected"
    redis_status = "unavailable"

    # 1. Database connectivity check
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    # 2. Redis cache connectivity check
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(redis_url, socket_timeout=1, socket_connect_timeout=1)
        if r.ping():
            redis_status = "connected"
    except Exception:
        redis_status = "unavailable"

    overall_status = "healthy" if db_status == "connected" else "unhealthy"
    if overall_status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": overall_status,
        "database": db_status,
        "redis": redis_status,
        "version": "1.0.0"
    }

@app.get("/metrics")
def metrics():
    """
    Prometheus telemetry endpoint exposing operational metrics.
    """
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
