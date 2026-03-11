# MyMetaView 4.0 — Visual Assets Summary

**Issue:** AIL-132 (Visual assets & marketing for MyMetaView 4.0)  
**Deliverable:** Demo screenshots spec + marketing assets for 4.0 release  
**Date:** 2026-03-10

---

## 1. Deliverables

| Asset | Path | Purpose |
|-------|------|---------|
| **Demo screenshot spec** | `agents/graphics-specialist/MYMETAVIEW_4.0_DEMO_SCREENSHOT_SPEC.md` | Capture instructions for demo hero, batch tool, result, landing hero, features, pricing |
| **OG image (HTML)** | `agents/graphics-specialist/MYMETAVIEW_4.0_OG_IMAGE.html` | 1200×630 social/OG image; render in browser and screenshot for meta tags |
| **Announcement banner** | `agents/graphics-specialist/MYMETAVIEW_4.0_ANNOUNCEMENT_BANNER.svg` | 1200×200 banner for release announcements, blog, email |

---

## 2. Usage

### Demo screenshots

- **Spec:** `MYMETAVIEW_4.0_DEMO_SCREENSHOT_SPEC.md` — URLs, viewports, capture steps
- **Tool:** Puppeteer, Playwright, or manual capture
- **Output:** PNG files for docs, sales decks
- **4.0-specific:** Batch tool and export flow captures when P3/P7 ship

### OG image

- Open `MYMETAVIEW_4.0_OG_IMAGE.html` in browser at 1200×630 viewport
- Screenshot or use headless browser to export PNG
- Use for `og:image` meta tag on landing page and release blog

### Announcement banner

- Use SVG as-is (scalable) or export to PNG
- For blog headers, email banners, internal announcements

---

## 3. Brand Alignment (4.0)

- **Colors:** Dark slate (#0f172a, #1e293b), accent (#38bdf8), text (#f8fafc, #94a3b8)
- **Message:** "Production tool, not a demo" — batch API, reliability, integrations, professional UX
- **CTA:** mymetaview.com/demo
- **Positioning:** Per `agents/chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md`

---

## 4. Handoff

- **Screenshot and Video Specialist:** Demo video; may reference screenshot spec
- **Visual Documentation Specialist:** Architecture diagrams; flow visuals
- **Marketing / Sales:** OG image and banner for 4.0 launch

---

## 5. References

- AIL-132 — This deliverable
- AIL-114 — MyMetaView 4.0 — Final Implementation Plan
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md`
- `agents/chief-of-sales/MYMETAVIEW_4.0_SALES_MESSAGING.md`
- `agents/graphics-specialist/MYMETAVIEW_3.5_VISUAL_ASSETS_SUMMARY.md`
