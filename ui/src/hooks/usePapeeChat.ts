import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { papeeApi, type PapeeAction, type PapeeChatResponse } from "../api/papee";
import { useCompany } from "../context/CompanyContext";
import { usePapeeOptional, type ChatMessage } from "../context/PapeeContext";
import { usePapeeNavigation } from "./usePapeePosition";
import { usePapeeTargetRegistryOptional } from "../context/PapeeTargetRegistry";
import { usePapeePointing } from "./usePapeePointing";
import { usePapeeEnact } from "./usePapeeEnact";

export type { ChatMessage };

const SUGGESTIONS: Record<string, string[]> = {
  dashboard: ["How are things?", "Any stalled work?", "Who's running?"],
  "agent-detail": ["What is this agent doing?", "Any issues?", "Recent runs?"],
  "agent-run": ["How did this run go?", "Any errors?"],
  "issue-detail": ["What's the status?", "Who's working on this?", "What happened here?"],
  issues: ["What's blocked?", "Status overview", "Any stalled issues?"],
  agents: ["Who's running?", "Any errors?", "Agent overview"],
  secrets: ["Which agents need tokens?", "Secret usage?"],
  other: ["How are things?", "Any problems?", "What should I know?"],
};

export function usePapeeChat() {
  const { selectedCompanyId } = useCompany();
  const papee = usePapeeOptional();
  const pageInfo = usePapeeNavigation();
  const registry = usePapeeTargetRegistryOptional();
  const { lookAt, walkTo } = usePapeePointing();
  const { enact, ConfirmDialog: EnactConfirmDialog } = usePapeeEnact();
  const enactRef = useRef(enact);
  enactRef.current = enact;
  // Monotonic token: any new walk-through invalidates in-flight timers
  // from the previous one, so callbacks don't collide.
  const walkSeqRef = useRef(0);
  // Set while Papee is mid-sequence so Claude's onSuccess handler
  // doesn't overwrite the final animation state.
  const walkActiveRef = useRef(false);

  // Messages live in PapeeContext — persist across navigation
  const messages = papee?.chatMessages ?? [];
  const setMessages = papee?.setChatMessages;

  const streamRef = useRef<{ abort: () => void } | null>(null);

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const history = messages.slice(-18).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body = {
        message,
        context: {
          page: pageInfo.page,
          agentId: pageInfo.agentId,
          issueId: pageInfo.issueId,
          projectId: pageInfo.projectId,
          workflowId: pageInfo.workflowId,
          runId: pageInfo.runId,
        },
        history,
      };

      // §Z.8 — stream when enabled, else fall back to single-shot
      if (papee?.prefs.enableStreaming) {
        return await new Promise<PapeeChatResponse>((resolve, reject) => {
          papee.setStreamingActive(true);
          papee.setStreamingText("");
          let accumulated = "";
          const handle = papeeApi.chatStream(selectedCompanyId, body, {
            onChunk: (chunk) => {
              accumulated += chunk;
              papee.setStreamingText(accumulated);
            },
            onDone: (final) => {
              papee.setStreamingActive(false);
              papee.setStreamingText(null);
              streamRef.current = null;
              resolve(final);
            },
            onError: (err) => {
              papee.setStreamingActive(false);
              papee.setStreamingText(null);
              streamRef.current = null;
              reject(new Error(err));
            },
          });
          streamRef.current = handle;
        });
      }
      return papeeApi.chat(selectedCompanyId, body);
    },
    onSuccess: (data: PapeeChatResponse) => {
      setMessages?.((prev) => [
        ...prev,
        {
          id: `papee-${Date.now()}`,
          role: "papee",
          content: data.response,
          actions: data.actions,
          followUps: data.followUps,
          timestamp: Date.now(),
        },
      ]);
      // §M.8 push extracted topics into the bounded topic stack
      if (data.topics && papee?.pushTopic) {
        for (const t of data.topics) papee.pushTopic(t);
      }

      // PAPEE_TOOLS_PLAN.md — auto-dispatch any structured tools Claude
      // emitted on this turn through papee.enact(). Tier-0 runs silently;
      // tier-1+ pop confirm + arc + undo. Sequential so arcs don't collide.
      if (data.tools && data.tools.length > 0 && enactRef.current) {
        const enact = enactRef.current;
        const queue = [...data.tools];
        const runNext = async () => {
          const t = queue.shift();
          if (!t) return;
          await enact(t);
          setTimeout(runNext, 600);
        };
        runNext();
      }

      // Map server mood to valid animation state.
      // Defer if a walk-through is still running so we don't
      // overwrite the celebration frame.
      const applyMood = () => {
        if (!papee) return;
        const MOOD_MAP: Record<string, Parameters<typeof papee.queueReaction>[0]> = {
          celebrating: "celebrating",
          alarmed: "alarmed",
          thinking: "thinking",
          waving: "waving",
          "thumbs-up": "thumbs-up",
          idle: "idle",
          relaxed: "idle",
          busy: "thinking",
          neutral: "idle",
        };
        const anim = data.mood ? MOOD_MAP[data.mood] : undefined;
        if (anim && anim !== "idle") {
          papee.queueReaction(anim, 2500);
        } else {
          papee.setAnimState("idle");
        }
      };
      if (walkActiveRef.current) {
        const poll = () => {
          if (!walkActiveRef.current) applyMood();
          else setTimeout(poll, 120);
        };
        poll();
      } else {
        applyMood();
      }
    },
    onError: () => {
      setMessages?.((prev) => [
        ...prev,
        {
          id: `papee-err-${Date.now()}`,
          role: "papee",
          content: "Oops, I had trouble thinking about that. Try again?",
          timestamp: Date.now(),
        },
      ]);
      if (papee) papee.setAnimState("idle");
    },
  });

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // PAPEE_TOOLS_PLAN.md §M.11 — slash commands intercept the chat
      // before it reaches Claude. /memory shows stored rows; /forget
      // wipes them; /forget all wipes everything for this user.
      if (trimmed.startsWith("/") && selectedCompanyId) {
        const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
        const arg = rest.join(" ").trim();
        const echo = (content: string) =>
          setMessages?.((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, role: "user", content: trimmed, timestamp: Date.now() },
            { id: `papee-${Date.now() + 1}`, role: "papee", content, timestamp: Date.now() + 1 },
          ]);

        if (cmd === "memory") {
          papeeApi.listMemory(selectedCompanyId).then(({ rows }) => {
            if (rows.length === 0) {
              echo("I don't remember anything yet.");
              return;
            }
            const grouped = rows.reduce<Record<string, string[]>>((acc, r) => {
              (acc[r.type] ??= []).push(`- ${r.content} _(conf ${r.confidence.toFixed(2)})_`);
              return acc;
            }, {});
            const md = Object.entries(grouped)
              .map(([t, items]) => `**${t}**\n${items.join("\n")}`)
              .join("\n\n");
            echo(`Here's what I remember about you:\n\n${md}`);
          }).catch(() => echo("Couldn't read memory."));
          return;
        }
        if (cmd === "forget") {
          const opts = arg && arg !== "all" ? { pattern: arg } : undefined;
          papeeApi
            .forgetMemory(selectedCompanyId, opts)
            .then(() => echo(arg === "all" || !arg ? "Wiped all memory." : `Forgot anything matching "${arg}".`))
            .catch(() => echo("Couldn't forget that."));
          return;
        }
        if (cmd === "remember") {
          // /remember <type> <content...>
          const [type, ...contentParts] = arg.split(/\s+/);
          const content = contentParts.join(" ");
          if (!type || !content) {
            echo("Usage: /remember <type> <content>");
            return;
          }
          papeeApi
            .remember(selectedCompanyId, { type, content, confidence: 1 })
            .then(() => echo(`Noted: ${type} → ${content}`))
            .catch(() => echo("Couldn't save that."));
          return;
        }
      }

      setMessages?.((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: trimmed,
          timestamp: Date.now(),
        },
      ]);

      // Papee's "investigating" sequence on an issue page:
      // scrolls through comments, hops between them, narrates with speech bubbles.
      const mySeq = ++walkSeqRef.current;
      const isCurrent = () => mySeq === walkSeqRef.current;
      if (pageInfo.page === "issue-detail" && registry && papee) {
        const domEls = Array.from(
          document.querySelectorAll<HTMLElement>('[id^="comment-"]'),
        );
        const merged = domEls.map((el) => `issue-comment:${el.id.replace(/^comment-/, "")}`);

        const MAX_VISITS = 8;
        const MIN_STEP_MS = 350;
        const MAX_STEP_MS = 800;
        const TOTAL_BUDGET_MS = 4500;

        // Sample up to MAX_VISITS comments evenly spread, always including the last.
        const stride = Math.max(1, Math.floor(merged.length / MAX_VISITS));
        const picks: string[] = [];
        for (let i = 0; i < merged.length && picks.length < MAX_VISITS; i += stride) {
          const id = merged[i];
          if (id) picks.push(id);
        }
        const lastId = merged[merged.length - 1];
        if (lastId && !picks.includes(lastId)) picks.push(lastId);

        if (picks.length > 0) {
          const stepMs = Math.max(
            MIN_STEP_MS,
            Math.min(MAX_STEP_MS, Math.round(TOTAL_BUDGET_MS / picks.length)),
          );

          const NARRATION = [
            "Let me check...",
            "Scrolling through...",
            "Hmm, interesting...",
            "What happened here...",
            "Found something...",
            "Almost got it...",
            "One more...",
            "Got it!",
          ];

          walkActiveRef.current = true;
          papee.showSpeechBubble("Let me look through these comments...", Math.max(1600, stepMs * 2));

          let i = 0;
          const run = () => {
            if (!isCurrent()) return;
            const id = picks[i];
            if (!id) return;
            const domId = id.replace(/^issue-comment:/, "comment-");
            const el = document.getElementById(domId);
            if (!el) {
              i += 1;
              if (i < picks.length) setTimeout(run, stepMs);
              else walkActiveRef.current = false;
              return;
            }

            // Instant scroll so Papee can hop in sync with the page.
            el.scrollIntoView({ behavior: "auto", block: "center" });

            // Directly set anim state each step — queueReaction gets blocked
            // by equal-priority "thinking" so we bypass the queue here.
            const hop: "jumping" | "thinking" = i % 2 === 0 ? "jumping" : "thinking";
            papee.setAnimState(hop);

            // Capture step index — closure must not see the post-increment value.
            const stepIndex = i;
            const isLast = stepIndex === picks.length - 1;

            // Layout settles next frame — refresh rect then move Papee.
            requestAnimationFrame(() => {
              if (!isCurrent()) return;
              registry.refreshRect(id);
              walkTo(id);
              lookAt(id);

              if (stepIndex > 0 && stepIndex % 2 === 0 && !isLast) {
                const phrase = NARRATION[Math.min(stepIndex, NARRATION.length - 1)];
                if (phrase) papee.showSpeechBubble(phrase, Math.max(600, stepMs));
              }

              if (isLast) {
                papee.setAnimState("celebrating");
                papee.setHighlightTarget(id);
                setTimeout(() => {
                  if (!isCurrent()) return;
                  papee.setHighlightTarget(null);
                  papee.setAnimState("thinking");
                  walkActiveRef.current = false;
                }, 1400);
              }
            });

            i += 1;
            if (i < picks.length) setTimeout(run, stepMs);
          };
          run();
        } else if (papee) {
          papee.setAnimState("thinking");
        }
      } else if (papee) {
        papee.setAnimState("thinking");
      }

      mutation.mutate(trimmed);
    },
    [mutation, papee, setMessages, pageInfo.page, registry, walkTo, lookAt],
  );

  const clearHistory = useCallback(() => {
    setMessages?.([]);
  }, [setMessages]);

  const suggestedActions = SUGGESTIONS[pageInfo.page] ?? SUGGESTIONS.other;

  return {
    messages,
    sendMessage,
    isLoading: mutation.isPending,
    error: mutation.error ? (mutation.error as Error).message : null,
    clearHistory,
    suggestedActions,
    /** Caller must render this so tier-2 confirmations actually pop. */
    EnactConfirmDialog,
  };
}
