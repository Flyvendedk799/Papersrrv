/**
 * CaseProblem — the case's description, treated as the *problem
 * statement* the case was filed to answer.
 *
 * Rendered as primary reading material (serif body, generous
 * leading) rather than as an editable input that gets in the way.
 * Hover reveals a pencil affordance; click enters edit mode.
 */

import type { MentionOption } from "../../MarkdownEditor";
import { cn } from "../../../lib/utils";
import { InlineEditor } from "../../InlineEditor";

interface Props {
  issueId: string;
  description: string | null | undefined;
  onSave: (description: string) => void;
  mentions?: MentionOption[];
  onAttachImage?: (file: File) => Promise<string>;
  className?: string;
}

export function CaseProblem({
  issueId,
  description,
  onSave,
  mentions,
  onAttachImage,
  className,
}: Props) {
  const empty = !description || description.trim().length === 0;
  return (
    <section
      id="chapter-description"
      aria-labelledby={`problem-${issueId}-heading`}
      className={cn("scroll-mt-8", className)}
    >
      <div className="flex items-baseline gap-2 mb-2.5">
        <h2
          id={`problem-${issueId}-heading`}
          className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]"
        >
          The problem
        </h2>
        {empty && (
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
            · nothing written yet
          </span>
        )}
      </div>
      <InlineEditor
        value={description ?? ""}
        onSave={onSave}
        as="p"
        className={cn(
          "text-[0.98rem] leading-[1.65] text-[var(--boared-ink)]",
          "prose-serif max-w-[70ch]",
          empty && "font-serif italic text-[var(--boared-ink-faint)]",
        )}
        placeholder="No description yet. Click to add the problem this case is solving."
        multiline
        mentions={mentions}
        imageUploadHandler={onAttachImage}
      />
    </section>
  );
}
