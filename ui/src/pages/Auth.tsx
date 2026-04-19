import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/boared/Wordmark";

type AuthMode = "sign_in" | "sign_up";

function todayDateline(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function AuthPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next") || "/", [searchParams]);
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) {
      navigate(nextPath, { replace: true });
    }
  }, [session, navigate, nextPath]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Authentication failed");
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    (mode === "sign_in" || name.trim().length > 0);

  if (isSessionLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <p className="font-mono text-[0.72rem] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <div className="min-h-full mx-auto max-w-[1080px] px-8 py-10 flex flex-col">
        {/* Masthead row */}
        <header className="flex items-baseline justify-between gap-6 pb-4 border-b border-[var(--boared-rule)]">
          <Wordmark size="lg" />
          <div className="font-mono text-[0.62rem] tracking-[0.08em] uppercase text-muted-foreground">
            Vol. I · No. 001 · {todayDateline()}
          </div>
        </header>

        {/* Edition bar */}
        <div className="boared-label mt-3 mb-8 text-foreground">
          §00 · The Front Page
        </div>

        <div className="boared-reveal grid md:grid-cols-12 gap-10 flex-1">
          {/* Left: editorial title */}
          <div className="md:col-span-7 flex flex-col">
            <h1 className="boared-display text-[clamp(3rem,8vw,6.5rem)] leading-[0.9] text-foreground max-w-[12ch]">
              Boared<span className="text-[var(--boared-acid)]">.</span>
            </h1>
            <p className="font-mono text-[0.72rem] tracking-tight text-muted-foreground mt-5 max-w-[40ch]">
              A quiet daily paper for the company you run. Sign in to read today's edition, or start a new subscription.
            </p>
            <div className="flex-1" />
            <p className="hidden md:block font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground mt-10">
              Printed in ink · Set in Fraunces &amp; Fragment Mono
            </p>
          </div>

          {/* Right: form */}
          <div className="md:col-span-5">
            <div className="border-t border-[var(--boared-rule)] pt-6">
              <div className="boared-label text-foreground mb-2">
                {mode === "sign_in" ? "Sign in" : "New subscription"}
              </div>
              <h2 className="boared-display text-[1.75rem] leading-[1.05] text-foreground max-w-[18ch]">
                {mode === "sign_in" ? (
                  <>
                    Welcome <em>back</em> to the desk.
                  </>
                ) : (
                  <>
                    Start your <em>subscription.</em>
                  </>
                )}
              </h2>

              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate();
                }}
              >
                {mode === "sign_up" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-name" className="boared-label text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id="auth-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email" className="boared-label text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    autoFocus={mode === "sign_in"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-password" className="boared-label text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  />
                </div>
                {error && (
                  <p className="font-mono text-[0.7rem] text-destructive border-l-2 border-destructive pl-2">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={!canSubmit || mutation.isPending}
                  className="w-full"
                >
                  {mutation.isPending
                    ? "Working…"
                    : mode === "sign_in"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </form>

              <div className="mt-5 font-mono text-[0.72rem] text-muted-foreground">
                {mode === "sign_in" ? "Need an account?" : "Already subscribed?"}{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-4 hover:[text-decoration-color:var(--boared-acid)]"
                  onClick={() => {
                    setError(null);
                    setMode(mode === "sign_in" ? "sign_up" : "sign_in");
                  }}
                >
                  {mode === "sign_in" ? "Create one" : "Sign in"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-10 pt-4 border-t border-[var(--boared-rule)] font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground flex items-center justify-between">
          <span>Est. today</span>
          <span>All the news fit to run.</span>
        </footer>
      </div>
    </div>
  );
}
