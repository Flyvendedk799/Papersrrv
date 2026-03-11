# Secrets and Credentials

**Scope:** All agents (credentials handling)  
**Source:** [AIL-52](/AIL/issues/AIL-52) Phase 5 via [AIL-62](/AIL/issues/AIL-62)  
**References:** [STRUCTURE.md](STRUCTURE.md), `doc/SPEC-implementation.md` §7.12, `doc/DEVELOPING.md` (Secrets in Dev), `doc/DATABASE.md` (Secret storage)

---

## 1. Overview

Paperclip stores secrets at the **company** level. Agents receive credentials through their adapter config at runtime. Secret values are never persisted inline in agent config; only references are stored.

---

## 2. Company Secrets Model

- **Scope:** Company-scoped. All secrets belong to a company (`company_secrets.company_id`).
- **Storage:** Secret metadata in `company_secrets`; encrypted material in `company_secret_versions`.
- **Providers:** `local_encrypted`, `aws_secrets_manager`, `gcp_secret_manager`, `vault`.
- **Access:** Agents receive resolved values only when their adapter config references a secret. The board controls which agents get which config.

**V1 behavior:** No role-specific secret scoping. Any agent in a company can be configured (by the board) to use any company secret. Access control is via who edits agent config, not via per-role secret grants. If role-specific scoping is needed in future, it would require schema and runtime changes.

---

## 3. Adapter Config and Env Bindings

Agent `adapterConfig.env` defines environment variables injected at heartbeat runtime. Each key can be:

| Binding type | Format | Use |
|--------------|--------|-----|
| Plain | `"value"` or `{ type: "plain", value: "..." }` | Non-sensitive values |
| Secret ref | `{ type: "secret_ref", secretId: "...", version?: number \| "latest" }` | Sensitive values (API keys, tokens, etc.) |

**Rules:**

- Sensitive keys (e.g. `*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`) should use `secret_ref` in production.
- With `PAPERCLIP_SECRETS_STRICT_MODE=true`, sensitive keys must use secret refs; inline plain values are rejected.
- Never persist raw secret values in adapter config. Use secret refs.

---

## 4. Resolution Flow

1. **Persistence:** When saving agent config, `adapterConfig.env` is normalized. Plain values for sensitive keys may be rejected in strict mode. Secret refs are validated against company secrets.
2. **Runtime:** At heartbeat, `resolveAdapterConfigForRuntime` resolves each `secret_ref` to its value. Resolved values are injected as env vars for the agent process.
3. **Redaction:** Secret values are redacted from logs, activity payloads, and API responses.

---

## 5. Local Development

- **Default:** `local_encrypted` provider; key at `~/.paperclip/instances/default/secrets/master.key`.
- **Override key:** `PAPERCLIP_SECRETS_MASTER_KEY` or `PAPERCLIP_SECRETS_MASTER_KEY_FILE`.
- **Strict mode:** `PAPERCLIP_SECRETS_STRICT_MODE=true` — requires secret refs for sensitive keys.
- **Config:** `pnpm paperclipai configure --section secrets`; `pnpm paperclipai doctor --repair` to create missing key.

**Migration from inline env:**

```sh
pnpm secrets:migrate-inline-env         # dry run
pnpm secrets:migrate-inline-env --apply # apply migration
```

---

## 6. Common Credentials

| Credential | Typical use | Guidance |
|------------|-------------|----------|
| Git PAT | Clone private repos, push | Store as company secret; reference in adapter `env.GITHUB_TOKEN` or similar |
| API keys (OpenAI, Anthropic, etc.) | Model access | Use secret refs; never inline in config |
| `PAPERCLIP_API_KEY` | Agent auth | Injected by runner; do not store in agent config |
| Database URLs | Migrations, dev | Use `DATABASE_URL` env or secret ref; never commit |

---

## 7. Never Put Secrets in Issues or Comments

**Rule:** Never paste credentials, API keys, tokens, or passwords into issue titles, descriptions, or comments.

- **Why:** Issues and comments are persisted, visible to multiple actors, and may be logged or exported. Plaintext secrets in issues create a security incident.
- **If a secret was pasted:** Treat it as compromised. Rotate or revoke it immediately. Do not copy or reuse it.
- **Correct workflow:** Use company secrets (see §8 Credential Distribution Workflow) and reference them in adapter config. For credential distribution requests, create an issue that *describes* the need (e.g. "Key developers need Git PAT access") and instruct the board to create the secret and wire it to the relevant agents.

---

## 8. Credential Distribution Workflow (Git PAT and Similar)

When developers or agents need credentials (e.g. Git PAT for push access):

1. **Board creates company secret** — `POST /api/companies/{companyId}/secrets` with `name` (e.g. `GITHUB_TOKEN`), `value`, and optional `description`.
2. **Board wires secret to agents** — In agent adapter config, add `env.GITHUB_TOKEN` (or equivalent) as `{ type: "secret_ref", secretId: "…" }`.
3. **Agents receive at runtime** — Resolved value is injected as env var; never persisted in config.
4. **Never** — Paste the token in an issue, comment, or any non-secret storage.

**Agents that typically need Git PAT (`GITHUB_TOKEN`):** Any agent whose work includes pushing to git (clone private repos, push commits, create branches). Common roles: Junior Dev Git, Founding Engineer, Senior Product Engineer, Backend/Frontend engineers who deploy. When a push-related task is blocked on credentials, wire the secret to the assigned agent. Check project execution plans and delegation chains for agents doing push/deploy work.

---

## 9. Safety Rules (All Agents)

- **Never exfiltrate secrets or private data.** Do not log, copy, or transmit secret values.
- **No destructive commands unless explicitly authorized** by manager or board.
- When proposing agent config changes that add credentials, use secret refs. Do not request inline plain values for sensitive keys.

---

## 10. Platform References

- **Company secrets API:** Create/list/rotate secrets per company.
- **Adapter config schema:** `adapterConfig.env` — see `packages/shared` types (`EnvBinding`, `AgentEnvConfig`).
- **Secret service:** `server/src/services/secrets.ts` — normalization, resolution, provider registry.

---

*End of secrets standards. See [STRUCTURE.md](STRUCTURE.md) for file layout and cross-references.*
