/**
 * PAPEE_TOOLS_PLAN.md — client-side animation telemetry.
 *
 * Batched, fire-and-forget event logger that ships to
 * `POST /companies/:companyId/papee/telemetry` every ~1.5s and on
 * `pagehide` (via `navigator.sendBeacon`). Events flow through the
 * same `papeeLog` sink on the server so everything lives in
 * `papee.log` alongside chat + tool events.
 *
 * Usage:
 *
 *   telemetry.setCompany(id);
 *   telemetry.log("anim.set", { from, to });
 *
 * Gate with `telemetry.setEnabled(false)` if you want it off.
 */

interface TelemetryEvent {
  event: string;
  t: number;
  meta?: Record<string, unknown>;
}

class PapeeTelemetry {
  private buffer: TelemetryEvent[] = [];
  private companyId: string | null = null;
  private enabled = true;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private mounted = false;

  setCompany(id: string | null) {
    if (this.companyId === id) return;
    this.companyId = id;
    this.ensureMount();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  log(event: string, meta?: Record<string, unknown>) {
    if (!this.enabled) return;
    this.buffer.push({ event, t: Date.now(), meta });
    if (this.buffer.length >= 40) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), 1500);
    }
    // Hard cap to prevent runaway memory if the server is down
    if (this.buffer.length > 400) this.buffer.splice(0, this.buffer.length - 200);
  }

  async flush() {
    if (this.flushing) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0) return;
    if (!this.companyId) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    this.flushing = true;
    try {
      await fetch(`/api/companies/${this.companyId}/papee/telemetry`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      // On failure, drop the batch — telemetry is best-effort
    } finally {
      this.flushing = false;
    }
  }

  private ensureMount() {
    if (this.mounted || typeof window === "undefined") return;
    this.mounted = true;
    const beacon = () => {
      if (this.buffer.length === 0 || !this.companyId) return;
      const url = `/api/companies/${this.companyId}/papee/telemetry`;
      const payload = JSON.stringify({ events: this.buffer });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        }
      } catch {
        /* best effort */
      }
      this.buffer.length = 0;
    };
    window.addEventListener("pagehide", beacon);
    window.addEventListener("beforeunload", beacon);
  }
}

export const telemetry = new PapeeTelemetry();
