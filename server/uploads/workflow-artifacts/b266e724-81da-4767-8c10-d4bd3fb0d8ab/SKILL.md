---
name: playwright-skill
description: >
  Browser automation with Playwright — screenshots, video recording, and web interaction.
  Use for navigating websites, filling forms, capturing screenshots, recording screen videos,
  and extracting page content. Optimized for Claude Code with proper video lifecycle management.
---

# Playwright Browser Automation Skill

You are an expert at browser automation using Playwright. You write Node.js scripts that launch a browser, interact with pages, capture screenshots, and record videos.

## Setup

Always install Playwright first if not already available:

```bash
npm ls playwright 2>/dev/null || npm install playwright@latest
npx playwright install chromium 2>/dev/null
```

## Core Pattern

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  // Enable video recording — ALWAYS include this for video capture
  recordVideo: {
    dir: './videos/',
    size: { width: 1280, height: 800 }
  }
});
const page = await context.newPage();

// ... do your work ...

// CRITICAL: Close context BEFORE accessing video files
// Videos are only finalized on context.close()
await context.close();
await browser.close();
```

## Screenshot Capture

Take high-quality, descriptive screenshots at each meaningful step:

```javascript
// Full page screenshot
await page.screenshot({ path: 'screenshots/01-page-loaded.png', fullPage: true });

// Element screenshot (crop to specific area)
const element = await page.locator('.main-content');
await element.screenshot({ path: 'screenshots/02-main-content.png' });

// Wait for content to be visible before capturing
await page.waitForSelector('.dashboard', { state: 'visible', timeout: 10000 });
await page.screenshot({ path: 'screenshots/03-dashboard.png' });
```

**Screenshot best practices:**
- Use descriptive numbered filenames: `01-login-page.png`, `02-form-filled.png`, `03-dashboard.png`
- Set viewport to `1280x800` for consistent sizing
- Use `fullPage: true` for scrollable pages, element screenshots for specific components
- Always `waitForSelector` or `waitForLoadState('networkidle')` before capturing
- Create the output directory first: `fs.mkdirSync('screenshots', { recursive: true })`

## Video Recording

Video recording captures the entire browser session as a WebM file.

### How It Works
1. Enable via `recordVideo: { dir: './videos/', size: { width, height } }` on `browser.newContext()`
2. Every page in that context is recorded automatically
3. **Videos are ONLY written to disk when `context.close()` is called** — this is critical
4. After closing, retrieve the video path via `page.video().path()` or save to a custom location via `page.video().saveAs(path)`

### Complete Video Recording Pattern

```javascript
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIDEOS_DIR = './videos';
const SCREENSHOTS_DIR = './screenshots';
fs.mkdirSync(VIDEOS_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: {
    dir: VIDEOS_DIR,
    size: { width: 1280, height: 800 }
  }
});

const page = await context.newPage();

// Navigate and interact
await page.goto('https://example.com');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-home.png') });

// Do interactions...
await page.click('text=Login');
await page.fill('#username', 'user');
await page.fill('#password', 'pass');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-login-filled.png') });
await page.click('button[type=submit]');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-logged-in.png') });

// IMPORTANT: Save video BEFORE closing context
// saveAs() works while recording is still in progress
await page.video().saveAs(path.join(VIDEOS_DIR, 'session-recording.webm'));

// Close context to finalize video files
await context.close();
await browser.close();

// List all captured files
const screenshots = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
const videos = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.webm'));
console.log('Screenshots:', screenshots);
console.log('Videos:', videos);
```

### Video API Reference
- `page.video().path()` — returns the file path (only valid after `context.close()`)
- `page.video().saveAs(path)` — copies video to custom path (safe to call during recording)
- `page.video().delete()` — deletes the video file
- Video format: **WebM** (VP8 codec)
- Default size: viewport dimensions, scaled down to fit 800x800 max
- Specify `size: { width, height }` to override

## Navigation & Interaction

```javascript
// Navigation
await page.goto(url);
await page.waitForLoadState('networkidle');  // wait for all requests to finish
await page.waitForLoadState('domcontentloaded');  // faster, DOM only

// Clicking
await page.click('text=Submit');
await page.click('button.primary');
await page.locator('[data-testid="login-btn"]').click();

// Filling forms
await page.fill('#email', 'user@example.com');
await page.fill('input[name="password"]', 'secret');
await page.selectOption('select#role', 'admin');
await page.check('#remember-me');

// Waiting
await page.waitForSelector('.success-message', { timeout: 15000 });
await page.waitForURL('**/dashboard', { timeout: 15000 });
await page.waitForTimeout(1000);  // explicit wait (use sparingly)

// Extracting text
const title = await page.textContent('h1');
const items = await page.locator('.item').allTextContents();
```

## Authentication Pattern

```javascript
// Login flow with cookie capture
await page.goto(loginUrl);
await page.fill('#username', username);
await page.fill('#password', password);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 15000 });

// Verify login succeeded
const loggedIn = await page.locator('.user-avatar, .logout-btn, .dashboard').count() > 0;

// Export cookies for reuse
const cookies = await context.cookies();
const sessionCookies = cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain }));
```

## Error Handling

```javascript
try {
  await page.goto(url, { timeout: 30000 });
} catch (err) {
  // Take error screenshot for debugging
  await page.screenshot({ path: 'screenshots/error-state.png' });
  console.error('Navigation failed:', err.message);
}
```

## Output Format

When completing a task, always output a summary listing all captured files with their absolute paths:

```
Screenshots captured:
- /absolute/path/to/screenshots/01-login.png
- /absolute/path/to/screenshots/02-dashboard.png

Videos captured:
- /absolute/path/to/videos/session-recording.webm

Output: { loginSucceeded: true, screenshotCount: 2, videoCount: 1 }
```

Print absolute paths using `path.resolve()` so downstream systems can find the files.
