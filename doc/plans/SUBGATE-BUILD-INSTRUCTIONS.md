# SubGate — Build Instructions

**Audience:** Claude Code running locally on the owner's PC, with all repos
available and SSH access to the VPS.

**Deliverable:** a subscription-backed LLM gateway that lets existing web apps
keep using their OpenAI/Anthropic client code while inference is served from
**Claude Code and Codex/ChatGPT developer subscriptions** instead of metered API
keys.

Two build targets, in this order:

1. **ServerHoster integration** — a new "AI Gateway" tab in the owner's
   dashboard. This is the primary use case and ships first.
2. **Standalone repo** — the same core extracted as a reusable package plus a
   minimal standalone UI, for use outside ServerHoster.

---

## 0. Read this before writing any code

This has already been implemented twice, independently, by the same owner. **Do
not design from scratch — port the working code.** Read all three of these
first; they are the ground truth for OAuth endpoints, headers, and refresh
logic:

| Source | Path | What it proves |
| --- | --- | --- |
| **LEADer** | `src/lib/ai/subscriptions.ts` | `readClaudeSubscriptionAuth`, `readCodexSubscriptionAuth`, `refreshCodexSubscriptionAuth`, `decodeJwtClaims`, `extractAccountId`. Its own header comment says it "mirrors the GameHub / OSINT approach" |
| **LEADer** | `src/lib/ai/provider.ts`, `keys.ts` | Provider-aware client that already routes between API-key providers and "local subscription providers harvested from Codex / Claude Code" |
| **Gamehub** | `packages/providers/src/claude/keychain.ts` | Harvest from macOS Keychain (`"Claude Code-credentials"`) **or** `~/.claude/.credentials.json`; explicitly designed for "a developer's Mac or a Linux VPS" |
| **Gamehub** | `packages/providers/src/claude/token-store.ts`, `oauth-refresh.ts` | Persist + refresh |
| **Gamehub** | `packages/providers/src/codex/{oauth,oauth-server,token-store,auth-file}.ts` | Full Codex/ChatGPT OAuth |
| **Gamehub** | `packages/providers/src/claude-code-compat.ts` | The exact identity headers (`claude-cli/` UA, `anthropic-beta` list) required when talking to Anthropic with an OAuth token rather than an API key |
| **Gamehub** | `packages/shared/src/base-url.ts`, `proxy-presets.ts` | Base-URL normalization + gateway preset pattern |
| **Gamehub** | `packages/providers/src/retry.ts` | Relay-specific retry/backoff |

> **Do not trust any endpoint URL, header name, or beta flag from this document
> over what is in those files.** Where this doc and the working code disagree,
> the working code wins. Where neither is conclusive, verify against the vendor
> CLI's actual traffic before shipping.

If `Papersrrv` is needed for reference, clone it — it is not expected to be
present locally:
`git clone https://github.com/Flyvendedk799/Papersrrv` (see
`doc/plans/subscription-backed-inference.md` for why the CLI-wrapping approach
was rejected in favour of token harvest).

---

## 1. Why this design

There are two ways to run inference off a subscription:

- **A — token harvest → real vendor API.** Read the OAuth blob the CLI wrote at
  login, call the real vendor endpoint with it. Native tool calls, streaming,
  structured output, no subprocess. **This is what we build.**
- **B — wrap the agent CLI, parse stdout.** Lossy: tool calls must be emulated
  in-prompt, a subprocess per request, and you inherit a coding agent's system
  prompt.

Claude Code and Codex both support A. (Cursor does not — it exposes no
inference API at all — which is why it is out of scope here.)

---

## 2. Consumers — what the gateway must satisfy

Five real apps. Their shapes dictate the design:

| App | Stack | Current AI call | Runs where |
| --- | --- | --- | --- |
| **Gamehub** | Node/TS | Own provider registry, pluggable `baseUrl`, proxy presets | VPS |
| **LEADer** | Node/TS | Own provider + already harvests subscriptions | VPS |
| **MyMetaView** | **Python** | `openai` SDK → `OpenAI()` client (`backend/services/ai_provider.py`) | VPS |
| **HaveKongen** | **Deno / Supabase Edge Functions** | Raw `fetch("https://api.openai.com/v1/chat/completions")` with `OPENAI_API_KEY` (e.g. `supabase/functions/plant-care-chat/index.ts`) | **Supabase infra — NOT the VPS** |
| **Awaire** | **Deno / Supabase Edge Functions** | Same pattern (`supabase/functions/ai-interactive/index.ts`) | **Supabase infra — NOT the VPS** |

Three requirements fall straight out of that table:

1. **OpenAI wire format is mandatory.** `POST /v1/chat/completions`, streaming
   via SSE. It is the only shape all five can speak (Python SDK, Deno `fetch`,
   Node). Also implement Anthropic `POST /v1/messages` — Gamehub has an
   Anthropic path already.
2. **The gateway must be reachable from the public internet.** Supabase Edge
   Functions cannot reach `127.0.0.1`. Expose it through ServerHoster's existing
   reverse proxy on a real hostname with TLS, guarded by a bearer token.
3. **Migration must be a config change, not a code change.** Every consumer
   already reads a base URL and a key from env. Swapping means setting
   `OPENAI_BASE_URL` / `OPENAI_API_KEY` (and the Anthropic equivalents) to point
   at SubGate. Do not require consumers to import anything.

---

## 3. Architecture

```
Consumer apps                    ServerHoster VPS
──────────────                   ─────────────────────────────────────
Gamehub    ─┐
LEADer     ─┤ OPENAI_BASE_URL   ┌──────────────────────────────┐
MyMetaView ─┼──────────────────▶│ SubGate                       │
HaveKongen ─┤ (https, bearer)   │  /v1/chat/completions         │
Awaire     ─┘                   │  /v1/messages                 │
                                │  /v1/models  /health          │
                                └──────────┬───────────────────┘
                                           │ harvested OAuth
                                ┌──────────▼───────────────────┐
                                │ credential harvest + refresh  │
                                │  ~/.claude/.credentials.json  │
                                │  macOS Keychain               │
                                │  ~/.codex/auth.json           │
                                └──────────┬───────────────────┘
                                           │
                        api.anthropic.com ─┴─ ChatGPT/Codex backend
```

### Core modules (framework-free, no ServerHoster imports)

```
core/
  harvest/claude.ts     read Keychain (macOS) or ~/.claude/.credentials.json
  harvest/codex.ts      read ~/.codex/auth.json
  harvest/types.ts      { accessToken, refreshToken?, accountId?, expiresAt? }
  store.ts              persist + expiry tracking
  refresh.ts            refresh before expiry; re-read local login when stale
  upstream/anthropic.ts call api.anthropic.com with OAuth + CC identity headers
  upstream/openai.ts    call the ChatGPT/Codex backend
  translate/            OpenAI ⇄ Anthropic ⇄ internal message mapping
  models.ts             model-id mapping + /v1/models payload
  errors.ts             typed errors; upstream 429/401 mapped, never swallowed
```

**Critical:** `core/` must not import ServerHoster, Fastify, React, or any app.
Both build targets consume the same `core/`.

### Credential-source precedence

The harvest must accept an explicit home directory, not assume `~`. ServerHoster
runs agent CLIs in **isolated per-profile homes** (see §4), so the gateway must
be able to read from a given profile's home. Signature roughly:

```ts
readClaudeAuth(opts?: { home?: string }): Promise<ClaudeAuth | null>
readCodexAuth(opts?: { home?: string }): Promise<CodexAuth | null>
```

Fall back to the real `$HOME` when no profile home is given. Keep the
`readRaw`/`env` injection seams Gamehub uses so this is unit-testable without a
keychain.

---

## 4. Target 1 — ServerHoster "AI Gateway" tab

**Repo:** `Flyvendedk799/ServerHoster` (package name `survhub`, product name
LocalSURV). npm workspaces: `apps/server` (Fastify, port 8787), `apps/web`
(React + react-router, port 5173), `apps/desktop`, `packages/shared`.

### 4.1 What already exists — reuse it, do not duplicate

`apps/server/src/services/agents.ts` already implements agent-profile
management, and it is the natural foundation:

- `AGENT_PROVIDERS` with ids `"claude" | "gemini" | "codex"` — provider
  metadata, `executable`, `installCommand()`, `authCommand(mode)`,
  `runCommand()`
- `type AgentAuthMode = "cli" | "managed"` — **`"cli"` is exactly the
  subscription login path** (`claude auth login`); `"managed"` is the API-key
  path
- `agentHomeForProfile(...)` (from `./terminals.js`) — the isolated `HOME` per
  profile. **This is where `claude auth login` writes credentials, and therefore
  where the gateway must harvest from.**
- `keychainPasswordForProfile()` + `darwinKeychainBootstrap()` — per-profile
  macOS keychain, deterministic HMAC password, never stored
- `apps/server/src/routes/agents.ts` — existing route module (82 lines; follow
  its shape)

Also reuse:

- `apps/server/src/security.ts` — `encryptSecret` / `decryptSecret` /
  `maskSecret` (AES-256-GCM). **The gateway bearer token and any stored
  credential material must go through these.**
- `apps/server/src/services/audit.ts` — log every credential read, token issue,
  and config change
- `apps/server/src/db.ts` — SQLite persistence
- The existing reverse proxy / domain / Let's Encrypt stack for public exposure

### 4.2 Server work

Create `apps/server/src/services/aiGateway.ts` and
`apps/server/src/routes/aiGateway.ts`.

Register the route module the same way the others are (match how `agents.ts`
and `mcp.ts` are wired in `apps/server/src/app.ts` — read it first).

**Management endpoints** (behind the dashboard's existing session auth):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ai-gateway/status` | enabled, bound host/port, public URL, per-provider credential state (present / expires-at / stale / missing) |
| POST | `/api/ai-gateway/enable` | start the gateway |
| POST | `/api/ai-gateway/disable` | stop it |
| GET | `/api/ai-gateway/providers` | which agent profiles have a usable `cli`-mode login |
| POST | `/api/ai-gateway/providers/:id/refresh` | force a re-harvest / token refresh |
| POST | `/api/ai-gateway/tokens` | mint a consumer bearer token (returns once, store hashed) |
| GET | `/api/ai-gateway/tokens` | list tokens (masked) with last-used |
| DELETE | `/api/ai-gateway/tokens/:id` | revoke |
| GET | `/api/ai-gateway/usage` | request counts, tokens in/out, errors, per-consumer |

**Inference endpoints** (bearer-token auth, NOT session auth — these are what
the apps call):

| Method | Path |
| --- | --- |
| POST | `/v1/chat/completions` (must support `stream: true`) |
| POST | `/v1/messages` |
| GET | `/v1/models` |
| GET | `/health` |

Decide deliberately whether these live on the main Fastify instance under a
path prefix or on a separate port. **Recommendation: separate Fastify instance
on its own port**, so the dashboard's session-auth middleware, CSRF, and rate
limits never apply to machine traffic, and so it can be exposed publicly without
exposing the dashboard. Route it through the existing reverse proxy on its own
hostname.

### 4.3 UI work

Add `apps/web/src/pages/AiGateway.tsx`, following the structure of an existing
page (`Secrets.tsx` is the closest analogue — it handles sensitive values).

Wire it in three places, matching the existing pattern exactly:

1. `apps/web/src/App.tsx` — add a `<Route path="/ai-gateway">` wrapped in
   `<ProtectedRoute>`, alongside the existing routes
2. The sidebar nav in `App.tsx`
3. `apps/web/src/components/CommandPalette.tsx` — add an entry (see the
   `"Secrets & Env"` entry at line ~78 for the shape)

**The tab must show:**

- Master on/off with live status
- Per-provider cards (Claude Code, Codex) — logged in?, which agent profile,
  token expiry countdown, "Refresh now", and a link to the existing agent-profile
  login flow when absent
- The public base URL, with a copy button, plus ready-to-paste env snippets:
  ```
  OPENAI_BASE_URL=https://<host>/v1
  OPENAI_API_KEY=<token>
  ```
- Consumer token management (mint / list masked / revoke / last-used)
- Live request log and usage counters
- A "Test" button that round-trips a trivial completion and shows the raw result

Follow the existing dark/light theming, toast notifications, and modal-confirm
conventions already used across the dashboard. Do not introduce a new UI kit.

---

## 5. Target 2 — standalone repo

**New repo:** `SubGate` (rename freely; keep it consistent once chosen).

```
subgate/
  packages/core/        the framework-free core from §3 — published, reusable
  packages/server/      standalone HTTP server exposing the same /v1 endpoints
  apps/ui/             minimal single-page UI
  docker/              Dockerfile + compose for VPS deploy
  README.md
```

The standalone UI is deliberately small: provider status, token mint/revoke,
base-URL copy, request log, test button. Same feature set as the ServerHoster
tab, no dashboard chrome.

**`packages/core` is the same code the ServerHoster tab imports.** Build this
target second, by extracting — not by copying and diverging. If ServerHoster
ends up with gateway logic that `core` lacks, that is a bug.

---

## 6. Migrating the consumers

Do these one at a time, verifying each before moving on. Start with the
lowest-risk app, not the most important one.

| App | Change |
| --- | --- |
| **MyMetaView** | `backend/services/ai_provider.py` — the `OpenAI()` client already takes a base URL; set `OPENAI_BASE_URL` + `OPENAI_API_KEY` env. Verify its circuit-breaker and retry layers treat SubGate 429s correctly |
| **HaveKongen** | Supabase Edge Functions hardcode `https://api.openai.com/v1/chat/completions` (e.g. `plant-care-chat`, `plant-diagnose`, `daily-briefing`). Replace with an env-driven base URL, set the secret in the Supabase dashboard. **Needs the public URL** |
| **Awaire** | Same pattern, `supabase/functions/ai-interactive/index.ts` + `src/lib/aiProviderSettings.ts` |
| **Gamehub** | Add a preset in `packages/shared/src/proxy-presets.ts` next to the existing `CLIProxyAPI` entry, then select it. Its provider registry needs no structural change |
| **LEADer** | Already harvests locally. Either point it at SubGate, or refactor `src/lib/ai/subscriptions.ts` to import `@subgate/core` and delete the duplicate |

**Keep a real API key configured as fallback in every app.** If the subscription
is throttled or the account is suspended, the app must degrade to the paid API,
not go down. Make the fallback automatic on repeated upstream 401/429.

---

## 7. Security requirements — non-negotiable

- **The harvested token is a live subscription credential.** Never log it, never
  include it in error payloads or crash reports, never return it over any API,
  never send it to the browser. Mask on every surface (`maskSecret` exists).
- **Consumer tokens are not the subscription token.** Mint separate bearer
  tokens per consumer app, store them hashed, support revocation, and record
  last-used. A leaked consumer token must be revocable without touching the
  subscription.
- **Bind the inference server to `127.0.0.1`** and expose it only through the
  reverse proxy with TLS. Never bind `0.0.0.0` directly.
- **Rate limit per consumer token**, and cap concurrency globally — one
  subscription behind five apps will hit upstream limits. Return `429` with
  `Retry-After`; never surface upstream throttling as a `500`.
- **File permissions:** `0600` on anything holding credential material; verify
  the isolated agent homes are not world-readable.
- **Audit** every credential read, token mint, and config change through the
  existing audit service.
- **Prompt content is user data.** Do not log request bodies by default; make it
  opt-in and time-boxed for debugging.

---

## 8. Testing

Match each repo's existing test setup — ServerHoster uses `node:test`
(`apps/server/src/*.test.ts`), Gamehub uses Vitest. Do not introduce a new
runner.

Required coverage:

1. **Harvest** — macOS Keychain path, Linux file path, missing-login path, all
   with injected fakes (no real keychain in tests). Follow the seams in
   Gamehub's `keychain.ts`.
2. **Refresh** — expired token triggers refresh; refresh failure falls back to
   re-reading the local login; permanent failure surfaces a clear
   "reconnect Claude Code" error.
3. **Translation** — OpenAI ⇄ Anthropic round-trip, including tool calls,
   multi-turn, system messages, and streaming deltas.
4. **Streaming** — SSE chunks are well-formed and terminate correctly, including
   on upstream mid-stream error and on client disconnect.
5. **Auth** — inference endpoints reject missing/revoked/malformed tokens;
   management endpoints reject non-session callers.
6. **Never-leak** — assert the subscription token appears in no response body,
   no log line, and no error payload. Write this test first.

**End-to-end before declaring done:** deploy to the VPS over SSH, point one real
consumer at it, and confirm a real completion — streaming and non-streaming, with
at least one tool-calling request. A passing unit suite is not sufficient
evidence that harvest works against a real login.

---

## 9. Known gotchas

- **Anthropic with an OAuth token is not the same as with an API key.** It needs
  `Authorization: Bearer`, the `anthropic-beta` flags, and a `claude-cli/`
  User-Agent. Gamehub's `claude-code-compat.ts` documents exactly why and lists
  them. Getting this wrong produces a `403` at the edge before any auth check.
- **Codex tokens expire and must be refreshed**, with an account id extracted
  from the JWT claims. LEADer's `refreshCodexSubscriptionAuth` and
  `extractAccountId` already do this.
- **ServerHoster's agent homes are isolated.** Harvesting from `~` will silently
  find nothing, or worse, find a different login than the one the dashboard
  shows. Always resolve through `agentHomeForProfile`.
- **On macOS there is no file fallback for Claude Code** — credentials live only
  in the Keychain, which is why `darwinKeychainBootstrap()` exists. On the Linux
  VPS the file path is the only path. Handle both; the VPS is Linux.
- **Model ids differ across the two wires.** Build an explicit mapping table and
  a `/v1/models` response; do not pass consumer model strings through unchanged.
  Verify current model ids against the vendor API rather than assuming.
- **Supabase Edge Functions are remote.** Anything requiring localhost will work
  in dev and fail in production for HaveKongen and Awaire. Test those two against
  the public URL specifically.

---

## 10. Order of work

1. Read every file in §0. Port, don't invent.
2. Build `core/` with harvest + refresh + upstream + translate, fully unit
   tested, no framework imports.
3. Wire it into ServerHoster: service, routes, then the UI tab.
4. Expose publicly via the existing reverse proxy; mint the first consumer token.
5. Migrate one low-risk consumer end-to-end. Verify streaming and tool calls.
6. Migrate the rest one at a time, each with API-key fallback intact.
7. Extract `core/` into the standalone `SubGate` repo with its own minimal UI.

Steps 1–5 deliver the whole value. Step 7 is packaging.

---

## 11. One thing the owner has already accepted

Routing a per-seat developer subscription into application traffic is against
the spirit — and likely the letter — of those subscriptions' terms. This has
been raised and accepted; it is recorded here for the next reader, not to be
re-litigated. The practical consequence is account termination, which is why
**every consumer keeps a working API-key fallback** (§6) and why the gateway must
never become a single point of failure. Build it that way.
