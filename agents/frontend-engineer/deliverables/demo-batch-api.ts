/**
 * MyMetaView 5.0 — Batch API client
 *
 * Copy to: your MyMetaView frontend (e.g. src/api/demo-batch-api.ts)
 * Wire: Set API_BASE_URL from env or config (default: same-origin)
 *
 * Reference: agents/junior-dev-backend-3/MYMETAVIEW_5.0_BACKEND_DATA_IMPLEMENTATION_SPEC.md
 * API docs: .agent-workspaces/documentation-specialist/docs/API_DOCS_MYMETAVIEW_4.0.md
 */

export const DEFAULT_API_BASE = "";

export interface BatchSubmitResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  created_at: string;
}

export interface ResultUrl {
  url: string;
  preview_url: string | null;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
}

export interface BatchResultsResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  result_urls?: ResultUrl[];
}

export interface BatchPagesResponse {
  job_id: string;
  status: string;
  pages: Array<{
    url: string;
    status: string;
    preview_url: string | null;
    error: string | null;
  }>;
}

/**
 * Submit a new batch demo job.
 */
export async function submitBatchJob(
  urls: string[],
  options: {
    apiBase?: string;
    qualityMode?: "fast" | "balanced" | "ultra" | "auto";
    apiKey?: string;
  } = {}
): Promise<BatchSubmitResponse> {
  const base = options.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/api/demo-v2/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    },
    body: JSON.stringify({
      urls,
      quality_mode: options.qualityMode ?? "balanced",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error ?? `Batch submit failed: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

/**
 * Poll job status (lightweight).
 */
export async function getBatchJobStatus(
  jobId: string,
  options: { apiBase?: string; apiKey?: string } = {}
): Promise<{ status: string; total?: number; completed?: number; failed?: number }> {
  const base = options.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/api/demo-v2/batch/${jobId}`, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Job not found");
    throw new Error(`Status fetch failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get batch results. Returns 202 with partial data when job is still running.
 * Use this for polling; map result_urls to DemoItem format.
 */
export async function getBatchResults(
  jobId: string,
  options: { apiBase?: string; apiKey?: string } = {}
): Promise<BatchResultsResponse> {
  const base = options.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/api/demo-v2/batch/${jobId}/results`, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
  });

  if (!res.ok && res.status !== 202) {
    if (res.status === 404) throw new Error("Job not found");
    throw new Error(`Results fetch failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Get per-URL pages (5.0 endpoint). Prefer this when available for richer progress.
 */
export async function getBatchPages(
  jobId: string,
  options: { apiBase?: string; apiKey?: string } = {}
): Promise<BatchPagesResponse | null> {
  const base = options.apiBase ?? DEFAULT_API_BASE;
  const res = await fetch(`${base}/api/demo-v2/batch/${jobId}/pages`, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  return res.json();
}
