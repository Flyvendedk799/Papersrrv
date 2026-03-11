# MyMetaView 3.5 — Visual Documentation

**Issue:** AIL-108  
**Parent:** AIL-96 (MyMetaView 3.5 grand plan)  
**Author:** Visual Documentation Specialist  
**Date:** 2026-03-10  
**References:** `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md`, `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`

---

## 1. System Architecture — 10x Generation Pipeline

High-level component view of the MyMetaView 3.5 preview generation system.

```mermaid
flowchart TB
    subgraph Input
        URL[URL Input]
        QM[Quality Mode<br/>fast / balanced / ultra / auto]
    end

    subgraph Cache["Cache Layer (Redis)"]
        CK[Cache Key<br/>demo:preview:v4:{mode}:{url_hash}]
        HIT[Cache Hit?]
    end

    subgraph Pipeline["Generation Pipeline"]
        REASON[preview_reasoning.py<br/>Layout + Reasoning Stages 1-6]
        BRAND[brand_extractor.py<br/>Brand Colors]
        UI[ui_element_extractor.py]
        CRITIC[quality_critic.py]
        RECON[preview_reconstruction.py]
    end

    subgraph Models["LLM Models"]
        GPT4O[gpt-4o<br/>Layout, Brand, Critic]
        GPT4OMINI[gpt-4o-mini<br/>Value Prop, Fallbacks]
    end

    subgraph Output
        RESP[DemoPreviewResponse<br/>LayoutBlueprint + Meta Image]
    end

    URL --> CK
    QM --> CK
    CK --> HIT
    HIT -->|Miss| REASON
    HIT -->|Hit| RESP
    REASON --> BRAND
    BRAND --> UI
    UI --> CRITIC
    CRITIC --> RECON
    RECON --> RESP
    REASON -.-> GPT4O
    BRAND -.-> GPT4O
    CRITIC -.-> GPT4O
    REASON -.-> GPT4OMINI
```

---

## 2. Preview Generation Flow — End-to-End

Request-to-response flow with quality profile and cache integration.

```mermaid
flowchart LR
    subgraph Request
        R1[DemoPreviewRequest]
        R2[URL + quality_mode]
    end

    subgraph Resolve
        AUTO[resolve_quality_mode<br/>auto → fast/balanced/ultra]
        NORM[normalize_url_for_cache]
        HASH[MD5 hash]
    end

    subgraph CacheCheck
        KEY[Cache Key<br/>demo:preview:v4:{mode}:{hash}]
        REDIS[(Redis)]
    end

    subgraph Stages["Reasoning Stages"]
        S1[Stage 1-3<br/>Layout, Design DNA]
        S2[Stage 4-6<br/>Blueprint, Composition]
        S3[Brand + UI Extract]
        S4[Quality Critic<br/>Iterate if needed]
    end

    subgraph Response
        OUT[DemoPreviewResponse]
    end

    R1 --> R2
    R2 --> AUTO
    R2 --> NORM
    NORM --> HASH
    AUTO --> KEY
    HASH --> KEY
    KEY --> REDIS
    REDIS -->|Hit| OUT
    REDIS -->|Miss| S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> OUT
```

---

## 3. Quality Profile Decision Flow

How `auto` mode resolves to `fast`, `balanced`, or `ultra` based on URL complexity.

```mermaid
flowchart TD
    START[quality_mode = auto]
    EST[estimate_url_complexity]
    SCORE{Complexity<br/>Score?}

    START --> EST
    EST --> SCORE

    SCORE -->|Score < 4| FAST[fast<br/>Simple pages<br/>~5-15s]
    SCORE -->|4 ≤ Score < 8| BAL[balanced<br/>Medium complexity<br/>~15-30s]
    SCORE -->|Score ≥ 8| ULTRA[ultra<br/>Complex pages<br/>~30-60s]

    subgraph ProfileSpec["Profile Spec"]
        direction TB
        F[fast: single-agent, 2 iter, soft pass]
        B[balanced: multi-agent, 3 iter, UI extract]
        U[ultra: multi-agent, 4 iter, no soft pass]
    end
```

---

## 4. Quality Profile Comparison

| Profile | Multi-Agent | UI Extraction | Threshold | Iterations | Soft Pass | Use Case |
|---------|:-----------:|:-------------:|:---------:|:----------:|:---------:|----------|
| **fast** | No | No | 0.78 | 2 | Yes | Home, about; low complexity |
| **balanced** | Yes | Yes | 0.82 | 3 | Yes | Pricing, features; medium |
| **ultra** | Yes | Yes | 0.88 | 4 | No | Product, docs; high complexity |

---

## 5. Grand Plan Dependency Graph (AIL-96)

Workstream dependencies from the MyMetaView 3.5 execution plan.

```mermaid
flowchart TD
    subgraph P1["Phase 1"]
        W1[W1: FE Architecture]
        W2[W2: CTO Review]
    end

    subgraph P2["Phase 2"]
        W6[W6: FE Implementation]
    end

    subgraph P3["Phase 3"]
        W3[W3: UX Validation]
        W4[W4: Product Design]
    end

    subgraph P4["Phase 4"]
        W7[W7: Push & Deploy]
        W8[W8: QA Validation]
        W5[W5: CS Feedback]
        W9[W9: Documentation]
        W10[W10: Sales Messaging]
        W11[W11: Visual Assets]
        W12[W12: Visual Docs]
        W13[W13: Screenshot/Video]
    end

    subgraph P5["Phase 5"]
        W14[W14: PCM Follow-through]
    end

    W1 --> W2
    W2 --> W6
    W6 --> W7
    W6 --> W8
    W6 --> W3
    W3 --> W4
    W7 --> W5
    W8 --> W5
    W4 --> W5
    W5 --> W9
    W5 --> W10
    W5 --> W11
    W5 --> W12
    W5 --> W13
    W9 --> W14
    W10 --> W14
    W11 --> W14
    W12 --> W14
    W13 --> W14
```

---

## 6. Model Usage Map

Which models power which components (from technical architecture).

```mermaid
flowchart LR
    subgraph GPT4O["gpt-4o (quality-critical)"]
        LAYOUT[Layout + Reasoning]
        BRAND[Brand Extraction]
        UI_EX[UI Element Extract]
        CRITIC[Quality Critic]
        RECON[Preview Reconstruction]
        FUSION[Multi-modal Fusion]
    end

    subgraph GPT4OMINI["gpt-4o-mini (cost-sensitive)"]
        VP[Value Prop Extractor]
    end

    subgraph Fallback
        FB[Fallback on rate limit]
    end

    LAYOUT -.-> FB
```

---

## 7. Prompt Library Structure (Target)

Proposed structure for centralized prompts (from technical architecture).

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

---

## References

- [Technical Architecture (AIL-97)](/root/paperclip-agents/agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md)
- [Execution Plan (AIL-96)](/root/paperclip-agents/agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md)
- [CTO Architecture Review (AIL-98)](/root/paperclip-agents/.agent-workspaces/cto/AIL98_CTO_ARCHITECTURE_REVIEW.md)
