/* ─────────────────────────────────────────────────────────────────────
 *  modeOf — decide which Companion pane to show.
 *
 *  The Case Companion has 5 modes. Priority order (highest first):
 *
 *    1. tour      — guided tour is running; Companion collapses
 *    2. search    — user has typed something; show results + dim scene
 *    3. inspector — something is selected; show its detail card
 *    4. chapter   — a chapter is active via scroll-spy; show chapter focus
 *    5. overview  — default
 *
 *  Pure function — deterministic on inputs. No hooks, no side effects.
 * ───────────────────────────────────────────────────────────────────── */

export type CompanionMode =
  | "overview"
  | "inspector"
  | "chapter"
  | "search"
  | "tour";

interface ModeInputs {
  tourRunning: boolean;
  searchQuery: string;
  hasSelection: boolean;
  activeChapterKey: string | null;
}

export function modeOf({
  tourRunning,
  searchQuery,
  hasSelection,
  activeChapterKey,
}: ModeInputs): CompanionMode {
  if (tourRunning) return "tour";
  if (searchQuery.trim().length > 0) return "search";
  if (hasSelection) return "inspector";
  // "overview" is both the default AND the chapter used when scroll-
  // spy lands on the first chapter, so treat it as overview.
  if (activeChapterKey && activeChapterKey !== "overview") return "chapter";
  return "overview";
}
