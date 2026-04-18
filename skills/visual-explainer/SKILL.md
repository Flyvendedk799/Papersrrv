---
name: visual-explainer
description: >
  Generate beautiful, self-contained HTML visual documents from screenshots, videos,
  and content. Assembles visual project documentation, slide decks, and interactive
  diagrams as standalone HTML files with embedded assets.
---

# Visual Explainer Skill

You create stunning, self-contained HTML visual documents that combine screenshots, videos, diagrams, and written content into polished, interactive pages.

## Core Principles

1. **Self-contained**: All CSS is inline or in `<style>` tags. No external dependencies.
2. **Responsive**: Works on all screen sizes using CSS Grid and flexbox.
3. **Professional**: Clean typography, consistent spacing, polished visual design.
4. **Accessible**: Proper headings, alt text on images, semantic HTML.

## Embedding Screenshots

When given screenshot URLs or file paths, embed them directly:

```html
<!-- From URL (e.g., artifact URLs from previous workflow steps) -->
<img src="http://server-url/api/workflow-artifacts/run-id/screenshot.png"
     alt="Login page screenshot"
     style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />

<!-- From base64 (for inline embedding) -->
<img src="data:image/png;base64,..." alt="Dashboard view" />
```

**IMPORTANT**: When embedding images from URLs, use the FULL absolute URL including the server base URL. Images referenced as relative paths will NOT work in standalone HTML files.

## Document Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{Document Title}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      background: #fafbfc;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    h2 { font-size: 1.75rem; font-weight: 600; margin: 2rem 0 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }

    /* Screenshot gallery */
    .screenshot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin: 1.5rem 0;
    }
    .screenshot-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: box-shadow 0.2s;
    }
    .screenshot-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .screenshot-card img {
      width: 100%;
      height: auto;
      display: block;
    }
    .screenshot-card .caption {
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      color: #4a5568;
    }

    /* Flow steps */
    .flow-step {
      display: flex;
      gap: 2rem;
      margin: 2rem 0;
      align-items: flex-start;
    }
    .flow-step .step-number {
      width: 48px; height: 48px;
      background: #4f46e5;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      flex-shrink: 0;
    }
    .flow-step .step-content { flex: 1; }
    .flow-step img { max-width: 100%; border-radius: 8px; margin-top: 0.75rem; }

    /* Table of contents */
    .toc { background: white; border-radius: 12px; padding: 1.5rem; margin: 2rem 0; }
    .toc a { color: #4f46e5; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    .toc ul { list-style: none; padding-left: 1rem; }
    .toc li { margin: 0.25rem 0; }

    /* Video embed */
    .video-container {
      position: relative;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      margin: 1.5rem 0;
    }
    .video-container video { width: 100%; display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{Title}}</h1>
    <p style="color: #718096; font-size: 1.1rem;">{{Subtitle/Description}}</p>

    <!-- Table of Contents -->
    <nav class="toc">
      <h3>Contents</h3>
      <ul>
        <li><a href="#section-1">Section 1</a></li>
        <!-- ... -->
      </ul>
    </nav>

    <!-- Sections with screenshots -->
    <section id="section-1">
      <h2>Section Title</h2>
      <p>Description text...</p>
      <div class="screenshot-grid">
        <div class="screenshot-card">
          <img src="URL" alt="Description" />
          <div class="caption">Step description</div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>
```

## Assembling from Workflow Step Outputs

When you receive "Available Assets" from previous workflow steps:

1. **Parse the asset list** — identify images, videos, and documents by URL
2. **Download or embed** each asset using its full URL with the base URL
3. **Organize by flow** — group screenshots into logical user flow sequences
4. **Write descriptions** — add captions explaining what each screenshot shows
5. **Create navigation** — add a table of contents with anchor links

## Output

Save the HTML file and print its absolute path:
```
Visual document generated:
- /absolute/path/to/document.html
```
