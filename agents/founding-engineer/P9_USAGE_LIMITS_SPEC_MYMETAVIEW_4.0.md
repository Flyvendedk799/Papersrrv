# P9: Usage Limits & Rate Limiting — MyMetaView 4.0

**Issue:** AIL-125  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Founding Engineer  
**Date:** 2026-03-10  
**Reference:** `TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §6.4, §5.3

---

## 1. Summary

Per-tenant limits; rate limiting; quota enforcement for the batch API. Builds on P3 (Batch API) and P10 (Auth). Until P10 (API keys, tenant_id) lands, tenant identity is derived from client IP.

---

## 2. Implemented Limits

| Limit | Default | Env Override | Behavior |
|-------|---------|--------------|----------|
| Jobs per tenant per hour | 20 | `BATCH_JOBS_PER_HOUR` | 429 when exceeded |
| URLs per batch | 50 | Schema + `BATCH_URLS_PER_JOB_MAX` | 400 from schema validation |
| Queue depth (backpressure) | 200 | `BATCH_QUEUE_MAX_DEPTH` | 503 when exceeded |

---

## 3. Response Semantics

| Status | Condition | Headers |
|--------|-----------|---------|
| 429 | Per-tenant jobs/hour exceeded | `Retry-After: <seconds>` |
| 503 | Queue depth ≥ max (backpressure) | `Retry-After: 60` |

---

## 4. Tenant Identity

- **Current (pre-P10):** `tenant_key = ip:{client_ip}` — IP-based
- **Post-P10:** `tenant_key = tenant:{tenant_id}` — from API key / auth

The `usage_limits` service accepts a tenant key; the route supplies it. When P10 delivers API key auth, the route should pass `tenant_id` from the authenticated context instead of IP.

---

## 5. Files Changed

- `backend/services/usage_limits.py` — New: `check_batch_job_limit`, `check_queue_backpressure`, `get_tenant_key_from_ip`
- `backend/api/v1/routes_demo_optimized.py` — Batch endpoint: queue backpressure, per-tenant limit, Retry-After headers

---

## 6. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.2, W9
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §6.4, §5.3
