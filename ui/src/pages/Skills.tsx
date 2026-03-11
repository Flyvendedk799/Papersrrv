import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle, Plus, Upload, Trash2, ChevronDown, ChevronRight,
  FileText, FolderArchive, Search, Edit3, Save, X, Eye,
} from "lucide-react";
import { skillsApi } from "../api/skills";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn } from "../lib/utils";
import type { CompanySkill } from "@paperclipai/shared";

export function Skills() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;

  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewSkill, setViewSkill] = useState<CompanySkill | null>(null);
  const [editSkill, setEditSkill] = useState<CompanySkill | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDirty, setEditDirty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Skills" }]);
  }, [setBreadcrumbs]);

  const { data: skills, isLoading } = useQuery({
    queryKey: queryKeys.skills.list(companyId),
    queryFn: () => skillsApi.list(companyId),
    enabled: !!selectedCompanyId,
  });

  const createSkill = useMutation({
    mutationFn: (data: { name: string; description?: string; content: string; files?: Record<string, string>; metadata?: Record<string, unknown> }) =>
      skillsApi.create(companyId, data),
    onSuccess: (skill) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.list(companyId) });
      pushToast({ title: "Skill created", body: skill.name, tone: "success" });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
    },
    onError: (err) => {
      pushToast({ title: "Failed to create skill", body: (err as Error).message, tone: "error" });
    },
  });

  const updateSkill = useMutation({
    mutationFn: ({ skillId, ...data }: { skillId: string } & Record<string, unknown>) =>
      skillsApi.update(companyId, skillId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.list(companyId) });
      pushToast({ title: "Skill updated", tone: "success" });
      setEditSkill(null);
      setEditDirty(false);
    },
    onError: (err) => {
      pushToast({ title: "Failed to update skill", body: (err as Error).message, tone: "error" });
    },
  });

  const deleteSkill = useMutation({
    mutationFn: (skillId: string) => skillsApi.delete(companyId, skillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.list(companyId) });
      pushToast({ title: "Skill deleted", tone: "info" });
      setViewSkill(null);
      setEditSkill(null);
    },
    onError: (err) => {
      pushToast({ title: "Failed to delete skill", body: (err as Error).message, tone: "error" });
    },
  });

  // Parse YAML frontmatter for name and description
  const parseFrontmatter = (content: string) => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return { name: null, description: null };
    const yaml = match[1];
    const nameMatch = yaml.match(/name:\s*["']?([^"'\n]+)["']?/);
    const descMatch = yaml.match(/description:\s*["']?([^"'\n]+)["']?/);
    return {
      name: nameMatch?.[1]?.trim() ?? null,
      description: descMatch?.[1]?.trim() ?? null,
    };
  };

  // Handle single SKILL.md upload
  const handleMdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const fm = parseFrontmatter(content);
        const name = fm.name ?? file.name.replace(/\.md$/i, "").replace(/^SKILL$/i, "uploaded-skill");
        const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        createSkill.mutate({
          name: safeName,
          description: fm.description ?? undefined,
          content,
        });
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  // Handle zip upload (skill folder with SKILL.md + supporting files)
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      // Dynamic import JSZip
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);

      // Find SKILL.md (could be at root or inside a single subdirectory)
      let skillMdPath: string | null = null;
      let prefix = "";

      zip.forEach((relativePath: string) => {
        const lower = relativePath.toLowerCase();
        if (lower.endsWith("skill.md") && !lower.includes("node_modules")) {
          // Prefer the shallowest SKILL.md
          if (!skillMdPath || relativePath.split("/").length < skillMdPath.split("/").length) {
            skillMdPath = relativePath;
            // prefix is everything before SKILL.md
            const parts = relativePath.split("/");
            parts.pop();
            prefix = parts.length > 0 ? parts.join("/") + "/" : "";
          }
        }
      });

      if (!skillMdPath) {
        pushToast({ title: "No SKILL.md found in zip", body: "The zip must contain a SKILL.md file.", tone: "error" });
        return;
      }

      const skillMdContent = await zip.file(skillMdPath)!.async("string");
      const fm = parseFrontmatter(skillMdContent);

      // Collect all other text files relative to the SKILL.md location
      const additionalFiles: Record<string, string> = {};
      const promises: Promise<void>[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zip.forEach((relativePath: string, zipEntry: any) => {
        if (zipEntry.dir) return;
        if (relativePath === skillMdPath) return;
        if (!relativePath.startsWith(prefix)) return;
        // Skip common non-skill files
        if (relativePath.includes("node_modules/")) return;
        if (relativePath.endsWith("package-lock.json")) return;

        const relPath = relativePath.slice(prefix.length);
        promises.push(
          zipEntry.async("string").then((fileContent: string) => {
            additionalFiles[relPath] = fileContent;
          }),
        );
      });

      await Promise.all(promises);

      const name = fm.name ?? file.name.replace(/\.zip$/i, "");
      const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

      createSkill.mutate({
        name: safeName,
        description: fm.description ?? undefined,
        content: skillMdContent,
        files: additionalFiles,
        metadata: {},
      });
    } catch (err) {
      pushToast({ title: "Failed to read zip", body: (err as Error).message, tone: "error" });
    }
  };

  const handleCreateBlank = () => {
    const safeName = newName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!safeName) return;
    const defaultContent = `---\nname: "${safeName}"\ndescription: "${newDescription.trim() || "TODO: describe this skill"}"\n---\n\n# ${safeName}\n\nTODO: Add skill instructions here.\n`;
    createSkill.mutate({
      name: safeName,
      description: newDescription.trim() || undefined,
      content: defaultContent,
    });
  };

  const filteredSkills = skills?.filter((s) =>
    !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  ) ?? [];

  if (!selectedCompanyId) {
    return <EmptyState icon={Puzzle} message="Select a company to view skills." />;
  }

  if (isLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Skills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shared skill library for all agents in your company.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload SKILL.md
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload a single SKILL.md file</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => zipInputRef.current?.click()}>
                <FolderArchive className="h-3.5 w-3.5 mr-1.5" />
                Upload Zip
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload a zip with SKILL.md and supporting files (assets, scripts, etc.)</TooltipContent>
          </Tooltip>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Skill
          </Button>
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple className="hidden" onChange={handleMdUpload} />
          <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleZipUpload} />
        </div>
      </div>

      {/* Search */}
      {skills && skills.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-full max-w-xs rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Skills grid */}
      {filteredSkills.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          message={skills?.length === 0
            ? "No shared skills yet. Upload a SKILL.md or zip to get started. Once added, these skills can be assigned to any agent."
            : "No skills match your search."
          }
          action={skills?.length === 0 ? "New Skill" : undefined}
          onAction={skills?.length === 0 ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSkills.map((skill) => {
            const fileCount = Object.keys(skill.files).length;
            return (
              <button
                key={skill.id}
                onClick={() => setViewSkill(skill)}
                className="group flex flex-col gap-2 border border-border rounded-lg bg-card p-4 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Puzzle className="h-4 w-4 shrink-0 text-indigo-500" />
                    <span className="font-mono text-sm font-medium truncate">{skill.name}</span>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                </div>
                {skill.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
                )}
                <div className="flex items-center gap-2 mt-auto">
                  <Badge variant="secondary" className="text-[10px]">SKILL.md</Badge>
                  {fileCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{fileCount} file{fileCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Skill</DialogTitle>
            <DialogDescription>Create a blank skill with a SKILL.md template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="my-skill (lowercase, hyphens ok)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="What does this skill do?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBlank} disabled={!newName.trim() || createSkill.isPending}>
              {createSkill.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit skill modal */}
      {(viewSkill || editSkill) && (
        <SkillModal
          skill={(editSkill ?? viewSkill)!}
          isEditing={!!editSkill}
          editContent={editContent}
          editDirty={editDirty}
          onClose={() => { setViewSkill(null); setEditSkill(null); setEditDirty(false); }}
          onStartEdit={() => {
            const s = viewSkill!;
            setEditSkill(s);
            setEditContent(s.content);
            setEditDirty(false);
          }}
          onEditChange={(content) => { setEditContent(content); setEditDirty(true); }}
          onSave={() => {
            if (editSkill) {
              updateSkill.mutate({ skillId: editSkill.id, content: editContent });
            }
          }}
          onDelete={() => {
            const s = (editSkill ?? viewSkill)!;
            if (window.confirm(`Delete skill "${s.name}"? This cannot be undone.`)) {
              deleteSkill.mutate(s.id);
            }
          }}
          saving={updateSkill.isPending}
        />
      )}
    </div>
  );
}

/* ---- Skill detail modal ---- */

function SkillModal({
  skill,
  isEditing,
  editContent,
  editDirty,
  onClose,
  onStartEdit,
  onEditChange,
  onSave,
  onDelete,
  saving,
}: {
  skill: CompanySkill;
  isEditing: boolean;
  editContent: string;
  editDirty: boolean;
  onClose: () => void;
  onStartEdit: () => void;
  onEditChange: (content: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const fileEntries = Object.entries(skill.files) as [string, string][];
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-background rounded-lg border border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Puzzle className="h-4 w-4 text-indigo-500 shrink-0" />
            <span className="font-mono text-sm font-medium truncate">{skill.name}</span>
            {skill.description && (
              <span className="text-xs text-muted-foreground truncate">- {skill.description}</span>
            )}
            {fileEntries.length > 0 && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                +{fileEntries.length} file{fileEntries.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onStartEdit}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit
                  </button>
                </TooltipTrigger>
                <TooltipContent>Edit the SKILL.md content</TooltipContent>
              </Tooltip>
            )}
            {isEditing && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={!editDirty || saving}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onDelete}
                  className="p-1.5 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete this skill</TooltipContent>
            </Tooltip>
            <button onClick={onClose} className="p-1 rounded-sm hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">
          {isEditing ? (
            <textarea
              className="w-full h-full min-h-[400px] p-4 text-xs font-mono bg-background resize-none focus:outline-none leading-relaxed"
              value={editContent}
              onChange={(e) => onEditChange(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className="p-4">
              <pre className="text-xs font-mono bg-muted/30 rounded-md p-4 whitespace-pre-wrap break-words leading-relaxed max-h-[50vh] overflow-auto">
                {skill.content}
              </pre>
            </div>
          )}

          {/* Additional files */}
          {fileEntries.length > 0 && !isEditing && (
            <div className="border-t border-border">
              <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                Bundled Files ({fileEntries.length})
              </div>
              <div className="divide-y divide-border">
                {fileEntries.map(([path, content]) => (
                  <div key={path}>
                    <button
                      onClick={() => toggleFile(path)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-accent/30 transition-colors"
                    >
                      {expandedFiles.has(path)
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono">{path}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {content.length} chars
                      </span>
                    </button>
                    {expandedFiles.has(path) && (
                      <div className="px-4 pb-3">
                        <pre className="text-[11px] font-mono bg-muted/30 rounded-md p-3 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                          {content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
