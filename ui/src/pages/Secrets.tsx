import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Plus, RotateCw, Trash2, Search, Shield,
  Bot, ChevronDown, ChevronRight, Copy, Eye, EyeOff, X,
} from "lucide-react";
import { secretsApi, type SecretUsageEntry } from "../api/secrets";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
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
import type { CompanySecret, Agent } from "@paperclipai/shared";

/* ---- Main Page ---- */

export function Secrets() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;

  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<CompanySecret | null>(null);
  const [editTarget, setEditTarget] = useState<CompanySecret | null>(null);
  const [grantTarget, setGrantTarget] = useState<CompanySecret | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Secrets" }]);
  }, [setBreadcrumbs]);

  const { data: secrets, isLoading } = useQuery({
    queryKey: queryKeys.secrets.list(companyId),
    queryFn: () => secretsApi.list(companyId),
    enabled: !!selectedCompanyId,
  });

  const { data: usage } = useQuery({
    queryKey: queryKeys.secrets.usage(companyId),
    queryFn: () => secretsApi.usage(companyId),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!selectedCompanyId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      pushToast({ title: "Secret deleted", tone: "info" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to delete secret", body: (err as Error).message, tone: "error" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (data: { secretId: string; agentId: string; envKey: string }) =>
      secretsApi.revoke(data.secretId, { agentId: data.agentId, envKey: data.envKey }),
    onSuccess: () => {
      invalidateAll();
      pushToast({ title: "Access revoked", tone: "info" });
    },
    onError: (err) => {
      pushToast({ title: "Failed to revoke access", body: (err as Error).message, tone: "error" });
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.usage(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
  }

  const filtered = secrets?.filter((s) =>
    !searchTerm ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  ) ?? [];

  if (!selectedCompanyId) {
    return <EmptyState icon={KeyRound} message="Select a company to manage secrets." />;
  }

  if (isLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Secrets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage encrypted secrets and control which agents can access them.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Secret
        </Button>
      </div>

      {/* Search */}
      {secrets && secrets.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search secrets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-full max-w-xs rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Secrets list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          message={
            secrets?.length === 0
              ? "No secrets yet. Create your first secret to securely share tokens, API keys, and credentials with your agents."
              : "No secrets match your search."
          }
          action={secrets?.length === 0 ? "New Secret" : undefined}
          onAction={secrets?.length === 0 ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {filtered.map((secret) => {
            const secretUsage = usage?.[secret.id] ?? [];
            const isExpanded = expandedId === secret.id;

            return (
              <div key={secret.id}>
                {/* Secret row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : secret.id)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <KeyRound className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium font-mono truncate">{secret.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        v{secret.latestVersion}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {secret.provider === "local_encrypted" ? "encrypted" : secret.provider}
                      </Badge>
                    </div>
                    {secret.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{secret.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {secretUsage.length > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        {secretUsage.length} agent{secretUsage.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">unused</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(secret.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-muted/20 border-t border-border">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Left: metadata + actions */}
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground">Name</span>
                            <span className="text-xs font-mono">{secret.name}</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground">Provider</span>
                            <span className="text-xs">{secret.provider}</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground">Version</span>
                            <span className="text-xs">{secret.latestVersion}</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground">Created</span>
                            <span className="text-xs">{new Date(secret.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground">Updated</span>
                            <span className="text-xs">{new Date(secret.updatedAt).toLocaleString()}</span>
                          </div>
                          {secret.description && (
                            <div className="flex items-center justify-between py-1">
                              <span className="text-xs text-muted-foreground">Description</span>
                              <span className="text-xs truncate max-w-[200px]">{secret.description}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setEditTarget(secret); }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setRotateTarget(secret); }}
                          >
                            <RotateCw className="h-3 w-3 mr-1" />
                            Rotate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete secret "${secret.name}"? Any agents referencing it will lose access.`)) {
                                deleteMutation.mutate(secret.id);
                                setExpandedId(null);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Right: agent access */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Access</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px]"
                            onClick={(e) => { e.stopPropagation(); setGrantTarget(secret); }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Grant
                          </Button>
                        </div>

                        {secretUsage.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 text-center">
                            No agents have access. Grant access to let agents use this secret.
                          </p>
                        ) : (
                          <div className="border border-border rounded-md divide-y divide-border">
                            {secretUsage.map((entry) => (
                              <div
                                key={`${entry.agentId}-${entry.envKey}`}
                                className="flex items-center gap-2 px-3 py-2"
                              >
                                <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium flex-1 truncate">{entry.agentName}</span>
                                <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                  {entry.envKey}
                                </code>
                                <StatusDot status={entry.agentStatus} />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Remove ${entry.agentName}'s access to "${secret.name}" via ${entry.envKey}?`)) {
                                      revokeMutation.mutate({
                                        secretId: secret.id,
                                        agentId: entry.agentId,
                                        envKey: entry.envKey,
                                      });
                                    }
                                  }}
                                  className="p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateSecretDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        onCreated={invalidateAll}
      />
      {rotateTarget && (
        <RotateSecretDialog
          secret={rotateTarget}
          onOpenChange={(open) => { if (!open) setRotateTarget(null); }}
          onRotated={invalidateAll}
        />
      )}
      {editTarget && (
        <EditSecretDialog
          secret={editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          onUpdated={invalidateAll}
        />
      )}
      {grantTarget && (
        <GrantAccessDialog
          secret={grantTarget}
          agents={agents ?? []}
          existingUsage={usage?.[grantTarget.id] ?? []}
          onOpenChange={(open) => { if (!open) setGrantTarget(null); }}
          onGranted={invalidateAll}
        />
      )}
    </div>
  );
}

/* ---- Status dot ---- */

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running" ? "bg-cyan-500 animate-pulse" :
    status === "active" || status === "idle" ? "bg-green-500" :
    status === "paused" ? "bg-yellow-500" :
    status === "error" ? "bg-red-500" :
    "bg-neutral-400";

  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", color)} />;
}

/* ---- Create Secret Dialog ---- */

function CreateSecretDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated: () => void;
}) {
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [showValue, setShowValue] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      secretsApi.create(companyId, {
        name: name.trim(),
        value,
        description: description.trim() || null,
      }),
    onSuccess: (secret) => {
      pushToast({ title: "Secret created", body: secret.name, tone: "success" });
      onCreated();
      onOpenChange(false);
      setName("");
      setValue("");
      setDescription("");
      setShowValue(false);
    },
    onError: (err) => {
      pushToast({ title: "Failed to create secret", body: (err as Error).message, tone: "error" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Secret</DialogTitle>
          <DialogDescription>
            Create an encrypted secret. You can grant agents access after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. GITHUB_TOKEN, OPENAI_API_KEY"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Unique name for this secret. Use UPPER_SNAKE_CASE by convention.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <div className="relative">
              <Input
                type={showValue ? "text" : "password"}
                placeholder="Secret value..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pr-9 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Encrypted at rest with AES-256-GCM. Never stored in plaintext.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="What is this secret for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !value || mutation.isPending}
          >
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            {mutation.isPending ? "Creating..." : "Create Secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Rotate Secret Dialog ---- */

function RotateSecretDialog({
  secret,
  onOpenChange,
  onRotated,
}: {
  secret: CompanySecret;
  onOpenChange: (open: boolean) => void;
  onRotated: () => void;
}) {
  const { pushToast } = useToast();
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  const mutation = useMutation({
    mutationFn: () => secretsApi.rotate(secret.id, { value }),
    onSuccess: () => {
      pushToast({ title: "Secret rotated", body: `${secret.name} is now v${secret.latestVersion + 1}`, tone: "success" });
      onRotated();
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({ title: "Failed to rotate secret", body: (err as Error).message, tone: "error" });
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate Secret</DialogTitle>
          <DialogDescription>
            Set a new value for <code className="font-mono text-xs">{secret.name}</code>. All agents referencing this secret will use the new value on their next run.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New Value</Label>
            <div className="relative">
              <Input
                type={showValue ? "text" : "password"}
                placeholder="New secret value..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pr-9 font-mono text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Current version: v{secret.latestVersion}. This will create v{secret.latestVersion + 1}.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!value || mutation.isPending}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1.5" />
            {mutation.isPending ? "Rotating..." : "Rotate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Edit Secret Dialog ---- */

function EditSecretDialog({
  secret,
  onOpenChange,
  onUpdated,
}: {
  secret: CompanySecret;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { pushToast } = useToast();
  const [name, setName] = useState(secret.name);
  const [description, setDescription] = useState(secret.description ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      secretsApi.update(secret.id, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      pushToast({ title: "Secret updated", tone: "success" });
      onUpdated();
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({ title: "Failed to update secret", body: (err as Error).message, tone: "error" });
    },
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Secret</DialogTitle>
          <DialogDescription>
            Update metadata for <code className="font-mono text-xs">{secret.name}</code>. To change the value, use Rotate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this secret for?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Grant Access Dialog ---- */

function GrantAccessDialog({
  secret,
  agents,
  existingUsage,
  onOpenChange,
  onGranted,
}: {
  secret: CompanySecret;
  agents: Agent[];
  existingUsage: SecretUsageEntry[];
  onOpenChange: (open: boolean) => void;
  onGranted: () => void;
}) {
  const { pushToast } = useToast();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [envKey, setEnvKey] = useState(secret.name);
  const [agentSearch, setAgentSearch] = useState("");

  // Filter out terminated agents and sort by name
  const availableAgents = agents
    .filter((a) => a.status !== "terminated")
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredAgents = availableAgents.filter((a) =>
    !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase()),
  );

  // Check if agent already has this secret with this key
  const alreadyGranted = existingUsage.some(
    (u) => u.agentId === selectedAgentId && u.envKey === envKey,
  );

  const mutation = useMutation({
    mutationFn: () => secretsApi.grant(secret.id, { agentId: selectedAgentId, envKey: envKey.trim() }),
    onSuccess: () => {
      const agentName = agents.find((a) => a.id === selectedAgentId)?.name ?? "Agent";
      pushToast({
        title: "Access granted",
        body: `${agentName} can now access ${secret.name} via $${envKey}`,
        tone: "success",
      });
      onGranted();
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({ title: "Failed to grant access", body: (err as Error).message, tone: "error" });
    },
  });

  const validEnvKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey.trim());

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant Agent Access</DialogTitle>
          <DialogDescription>
            Give an agent access to <code className="font-mono text-xs">{secret.name}</code> by injecting it as an environment variable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Agent selector */}
          <div className="space-y-2">
            <Label>Agent</Label>
            {availableAgents.length > 5 && (
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
            <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {filteredAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No agents found</p>
              ) : (
                filteredAgents.map((agent) => {
                  const isSelected = selectedAgentId === agent.id;
                  const hasAccess = existingUsage.some((u) => u.agentId === agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-left transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium flex-1 truncate">{agent.name}</span>
                      {agent.role && (
                        <span className="text-[10px] text-muted-foreground">{agent.role}</span>
                      )}
                      <StatusDot status={agent.status} />
                      {hasAccess && (
                        <Badge variant="secondary" className="text-[10px]">has access</Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Env key */}
          <div className="space-y-2">
            <Label>Environment Variable Name</Label>
            <Input
              value={envKey}
              onChange={(e) => setEnvKey(e.target.value)}
              placeholder="e.g. GITHUB_TOKEN"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              The agent will receive the decrypted secret value as <code className="font-mono">${envKey}</code> at runtime.
            </p>
            {envKey && !validEnvKey && (
              <p className="text-[10px] text-destructive">
                Must start with a letter or underscore. Only letters, digits, and underscores.
              </p>
            )}
            {alreadyGranted && (
              <p className="text-[10px] text-amber-500">
                This agent already has this secret bound to {envKey}. Granting will overwrite.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedAgentId || !validEnvKey || mutation.isPending}
          >
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            {mutation.isPending ? "Granting..." : "Grant Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
