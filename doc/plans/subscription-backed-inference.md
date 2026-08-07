# Subscription-Backed Inference for Web Apps

**Goal:** stop paying per-token API bills in web apps by serving inference from
a developer subscription (Claude Code, Codex/ChatGPT, Cursor) running on a VPS.

**Status:** design. Supersedes the earlier Cursor-CLI-gateway-only draft — see
§1 for why the recommendation changed.

> **Sourcing caveat.** Cursor-side pricing/capability facts come from
> third-party summaries; `cursor.com` was unreachable from the machine this was
> written on (egress proxy block). Items marked **[VERIFY]** need confirming
> against primary sources. Claims about `Papersrrv` and `Gamehub` code were read
> directly and are reliable.

---

## 1. There are two mechanisms, and one is much better

### A. Token harvest → real vendor API ✅ recommended

The CLI tool logs in once and drops a subscription OAuth blob on disk. Your
backend reads that blob and calls the **real vendor API** with it.

- Full-fidelity native tool calls, streaming, structured output — because it
  *is* the vendor's API
- No subprocess per request; plain HTTPS
- No prompt-level emulation, no parsing sentinels out of a text stream
- Works headless on a Linux VPS

### B. CLI wrap → parse stdout ⚠️ fallback only

Spawn the agent CLI per request, pipe a prompt in, parse `stream-json` out, and
re-emit it in OpenAI shape.

- No native tool calls — must be emulated in-prompt (lossy, no parallel calls,
  malformed-JSON retries)
- Process spawn per request; meaningful cold start
- You inherit a *coding agent's* system prompt and priors on every call
- The agent may go exploring a workspace instead of answering

**Only use B when A is impossible.** For Cursor, A *is* impossible — the
subscription talks to Cursor's own backend over a proprietary protocol, not a
public API you can point an OAuth token at. That's the whole reason the Cursor
path is awkward, and it isn't fixable with a better harness.

**Claude Code and Codex both support mechanism A. Cursor does not.**

---

## 2. You already built mechanism A — in Gamehub

`Flyvendedk799/Gamehub` (package name `playforge`) has this working. From
`packages/providers/src/claude/keychain.ts`:

> Claude Code stores its subscription OAuth blob two ways depending on host:
> macOS Keychain service `"Claude Code-credentials"`, or a plaintext file at
> `~/.claude/.credentials.json`. Because Gamehub's API runs on the same machine
> where `claude` is logged in, we read whichever exists, persist the
> `{accessToken, refreshToken, clientId, expiresAt}` into a `ClaudeTokenStore`,
> and keep it fresh by re-reading the local login — **so generation runs on the
> subscription against the REAL Anthropic API, whether the box is a developer's
> Mac or a Linux VPS.**

That is the exact thing being asked for, already implemented and already
VPS-aware. The reusable pieces:

| Concern                                  | File                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| Harvest Claude Code subscription OAuth    | `packages/providers/src/claude/keychain.ts`             |
| Persist / refresh those tokens            | `packages/providers/src/claude/token-store.ts`, `oauth-refresh.ts` |
| Codex / ChatGPT subscription OAuth        | `packages/providers/src/codex/{oauth,oauth-server,token-store,auth-file}.ts` |
| Claude Code identity headers for gateways | `packages/providers/src/claude-code-compat.ts`          |
| Pluggable provider registry + base URLs   | `packages/shared/src/config.ts` (`providers`, `activeProvider`) |
| Gateway presets incl. self-hosted         | `packages/shared/src/proxy-presets.ts`                  |
| Base-URL normalization for custom gateways| `packages/shared/src/base-url.ts`                       |
| Relay-specific retry handling             | `packages/providers/src/retry.ts`                       |

`proxy-presets.ts` already ships presets for OpenAI, Anthropic, Google,
OpenRouter, SiliconFlow, DuckCoding, self-hosted `one-api`, **CLIProxyAPI at
`127.0.0.1:8317`**, and `custom`. `claude-code-compat.ts` exists specifically to
satisfy `sub2api` / `claude2api` / `anyrouter` WAFs that reject anything not
identifying as `claude-cli/`.

**So the socket for a local gateway is already cut.** Anything that speaks the
OpenAI or Anthropic wire on a base URL drops straight in — no architecture
change, roughly a preset entry plus running the process.

---

## 3. Porting to other projects

The reusable core is small and has no Gamehub-specific dependencies:

1. **Credential harvest** — read `~/.claude/.credentials.json` (Linux/VPS) or
   the macOS Keychain entry; same idea for Codex's auth file.
2. **Token store + refresh** — persist, watch expiry, re-read the local login
   when stale.
3. **Wire adapter** — call `api.anthropic.com` with the harvested token and the
   Claude Code identity headers.

Extract those three into a standalone package and every project gets
subscription-backed inference by importing it and setting a base URL. Nothing
below that layer needs to know where the credentials came from.

Prerequisite on each box: `claude` (or `codex`) logged in once, non-interactively
persistable, on the same VPS as the backend.

---

## 4. Where Cursor still fits

Only via mechanism B, and only under one condition.

Cursor moved to **usage-based credit pools priced near upstream API rates** —
each plan includes credits equal to its price (Pro $20→$20, Pro+ $70→$70, Ultra
$200→$400). Paying $20 for $20 of inference at API rates saves nothing.

The one exception: **`auto` mode is reportedly unlimited and does not draw from
the credit pool.** Named models (`opus-4.6`, `gpt-5.3-codex`) bill at full rate.

> **[VERIFY]** — load-bearing. Is `auto` genuinely uncapped? Is sustained
> programmatic traffic acceptable use? Does it stay uncapped on the cheapest
> paid tier?

If you do go this route, don't build the HTTP layer —
[`anyrobert/cursor-api-proxy`](https://github.com/anyrobert/cursor-api-proxy)
already exposes `/v1/chat/completions`, `/v1/messages`, `/v1/responses`,
`/v1/models` with SSE streaming and Bearer auth, backed by the `agent` CLI. It
runs the CLI in an isolated temp workspace by default
(`CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=true`). Register it in `proxy-presets.ts`
exactly like the CLIProxyAPI entry. Its stated limitation is tool calls — that
shim is yours to write. **Audit it before giving it credentials; it is
unvetted third-party code that will hold your Cursor key.**

Headless auth uses `CURSOR_API_KEY` rather than `agent login`, so VPS
deployment is viable. Cursor CLI now supports MCP sharing the editor's config,
but there are community reports that **MCP does not work in `-p` print mode** —
which is what headless serving uses. **[VERIFY]** early; it decides MCP vs.
hand-rolled emulation.

### Gotcha already in Papersrrv

The Cursor adapter and the runners disagree on default model:

- `packages/adapters/cursor-local/src/index.ts:3` → `"auto"` ✅
- `scripts/local-runner.mjs:157` → `"composer-1.5"` ⚠️
- `scripts/local-runner-macos.mjs:117` → `"composer-1.5"` ⚠️

If Composer bills as a named model, the runner path silently burns credits.
Pin `auto` explicitly either way. **[VERIFY]** how Cursor bills its own models.

---

## 5. Risks that apply to every option here

- **Terms of service.** Every mechanism on this page routes a per-seat
  developer subscription into application traffic. This is the accepted,
  understood risk of the approach — noted once, not re-argued. Consequence if
  enforced is account termination, so keep a real API key configured as a
  fallback path and never make a subscription the single point of failure.
- **Concurrency.** One subscription behind N users. Queue and hard-cap
  concurrency; treat rate-limit errors as first-class responses, not 500s.
- **Credential blast radius.** The harvested token is a live subscription
  credential sitting on the VPS. Lock down file permissions, keep it out of
  logs and error payloads, and don't ship it to the browser.
- **Sandboxing (mechanism B only).** The runner passes `--yolo` (commit
  `62eeb31`), granting shell and filesystem access with no approval prompts.
  Piping untrusted user text into that is a prompt-injection-to-RCE path. Keep
  the chat-only workspace default, containerize, non-root, read-only rootfs,
  restricted egress, bind `127.0.0.1` behind your own auth.

---

## 6. Order of work

1. Extract Gamehub's harvest + token-store + wire-adapter trio into a
   standalone package. **This is the main event** — it unlocks Claude Code and
   Codex subscriptions across every project, at full API fidelity.
2. Point one low-risk workload at it. Measure quality and latency against what
   it replaced.
3. Only if Cursor specifically is still wanted: verify `auto` is uncapped
   (§4), then deploy `cursor-api-proxy` as a preset and write the tool shim.

Step 1 delivers most of the value and carries none of Cursor's emulation
penalty. Step 3 is optional and strictly worse — do it only if the Cursor
subscription is one you're already paying for and want to drain.

---

## Appendix — reusable from Papersrrv (mechanism B only)

| What                                   | Where                                                          |
| -------------------------------------- | -------------------------------------------------------------- |
| `stream-json` → structured events      | `packages/adapters/cursor-local/src/server/parse.ts`             |
| CLI args + stdin piping                | `packages/adapters/cursor-local/src/server/execute.ts:345-353`   |
| Stream line normalization              | `packages/adapters/cursor-local/src/shared/stream.ts`            |
| Native (non-WSL) spawn + workspace mgmt| `scripts/local-runner-macos.mjs`                                 |

`local-runner-macos.mjs` was checked for Darwin-specific code (`darwin`,
`/opt/homebrew`, `~/Library`, `osascript`) and has **none** — it is already
POSIX-portable and should run on a Linux VPS unmodified.

There is no OpenAI/Anthropic-compatible HTTP surface anywhere in Papersrrv;
`openclaw-gateway` is a WebSocket *client* to a different agent system.
