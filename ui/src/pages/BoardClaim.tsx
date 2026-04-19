import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/boared/Wordmark";

function ClaimShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div className="min-h-full mx-auto max-w-[900px] px-8 py-10 flex flex-col">
        <header className="flex items-baseline justify-between gap-6 pb-4 border-b border-[var(--boared-rule)]">
          <Wordmark size="lg" />
          <span className="font-mono text-[0.62rem] tracking-[0.1em] uppercase text-muted-foreground">
            Ownership · Board claim
          </span>
        </header>

        <div className="boared-reveal mt-10 grid md:grid-cols-12 gap-10">
          <div className="md:col-span-12">
            <div className="boared-label text-foreground mb-3">{kicker}</div>
            <h1 className="boared-display text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95] text-foreground max-w-[22ch]">
              {title}
            </h1>
            <div className="mt-8 max-w-[56ch]">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BoardClaimPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = (params.token ?? "").trim();
  const code = (searchParams.get("code") ?? "").trim();
  const currentPath = useMemo(
    () => `/board-claim/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ""}`,
    [token, code],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["board-claim", token, code],
    queryFn: () => accessApi.getBoardClaimStatus(token, code),
    enabled: token.length > 0 && code.length > 0,
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBoard(token, code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await statusQuery.refetch();
    },
  });

  if (!token || !code) {
    return (
      <ClaimShell
        kicker="§ · Invalid URL"
        title={<>Something's <em>off</em> with this link.</>}
      >
        <p className="font-mono text-[0.75rem] text-destructive">Invalid board claim URL.</p>
      </ClaimShell>
    );
  }

  if (statusQuery.isLoading || sessionQuery.isLoading) {
    return (
      <ClaimShell kicker="§ · Loading" title="One moment.">
        <p className="font-mono text-[0.75rem] text-muted-foreground">Loading claim challenge…</p>
      </ClaimShell>
    );
  }

  if (statusQuery.error) {
    return (
      <ClaimShell
        kicker="§ · Unavailable"
        title={<>Claim challenge <em>unavailable.</em></>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground">
          {statusQuery.error instanceof Error ? statusQuery.error.message : "Challenge is invalid or expired."}
        </p>
      </ClaimShell>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return (
      <ClaimShell kicker="§ · Unavailable" title="Claim challenge unavailable.">
        <p className="font-mono text-[0.75rem] text-destructive">No challenge payload returned.</p>
      </ClaimShell>
    );
  }

  if (status.status === "claimed") {
    return (
      <ClaimShell
        kicker="§ · Claimed"
        title={<>The <em>board</em> is yours.</>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground mb-6">
          This instance is now linked to your authenticated user.
        </p>
        <Button asChild>
          <Link to="/">Open board</Link>
        </Button>
      </ClaimShell>
    );
  }

  if (!sessionQuery.data) {
    return (
      <ClaimShell
        kicker="§ · Sign in required"
        title={<>First, <em>sign in.</em></>}
      >
        <p className="font-mono text-[0.75rem] text-muted-foreground mb-6">
          Sign in or create an account, then return to this page to claim board ownership.
        </p>
        <Button asChild>
          <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>Sign in / Create account</Link>
        </Button>
      </ClaimShell>
    );
  }

  return (
    <ClaimShell
      kicker="§ · Ownership"
      title={<>Claim <em>ownership</em> of the board.</>}
    >
      <p className="font-mono text-[0.75rem] text-muted-foreground mb-4">
        This will promote your user to instance admin and migrate company ownership access from local trusted mode.
      </p>

      {claimMutation.error && (
        <p className="mb-4 font-mono text-[0.7rem] text-destructive border-l-2 border-destructive pl-2">
          {claimMutation.error instanceof Error ? claimMutation.error.message : "Failed to claim board ownership"}
        </p>
      )}

      <Button
        onClick={() => claimMutation.mutate()}
        disabled={claimMutation.isPending}
      >
        {claimMutation.isPending ? "Claiming…" : "Claim ownership"}
      </Button>
    </ClaimShell>
  );
}
