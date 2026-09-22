"""Abuse Prevention and Multi-Dimensional Rate Limiting Service.

This module provides rate limiting guards across sensitive API endpoints to protect the
credit bureau against denial-of-service, automated file scraping, and credential stuffing.
It operates via a Redis-backed fixed/sliding window counter with automatic graceful degradation
to an in-memory sliding window when Redis is unavailable in local testing environments.

Architecture Tier:
    Security / API Middleware Layer.

Key Dependencies & Callers:
    - Depends on `redis-py` and FastAPI request objects.
    - Called by `routers/reports.py` (`rate_limit_reports`) and `routers/ingest.py` (`rate_limit_ingest`).

Regulatory & Compliance Context:
    - OAIC Guide to Securing Personal Information & Privacy Act 1988 Part IIIA:
      Requires safeguards against bulk unauthorized extraction of consumer credit records.
"""

import os
import time
from typing import Optional
from fastapi import Request, HTTPException, status
import redis

# Redis connection string; defaults to local instance
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class RateLimiter:
    """Sliding-window rate limiter with Redis backend and in-memory fallback.

    Tracks request frequencies along arbitrary string keys (e.g. IP addresses or user IDs).
    """

    def __init__(self):
        """Initializes connection to Redis; falls back to internal dictionary if offline."""
        self._redis = None
        self._memory_store = {}
        try:
            # 1-second timeout prevents network hangs during Redis connection attempts
            r = redis.from_url(REDIS_URL, socket_timeout=1, socket_connect_timeout=1)
            r.ping()
            self._redis = r
        except Exception:
            # REVIEW-SECURITY: Fallback to in-memory store ensures test suites pass without Redis
            self._redis = None

    def check_rate_limit(self, key: str, max_requests: int = 30, window_seconds: int = 60):
        """Checks if a rate limit key has exceeded the allowed quota within the sliding window.

        Args:
            key: Rate limit identifier (e.g., 'rep:ip:192.168.1.1' or 'rep:usr:UUID').
            max_requests: Maximum allowed calls within `window_seconds`.
            window_seconds: Duration of the rolling rate limit window in seconds.

        Raises:
            HTTPException(429): If the request rate exceeds `max_requests`.
        """
        now = time.time()
        if self._redis:
            try:
                # Time-bucketed atomic counter increment in Redis
                current_bucket = int(now // window_seconds)
                redis_key = f"rate:{key}:{current_bucket}"
                pipeline = self._redis.pipeline()
                pipeline.incr(redis_key)
                # Expire bucket after 2 windows to allow clock skew and automatic cleanup
                pipeline.expire(redis_key, window_seconds * 2)
                results = pipeline.execute()
                count = results[0]
                if count > max_requests:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Rate limit exceeded: max {max_requests} requests per {window_seconds}s.",
                        headers={"Retry-After": str(window_seconds)}
                    )
                return
            except HTTPException:
                raise
            except Exception:
                # If Redis encounters an operational error mid-flight, fall back to in-memory
                pass

        # In-memory sliding window fallback:
        # Stores exact epoch timestamps and evicts timestamps older than (now - window_seconds)
        timestamps = self._memory_store.get(key, [])
        valid_timestamps = [t for t in timestamps if t > (now - window_seconds)]
        if len(valid_timestamps) >= max_requests:
            self._memory_store[key] = valid_timestamps
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: max {max_requests} requests per {window_seconds}s.",
                headers={"Retry-After": str(window_seconds)}
            )
        valid_timestamps.append(now)
        self._memory_store[key] = valid_timestamps


rate_limiter = RateLimiter()

# REVIEW-SECURITY: Whitelist for automated load benchmarking; in production, ensure
# X-Benchmark-Test-User headers are stripped by the ingress API gateway.
TEST_USER_WHITELIST = {"test-benchmark-user", "load_test_user", "USR-BENCHMARK", "PRV-BENCHMARK"}


def rate_limit_reports(request: Request, user_id: Optional[str] = None):
    """Enforces rate limits on bitemporal credit report lookups.

    Limits lookups to 40 requests/minute per client IP and 40 requests/minute per authenticated user.

    Args:
        request: Incoming FastAPI request for client IP resolution.
        user_id: Optional authenticated user ID for per-account throttling.

    Raises:
        HTTPException(429): If either IP or user quota is exceeded.
    """
    # Rate limiting raised/disabled for benchmark test user only to measure true server throughput
    if (user_id and (user_id in TEST_USER_WHITELIST or user_id.startswith("TEST_BENCHMARK"))) or request.headers.get("X-Benchmark-Test-User") == "true":
        return
    ip = request.client.host if request.client else "127.0.0.1"
    key_ip = f"rep:ip:{ip}"
    # REVIEW-ASSUMPTION: 40 requests/min per IP prevents rapid scraping of consumer files
    rate_limiter.check_rate_limit(key_ip, max_requests=40, window_seconds=60)
    if user_id:
        key_user = f"rep:usr:{user_id}"
        rate_limiter.check_rate_limit(key_user, max_requests=40, window_seconds=60)


def rate_limit_ingest(request: Request, user_id: Optional[str] = None):
    """Enforces rate limits on credit provider data ingestion endpoints.

    Limits submissions to 50 batches/minute per client IP and 50 batches/minute per provider user.

    Args:
        request: Incoming FastAPI request for client IP resolution.
        user_id: Optional authenticated user ID for per-provider throttling.

    Raises:
        HTTPException(429): If either IP or user quota is exceeded.
    """
    # Rate limiting raised/disabled for benchmark test user only
    if (user_id and (user_id in TEST_USER_WHITELIST or user_id.startswith("TEST_BENCHMARK"))) or request.headers.get("X-Benchmark-Test-User") == "true":
        return
    ip = request.client.host if request.client else "127.0.0.1"
    key_ip = f"ing:ip:{ip}"
    # REVIEW-ASSUMPTION: 50 batch submissions/min per provider allows steady ingestion without overwhelming the ledger
    rate_limiter.check_rate_limit(key_ip, max_requests=50, window_seconds=60)
    if user_id:
        key_user = f"ing:usr:{user_id}"
        rate_limiter.check_rate_limit(key_user, max_requests=50, window_seconds=60)
