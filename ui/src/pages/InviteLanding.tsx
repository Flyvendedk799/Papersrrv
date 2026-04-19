import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Wordmark } from "@/components/boared/Wordmark";
import { cn } from "@/lib/utils";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";

type JoinType = "human" | "agent";
const joinAdapterOptions: AgentAdapterType[] = [
  "openclaw",
  ...AGENT_ADAPTER_TYPES.filter((type): type is Exclude<AgentAdapterType, "openclaw"> => type !== "openclaw"),
];

const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  codex_local: "Codex (local)",
  opencode_local: "OpenCode (local)",
  openclaw: "OpenClaw",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
};

const ENABLED_INVITE_ADAPTERS = new Set(["claude_local", "codex_local", "opencode_local", "cursor"]);

function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

function InviteShell({
  kicker,
  title,
  dateline,
  children,
}: {
  kicker: string;
  title: React.ReactNode;
  dateline?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div className="min-h-full mx-auto max-w-[1080px] px-8 py-10 flex flex-col">
        <header className="flex items-baseline justify-between gap-6 pb-4 border-b border-[var(--boared-rule)]">
          <Wordmark size="lg" />
          <span className="font-mono text-[0.62rem] tracking-[0.1em] uppercase text-muted-foreground">
            Invitation · Press desk
          </span>
        </header>

        <div className="boared-reveal mt-10">
          <div className="boared-label text-foreground mb-3">{kicker}</div>
          <h1 className="boared-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] text-foreground max-w-[22ch]">
            {title}
          </h1>
          {dateline && (
            <p className="font-mono text-[0.7rem] tracking-tight text-muted-foreground mt-3">
              {dateline}
            </p>
          )}
          <div className="mt-10 max-w-[64ch]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--boared-rule)] py-3">
      <div className="boared-label text-foreground mb-1">{label}</div>
      <div className="font-mono text-[0.72rem] break-all text-foreground">{value}</div>
    </div>
  );
}

export function InviteLandingPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [joinType, setJoinType] = useState<JoinType>("human");
  const [agentName, setAgentName] = useState("");
  const [adapterType, setAdapterType] = useState<AgentAdapterType>("claude_local");
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });

  const invite = inviteQuery.data;
  const allowedJoinTypes = invite?.allowedJoinTypes ?? "both";
  const availableJoinTypes = useMemo(() => {
    if (invite?.inviteType === "bootstrap_ceo") return ["human"] as JoinType[];
    if (allowedJoinTypes === "both") return ["human", "agent"] as JoinType[];
    return [allowedJoinTypes] as JoinType[];
  }, [invite?.inviteType, allowedJoinTypes]);

  useEffect(() => {
    if (!availableJoinTypes.includes(joinType)) {
      setJoinType(availableJoinTypes[0] ?? "human");
    }
  }, [availableJoinTypes, joinType]);

  const requiresAuthForHuman =
    joinType === "human" &&
    healthQuery.data?.deploymentMode === "authenticated" &&
    !sessionQuery.data;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error("Invite not found");
      if (invite.inviteType === "bootstrap_ceo") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      if (joinType === "human") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const asBootstrap =
        payload && typeof payload === "object" && "bootstrapAccepted" in (payload as Record<string, unknown>);
      setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    },
  });

  if (!token) {
    return (
      <InviteShell kicker="§ · Invalid" title="Invalid invite token.">
        <p className="font-mono text-[0.75rem] text-destructive">No token was provided.</p>
      </InviteShell>
    );
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return (
      <InviteShell kicker="§ · Loading" title="One moment.">
        <p className="font-mono text-[0.75rem] text-muted-foreground">Loading invite…</p>
      </InviteShell>
    );
  }

  if (inviteQuery.error || !invite) {
    return (
      <InviteShell
        kicker="§ · Gone"
        title={<>This invite is <em>not available.</em></>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground">
          This invite may be expired, revoked, or already used.
        </p>
      </InviteShell>
    );
  }

  if (result?.kind === "bootstrap") {
    return (
      <InviteShell
        kicker="§ · Bootstrapped"
        title={<>The press is <em>set.</em></>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground mb-6">
          The first instance admin is now configured. You can continue to the board.
        </p>
        <Button asChild>
          <Link to="/">Open board</Link>
        </Button>
      </InviteShell>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
      diagnostics?: Array<{
        code: string;
        level: "info" | "warn";
        message: string;
        hint?: string;
      }>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingSkillUrl = readNestedString(payload.onboarding, ["skill", "url"]);
    const onboardingSkillPath = readNestedString(payload.onboarding, ["skill", "path"]);
    const onboardingInstallPath = readNestedString(payload.onboarding, ["skill", "installPath"]);
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const onboardingTextPath = readNestedString(payload.onboarding, ["textInstructions", "path"]);
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    return (
      <InviteShell
        kicker="§ · Submitted"
        title={<>Request <em>filed.</em></>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground mb-4">
          Your request is pending admin approval. You will not have access until approved.
        </p>

        <Fact label="Request ID" value={payload.id} />

        {claimSecret && claimApiKeyPath && (
          <>
            <Fact
              label="One-time claim secret (save now)"
              value={
                <div className="space-y-1">
                  <div>{claimSecret}</div>
                  <div className="text-muted-foreground">POST {claimApiKeyPath}</div>
                </div>
              }
            />
          </>
        )}

        {(onboardingSkillUrl || onboardingSkillPath || onboardingInstallPath) && (
          <Fact
            label="Boared skill bootstrap"
            value={
              <div className="space-y-1">
                {onboardingSkillUrl && <div>GET {onboardingSkillUrl}</div>}
                {!onboardingSkillUrl && onboardingSkillPath && <div>GET {onboardingSkillPath}</div>}
                {onboardingInstallPath && (
                  <div className="text-muted-foreground">Install to {onboardingInstallPath}</div>
                )}
              </div>
            }
          />
        )}

        {(onboardingTextUrl || onboardingTextPath) && (
          <Fact
            label="Agent-readable onboarding text"
            value={
              <div className="space-y-1">
                {onboardingTextUrl && <div>GET {onboardingTextUrl}</div>}
                {!onboardingTextUrl && onboardingTextPath && <div>GET {onboardingTextPath}</div>}
              </div>
            }
          />
        )}

        {diagnostics.length > 0 && (
          <Fact
            label="Connectivity diagnostics"
            value={
              <div className="space-y-2">
                {diagnostics.map((diag, idx) => (
                  <div key={`${diag.code}:${idx}`} className="space-y-0.5">
                    <p className={diag.level === "warn" ? "text-[var(--boared-acid)]" : undefined}>
                      [{diag.level}] {diag.message}
                    </p>
                    {diag.hint && <p className="text-muted-foreground">{diag.hint}</p>}
                  </div>
                ))}
              </div>
            }
          />
        )}
      </InviteShell>
    );
  }

  return (
    <InviteShell
      kicker={invite.inviteType === "bootstrap_ceo" ? "§ · Bootstrap" : "§ · Invitation"}
      title={
        invite.inviteType === "bootstrap_ceo" ? (
          <>
            Bootstrap your <em>Boared</em> instance.
          </>
        ) : (
          <>
            You're invited to <em>join.</em>
          </>
        )
      }
      dateline={`Invite expires ${dateTime(invite.expiresAt)}`}
    >
      {invite.inviteType !== "bootstrap_ceo" && (
        <div className="mb-6">
          <div className="boared-label text-muted-foreground mb-2">Join as</div>
          <div className="flex gap-0 border border-foreground w-fit">
            {availableJoinTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setJoinType(type)}
                className={cn(
                  "px-4 h-9 font-mono text-[0.7rem] uppercase tracking-[0.08em] transition-colors",
                  joinType === type
                    ? "bg-foreground text-background"
                    : "bg-background text-foreground hover:bg-foreground/5",
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && (
        <div className="space-y-4 mb-6 max-w-[44ch]">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name" className="boared-label text-muted-foreground">
              Agent name
            </Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adapter-type" className="boared-label text-muted-foreground">
              Adapter type
            </Label>
            <Select value={adapterType} onValueChange={(v) => setAdapterType(v as AgentAdapterType)}>
              <SelectTrigger id="adapter-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {joinAdapterOptions.map((type) => (
                  <SelectItem key={type} value={type} disabled={!ENABLED_INVITE_ADAPTERS.has(type)}>
                    {adapterLabels[type]}
                    {!ENABLED_INVITE_ADAPTERS.has(type) ? " (coming soon)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="capabilities" className="boared-label text-muted-foreground">
              Capabilities (optional)
            </Label>
            <Textarea
              id="capabilities"
              rows={4}
              value={capabilities}
              onChange={(event) => setCapabilities(event.target.value)}
            />
          </div>
        </div>
      )}

      {requiresAuthForHuman && (
        <div className="mb-5 p-4 border border-foreground bg-[var(--boared-paper-2)] max-w-[56ch]">
          <p className="font-mono text-[0.72rem] text-foreground">
            Sign in or create an account before submitting a human join request.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link to={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in / Create account</Link>
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 font-mono text-[0.7rem] text-destructive border-l-2 border-destructive pl-2">
          {error}
        </p>
      )}

      <Button
        disabled={
          acceptMutation.isPending ||
          (joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && agentName.trim().length === 0) ||
          requiresAuthForHuman
        }
        onClick={() => acceptMutation.mutate()}
      >
        {acceptMutation.isPending
          ? "Submitting…"
          : invite.inviteType === "bootstrap_ceo"
            ? "Accept bootstrap invite"
            : "Submit join request"}
      </Button>
    </InviteShell>
  );
}
