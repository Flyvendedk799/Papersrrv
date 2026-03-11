/**
 * MyMetaView 5.0 — Demo generation page (API-wired)
 *
 * Copy to: your MyMetaView frontend (e.g. src/pages/DemoGenerationPage.tsx)
 *
 * Prerequisites (copy first):
 * - agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx → src/components/DemoGenerationExperience.tsx
 * - deliverables/demo-batch-api.ts → src/api/demo-batch-api.ts
 * - deliverables/demo-generation.css → src/styles/demo-generation.css (import in app)
 *
 * Wire: Set apiBase and apiKey from your app config (env, context, etc.)
 */

import React, { useCallback, useRef } from "react";
import {
  DemoGenerationExperience,
  type DemoItem,
} from "../../junior-dev-animation/deliverables/mymetaview-demo-animation";
import {
  submitBatchJob,
  getBatchPages,
  getBatchResults,
  DEFAULT_API_BASE,
} from "./demo-batch-api";

function mapBackendStatusToItem(
  status: string
): "pending" | "generating" | "success" | "error" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "running":
      return "generating";
    default:
      return "pending";
  }
}

function mapResultToDemoItem(
  r: { url: string; status: string; preview_url?: string | null; error?: string | null },
  index: number
): DemoItem {
  return {
    id: `${r.url}-${index}`,
    url: r.url,
    status: mapBackendStatusToItem(r.status),
    thumbnailUrl: r.preview_url ?? undefined,
    errorMessage: r.error ?? undefined,
  };
}

export interface DemoGenerationPageProps {
  apiBase?: string;
  apiKey?: string;
  qualityMode?: "fast" | "balanced" | "ultra" | "auto";
  pollIntervalMs?: number;
}

export const DemoGenerationPage: React.FC<DemoGenerationPageProps> = ({
  apiBase = DEFAULT_API_BASE,
  apiKey,
  qualityMode = "balanced",
  pollIntervalMs = 1500,
}) => {
  const jobIdRef = useRef<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  const onCreateJob = useCallback(
    async (urls: string[]) => {
      urlsRef.current = urls;
      const res = await submitBatchJob(urls, {
        apiBase,
        apiKey,
        qualityMode,
      });
      jobIdRef.current = res.job_id;
    },
    [apiBase, apiKey, qualityMode]
  );

  const onPollJob = useCallback(async (): Promise<DemoItem[]> => {
    const jobId = jobIdRef.current;
    const urls = urlsRef.current;
    if (!jobId) return [];

    // Prefer 5.0 /pages endpoint for per-URL progress
    const pagesRes = await getBatchPages(jobId, { apiBase, apiKey });
    if (pagesRes?.pages && pagesRes.pages.length > 0) {
      return pagesRes.pages.map((p, i) =>
        mapResultToDemoItem(
          {
            url: p.url,
            status: p.status,
            preview_url: p.preview_url,
            error: p.error,
          },
          i
        )
      );
    }

    // Fallback: poll /results (4.0 compatible)
    const resultsRes = await getBatchResults(jobId, { apiBase, apiKey });
    const resultUrls = resultsRes.result_urls ?? [];
    if (resultUrls.length > 0) {
      return resultUrls.map(mapResultToDemoItem);
    }

    // Job still queued/running, no per-URL data yet — return placeholders so grid stays visible
    return urls.map((url, i) => ({
      id: `${jobId}-${i}`,
      url,
      status: "generating" as const,
    }));
  }, [apiBase, apiKey]);

  return (
    <div className="min-h-screen bg-slate-950">
      <DemoGenerationExperience
        onCreateJob={onCreateJob}
        onPollJob={onPollJob}
        pollIntervalMs={pollIntervalMs}
      />
    </div>
  );
};
