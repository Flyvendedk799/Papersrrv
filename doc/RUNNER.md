# Remote Runner

**Status:** Operational  
**Source:** `server/src/routes/runner.ts`, `scripts/local-runner.mjs`  
**Use case:** Cloud-hosted Paperclip (e.g. Railway) with local adapters (cursor, process) running on operator machines

---

## 1. Overview

When Paperclip runs in the cloud, local adapters (`cursor`, `process`, `claude_local`, `codex_local`, etc.) cannot execute on the server. The **Remote Runner** pattern lets an external process poll for queued runs, claim them, execute locally, and report results.

- **Server:** Sets `PAPERCLIP_RUNNER_MODE=remote`. Heartbeat scheduling continues; local adapter runs stay `queued` until claimed.
- **Runner:** Polls `GET /api/runner/poll`, claims runs via `POST /api/runner/claim/:runId`, executes the adapter locally, streams logs, and completes via `POST /api/runner/complete/:runId`.

---

## 2. Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `PAPERCLIP_RUNNER_MODE` | Server | Set to `remote` to enable remote runner mode |
| `PAPERCLIP_RUNNER_TOKEN` | Server + Runner | Shared secret for runner API auth |
| `PAPERCLIP_DEFAULT_ADAPTER_TYPE` | Server | Default adapter for new agents (default: `cursor`) |
| `PAPERCLIP_SERVER_URL` | Runner | Base URL of Paperclip API |
| `PAPERCLIP_LOCAL_AGENTS_DIR` | Runner | Local path for agents (default: project root + `\agents` on Windows) |
| `ADAPTER_TYPES` | Runner | Comma-separated types to poll (default: `cursor`) |
| `POLL_INTERVAL_MS` | Runner | Poll interval in ms (default: 3000) |

---

## 3. Runner API Endpoints

All endpoints require `Authorization: Bearer <PAPERCLIP_RUNNER_TOKEN>`. Base path: `/api`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/runner/poll` | Get next queued run for local adapter types |
| POST | `/runner/claim/:runId` | Atomically claim run (queued → running) |
| POST | `/runner/log/:runId` | Append stdout/stderr chunk |
| POST | `/runner/complete/:runId` | Mark run succeeded/failed/timed_out |
| POST | `/runner/fix-adapters` | Patch agents with null/wrong adapterType |

### 3.1 GET /api/runner/poll

**Query params:**
- `adapterTypes` (optional): Comma-separated adapter types (default: all local types)

**Response:**
```json
{ "run": null }
```
or
```json
{
  "run": {
    "runId": "uuid",
    "agentId": "uuid",
    "companyId": "uuid",
    "adapterType": "cursor",
    "createdAt": "ISO8601"
  }
}
```

### 3.2 POST /api/runner/claim/:runId

**Response:** Full execution context (run, agent, runtime, `authToken` JWT for agent API calls).

**Errors:** `409` if run already claimed or not found.

### 3.3 POST /api/runner/log/:runId

**Body:**
```json
{ "stream": "stdout" | "stderr", "chunk": "string" }
```

### 3.4 POST /api/runner/complete/:runId

**Body:** Adapter execution result:
```json
{
  "exitCode": 0,
  "signal": null,
  "timedOut": false,
  "errorMessage": null,
  "errorCode": null,
  "usage": { "inputTokens": 0, "outputTokens": 0 },
  "costUsd": null,
  "billingType": null,
  "sessionId": null,
  "summary": null,
  "stdoutExcerpt": null,
  "stderrExcerpt": null
}
```

**Outcome:** `succeeded` (exitCode 0, no error), `failed`, or `timed_out`.

---

## 4. fix-adapters Endpoint

**POST /api/runner/fix-adapters**

Patches agents with null/empty `adapterType` or converts from specified types. Sets per-agent `instructionsFilePath` (e.g. `/app/agents/<urlKey>/AGENTS.md`). Requires runner auth.

**Body (optional):**
```json
{
  "adapterType": "cursor",
  "adapterConfig": { ... },
  "agentIds": ["uuid1", "uuid2"],
  "fromTypes": ["process"]
}
```

| Field | Purpose |
|-------|---------|
| `adapterType` | Target type (default: `PAPERCLIP_DEFAULT_ADAPTER_TYPE` or `cursor`) |
| `adapterConfig` | Template config; if omitted, uses first agent with target type |
| `agentIds` | Limit to specific agents |
| `fromTypes` | Convert only from these types (e.g. `["process"]` → cursor) |

**Response:**
```json
{ "ok": true, "patched": 3, "agents": [{ "id": "...", "name": "..." }] }
```

---

## 5. Local Runner Script

Reference implementation: `scripts/local-runner.mjs`

```sh
PAPERCLIP_SERVER_URL="https://your-paperclip.example.com" \
PAPERCLIP_RUNNER_TOKEN="<token>" \
node scripts/local-runner.mjs
```

- Polls for `cursor` runs by default (`ADAPTER_TYPES=cursor`)
- Executes Cursor CLI via WSL on Windows
- Maps `/app/agents/...` paths to local `PAPERCLIP_LOCAL_AGENTS_DIR`
- Streams stdout/stderr to server
- Reports completion with exit code and usage

---

## 6. Local Adapter Types

Adapters that require a remote runner when `PAPERCLIP_RUNNER_MODE=remote`:

- `cursor`
- `process`
- `claude_local`
- `codex_local`
- `opencode_local`
- `pi_local`

---

## 7. Traceability

| Concept | Source |
|---------|--------|
| Runner routes | `server/src/routes/runner.ts` |
| `isRemoteRunnerMode`, `needsRemoteRunner` | `server/src/routes/runner.ts` L24–34 |
| Local runner script | `scripts/local-runner.mjs` |
| Default adapter type | `server/src/services/agents.ts` L347 |
| Docker remote mode | `Dockerfile` L50 |
