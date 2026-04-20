/**
 * CasePlanDocument — renders a planning issue's PlanOutput as a
 * structured, readable document inside the "What was made" section.
 * Surfaced as the PRIMARY artifact for planning-kind issues.
 */

import type { PlanOutput } from "@paperclipai/shared";
import { cn } from "../../../lib/utils";

interface Props {
  plan: PlanOutput;
  className?: string;
  /** When set, the component fades in with a subtle animation on
   * mount. Useful for synthesis-driven loads. */
  animateIn?: boolean;
}

export function CasePlanDocument({ plan, className, animateIn }: Props) {
  return (
    <article
      className={cn(
        "border-2 border-[var(--boared-acid)]/30 bg-[var(--boared-paper-2)]/50 p-5 space-y-4",
        animateIn && "animate-in fade-in duration-500",
        className,
      )}
    >
      {/* Kicker + summary */}
      <header className="space-y-1.5 pb-3 border-b border-[var(--boared-acid)]/20">
        <div className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-acid)]">
          ✦ The final plan
        </div>
        <p className="font-serif italic text-[1.08rem] leading-[1.4] text-[var(--boared-ink)]">
          {plan.summary}
        </p>
      </header>

      {/* Context */}
      {plan.context && (
        <section className="space-y-1.5">
          <h4 className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            Context
          </h4>
          <p className="text-[0.88rem] leading-[1.55] text-[var(--boared-ink-soft)] whitespace-pre-wrap">
            {plan.context}
          </p>
        </section>
      )}

      {/* Steps */}
      <section className="space-y-2">
        <h4 className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
          Proposed steps · {plan.proposedSteps.length}
        </h4>
        <ol className="space-y-2.5">
          {plan.proposedSteps.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 pb-2.5 border-b border-[var(--boared-rule)]/50 last:border-0 last:pb-0"
            >
              <span className="inline-flex items-center justify-center h-6 w-6 shrink-0 border border-[var(--boared-ink-soft)] font-mono text-[0.62rem] text-[var(--boared-ink)] tabular-nums mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h5 className="font-serif italic text-[0.96rem] leading-snug text-[var(--boared-ink)]">
                    {step.title}
                  </h5>
                  {step.owner && (
                    <span className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                      → {step.owner}
                    </span>
                  )}
                  {step.effort && (
                    <span
                      className={cn(
                        "font-mono text-[0.54rem] uppercase tracking-[0.14em] px-1 border",
                        step.effort === "large"
                          ? "text-[var(--boared-warn)] border-[var(--boared-warn)]/40"
                          : step.effort === "medium"
                            ? "text-[var(--boared-ink)] border-[var(--boared-rule)]"
                            : "text-[var(--boared-ink-faint)] border-[var(--boared-rule)]",
                      )}
                    >
                      {step.effort}
                    </span>
                  )}
                </div>
                <p className="text-[0.84rem] leading-snug text-[var(--boared-ink-soft)] whitespace-pre-wrap">
                  {step.detail}
                </p>
                {step.dependsOn && step.dependsOn.length > 0 && (
                  <div className="font-mono text-[0.54rem] uppercase tracking-[0.14em] text-[var(--boared-ink-faint)]">
                    Depends on · {step.dependsOn.map((d) => `#${d + 1}`).join(", ")}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Risks */}
      {plan.risks && plan.risks.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-warn)]">
            Risks · {plan.risks.length}
          </h4>
          <ul className="space-y-1">
            {plan.risks.map((risk, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[0.84rem] leading-snug text-[var(--boared-ink-soft)]"
              >
                <span aria-hidden="true" className="text-[var(--boared-warn)] mt-1">
                  ⚠
                </span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Open questions */}
      {plan.openQuestions && plan.openQuestions.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-info)]">
            Open questions · {plan.openQuestions.length}
          </h4>
          <ul className="space-y-1">
            {plan.openQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[0.84rem] leading-snug text-[var(--boared-ink-soft)]"
              >
                <span aria-hidden="true" className="inline-block w-3 h-3 border border-[var(--boared-info)] mt-1 shrink-0" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Delegations */}
      {plan.delegations && plan.delegations.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="font-mono text-[0.54rem] uppercase tracking-[0.22em] text-[var(--boared-ink-faint)]">
            Suggested owners · {plan.delegations.length}
          </h4>
          <ul className="space-y-1.5">
            {plan.delegations.map((d, i) => (
              <li key={i} className="text-[0.84rem] leading-snug text-[var(--boared-ink)]">
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--boared-review)]">
                  {d.agent}
                </span>
                <span className="text-[var(--boared-ink-soft)]"> — {d.task}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
