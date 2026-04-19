import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { AGENT_ROLES } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shield, User } from "lucide-react";
import { cn, agentUrl } from "../lib/utils";
import { roleLabels } from "../components/agent-config-primitives";
import { AgentConfigForm, type CreateConfigValues } from "../components/AgentConfigForm";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { AgentIcon } from "../components/AgentIconPicker";
import { PageHeader } from "../components/boared/PageHeader";

export function NewAgent() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("general");
  const [reportsTo, setReportsTo] = useState("");
  const [configValues, setConfigValues] = useState<CreateConfigValues>(defaultCreateValues);
  const [roleOpen, setRoleOpen] = useState(false);
  const [reportsToOpen, setReportsToOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, configValues.adapterType)
      : ["agents", "none", "adapter-models", configValues.adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, configValues.adapterType),
    enabled: Boolean(selectedCompanyId),
  });

  const isFirstAgent = !agents || agents.length === 0;
  const effectiveRole = isFirstAgent ? "ceo" : role;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "New Agent" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (isFirstAgent) {
      if (!name) setName("CEO");
      if (!title) setTitle("CEO");
    }
  }, [isFirstAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      agentsApi.hire(selectedCompanyId!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(agentUrl(result.agent));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  function buildAdapterConfig() {
    const adapter = getUIAdapter(configValues.adapterType);
    return adapter.buildAdapterConfig(configValues);
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    setFormError(null);
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        setFormError("OpenCode requires an explicit model in provider/model format.");
        return;
      }
      if (adapterModelsError) {
        setFormError(
          adapterModelsError instanceof Error
            ? adapterModelsError.message
            : "Failed to load OpenCode models.",
        );
        return;
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        setFormError("OpenCode models are still loading. Please wait and try again.");
        return;
      }
      const discovered = adapterModels ?? [];
      if (!discovered.some((entry) => entry.id === selectedModel)) {
        setFormError(
          discovered.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModel}`,
        );
        return;
      }
    }
    createAgent.mutate({
      name: name.trim(),
      role: effectiveRole,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(reportsTo ? { reportsTo } : {}),
      adapterType: configValues.adapterType,
      adapterConfig: buildAdapterConfig(),
      runtimeConfig: {
        heartbeat: {
          enabled: configValues.heartbeatEnabled,
          intervalSec: configValues.intervalSec,
          wakeOnDemand: true,
          cooldownSec: 10,
          maxConcurrentRuns: 1,
        },
      },
      budgetMonthlyCents: 0,
    });
  }

  const currentReportsTo = (agents ?? []).find((a) => a.id === reportsTo);

  return (
    <div className="boared-reveal max-w-[900px] mx-auto">
      <PageHeader
        kicker={<>§05 · Agents · New</>}
        title={<>A new <em>hire.</em></>}
        dateline={
          selectedCompany
            ? `Hiring into ${selectedCompany.name}`
            : "Advanced agent configuration"
        }
      />

      <div className="border-t border-[var(--boared-rule)]">
        {/* Name */}
        <div className="px-1 pt-5 pb-2">
          <input
            className="w-full boared-display text-[1.75rem] leading-[1.1] bg-transparent outline-none placeholder:text-muted-foreground/50"
            placeholder="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Title */}
        <div className="px-1 pb-3">
          <input
            className="w-full bg-transparent outline-none font-mono text-[0.78rem] text-muted-foreground placeholder:text-muted-foreground/40"
            placeholder="Title (e.g. VP of Engineering)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Property chips: Role + Reports To */}
        <div className="flex items-center gap-1.5 px-1 py-3 border-t border-[var(--boared-rule)] flex-wrap">
          <Popover open={roleOpen} onOpenChange={setRoleOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 border border-foreground px-2 h-7 font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors hover:bg-foreground hover:text-background",
                  isFirstAgent && "opacity-60 cursor-not-allowed hover:bg-transparent hover:text-foreground"
                )}
                disabled={isFirstAgent}
              >
                <Shield className="h-3 w-3" />
                {roleLabels[effectiveRole] ?? effectiveRole}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="start">
              {AGENT_ROLES.map((r) => (
                <button
                  key={r}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-[0.78rem] text-left hover:bg-foreground/[0.06] transition-colors",
                    r === role && "bg-foreground/[0.08]"
                  )}
                  onClick={() => { setRole(r); setRoleOpen(false); }}
                >
                  {roleLabels[r] ?? r}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <Popover open={reportsToOpen} onOpenChange={setReportsToOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 border border-foreground px-2 h-7 font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors hover:bg-foreground hover:text-background",
                  isFirstAgent && "opacity-60 cursor-not-allowed hover:bg-transparent hover:text-foreground"
                )}
                disabled={isFirstAgent}
              >
                {currentReportsTo ? (
                  <>
                    <AgentIcon icon={currentReportsTo.icon} className="h-3 w-3" />
                    {`Reports to ${currentReportsTo.name}`}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3" />
                    {isFirstAgent ? "Reports to: n/a (ceo)" : "Reports to..."}
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-[0.78rem] text-left hover:bg-foreground/[0.06] transition-colors",
                  !reportsTo && "bg-foreground/[0.08]"
                )}
                onClick={() => { setReportsTo(""); setReportsToOpen(false); }}
              >
                No manager
              </button>
              {(agents ?? []).map((a) => (
                <button
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-[0.78rem] text-left hover:bg-foreground/[0.06] truncate transition-colors",
                    a.id === reportsTo && "bg-foreground/[0.08]"
                  )}
                  onClick={() => { setReportsTo(a.id); setReportsToOpen(false); }}
                >
                  <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3" />
                  {a.name}
                  <span className="ml-auto font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">{roleLabels[a.role] ?? a.role}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Shared config form */}
        <div className="border-t border-[var(--boared-rule)]">
          <AgentConfigForm
            mode="create"
            values={configValues}
            onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
            adapterModels={adapterModels}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--boared-rule)] px-1 py-4">
          {isFirstAgent && (
            <p className="font-mono text-[0.68rem] text-muted-foreground mb-2">This will be the ceo.</p>
          )}
          {formError && (
            <p className="font-mono text-[0.68rem] text-destructive mb-2">{formError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || createAgent.isPending}
              onClick={handleSubmit}
            >
              {createAgent.isPending ? "Creating…" : "Create agent"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
