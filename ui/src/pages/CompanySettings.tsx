import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import { PageHeader } from "@/components/boared/PageHeader";
import { SectionRule } from "@/components/boared/Kicker";
import { Clipping } from "@/components/boared/Clipping";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "agent"
      }),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite"
      );
    }
  });

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);
  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="font-mono text-[0.72rem] text-muted-foreground">
        No organization selected. Pick one from the masthead above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null
    });
  }

  const requireApproval = !!selectedCompany.requireBoardApprovalForNewAgents;

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§20 · Settings</>}
        title={
          <>
            <em>{selectedCompany.name}</em>
            <br />
            house rules.
          </>
        }
        dateline="Identity, branding, approvals, invites"
      />

      <div className="max-w-3xl">
        {/* Identity */}
        <SectionRule label="Identity" />
        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Organization name</Label>
            <Input
              id="company-name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <p className="font-mono text-[0.62rem] text-muted-foreground">
              The display name for your organization.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-description">Description</Label>
            <Textarea
              id="company-description"
              value={description}
              placeholder="Optional description shown in the organization profile."
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* Branding */}
        <SectionRule label="Branding" />
        <div className="flex items-start gap-6 py-2">
          <div className="shrink-0">
            <CompanyPatternIcon
              companyName={companyName || selectedCompany.name}
              brandColor={brandColor || null}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="brand-color-hex">Brand color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor || "#6b1f1f"}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-9 cursor-pointer border border-foreground bg-transparent p-0"
                aria-label="Brand color swatch"
              />
              <Input
                id="brand-color-hex"
                type="text"
                value={brandColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setBrandColor(v);
                  }
                }}
                placeholder="Auto"
                className="w-32 font-mono"
              />
              {brandColor && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBrandColor("")}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="font-mono text-[0.62rem] text-muted-foreground">
              Sets the hue for the organization icon. Leave empty for auto.
            </p>
          </div>
        </div>

        {/* Save bar */}
        {generalDirty && (
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[var(--boared-rule)]">
            <Button
              variant="acid"
              size="sm"
              onClick={handleSaveGeneral}
              disabled={generalMutation.isPending || !companyName.trim()}
            >
              {generalMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
            {generalMutation.isSuccess && (
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">
                Saved
              </span>
            )}
            {generalMutation.isError && (
              <span className="font-mono text-[0.62rem] text-destructive">
                {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
              </span>
            )}
          </div>
        )}

        {/* Approvals */}
        <SectionRule label="Approvals" />
        <div className="py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={requireApproval}
              onCheckedChange={(v) => settingsMutation.mutate(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <div className="text-[0.82rem] text-foreground">
                Require board approval for new hires
              </div>
              <p className="font-mono text-[0.62rem] text-muted-foreground">
                New agent hires stay pending until approved by the board.
              </p>
            </div>
          </label>
        </div>

        {/* Invites */}
        <SectionRule label="Invites" />
        <div className="space-y-4 py-2">
          <p className="text-[0.82rem] text-muted-foreground">
            Generate an agent snippet for join flows. Creates an agent-only
            invite (10m) and renders a copy-ready snippet.
          </p>
          <div>
            <Button
              variant="acid"
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? "Generating…"
                : "Generate agent snippet"}
            </Button>
          </div>
          {inviteError && (
            <p className="font-mono text-[0.7rem] text-destructive">
              {inviteError}
            </p>
          )}
          {inviteSnippet && (
            <div className="border border-foreground">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--boared-rule)]">
                <div className="boared-label">Agent snippet</div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 font-mono uppercase tracking-[0.08em] text-[0.6rem] text-[var(--boared-acid)] animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <Textarea
                className="h-[28rem] w-full border-0 bg-[var(--boared-paper-2)] font-mono text-xs resize-none focus-visible:ring-0"
                value={inviteSnippet}
                readOnly
              />
              <div className="flex justify-end border-t border-[var(--boared-rule)] px-3 py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteSnippet);
                      setSnippetCopied(true);
                      setSnippetCopyDelightId((prev) => prev + 1);
                      setTimeout(() => setSnippetCopied(false), 2000);
                    } catch {
                      /* clipboard may not be available */
                    }
                  }}
                >
                  {snippetCopied ? "Copied snippet" : "Copy snippet"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Danger zone */}
        <SectionRule label="Danger zone" />
        <Clipping
          kicker={<>Archive</>}
          title="Archive this organization"
          className="mt-2"
        >
          <div className="space-y-4">
            <p className="text-[0.82rem] text-muted-foreground">
              Archiving hides this organization from the sidebar. The record
              persists in the database and can be restored by an operator.
            </p>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  archiveMutation.isPending ||
                  selectedCompany.status === "archived"
                }
                onClick={() => {
                  if (!selectedCompanyId) return;
                  const confirmed = window.confirm(
                    `Archive organization "${selectedCompany.name}"? It will be hidden from the sidebar.`
                  );
                  if (!confirmed) return;
                  const nextCompanyId =
                    companies.find(
                      (company) =>
                        company.id !== selectedCompanyId &&
                        company.status !== "archived"
                    )?.id ?? null;
                  archiveMutation.mutate({
                    companyId: selectedCompanyId,
                    nextCompanyId
                  });
                }}
              >
                {archiveMutation.isPending
                  ? "Archiving…"
                  : selectedCompany.status === "archived"
                  ? "Already archived"
                  : "Archive organization"}
              </Button>
              {archiveMutation.isError && (
                <span className="font-mono text-[0.62rem] text-destructive">
                  {archiveMutation.error instanceof Error
                    ? archiveMutation.error.message
                    : "Failed to archive organization"}
                </span>
              )}
            </div>
          </div>
        </Clipping>
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Boared, then retry.
Suggested steps:
- choose a hostname that resolves to the Boared host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Boared
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Boared, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Boared-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Boared. Test it. `
    : "";

  return `You're invited to join a Boared organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Boared, Boared must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Boared can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Boared will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Boared (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
