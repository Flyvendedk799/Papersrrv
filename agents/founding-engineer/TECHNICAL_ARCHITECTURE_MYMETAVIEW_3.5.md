# Technical Architecture for 10x Generation Quality — MyMetaView 3.5

**Issue:** AIL-97  
**Parent:** AIL-96 (COO grand plan)  
**Author:** Founding Engineer  
**Date:** 2026-03-10  
**Reference:** `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md` §4

---

## 1. Model Selection

### 1.1 Current State

| Component | Model | Location |
|-----------|-------|----------|
| Layout + reasoning (Stage 1–3) | `gpt-4o` | `preview_reasoning.py` |
| Layout + reasoning (Stage 4–6) | `gpt-4o` | `preview_reasoning.py` |
| Brand extraction (vision) | `gpt-4o` | `preview_engine.py`, `brand_extractor.py` |
| UI element extraction | `gpt-4o` | `ui_element_extractor.py` |
| Quality critic | `gpt-4o` | `quality_critic.py` |
| Value prop extractor | `gpt-4o-mini` | `value_prop_extractor.py` |
| UX intelligence | `gpt-4o` | `ux_intelligence.py` |
| Preview reconstruction | `gpt-4o` | `preview_reconstruction.py` |
| Multi-modal fusion | `gpt-4o` | `multi_modal_fusion.py` |

### 1.2 Recommendation for 10x Quality

| Use Case | Primary Model | Fallback | Rationale |
|----------|---------------|----------|-----------|
| **Layout + reasoning** | `gpt-4o` | `gpt-4o-mini` | Vision + structured output; 4o best for layout/design reasoning. Keep 4o for quality bar. |
| **Brand extraction** | `gpt-4o` | — | Vision-heavy; color/logo extraction needs strong visual understanding. |
| **Quality critic / iteration** | `gpt-4o` | — | Subjective quality; 4o aligns best with human judgment. |
| **Value prop / lightweight** | `gpt-4o-mini` | — | Cost-sensitive; already in use. |

**Cost/latency tradeoffs (per 1M tokens, approximate):**

| Model | Input ($/1M) | Output ($/1M) | Latency | Use |
|-------|--------------|---------------|---------|-----|
| gpt-4o | $2.50 | $10.00 | ~2–5s | Layout, reasoning, brand, critic |
| gpt-4o-mini | $0.15 | $0.60 | ~0.5–2s | Value prop, fallbacks |

**Recommendation:** Keep `gpt-4o` for layout, reasoning, and brand extraction. Do **not** downgrade to 4o-mini for quality-critical paths. For 10x improvement, focus on prompts and caching rather than model swap.

**Optional future:** Evaluate Claude 3.5 Sonnet / Opus for layout reasoning if OpenAI rate limits or quality plateaus; requires adapter layer.

---

## 2. Prompt Library

### 2.1 Current State

- Prompts are inline in `preview_reasoning.py`, `preview_engine.py`, and related services.
- No centralized prompt registry or versioning.
- Output schema enforced via Pydantic; JSON parsing can fail on malformed responses.

### 2.2 Target: Structured Prompt Library

**Location:** `backend/prompts/` (new)

**Structure:**

```
backend/prompts/
├── layout_reasoning/
│   ├── system_layout_stage1.txt
│   ├── system_layout_stage4.txt
│   └── few_shot_examples.json
├── brand_extraction/
│   └── system_brand.txt
├── quality_critic/
│   └── system_critic.txt
└── schemas/
    ├── layout_blueprint.json
    └── reasoning_output.json
```

### 2.3 LayoutBlueprint Output Schema

```json
{
  "template_type": "string (article|hero|product|landing)",
  "primary_color": "#RRGGBB",
  "secondary_color": "#RRGGBB",
  "accent_color": "#RRGGBB",
  "coherence_score": 0.0-1.0,
  "balance_score": 0.0-1.0,
  "clarity_score": 0.0-1.0,
  "design_fidelity_score": 0.0-1.0,
  "overall_quality": "string (good|excellent|needs_work)",
  "layout_reasoning": "string",
  "composition_notes": "string"
}
```

### 2.4 Reasoning Output Schema (Stage 1–3)

```json
{
  "primary_headline": "string",
  "value_statement": "string",
  "credibility_signals": "string",
  "page_type": "string",
  "design_dna": { "style", "mood", "formality", "typography_personality", "color_emotion", "spacing_feel", "brand_adjectives", "design_reasoning" },
  "analysis_confidence": 0.0-1.0
}
```

### 2.5 Prompt Principles

1. **System prompts:** Explicit role, output format, and constraints.
2. **Few-shot examples:** 2–3 examples per layout type (article, hero, product).
3. **Structured output:** Request JSON with schema; validate and retry on parse failure.
4. **Fallback:** On malformed JSON, use graceful degradation (default values, retry once).

---

## 3. Caching Design

### 3.1 Current State

- **Cache key:** `demo:preview:v3:{quality_mode}:` + MD5(normalized_url)
- **Storage:** Redis (`REDIS_URL`)
- **TTL:** `CacheConfig.DEFAULT_TTL_HOURS` (24h)
- **Prefixes:** `demo:preview:`, `demo:preview:v2:`, `demo:preview:v3:{mode}:`, `preview:focus:`, `preview:analysis:`, etc.
- **Sync route** (`/demo-v2/preview`): Hardcoded `ultra` in cache key — does not use `quality_mode` from request.
- **Async job** (`/demo-v2/jobs`): Uses `quality_mode` in cache key.

### 3.2 Target: Unified Cache Design

| Dimension | Spec |
|-----------|------|
| **Cache key** | `demo:preview:v4:{quality_mode}:{normalized_url_hash}` |
| **Quality mode** | `fast`, `balanced`, `ultra`, or `auto` (resolved via `demo_quality_profiles.resolve_quality_mode`) |
| **URL normalization** | Use `normalize_url_for_cache(url)` — strip fragment, lowercase scheme/host, sort query params |
| **TTL** | 24h default; configurable per mode (e.g. `ultra` 48h, `fast` 12h) |
| **Invalidation** | On URL change (implicit via key); manual `invalidate_cache(url)` clears all prefixes for URL |
| **Storage** | Redis (primary); fallback to in-memory only if Redis unavailable (no persistence) |

### 3.3 Cache Key Format

```
demo:preview:v4:{fast|balanced|ultra}:{md5(normalized_url)}
```

### 3.4 Invalidation Rules

1. **URL change:** New URL → new key → cache miss (no action).
2. **Manual invalidation:** `invalidate_cache(url)` deletes all keys for that URL across prefixes.
3. **Admin toggle:** `admin:settings:demo_cache_disabled` = true → skip cache read/write; invalidate on write path.

### 3.5 Sync Route Fix

**Current bug:** Sync `/demo-v2/preview` always uses `ultra` in cache key. It does not accept `quality_mode` in request.

**Fix:** Add optional `quality_mode` to `DemoPreviewRequest`; use `get_cache_prefix_for_mode(quality_mode, url)` from `demo_quality_profiles.py` for cache key.

---

## 4. Robustness Fixes

### 4.1 preview_reasoning.py — Null-Safety

**Issue (QA AIL-75):** `TypeError` when `extracted_highlights` values are `None` (malformed JSON fallback path).

**Location:** ~line 830 (or equivalent in fallback path).

**Fix (already applied per QA):** Guard with `(val or "none")` before any slicing or string ops:

```python
hook_val = extracted_highlights.get("the_hook") or "none"
proof_val = extracted_highlights.get("social_proof_found") or "none"
# Use str(hook_val)[:50] only after ensuring non-None
```

**Additional hardening:**

1. **JSON parse fallback:** Wrap `json.loads` in try/except; on failure, return structured default (e.g. `{"primary_headline": None, "credibility_signals": None, ...}`) and set `analysis_confidence=0.3`.
2. **Confidence scoring:** Emit `reasoning_confidence` from 0–1 based on parse success and field completeness.
3. **Retry:** On first parse failure, retry once with simplified prompt ("Return valid JSON only").

### 4.2 Brand Extractor API Alignment

**Issue (QA AIL-75, AIL-88):** Tests expected `extract_brand_colors(html, url, screenshot)` with 3 args; API is `extract_brand_colors(html_content, screenshot_bytes)` with 2 args. Return keys: `primary_color`, `secondary_color`, `accent_color` (not `primary`/`secondary`).

**Status:** Tests updated per QA. Ensure all call sites use:

- **Signature:** `extract_brand_colors(html_content: str, screenshot_bytes: Optional[bytes] = None) -> Dict[str, str]`
- **Return keys:** `primary_color`, `secondary_color`, `accent_color`

**Audit:** Grep for `extract_brand_colors` and `primary`/`secondary` (without `_color`) to catch drift.

---

## 5. Quality Profile Spec

### 5.1 Profiles (from demo_quality_profiles.py)

| Profile | multi_agent | ui_extraction | threshold | iterations | allow_soft_pass | enforce_target_quality |
|---------|-------------|---------------|-----------|------------|-----------------|------------------------|
| **fast** | false | false | 0.78 | 2 | true | false |
| **balanced** | true | true | 0.82 | 3 | true | false |
| **ultra** | true | true | 0.88 | 4 | false | true |

### 5.2 Behavior Summary

| Profile | When to Use | Latency | Quality | Cost |
|---------|-------------|---------|---------|------|
| **fast** | Simple pages (home, about); low URL complexity (score &lt; 4) | ~5–15s | Good for simple layouts | Low |
| **balanced** | Medium complexity (pricing, features); score 4–7 | ~15–30s | Good balance | Medium |
| **ultra** | Complex pages (product, docs, blog); score ≥ 8 | ~30–60s | Best quality; no soft pass | High |

### 5.3 Auto Mode

`resolve_quality_mode("auto", url)` uses `estimate_url_complexity(url)`:

- Score &lt; 4 → `fast`
- Score 4–7 → `balanced`
- Score ≥ 8 → `ultra`

### 5.4 Guarantees

- **ultra** = strictest path: `enforce_target_quality=True`, `allow_soft_pass=False`, 4 iterations.
- **fast** = fastest path: single-agent, no UI extraction, 2 iterations, soft pass allowed.

---

## 6. Implementation Order (from COO Plan)

1. **Robustness fixes** (unblock QA) — preview_reasoning null-safety, brand extractor audit.
2. **Model + prompt upgrades** — Centralize prompts; add few-shot; enforce schema.
3. **Caching layer** — Unified cache key (URL + quality_mode); fix sync route.
4. **Quality profile tuning** — Document; ensure `ultra` = best path.

---

## 7. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- `agents/tmp-preview-check-20260308185629/backend/services/demo_quality_profiles.py`
- `agents/tmp-preview-check-20260308185629/backend/services/preview_reasoning.py`
- `agents/tmp-preview-check-20260308185629/backend/services/preview_cache.py`
- `agents/qa-automation-engineer/QA_REPORT_AIL75.md`, `QA_REPORT_AIL88.md`
