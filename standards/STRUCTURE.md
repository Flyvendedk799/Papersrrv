# Employee Standards Handbook — Structure (Locked)

**Status:** Locked (first integration = final)  
**Approved:** 2026-03-09  
**Source:** [AIL-52](/AIL/issues/AIL-52) Phase 0

This document defines the handbook-as-project-structure layout. No implementation of content until this structure is approved by the board. Once approved, Phases 1–6 implement content into these files.

---

## 1. File Layout

```
standards/
├── STRUCTURE.md    # This file — layout definition and cross-reference rules
├── global.md       # Applies to all agents
├── hiring.md       # Hiring rules, approval flow; references approval-flow
├── engineering.md  # PR conventions, coding standards; references PR conventions
└── secrets.md      # Company-secrets config, credentials; references company-secrets
```

---

## 2. File Purposes

| File | Scope | Key References |
|------|-------|----------------|
| `standards/global.md` | All agents | — |
| `standards/hiring.md` | HR Manager, CEO, board | Approval flow (Paperclip approvals API, hire_agent type) |
| `standards/engineering.md` | Engineers, Founding Engineer | PR conventions, doc/DEVELOPING.md |
| `standards/secrets.md` | All agents (credentials handling) | Company secrets config, adapter env vars |

---

## 3. Cross-Reference Rules

1. **Single source of truth per topic.** Each file owns its domain. Do not duplicate rules across files.
2. **Reference, don't repeat.** When a rule in file A depends on a concept in file B, use a markdown link: `See [secrets.md](secrets.md) for credentials handling.`
3. **Global overrides.** `global.md` defines rules that apply to all agents. Role-specific files extend or specialize; they never contradict global.
4. **Load order.** Agents should load in order: `global.md` first, then role-relevant files (hiring, engineering, secrets as needed).
5. **No circular refs.** Dependencies flow: global → hiring | engineering | secrets. No file references another that references it.

---

## 4. Integration Points (Platform References)

- **Approval flow:** Paperclip `approvals` API, `hire_agent` approval type. See `doc/plans/ceo-agent-creation-and-hiring.md`, `doc/spec/ui.md` §11.
- **PR conventions:** `doc/DEVELOPING.md`, `AGENTS.md` §5–7.
- **Company secrets:** Paperclip company secrets + adapter config resolution. See `doc/SPEC-implementation.md`, adapter config schema.

---

## 5. Phase Dependencies

| Phase | Depends On | Creates/Updates |
|-------|------------|------------------|
| 0 | — | This STRUCTURE.md (layout lock) |
| 1 | Phase 0 | Inventory only; no new files |
| 2 | Phase 0, 1 | Taxonomy mapping into this structure |
| 3–5 | Phase 0, 2 | Content in hiring.md, engineering.md, secrets.md |
| 6 | Phase 0–5 | Hire for ownership; no structure change |

---

## 6. Amendment Process

To change this structure after first integration:

1. Propose change via issue under [AIL-52](/AIL/issues/AIL-52).
2. Board approval required (structure is "first integration = final").
3. Update this document and any affected Phase 2+ content in a single change.
