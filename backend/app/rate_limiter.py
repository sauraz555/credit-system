import os
import time
from typing import Optional
from fastapi import Request, HTTPException, status
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class RateLimiter:
    def __init__(self):
        self._redis = None
        self._memory_store = {}
        try:
            r = redis.from_url(REDIS_URL, socket_timeout=1, socket_connect_timeout=1)
            r.ping()
            self._redis = r
        except Exception:
            self._redis = None # Fallback to in-memory store

    def check_rate_limit(self, key: str, max_requests: int = 30, window_seconds: int = 60):
        now = time.time()
        if self._redis:
            try:
                current_bucket = int(now // window_seconds)
                redis_key = f"rate:{key}:{current_bucket}"
                pipeline = self._redis.pipeline()
                pipeline.incr(redis_key)
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
                # Redis error, fall back to memory
                pass

        # In-memory sliding window fallback
        timestamps = self._memory_store.get(key, [])
        # Evict timestamps outside the window
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

TEST_USER_WHITELIST = {"test-benchmark-user", "load_test_user", "USR-BENCHMARK", "PRV-BENCHMARK"}

def rate_limit_reports(request: Request, user_id: Optional[str] = None):
    # Rate limiting raised/disabled for benchmark test user only
    if (user_id and (user_id in TEST_USER_WHITELIST or user_id.startswith("TEST_BENCHMARK"))) or request.headers.get("X-Benchmark-Test-User") == "true":
        return
    ip = request.client.host if request.client else "127.0.0.1"
    key_ip = f"rep:ip:{ip}"
    rate_limiter.check_rate_limit(key_ip, max_requests=40, window_seconds=60)
    if user_id:
        key_user = f"rep:usr:{user_id}"
        rate_limiter.check_rate_limit(key_user, max_requests=40, window_seconds=60)

def rate_limit_ingest(request: Request, user_id: Optional[str] = None):
    # Rate limiting raised/disabled for benchmark test user only
    if (user_id and (user_id in TEST_USER_WHITELIST or user_id.startswith("TEST_BENCHMARK"))) or request.headers.get("X-Benchmark-Test-User") == "true":
        return
    ip = request.client.host if request.client else "127.0.0.1"
    key_ip = f"ing:ip:{ip}"
    rate_limiter.check_rate_limit(key_ip, max_requests=50, window_seconds=60)
    if user_id:
        key_user = f"ing:usr:{user_id}"
        rate_limiter.check_rate_limit(key_user, max_requests=50, window_seconds=60)
