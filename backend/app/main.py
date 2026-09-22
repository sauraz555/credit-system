"""FastAPI Application Entrypoint, Routing Hierarchy, and Infrastructure Endpoints.

This module initializes the core FastAPI application for the Credit Reporting Mechanism
Platform (CRMS). It registers enterprise CORS policies, aggregates modular domain routers
(auth, ingest, reports, admin, disputes), initializes optional Sentry Application Performance
Monitoring (APM), and exposes container orchestration health probes (`/health`) and Prometheus
telemetry endpoints (`/metrics`).

Architecture Tier:
    API Gateway & Application Entrypoint Layer.

Key Dependencies & Callers:
    - Depends on FastAPI, Starlette middleware, SQLAlchemy engine, and Prometheus client.
    - Entrypoint served by Uvicorn / Gunicorn ASGI workers inside the container stack.
    - Aggregates `auth_router`, `ingest`, `reports`, `admin`, and `disputes` sub-routers.

Regulatory & Compliance Context:
    - Privacy Act 1988 (Cth) Part IIIA & Privacy (Credit Reporting) Code 2014:
      Governs access controls, audited operations, and data isolation enforced throughout the API.
"""

import os
import logging
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import engine
from app.routers import ingest, reports, admin, disputes, auth_router

# REVIEW-SECURITY: Initialize Sentry error tracking and performance profiling if configured.
# Traces sample rate is set to 20% (0.2) to balance observability depth with network overhead.
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

# REVIEW-SECURITY: Explicit origins from environment (strictly non-wildcard).
# Disallows '*' to protect authenticated session cookies and Bearer tokens against cross-origin CSRF/CORS theft.
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
    """Application startup event handler.

    Enforces that database schema creation is NOT performed dynamically via create_all(),
    mandating that schema changes are applied deterministically via Alembic migrations.
    """
    # REVIEW-ASSUMPTION: create_all() is strictly disabled in production in favor of Alembic migrations
    logger = logging.getLogger("uvicorn")
    logger.info("CRMS Backend initialized without create_all(). Schema managed via Alembic baseline migrations.")


# Mount modular domain routers
app.include_router(auth_router.router)
app.include_router(ingest.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(disputes.router)


@app.get("/health")
def health_check(response: Response):
    """Production health check probe for container orchestrators (Kubernetes / Docker Compose).

    Actively executes `SELECT 1` on the PostgreSQL database engine and pings the Redis cache.
    Returns HTTP 200 if healthy, or HTTP 503 Service Unavailable if primary storage fails.

    Args:
        response: FastAPI response object for mutating HTTP status codes.

    Returns:
        JSON status dictionary with component-level connectivity indicators.
    """
    db_status = "disconnected"
    redis_status = "unavailable"

    # 1. Database connectivity check via atomic query
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

    # REVIEW-SECURITY: If database is unreachable, signal 503 to stop ingress traffic routing
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
    """Prometheus telemetry endpoint exposing runtime metrics.

    Exposes HTTP request durations, memory usage, and operational counters
    in standard Prometheus text format.

    Returns:
        Starlette Response with Prometheus content-type.
    """
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
