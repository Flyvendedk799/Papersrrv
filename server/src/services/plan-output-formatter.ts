/**
 * plan-output-formatter — reshape arbitrary agent output into the
 * enforced `PlanOutput` shape.
 *
 * Planning-kind issues converge to a final plan. The agent writes
 * free-form markdown; this service normalises it into the
 * `PlanOutput` structure so downstream code (transfer-to-backlog,
 * UI rendering) can depend on a stable shape.
 *
 * Today this is a lenient parser — it accepts anything that
 * already matches the schema, and does a best-effort extraction
 * from common markdown patterns (## Summary, ## Steps, bullet
 * lists). A future iteration can hand ambiguous input to an LLM
 * for structured re-formatting behind a feature flag.
 *
 * Invariant: if this function returns a value, it PASSES
 * `planOutputSchema.parse()`. Callers can treat the result as a
 * guaranteed `PlanOutput`.
 */

import {
  planOutputSchema,
  type PlanOutput,
  type PlanOutputStep,
} from "@paperclipai/shared";

/** Accept anything. Try to produce a valid PlanOutput or return
 * null so the caller can decide how to handle failure (reject the
 * transfer, fall back to template, etc.). */
export function formatPlanOutput(raw: unknown): PlanOutput | null {
  // 1. Already matches the schema — pass it through.
  const direct = planOutputSchema.safeParse(raw);
  if (direct.success) return direct.data;

  // 2. String input — parse as markdown-ish.
  if (typeof raw === "string") {
    return fromMarkdown(raw);
  }

  // 3. Partial object — fill gaps and try again.
  if (raw && typeof raw === "object") {
    const partial = raw as Record<string, unknown>;
    const filled: Record<string, unknown> = { ...partial };
    if (!filled.summary && typeof filled.title === "string") {
      filled.summary = String(filled.title).slice(0, 400);
    }
    if (!filled.context && typeof filled.description === "string") {
      filled.context = String(filled.description).slice(0, 4000);
    }
    if (!filled.proposedSteps && Array.isArray(filled.steps)) {
      filled.proposedSteps = (filled.steps as unknown[]).map(coerceStep).filter(Boolean);
    }
    if (!filled.schemaVersion) filled.schemaVersion = 1;
    const parsed = planOutputSchema.safeParse(filled);
    if (parsed.success) return parsed.data;
  }

  return null;
}

/** Coerce something that looks like a step — string, {title, detail},
 * or a structured object — into a PlanOutputStep. Returns null when
 * the input is too thin to rescue. */
function coerceStep(input: unknown): PlanOutputStep | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return {
      title: trimmed.split("\n")[0].slice(0, 200),
      detail: trimmed,
    };
  }
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    const title =
      typeof o.title === "string"
        ? o.title.trim()
        : typeof o.name === "string"
          ? o.name.trim()
          : null;
    const detail =
      typeof o.detail === "string"
        ? o.detail.trim()
        : typeof o.description === "string"
          ? o.description.trim()
          : typeof o.body === "string"
            ? o.body.trim()
            : null;
    if (!title || !detail) return null;
    return { title: title.slice(0, 200), detail: detail.slice(0, 2000) };
  }
  return null;
}

/** Best-effort markdown extraction. Looks for headings named
 * Summary / Context / Steps / Risks / Questions and pulls their
 * bodies. Tolerates heading variations and missing sections. */
function fromMarkdown(md: string): PlanOutput | null {
  const sections = splitSections(md);
  const summary =
    pickSection(sections, ["summary", "tl;dr", "tldr"]) ??
    firstParagraph(md);
  const context =
    pickSection(sections, ["context", "background", "investigation", "why"]) ??
    md.slice(0, 2000);
  const stepsSection = pickSection(sections, [
    "proposed steps",
    "steps",
    "plan",
    "proposed plan",
    "next steps",
    "action items",
  ]);
  const steps = stepsSection ? extractSteps(stepsSection) : [];
  const risks = arraySection(sections, ["risks", "risk"]);
  const openQuestions = arraySection(sections, ["open questions", "questions", "unknowns"]);
  if (!summary || !context || steps.length === 0) return null;
  const candidate = {
    summary: summary.trim().slice(0, 400),
    context: context.trim().slice(0, 4000),
    proposedSteps: steps,
    risks: risks.length ? risks : undefined,
    openQuestions: openQuestions.length ? openQuestions : undefined,
    schemaVersion: 1 as const,
  };
  const parsed = planOutputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Split a markdown blob into {headingName: body} keyed by the
 * lowercased heading text. Only considers h1 and h2 headings. */
function splitSections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = md.split(/\r?\n/);
  let currentKey: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentKey && buffer.length) {
      out.set(currentKey, buffer.join("\n").trim());
    }
    buffer = [];
  };
  for (const line of lines) {
    const m = line.match(/^\s*#{1,2}\s+(.+?)\s*$/);
    if (m) {
      flush();
      currentKey = m[1].toLowerCase();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out;
}

function pickSection(sections: Map<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const hit = sections.get(alias);
    if (hit) return hit;
  }
  return null;
}

function arraySection(sections: Map<string, string>, aliases: string[]): string[] {
  const body = pickSection(sections, aliases);
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 20);
}

function firstParagraph(md: string): string | null {
  const trimmed = md.trim();
  if (!trimmed) return null;
  const firstPara = trimmed.split(/\n\s*\n/)[0];
  return firstPara.slice(0, 400);
}

/** Parse a "steps" section into ordered PlanOutputStep[]. Accepts
 * bullet lists and numbered lists. Each list item becomes one
 * step; the first line is the title, the rest (indented or
 * following continuation) is the detail. */
function extractSteps(body: string): PlanOutputStep[] {
  const out: PlanOutputStep[] = [];
  const blocks = body.split(/\n(?=\s*(?:[-*+]|\d+[.)])\s)/);
  for (const block of blocks) {
    const clean = block.replace(/^\s*(?:[-*+]|\d+[.)])\s/, "").trim();
    if (!clean) continue;
    const lines = clean.split(/\r?\n/);
    const title = lines[0].trim().slice(0, 200);
    const detail =
      lines.length > 1
        ? lines
            .slice(1)
            .map((l) => l.replace(/^\s+/, ""))
            .join(" ")
            .trim()
            .slice(0, 2000)
        : title;
    if (!title) continue;
    out.push({ title, detail: detail || title });
    if (out.length >= 40) break;
  }
  return out;
}
