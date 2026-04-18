import { File, FileText, FileJson, FileCode, Settings } from "lucide-react";

export function fileIconFor(path: string) {
  const lower = path.toLowerCase();
  if (/\.(md|mdx|markdown)$/.test(lower)) return FileText;
  if (/\.(json|yaml|yml|toml)$/.test(lower)) return FileJson;
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|cs|rb|php)$/.test(lower)) return FileCode;
  if (/\.(ini|env|config)/.test(lower)) return Settings;
  return File;
}

export function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}
