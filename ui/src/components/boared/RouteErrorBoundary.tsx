/**
 * RouteErrorBoundary — per-route error boundary that isolates a
 * crashed page so it doesn't nuke the whole app. Renders a
 * Boared-style error pane with the error message, a retry
 * action, and a link back to the dashboard.
 *
 * Wrapped around each top-level <Route element> in App.tsx.
 */

import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  /** Short route name shown in the error pane's kicker. */
  routeName?: string;
}

interface State {
  err: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", this.props.routeName ?? "route", err, info);
  }

  reset = () => this.setState({ err: null });

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-12">
        <div className="border-2 border-[var(--boared-acid)]/50 bg-[var(--boared-acid)]/[0.03] p-6 space-y-4">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
            Something broke on this {this.props.routeName ?? "page"}
          </div>
          <p className="font-serif italic text-[1.2rem] leading-tight text-[var(--boared-ink)]">
            We hit an unexpected error rendering this view.
          </p>
          <p className="text-[0.88rem] text-[var(--boared-ink)]">
            <span className="font-mono text-[0.76rem] text-[var(--boared-ink-soft)]">
              {this.state.err.message || "No message"}
            </span>
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center h-8 px-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-ink)] text-[var(--boared-ink)] hover:bg-[var(--boared-paper-2)] transition-colors"
            >
              Try again
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center h-8 px-4 font-mono text-[0.6rem] uppercase tracking-[0.14em] border border-[var(--boared-rule)] text-[var(--boared-ink-faint)] hover:text-[var(--boared-ink)] transition-colors no-underline"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
