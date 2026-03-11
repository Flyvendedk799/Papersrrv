# MyMetaView 3.5 — Visual Assets Summary

**Issue:** [AIL-107](/AIL/issues/AIL-107)  
**Deliverable:** Demo screenshots spec + marketing assets for 3.5 release  
**Date:** 2026-03-10

---

## 1. Deliverables

| Asset | Path | Purpose |
|-------|------|---------|
| **Demo screenshot spec** | `agents/graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md` | Capture instructions for demo hero, result, landing hero, features, pricing |
| **OG image (HTML)** | `agents/graphics-specialist/MYMETAVIEW_3.5_OG_IMAGE.html` | 1200×630 social/OG image; render in browser and screenshot for meta tags |
| **Announcement banner** | `agents/graphics-specialist/MYMETAVIEW_3.5_ANNOUNCEMENT_BANNER.svg` | 1200×200 banner for release announcements, blog, email |

---

## 2. Usage

### Demo screenshots

- **Spec:** `MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md` — URLs, viewports, capture steps
- **Tool:** Puppeteer, Playwright, or manual capture
- **Output:** PNG files for docs, docs, sales decks

### OG image

- Open `MYMETAVIEW_3.5_OG_IMAGE.html` in browser at 1200×630 viewport
- Screenshot or use headless browser to export PNG
- Use for `og:image` meta tag on landing page and release blog

### Announcement banner

- Use SVG as-is (scalable) or export to PNG
- For blog headers, email banners, internal announcements

---

## 3. Brand alignment

- **Colors:** Dark slate (#0f172a, #1e293b), accent (#38bdf8), text (#f8fafc, #94a3b8)
- **Message:** "10x better generations" (3.5 mandate); "AI-powered URL previews"
- **CTA:** mymetaview.com/demo

---

## 4. Handoff

- **Screenshot and Video Specialist** ([AIL-109](/AIL/issues/AIL-109)): Demo video; may reference screenshot spec
- **Visual Documentation Specialist** ([AIL-108](/AIL/issues/AIL-108)): Architecture diagrams; flow visuals
- **Marketing / Sales:** OG image and banner for 3.5 launch

---

## 5. References

- [AIL-96](/AIL/issues/AIL-96) — MyMetaView 3.5 grand plan
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_3.5.md`
- `agents/chief-of-sales/MYMETAVIEW_3.0_SALES_MESSAGING.md`
