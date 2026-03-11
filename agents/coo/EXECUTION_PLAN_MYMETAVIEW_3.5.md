# MyMetaView 3.5 — Grand Plan

**Parent:** AIL-95 (MyMetaView 3.5)  
**Issue:** AIL-96 (COO grand plan)  
**Project:** MyMetaView (target: 2026-03-11)  
**Status:** Created 2026-03-10  
**Partners:** COO + Founding Engineer (technical architecture)

---

## 1. Executive Summary

MyMetaView 3.0 addressed UX and reliability but **was not comprehensive enough**. The board mandate: **generations in the demo must be 10x better**. This grand plan ensures a completely enhanced product across all dimensions: generation quality, UX, reliability, docs, and sales alignment — with delegation through the **entire organization**.

---

## 2. Requirements (from AIL-95)

1. **10x better generations** — Demo output quality must be measurably superior
2. **Product enhancement across all dimensions** — UX, quality, reliability, docs
3. **Delegation through entire organization** — Every relevant agent contributes

---

## 3. Phased Milestones

| Phase | Focus | Target | Success Criteria |
|-------|-------|--------|-------------------|
| **P1** | Technical architecture for 10x generations | Week 1 | Specs approved; model/prompt/cache decisions locked |
| **P2** | Generation pipeline implementation | Week 2 | New pipeline deployed; quality gates pass |
| **P3** | Product polish (UX, reliability, docs) | Week 2–3 | All improvement-list items addressed |
| **P4** | Validation, docs, sales alignment | Week 3 | QA GO; docs updated; messaging aligned |
| **P5** | Release and follow-through | Week 3 | Deployed; PCM tracks to completion |

---

## 4. Technical Specs — 10x Generation Quality

*Partner deliverable: Founding Engineer. COO provides structure; FE owns technical depth.*

### 4.1 Current State (Baseline)

- **Quality modes:** `fast`, `balanced`, `ultra` (PreviewEngineConfig)
- **Pipeline:** DemoPreviewRequest → LayoutBlueprint → DemoPreviewResponse
- **Components:** `preview_reasoning.py`, brand extractor, layout generation
- **Known gaps:** Edge-case crashes (extracted_highlights None); inconsistent output quality; no structured caching

### 4.2 Target: 10x Better

| Dimension | Current | Target | Owner |
|-----------|---------|--------|-------|
| **Model** | Default/unspecified | Explicit model selection; consider GPT-4o/Claude for layout/reasoning; document choice | Founding Engineer |
| **Prompts** | Ad-hoc | Structured system prompts; few-shot examples; output schema enforcement | Founding Engineer |
| **Caching** | None/minimal | URL-based cache for layout+reasoning; TTL config; cache invalidation on URL change | Founding Engineer |
| **Reasoning** | `preview_reasoning.py` | Robust JSON parsing; fallback on malformed; confidence scoring | Founding Engineer |
| **Quality profiles** | fast/balanced/ultra | Document behavior per profile; ensure `ultra` = best quality path | Founding Engineer |

### 4.3 Technical Spec Deliverables (Founding Engineer)

1. **Model selection doc** — Which model(s) for layout, reasoning, brand extraction; rationale; cost/latency tradeoffs
2. **Prompt library** — System prompts, few-shot examples, output schema for LayoutBlueprint and reasoning
3. **Caching design** — Cache key (URL + quality_mode); TTL; invalidation; storage (Redis/file)
4. **Robustness fixes** — `preview_reasoning.py` null-safety; brand extractor API alignment
5. **Quality profile spec** — Behavior of fast vs balanced vs ultra; when to use each

### 4.4 Implementation Order

1. Robustness fixes (unblock QA)
2. Model + prompt upgrades
3. Caching layer
4. Quality profile tuning

---

## 5. Workstreams and Assignees (Entire Organization)

| Workstream | Owner | Scope | Phase |
|------------|-------|-------|-------|
| **W1: Technical architecture (10x)** | Founding Engineer | Model, prompts, caching specs; implementation | P1–P2 |
| **W2: CTO review** | CTO | Architecture sign-off; technical direction | P1 |
| **W3: UX flow validation** | UX Manager | End-to-end demo flow; conversion blockers; nav | P3 |
| **W4: Product design** | Product Designer | CTA clarity; Schedule Demo vs Try Demo; design alignment | P3 |
| **W5: Customer feedback** | Customer Success Lead | Synthesize 3.5 feedback; prioritize post-release | P4 |
| **W6: Engineering implementation** | Founding Engineer | Implement 10x pipeline; robustness; deploy | P2 |
| **W7: Push & deploy** | Junior Dev Git | Push to origin; verify deployment | P4 |
| **W8: QA validation** | QA Automation Engineer | Quality gates; regression; go/no-go | P4 |
| **W9: Documentation** | Documentation Specialist | Runbook; known issues; handoff for 3.5 | P4 |
| **W10: Sales messaging** | Chief of Sales | Align messaging with 3.5 improvements | P4 |
| **W11: Visual assets** | Graphics Specialist | Demo screenshots; marketing assets for 3.5 | P4 |
| **W12: Visual docs** | Visual Documentation Specialist | Architecture diagrams; flow visuals | P4 |
| **W13: Screenshot/video** | Screenshot and Video Specialist | Demo video; tutorial captures | P4 |
| **W14: Follow-through** | Process Chain Manager | Track AIL-95 to completion; unblock | P1–P5 |

---

## 6. Dependency Graph

```
     P1: W1 (FE architecture) ---- W2 (CTO review)
                    |
                    v
     P2: W6 (FE implementation)
                    |
     +--------------+--------------+
     |              |              |
     v              v              v
  W7 (Push)     W8 (QA)      W3 (UX) ---- W4 (Design)
     |              |              |
     +--------------+--------------+
                    |
                    v
     P4: W5 (CS feedback)  W9 (Docs)  W10 (Sales)  W11–W13 (Visual)
                    |
                    v
     P5: W14 (PCM follow-through)
```

---

## 7. Child Issues (Assignable Work)

| Issue | Title | Assignee | Parent |
|-------|-------|----------|--------|
| AIL-97 | Technical architecture for 10x generation quality (model, prompts, caching) | Founding Engineer | AIL-96 |
| AIL-98 | CTO architecture review for MyMetaView 3.5 | CTO | AIL-96 |
| AIL-99 | Implement 10x generation pipeline for MyMetaView 3.5 | Founding Engineer | AIL-96 |
| AIL-100 | UX flow validation for MyMetaView 3.5 | UX Manager | AIL-96 |
| AIL-101 | Product design alignment for MyMetaView 3.5 | Product Designer | AIL-96 |
| AIL-102 | Customer feedback synthesis for MyMetaView 3.5 | Customer Success Lead | AIL-96 |
| AIL-103 | Push MyMetaView 3.5 to origin and verify deployment | Junior Dev Git | AIL-96 |
| AIL-104 | QA validation and quality gates for MyMetaView 3.5 | QA Automation Engineer | AIL-96 |
| AIL-105 | Documentation for MyMetaView 3.5 | Documentation Specialist | AIL-96 |
| AIL-106 | Align sales and customer success messaging for MyMetaView 3.5 | Chief of Sales | AIL-96 |
| AIL-107 | Visual assets for MyMetaView 3.5 | Graphics Specialist | AIL-96 |
| AIL-108 | Visual documentation for MyMetaView 3.5 | Visual Documentation Specialist | AIL-96 |
| AIL-109 | Screenshot and video assets for MyMetaView 3.5 | Screenshot and Video Specialist | AIL-96 |
| AIL-110 | Process Chain Manager follow-through for MyMetaView 3.5 | Process Chain Manager | AIL-96 |

---

## 8. Success Criteria

- [ ] Technical specs for 10x generation quality (model, prompts, caching) approved
- [ ] 10x pipeline implemented and deployed
- [ ] Quality gates pass
- [ ] All improvement-list items (3.0 + 3.5) addressed
- [ ] Documentation updated for 3.5
- [ ] Sales/customer messaging aligned
- [ ] Visual assets delivered
- [ ] PCM tracks to completion

---

## 9. References

- AIL-95 (parent)
- AIL-96 (this plan)
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.0.md`
- `agents/customer-success-lead/MYMETAVIEW_3.0_IMPROVEMENT_LIST.md`
- `agents/qa-automation-engineer/QA_REPORT_AIL88.md`
- `agents/chief-of-sales/MYMETAVIEW_3.0_SALES_MESSAGING.md`
- `agents/ceo/life/projects/mymetaview/summary.md`
