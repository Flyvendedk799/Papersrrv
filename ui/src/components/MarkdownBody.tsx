import { isValidElement, useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseProjectMentionHref } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";
import { FileText } from "lucide-react";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  /** Company ID for clickable file references. If not provided, file links will be disabled. */
  companyId?: string;
  /** Company prefix for routing (e.g. "ACME"). If not provided, file links use relative paths. */
  companyPrefix?: string;
}

let mermaidLoaderPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidLoaderPromise;
}

function flattenText(value: ReactNode): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item)).join("");
  return "";
}

function extractMermaidSource(children: ReactNode): string | null {
  if (!isValidElement(children)) return null;
  const childProps = children.props as { className?: unknown; children?: ReactNode };
  if (typeof childProps.className !== "string") return null;
  if (!/\blanguage-mermaid\b/i.test(childProps.className)) return null;
  return flattenText(childProps.children).replace(/\n$/, "");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mentionChipStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return {
    borderColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    color: luminance > 0.55 ? "#111827" : "#f8fafc",
  };
}

/**
 * Detect if text looks like a file path.
 * Must start with /, ./, ../, ~/ or look like a path with extensions.
 * Excludes URLs and common non-path patterns.
 */
function isLikelyFilePath(text: string): boolean {
  const trimmed = text.trim();
  // Exclude URLs
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^mailto:/i.test(trimmed)) return false;
  // Exclude single words without path separators
  if (!trimmed.includes("/") && !trimmed.includes("\\")) return false;
  // Must look like a path: starts with / or ./ or ~/ OR contains a file extension
  if (/^(\.{0,2}\/|~\/|\/)/i.test(trimmed)) return true;
  // Has path separators and a file extension
  if (/\/[\w@.-]+\.\w{1,10}$/.test(trimmed)) return true;
  return false;
}

function MermaidDiagramBlock({ source, darkMode }: { source: string; darkMode: boolean }) {
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSvg(null);
    setError(null);

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: darkMode ? "dark" : "default",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        });
        const rendered = await mermaid.render(`paperclip-mermaid-${renderId}`, source);
        if (!active) return;
        setSvg(rendered.svg);
      })
      .catch((err) => {
        if (!active) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to render Mermaid diagram.";
        setError(message);
      });

    return () => {
      active = false;
    };
  }, [darkMode, renderId, source]);

  return (
    <div className="paperclip-mermaid">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <>
          <p className={cn("paperclip-mermaid-status", error && "paperclip-mermaid-status-error")}>
            {error ? `Unable to render Mermaid diagram: ${error}` : "Rendering Mermaid diagram..."}
          </p>
          <pre className="paperclip-mermaid-source">
            <code className="language-mermaid">{source}</code>
          </pre>
        </>
      )}
    </div>
  );
}

export function MarkdownBody({ children, className, companyId, companyPrefix }: MarkdownBodyProps) {
  const { theme } = useTheme();

  const filePathUrl = (filePath: string) => {
    const base = companyPrefix ? `/${companyPrefix}/files` : "/files";
    return `${base}?file=${encodeURIComponent(filePath)}`;
  };

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none prose-p:my-2 prose-p:leading-[1.4] prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:leading-[1.4] prose-pre:my-2 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-headings:my-2 prose-headings:text-sm prose-blockquote:leading-[1.4] prose-table:my-2 prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-code:break-all [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:list-item",
        theme === "dark" && "prose-invert",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ node: _node, children: preChildren, ...preProps }) => {
            const mermaidSource = extractMermaidSource(preChildren);
            if (mermaidSource) {
              return <MermaidDiagramBlock source={mermaidSource} darkMode={theme === "dark"} />;
            }
            return <pre {...preProps}>{preChildren}</pre>;
          },
          // Inline code: detect file paths and make them clickable
          code: ({ node: _node, children: codeChildren, className: codeCn, ...codeProps }) => {
            // Don't touch code blocks (they have a language-* class from <pre><code>)
            if (codeCn && /^language-/.test(codeCn)) {
              return <code className={codeCn} {...codeProps}>{codeChildren}</code>;
            }
            const text = flattenText(codeChildren);
            if (isLikelyFilePath(text)) {
              return (
                <a
                  href={filePathUrl(text)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/60 hover:bg-accent text-xs font-mono no-underline transition-colors cursor-pointer border border-border/50"
                  title={`Open ${text}`}
                >
                  <FileText className="h-3 w-3 shrink-0 text-blue-500" />
                  <span className="truncate max-w-[300px]">{text}</span>
                </a>
              );
            }
            return <code className={codeCn} {...codeProps}>{codeChildren}</code>;
          },
          a: ({ href, children: linkChildren }) => {
            const parsed = href ? parseProjectMentionHref(href) : null;
            if (parsed) {
              const label = linkChildren;
              return (
                <a
                  href={`/projects/${parsed.projectId}`}
                  className="paperclip-project-mention-chip"
                  style={mentionChipStyle(parsed.color)}
                >
                  {label}
                </a>
              );
            }
            // Check if href or link text looks like a file path
            const linkText = flattenText(linkChildren);
            if (href && isLikelyFilePath(href)) {
              return (
                <a
                  href={filePathUrl(href)}
                  className="inline-flex items-center gap-1 no-underline hover:underline"
                  title={`Open ${href}`}
                >
                  <FileText className="h-3 w-3 shrink-0 text-blue-500 inline" />
                  {linkChildren}
                </a>
              );
            }
            if (isLikelyFilePath(linkText) && (!href || href === linkText)) {
              return (
                <a
                  href={filePathUrl(linkText)}
                  className="inline-flex items-center gap-1 no-underline hover:underline"
                  title={`Open ${linkText}`}
                >
                  <FileText className="h-3 w-3 shrink-0 text-blue-500 inline" />
                  {linkChildren}
                </a>
              );
            }
            return (
              <a href={href} rel="noreferrer">
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
