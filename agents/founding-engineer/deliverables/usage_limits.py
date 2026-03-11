"""
P9: Usage Limits & Rate Limiting — MyMetaView 4.0

Copy to: backend/services/usage_limits.py

Issue: AIL-125
Spec: agents/founding-engineer/P9_USAGE_LIMITS_SPEC_MYMETAVIEW_4.0.md
"""
import os
import time
from typing import Optional, Tuple

# Defaults per spec
DEFAULT_JOBS_PER_HOUR = 20
DEFAULT_QUEUE_MAX_DEPTH = 200
BATCH_JOBS_PER_HOUR = int(os.environ.get("BATCH_JOBS_PER_HOUR", str(DEFAULT_JOBS_PER_HOUR)))
BATCH_QUEUE_MAX_DEPTH = int(os.environ.get("BATCH_QUEUE_MAX_DEPTH", str(DEFAULT_QUEUE_MAX_DEPTH)))

# Redis key prefix for usage tracking
USAGE_KEY_PREFIX = "usage:batch"
QUEUE_NAME = os.environ.get("BATCH_QUEUE_NAME", "demo:batch:jobs")


def get_tenant_key_from_ip(client_ip: str) -> str:
    """
    Derive tenant key from client IP (pre-P10).
    Post-P10: use tenant_id from API key auth instead.
    """
    return f"ip:{client_ip}"


def get_tenant_key_from_request(request) -> str:
    """
    Extract tenant key from request.
    Uses X-Forwarded-For if behind proxy, else request.remote_addr.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "0.0.0.0")
    return get_tenant_key_from_ip(ip)


def get_tenant_key_from_tenant_id(tenant_id: str) -> str:
    """Post-P10: use tenant_id from API key auth."""
    return f"tenant:{tenant_id}"


def _hour_bucket() -> int:
    """Current hour bucket (Unix timestamp // 3600."""
    return int(time.time() // 3600)


def check_batch_job_limit(
    redis_client,
    tenant_key: str,
) -> Tuple[bool, Optional[int]]:
    """
    Check if tenant is within jobs-per-hour limit.
    If within limit, increments the counter (call only when accepting the job).
    Returns (ok, retry_after_seconds).
    - ok=True: within limit, counter incremented
    - ok=False: exceeded; retry_after_seconds is seconds until limit resets
    """
    key = f"{USAGE_KEY_PREFIX}:{tenant_key}:{_hour_bucket()}"
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 7200)
        results = pipe.execute()
        count = int(results[0])
        if count > BATCH_JOBS_PER_HOUR:
            redis_client.decr(key)  # undo: don't count rejected request
            ttl = redis_client.ttl(key)
            retry_after = max(60, ttl) if ttl > 0 else 3600
            return (False, retry_after)
        return (True, None)
    except Exception:
        return (True, None)  # Fail open for availability


def check_queue_backpressure(
    redis_client,
    queue_name: str = QUEUE_NAME,
) -> Tuple[bool, Optional[int]]:
    """
    Check if queue is at capacity (backpressure).
    Returns (ok, retry_after_seconds).
    - ok=True: queue has capacity
    - ok=False: queue full; retry_after_seconds=60 per spec
    """
    try:
        depth = redis_client.llen(queue_name)
        if depth >= BATCH_QUEUE_MAX_DEPTH:
            return (False, 60)
        return (True, None)
    except Exception:
        return (True, None)  # Fail open
