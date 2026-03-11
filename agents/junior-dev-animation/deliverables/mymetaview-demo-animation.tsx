// MyMetaView 5.0 Demo Generation Experience
// Copy to: your marketing/demo frontend repo and wire to real APIs.
// Stack: React + Tailwind CSS + Framer Motion

import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type DemoStatus =
  | "configure"
  | "submitting"
  | "generating"
  | "results_success"
  | "results_partial"
  | "results_error";

type ItemStatus = "pending" | "generating" | "success" | "error";

export interface DemoItem {
  id: string;
  url: string;
  status: ItemStatus;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface DemoGenerationExperienceProps {
  /**
   * Optional seed items (e.g. from a previous run or server prefetch).
   */
  initialItems?: DemoItem[];
  /**
   * Called when the user submits URLs.
   * Implementers should:
   * - create a backend job
   * - resolve when the job is accepted
   */
  onCreateJob?: (urls: string[]) => Promise<void>;
  /**
   * Called periodically while `status === "generating"` to poll job state.
   * Should return the latest set of demo items with statuses and thumbnails.
   */
  onPollJob?: () => Promise<DemoItem[]>;
  /**
   * Polling interval in ms while generating.
   * Default: 1500ms.
   */
  pollIntervalMs?: number;
}

export const DemoGenerationExperience: React.FC<
  DemoGenerationExperienceProps
> = ({ initialItems, onCreateJob, onPollJob, pollIntervalMs = 1500 }) => {
  const prefersReduced = useReducedMotion();

  const [status, setStatus] = useState<DemoStatus>(
    initialItems && initialItems.length > 0 ? "results_success" : "configure",
  );
  const [urlsInput, setUrlsInput] = useState("");
  const [items, setItems] = useState<DemoItem[]>(initialItems ?? []);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasAnySuccess = useMemo(
    () => items.some((item) => item.status === "success"),
    [items],
  );
  const hasAnyError = useMemo(
    () => items.some((item) => item.status === "error"),
    [items],
  );

  useEffect(() => {
    if (status !== "generating") return;

    if (prefersReduced) {
      setProgress(100);
      return;
    }

    setProgress(8);
    const start = performance.now();

    const tick = () => {
      setProgress((current) => {
        const elapsed = performance.now() - start;
        const target = Math.min(92, Math.max(current, elapsed / 40));
        return target;
      });
      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [status, prefersReduced]);

  useEffect(() => {
    if (status !== "generating" || !onPollJob) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const next = await onPollJob();
        if (!active) return;
        setItems(next);

        const total = next.length;
        const successCount = next.filter((i) => i.status === "success").length;
        const errorCount = next.filter((i) => i.status === "error").length;
        const doneCount = successCount + errorCount;

        if (total > 0) {
          setProgress((prev) =>
            prefersReduced
              ? 100
              : Math.max(prev, 92 + (doneCount / total) * 8),
          );
        }

        if (total > 0 && doneCount === total) {
          if (successCount > 0 && errorCount > 0) {
            setStatus("results_partial");
          } else if (successCount > 0) {
            setStatus("results_success");
          } else {
            setStatus("results_error");
          }
        }
      } catch (err) {
        if (!active) return;
        console.error("Error polling demo job", err);
        setErrorMessage("We hit a problem fetching the latest previews.");
        setStatus("results_error");
      }
    }, pollIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, onPollJob, pollIntervalMs, prefersReduced]);

  const handleSubmit: React.FormEventHandler = async (event) => {
    event.preventDefault();
    setErrorMessage(null);

    const raw = urlsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (raw.length === 0) {
      setErrorMessage("Add at least one URL to generate a demo.");
      return;
    }

    const nextItems: DemoItem[] = raw.map((url, index) => ({
      id: `${Date.now()}-${index}`,
      url,
      status: "pending",
    }));

    setItems(nextItems);
    setStatus("submitting");

    try {
      if (onCreateJob) {
        await onCreateJob(raw);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setStatus("generating");
    } catch (err) {
      console.error("Error creating demo job", err);
      setErrorMessage("We couldn't start your demo generation. Please try again.");
      setStatus("results_error");
    }
  };

  const handleRetryFailed = () => {
    const failed = items.filter((item) => item.status === "error");
    if (!failed.length) return;

    setUrlsInput(failed.map((item) => item.url).join("\n"));
    setStatus("configure");
  };

  const handleEditUrls = () => {
    setStatus("configure");
  };

  const isLoading = status === "submitting" || status === "generating";

  const heroMotion = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
      };

  const formMotion = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
      };

  const gridMotion = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
      };

  return (
    <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <motion.header
        {...heroMotion}
        className="space-y-2"
        aria-label="MyMetaView 5.0 demo generation"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400/80">
          MyMetaView 5.0
        </p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
          Generate live product demos from any URL.
        </h1>
        <p className="max-w-2xl text-sm text-slate-300/80 sm:text-[0.95rem]">
          Drop in your marketing or app URLs and watch MyMetaView assemble a
          polished, ready-to-share demo experience.
        </p>
      </motion.header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)] lg:items-start">
        <section className="space-y-4">
          <AnimatePresence mode="wait">
            {status === "configure" && (
              <motion.form
                key="configure-form"
                onSubmit={handleSubmit}
                className="mv-fade-up relative rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 shadow-[0_18px_45px_rgba(2,6,23,0.75)] backdrop-blur"
                {...formMotion}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-slate-50">
                    New demo preview
                  </h2>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-300 ring-1 ring-emerald-500/40">
                    Live animation
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-slate-200/80">
                    URLs to include
                    <span className="ml-1 text-[0.65rem] font-normal text-slate-400">
                      (one per line)
                    </span>
                  </label>
                  <textarea
                    className="mt-1 h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-50 outline-none ring-0 transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:bg-slate-900/80"
                    placeholder="https://your-product-url.com/demo&#10;https://another-page.com"
                    value={urlsInput}
                    onChange={(e) => setUrlsInput(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-xs text-[0.7rem] text-slate-400/90">
                    We&apos;ll scan each URL and assemble a cohesive demo flow
                    with scenes, highlights, and timing that feels live.
                  </p>
                  <motion.button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-4 py-2 text-xs font-medium text-slate-950 shadow-lg shadow-sky-500/30 outline-none ring-0 transition-transform duration-150 hover:bg-sky-400 focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-[0.97]"
                    whileHover={!prefersReduced ? { y: -1 } : undefined}
                    whileTap={!prefersReduced ? { scale: 0.97 } : undefined}
                    disabled={isLoading}
                  >
                    <span>Generate demo preview</span>
                  </motion.button>
                </div>

                {errorMessage && (
                  <p className="mt-3 text-[0.7rem] text-amber-300">
                    {errorMessage}
                  </p>
                )}
              </motion.form>
            )}

            {status !== "configure" && (
              <motion.div
                key="loading-or-results"
                className="relative space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 shadow-[0_18px_45px_rgba(2,6,23,0.75)] backdrop-blur"
                {...gridMotion}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-slate-100">
                      {status === "submitting" && "Creating demo job…"}
                      {status === "generating" && "Generating previews…"}
                      {status === "results_success" &&
                        "Demo previews ready to review"}
                      {status === "results_partial" &&
                        "Some previews are ready, some need attention"}
                      {status === "results_error" &&
                        "We couldn’t complete this demo run"}
                    </p>
                    <p className="text-[0.7rem] text-slate-400">
                      {status === "submitting" &&
                        "We’re registering your URLs with MyMetaView."}
                      {status === "generating" &&
                        "We’re assembling scenes and transitions for each demo step."}
                      {status === "results_success" &&
                        "Review the generated scenes and fine-tune the flow."}
                      {status === "results_partial" &&
                        "Successful scenes are ready. Fix failed URLs or retry them."}
                      {status === "results_error" &&
                        "You can edit URLs and try again, or focus on the successful ones."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {(status === "results_partial" ||
                      status === "results_error") && (
                      <button
                        type="button"
                        onClick={handleRetryFailed}
                        className="rounded-full border border-slate-600/70 bg-slate-900/80 px-2.5 py-1 text-[0.7rem] font-medium text-slate-100 hover:border-sky-400/60 hover:text-sky-100"
                      >
                        Retry failed
                      </button>
                    )}
                    {(status === "results_success" ||
                      status === "results_partial" ||
                      status === "results_error") && (
                      <button
                        type="button"
                        onClick={handleEditUrls}
                        className="rounded-full border border-slate-600/70 bg-slate-950/80 px-2.5 py-1 text-[0.7rem] font-medium text-slate-200 hover:border-sky-400/60 hover:text-sky-50"
                      >
                        Edit URLs
                      </button>
                    )}
                  </div>
                </div>

                <LoadingStrip
                  status={status}
                  progress={progress}
                  prefersReduced={prefersReduced}
                />

                <ResultsGrid
                  items={items}
                  status={status}
                  prefersReduced={prefersReduced}
                />

                {errorMessage && (
                  <p className="mt-3 text-[0.7rem] text-amber-300">
                    {errorMessage}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="space-y-4">
          <ParallaxPreview prefersReduced={prefersReduced} />
          <StatusSummary
            status={status}
            items={items}
            prefersReduced={prefersReduced}
          />
        </aside>
      </div>

      <VisuallyHiddenLiveRegion status={status} items={items} />
    </div>
  );
};

interface LoadingStripProps {
  status: DemoStatus;
  progress: number;
  prefersReduced: boolean;
}

const LoadingStrip: React.FC<LoadingStripProps> = ({
  status,
  progress,
  prefersReduced,
}) => {
  if (status === "configure") return null;

  const showStrip = status === "submitting" || status === "generating";

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-[0.7rem] text-slate-400">
        <span>
          {status === "submitting" && "Submitting demo job…"}
          {status === "generating" && "Assembling demo scenes…"}
          {status === "results_success" && "Done"}
          {status === "results_partial" && "Completed with some issues"}
          {status === "results_error" && "Encountered an error"}
        </span>
        <span className="tabular-nums text-slate-300/90">
          {Math.round(
            status === "results_success" || status === "results_partial"
              ? 100
              : progress,
          )}
          %
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-emerald-400"
          style={{ width: `${Math.max(4, progress)}%` }}
          transition={
            prefersReduced
              ? { duration: 0.1 }
              : {
                  duration: 0.35,
                  ease: [0.16, 1, 0.3, 1],
                }
          }
        />
        {!prefersReduced && showStrip && (
          <motion.div
            className="pointer-events-none absolute inset-0 h-1.5 rounded-full bg-gradient-to-r from-transparent via-sky-200/40 to-transparent mix-blend-screen"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              duration: 1.6,
              ease: [0.2, 0, 0, 1],
              repeat: Number.POSITIVE_INFINITY,
            }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
};

interface ResultsGridProps {
  items: DemoItem[];
  status: DemoStatus;
  prefersReduced: boolean;
}

const ResultsGrid: React.FC<ResultsGridProps> = ({
  items,
  status,
  prefersReduced,
}) => {
  const showSkeletons =
    (status === "submitting" || status === "generating") && items.length === 0;

  const showItems = items.length > 0;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
        {showSkeletons &&
          Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard
              key={index}
              delay={prefersReduced ? 0 : 0.04 * index}
              prefersReduced={prefersReduced}
            />
          ))}

        <AnimatePresence mode="popLayout">
          {showItems &&
            items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={
                  prefersReduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: 10, scale: 0.96 }
                }
                animate={
                  prefersReduced
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  prefersReduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: -6, scale: 0.98 }
                }
                transition={
                  prefersReduced
                    ? { duration: 0.12 }
                    : {
                        duration: 0.24,
                        ease: [0.16, 1, 0.3, 1],
                        delay: 0.04 * index,
                      }
                }
                className="group relative overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/70 p-2 text-[0.7rem] text-slate-100 shadow-sm shadow-slate-950/50 transition-shadow hover:shadow-lg hover:shadow-sky-500/25"
              >
                <div className="relative h-20 overflow-hidden rounded-lg bg-slate-900/80">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={`Preview for ${item.url}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[0.65rem] text-slate-500">
                      {item.status === "success"
                        ? "Preview pending"
                        : "Generating…"}
                    </div>
                  )}

                  {!prefersReduced && item.status === "generating" && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(56,189,248,0.38),transparent)] mix-blend-screen"
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{
                        duration: 1.4,
                        ease: [0.2, 0, 0, 1],
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                    />
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  <p className="line-clamp-2 break-all text-[0.65rem] text-slate-200">
                    {item.url}
                  </p>
                  <p className="flex items-center gap-1 text-[0.65rem]">
                    <span
                      className={
                        item.status === "success"
                          ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
                          : item.status === "error"
                            ? "h-1.5 w-1.5 rounded-full bg-amber-400"
                            : "h-1.5 w-1.5 rounded-full bg-sky-400"
                      }
                    />
                    <span className="capitalize text-slate-300">
                      {item.status}
                    </span>
                  </p>
                </div>

                {item.status === "error" && item.errorMessage && (
                  <p className="mt-1 text-[0.65rem] text-amber-300">
                    {item.errorMessage}
                  </p>
                )}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

interface SkeletonCardProps {
  delay: number;
  prefersReduced: boolean;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({
  delay,
  prefersReduced,
}) => {
  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/80 p-2"
      initial={
        prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }
      }
      animate={
        prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        prefersReduced
          ? { duration: 0.12, delay }
          : {
              duration: 0.24,
              ease: [0.16, 1, 0.3, 1],
              delay,
            }
      }
    >
      <div className="h-20 w-full overflow-hidden rounded-lg bg-slate-800/80">
        {!prefersReduced && (
          <motion.div
            className="mv-shimmer h-full w-full"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="mt-2 space-y-1">
        <div className="h-2 w-5/6 rounded-full bg-slate-800" />
        <div className="h-2 w-2/3 rounded-full bg-slate-800" />
      </div>
    </motion.div>
  );
};

interface ParallaxPreviewProps {
  prefersReduced: boolean;
}

const ParallaxPreview: React.FC<ParallaxPreviewProps> = ({
  prefersReduced,
}) => {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950/90 p-4 shadow-[0_18px_45px_rgba(2,6,23,0.85)]"
      initial={prefersReduced ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReduced ? undefined : { opacity: 1, y: 0 }}
      transition={
        prefersReduced
          ? undefined
          : { duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.06 }
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-slate-100">
          Live demo storyboard
        </h2>
        <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[0.6rem] font-medium text-slate-300 ring-1 ring-slate-700/80">
          Preview
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[1.15fr_minmax(0,0.9fr)] gap-2 text-[0.65rem] text-slate-200/90">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.6rem] font-medium text-sky-200">
              Narrative track
            </span>
            <span className="text-[0.6rem] text-slate-400">Auto-timed</span>
          </div>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-1.5">
              <span className="mt-[2px] h-1 w-1 rounded-full bg-sky-400" />
              <span>Landing: high-level promise and key value prop.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-[2px] h-1 w-1 rounded-full bg-sky-400" />
              <span>Deep-dive: core workflow with guided highlights.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-[2px] h-1 w-1 rounded-full bg-sky-400" />
              <span>Closing: call-to-action and next steps.</span>
            </li>
          </ul>
        </div>

        <div className="relative flex flex-col gap-1.5">
          <motion.div
            className="relative rounded-xl border border-sky-500/50 bg-slate-950/90 p-2 text-[0.6rem] text-sky-50 shadow-[0_0_25px_rgba(56,189,248,0.35)]"
            initial={prefersReduced ? undefined : { y: 4 }}
            animate={prefersReduced ? undefined : { y: 0 }}
            transition={
              prefersReduced
                ? undefined
                : {
                    duration: 1.2,
                    ease: [0.2, 0, 0, 1],
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: "reverse",
                  }
            }
          >
            <div className="flex items-center justify-between text-[0.6rem]">
              <span className="font-semibold text-sky-100">
                Scene 1 · Hero
              </span>
              <span className="text-[0.6rem] text-sky-300/80">00:06</span>
            </div>
            <p className="mt-1 text-[0.6rem] text-sky-50/90">
              Pan across your hero section with layered parallax and subtle
              copy emphasis.
            </p>
          </motion.div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-950/90 p-2 text-[0.6rem] text-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-100">
                Scene 2 · Workflow
              </span>
              <span className="text-[0.6rem] text-slate-400">00:10</span>
            </div>
            <p className="mt-1 text-[0.6rem] text-slate-300/90">
              Step through your product UI with auto-cropped focus frames and
              cursor choreography.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface StatusSummaryProps {
  status: DemoStatus;
  items: DemoItem[];
  prefersReduced: boolean;
}

const StatusSummary: React.FC<StatusSummaryProps> = ({
  status,
  items,
}) => {
  const total = items.length;
  const successCount = items.filter((i) => i.status === "success").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-950/80 p-4 text-[0.7rem] text-slate-200">
      <h2 className="text-xs font-medium text-slate-100">Run summary</h2>
      <p className="mt-1 text-[0.7rem] text-slate-400">
        Quick snapshot of this demo generation run.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <dt className="text-[0.65rem] text-slate-400">State</dt>
          <dd className="text-xs font-medium text-slate-100">
            {status.replace("results_", "").replace("_", " ")}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[0.65rem] text-slate-400">Total scenes</dt>
          <dd className="text-xs font-medium text-slate-100">
            {total || "—"}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[0.65rem] text-slate-400">Ready</dt>
          <dd className="text-xs font-medium text-emerald-300">
            {successCount || "—"}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-[0.65rem] text-slate-400">Needs attention</dt>
          <dd className="text-xs font-medium text-amber-300">
            {errorCount || "—"}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[0.65rem] text-slate-400/90">
        Wire this component to your own demo-generation API by providing{" "}
        <span className="font-mono text-[0.6rem] text-sky-300">
          onCreateJob
        </span>{" "}
        and{" "}
        <span className="font-mono text-[0.6rem] text-sky-300">onPollJob</span>{" "}
        props.
      </p>
    </div>
  );
};

interface LiveRegionProps {
  status: DemoStatus;
  items: DemoItem[];
}

const VisuallyHiddenLiveRegion: React.FC<LiveRegionProps> = ({
  status,
  items,
}) => {
  const total = items.length;
  const successCount = items.filter((i) => i.status === "success").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  let message = "";
  if (status === "submitting") {
    message = "Submitting demo job.";
  } else if (status === "generating") {
    message = `Generating previews. ${successCount} of ${total} complete.`;
  } else if (status === "results_success") {
    message = `Demo generation complete. ${successCount} scenes ready.`;
  } else if (status === "results_partial") {
    message = `Demo generation partially complete. ${successCount} ready, ${errorCount} failed.`;
  } else if (status === "results_error") {
    message = "Demo generation failed. Edit URLs or retry failed scenes.";
  }

  if (!message) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

