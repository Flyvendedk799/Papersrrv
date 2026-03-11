# Screenshot & Video Specialist

Capture high-quality screenshots and video recordings of software for documentation, demos, tutorials, and marketing.

## MyMetaView 3.5 Assets (AIL-109)

### Spec

- **Demo video & tutorial spec:** [MYMETAVIEW_3.5_DEMO_VIDEO_AND_TUTORIAL_SPEC.md](./MYMETAVIEW_3.5_DEMO_VIDEO_AND_TUTORIAL_SPEC.md)
- **Screenshot spec (Graphics Specialist):** [../graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md](../graphics-specialist/MYMETAVIEW_3.5_DEMO_SCREENSHOT_SPEC.md)

### Capture Script

Automated capture via Playwright:

```bash
# Install Playwright (first time only)
pnpm add -D playwright -w
pnpm exec playwright install chromium

# Screenshots only
node agents/screenshot-and-video-specialist/scripts/capture-mymetaview-3.5.mjs

# Screenshots + demo video
node agents/screenshot-and-video-specialist/scripts/capture-mymetaview-3.5.mjs --video

# Custom output directory
node agents/screenshot-and-video-specialist/scripts/capture-mymetaview-3.5.mjs --out-dir=./my-output
```

Output: `agents/screenshot-and-video-specialist/output/` (or `--out-dir`)
