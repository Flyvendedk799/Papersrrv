/**
 * CaseBrief — the description, inline, no chapter heading.
 *
 * Previous layout treated the description as a standalone "The
 * problem" chapter with its own kicker and rule. It rarely warrants
 * that framing — most descriptions are a sentence or two and the
 * chapter heading doubled the reading material without adding signal.
 *
 * This replaces it with a minimal inline editor: serif body type,
 * click-to-edit, muted placeholder when empty. Still mentions +
 * image upload aware.
 */

import type { MentionOption } from "../../MarkdownEditor";
import { cn } from "../../../lib/utils";
import { InlineEditor } from "../../InlineEditor";

interface Props {
  description: string | null | undefined;
  onSave: (description: string) => void;
  mentions?: MentionOption[];
  onAttachImage?: (file: File) => Promise<string>;
  className?: string;
}

export function CaseBrief({
  description,
  onSave,
  mentions,
  onAttachImage,
  className,
}: Props) {
  const empty = !description || description.trim().length === 0;
  return (
    <div className={cn("max-w-[68ch]", className)}>
      <InlineEditor
        value={description ?? ""}
        onSave={onSave}
        as="p"
        className={cn(
          "text-[0.95rem] leading-[1.6] text-[var(--boared-ink)] prose-serif",
          empty && "font-serif italic text-[var(--boared-ink-faint)] text-[0.88rem]",
        )}
        placeholder="Click to describe this case."
        multiline
        mentions={mentions}
        imageUploadHandler={onAttachImage}
      />
    </div>
  );
}
