"""
P11: Monitoring & Observability — MyMetaView 4.0 Batch API

Copy to: backend/services/batch_metrics.py

Issue: AIL-127
Spec: agents/founding-engineer/MONITORING_OBSERVABILITY_MYMETAVIEW_4.0.md
"""
from prometheus_client import Counter, Gauge, Histogram

# Gauges
queue_depth = Gauge("demo_batch_queue_depth", "Jobs in queue (queued, not running)")
jobs_in_progress = Gauge("demo_batch_jobs_in_progress", "Jobs currently being processed")

# Counters
jobs_submitted_total = Counter("demo_batch_jobs_submitted_total", "Jobs submitted", ["tenant_id"])
jobs_completed_total = Counter("demo_batch_jobs_completed_total", "Jobs completed", ["tenant_id", "status"])
urls_failed_total = Counter("demo_batch_urls_failed_total", "URLs failed", ["tenant_id", "error_type"])
cache_hits_total = Counter("demo_batch_cache_hits_total", "Cache hits", ["quality_mode"])
cache_misses_total = Counter("demo_batch_cache_misses_total", "Cache misses", ["quality_mode"])
webhook_deliveries_total = Counter("demo_batch_webhook_deliveries_total", "Webhook attempts", ["tenant_id", "status"])
api_requests_total = Counter("demo_batch_api_requests_total", "API requests", ["tenant_id", "status_code"])

# Histograms
job_duration_seconds = Histogram(
    "demo_batch_job_duration_seconds",
    "End-to-end job duration",
    ["tenant_id", "quality_mode", "status"],
    buckets=[5, 15, 30, 60, 120, 300, 600, 1800],
)
url_duration_seconds = Histogram(
    "demo_batch_url_duration_seconds",
    "Per-URL processing time",
    ["quality_mode", "status"],
    buckets=[1, 5, 15, 30, 60, 120],
)

# Optional: SLA compliance (0–1 scale): % jobs completing within 2× estimated time
sla_compliance_rate = Gauge("demo_batch_sla_compliance_rate", "SLA compliance rate (0–1)")
