/**
 * FilesQuickOpen — Cmd+P file jumper, in-page sibling of the global
 * Cmd+K palette. Ranks results by: recents > exact-basename > path.
 *
 * Always-on within the Files tab. The parent owns open/close state so
 * the shell's keyboard hook can toggle it alongside other shortcuts.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { FileText, History, Search as SearchIcon } from "lucide-react";
import { filesApi } from "@/api/files";
import { queryKeys } from "@/lib/queryKeys";
import { getRecentFiles } from "@/lib/recentFiles";

function filenameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;
}

export interface FilesQuickOpenProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (filePath: string) => void;
}

export function FilesQuickOpen({ companyId, open, onOpenChange, onPick }: FilesQuickOpenProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmed = query.trim();

  const { data: searchResults = [] } = useQuery({
    queryKey: queryKeys.files.search(companyId, trimmed),
    queryFn: () => filesApi.search(companyId, trimmed),
    enabled: open && !!companyId && trimmed.length >= 2,
    staleTime: 15_000,
  });

  const { data: topRecent = [] } = useQuery({
    queryKey: [...queryKeys.files.list(companyId), "quickopen-top"] as const,
    queryFn: () => filesApi.list(companyId, { search: undefined }),
    enabled: open && !!companyId,
    staleTime: 60_000,
  });

  const recents = useMemo(() => (open ? getRecentFiles() : []), [open]);

  const handlePick = (path: string) => {
    onOpenChange(false);
    onPick(path);
  };

  const distinctSearchPaths = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of searchResults) {
      if (seen.has(r.filePath)) continue;
      seen.add(r.filePath);
      out.push(r.filePath);
    }
    return out;
  }, [searchResults]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick open file"
      description="Jump to any file in the workspace"
    >
      <CommandInput
        placeholder="Type to search files by path…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No files match.</CommandEmpty>

        {recents.length > 0 && trimmed.length === 0 && (
          <CommandGroup heading="Recent">
            {recents.slice(0, 8).map((r) => (
              <CommandItem
                key={`recent-${r.filePath}`}
                value={`recent ${r.filePath}`}
                onSelect={() => handlePick(r.filePath)}
              >
                <History className="mr-2 h-3.5 w-3.5" />
                <span className="truncate font-medium">{filenameOf(r.filePath)}</span>
                <span className="ml-2 truncate font-mono text-[0.6rem] text-muted-foreground">
                  {r.filePath}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {trimmed.length === 0 && topRecent.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Latest in workspace">
              {topRecent.slice(0, 10).map((f) => (
                <CommandItem
                  key={`latest-${f.filePath}`}
                  value={`latest ${f.filePath}`}
                  onSelect={() => handlePick(f.filePath)}
                >
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  <span className="truncate font-medium">{filenameOf(f.filePath)}</span>
                  <span className="ml-2 truncate font-mono text-[0.6rem] text-muted-foreground">
                    {f.filePath}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {trimmed.length >= 2 && distinctSearchPaths.length > 0 && (
          <CommandGroup heading={`Matches for "${trimmed}"`}>
            {distinctSearchPaths.slice(0, 20).map((path) => (
              <CommandItem
                key={`search-${path}`}
                value={`search ${path}`}
                onSelect={() => handlePick(path)}
              >
                <SearchIcon className="mr-2 h-3.5 w-3.5" />
                <span className="truncate font-medium">{filenameOf(path)}</span>
                <span className="ml-2 truncate font-mono text-[0.6rem] text-muted-foreground">
                  {path}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
