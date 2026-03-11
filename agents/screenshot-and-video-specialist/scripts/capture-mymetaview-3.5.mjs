#!/usr/bin/env node
/**
 * MyMetaView 3.5 — Screenshot and video capture script
 *
 * Captures tutorial screenshots and optional demo walkthrough video per
 * agents/screenshot-and-video-specialist/MYMETAVIEW_3.5_DEMO_VIDEO_AND_TUTORIAL_SPEC.md
 *
 * Usage:
 *   npx playwright install chromium   # first time only
 *   node agents/screenshot-and-video-specialist/scripts/capture-mymetaview-3.5.mjs [--video] [--out-dir=./output]
 *
 * Options:
 *   --video     Also record demo walkthrough video (default: screenshots only)
 *   --out-dir   Output directory (default: agents/screenshot-and-video-specialist/output)
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

const VIEWPORT = { width: 1920, height: 1080 };
const DEMO_URL = "https://www.mymetaview.com/demo";
const LANDING_URL = "https://www.mymetaview.com";
const EXAMPLE_URL = "https://stripe.com";

function parseArgs() {
  const args = process.argv.slice(2);
  const video = args.includes("--video");
  const outDirArg = args.find((a) => a.startsWith("--out-dir="));
  const outDir = outDirArg
    ? outDirArg.split("=")[1]
    : join(ROOT, "agents", "screenshot-and-video-specialist", "output");
  return { video, outDir };
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureScreenshots(page, outDir) {
  const frames = [
    {
      name: "mymetaview-3.5-tutorial-01-demo-hero.png",
      url: DEMO_URL,
      wait: 3000,
    },
    {
      name: "mymetaview-3.5-tutorial-04-landing-hero.png",
      url: LANDING_URL,
      wait: 3000,
    },
    {
      name: "mymetaview-3.5-tutorial-05-landing-features.png",
      url: LANDING_URL,
      wait: 3000,
      scroll: true,
    },
    {
      name: "mymetaview-3.5-tutorial-06-landing-pricing.png",
      url: LANDING_URL,
      wait: 3000,
      scroll: "pricing",
    },
  ];

  for (const f of frames) {
    console.log(`Capturing ${f.name}...`);
    await page.goto(f.url, { waitUntil: "networkidle" });
    await wait(f.wait);
    if (f.scroll === true) {
      await page.evaluate(() =>
        document.querySelector('[id*="feature"], [class*="feature"]')?.scrollIntoView()
      );
      await wait(500);
    } else if (f.scroll === "pricing") {
      await page.evaluate(() =>
        document.querySelector('[id*="pricing"], [class*="pricing"]')?.scrollIntoView()
      );
      await wait(500);
    }
    await page.screenshot({
      path: join(outDir, f.name),
      fullPage: false,
    });
  }

  // Demo flow: enter URL, generate, capture in-progress and result
  console.log("Capturing demo flow (in progress + result)...");
  await page.goto(DEMO_URL, { waitUntil: "networkidle" });
  await wait(2000);

  const input = page.locator('input[type="url"], input[placeholder*="URL"], input[name*="url"]').first();
  await input.fill(EXAMPLE_URL);

  const generateBtn = page.locator('button:has-text("Generate"), button:has-text("Preview")').first();
  await generateBtn.click();

  await wait(3000);
  await page.screenshot({
    path: join(outDir, "mymetaview-3.5-tutorial-02-demo-progress.png"),
    fullPage: false,
  });

  // Wait for generation to complete (up to 60s)
  try {
    await page.waitForSelector('[class*="preview"], [class*="result"], [class*="card"]', {
      timeout: 60000,
    });
  } catch {
    console.warn("Generation may not have completed; result screenshot may show loading state.");
  }
  await wait(2000);
  await page.screenshot({
    path: join(outDir, "mymetaview-3.5-tutorial-03-demo-result.png"),
    fullPage: false,
  });
}

async function captureVideo(browser, outDir) {
  console.log("Recording demo walkthrough video...");
  const videoDir = join(outDir, "video-temp");
  await mkdir(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });

  const videoPage = await context.newPage();
  await videoPage.goto(LANDING_URL, { waitUntil: "networkidle" });
  await wait(3000);

  const demoLink = videoPage.locator('a[href*="/demo"], a:has-text("Watch Demo"), a:has-text("Try Demo")').first();
  await demoLink.click();
  await wait(3000);

  const input = videoPage.locator('input[type="url"], input[placeholder*="URL"]').first();
  await input.fill(EXAMPLE_URL);
  await wait(1000);

  const generateBtn = videoPage.locator('button:has-text("Generate"), button:has-text("Preview")').first();
  await generateBtn.click();

  await wait(45000); // Allow generation to complete

  await context.close();

  // Playwright saves video to videoDir; move to final location
  const { readdirSync, renameSync } = await import("fs");
  const files = readdirSync(videoDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (webm) {
    const src = join(videoDir, webm);
    const dest = join(outDir, "mymetaview-3.5-demo-walkthrough.webm");
    renameSync(src, dest);
    console.log(`Video saved: ${dest}`);
  }
  const { rmSync } = await import("fs");
  rmSync(videoDir, { recursive: true, force: true });
}

async function main() {
  const { video, outDir } = parseArgs();
  await mkdir(outDir, { recursive: true });
  console.log(`Output directory: ${outDir}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    await captureScreenshots(page, outDir);
    if (video) {
      await captureVideo(browser, outDir);
    }
  } finally {
    await browser.close();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
