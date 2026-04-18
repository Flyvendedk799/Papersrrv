import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, Send, Trash2, Sparkles } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { usePapee } from "../../context/PapeeContext";
import { useSidebar } from "../../context/SidebarContext";
import { usePapeeChat } from "../../hooks/usePapeeChat";
import type { ChatMessage } from "../../context/PapeeContext";
import { agentsApi } from "../../api/agents";
import { useCompany } from "../../context/CompanyContext";
import { MarkdownBody } from "../MarkdownBody";
import { cn } from "../../lib/utils";
import type { PapeeAction } from "../../api/papee";

/* ---- Chat Panel ---- */

export function PapeeChat() {
  const papee = usePapee();
  const { isMobile } = useSidebar();
  const { messages, sendMessage, isLoading, suggestedActions, clearHistory, EnactConfirmDialog } = usePapeeChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Focus input when chat opens
  useEffect(() => {
    if (papee.chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [papee.chatOpen]);

  // Escape to close
  useEffect(() => {
    if (!papee.chatOpen) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") papee.setChatOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [papee.chatOpen, papee]);

  if (!papee.chatOpen) return null;

  function handleSend() {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isRight = papee.prefs.position === "bottom-right";

  return (
    <>
    {/* Tier-2 confirm dialog mounted alongside the chat panel */}
    <EnactConfirmDialog />
    <div
      className={cn(
        "fixed z-[90] flex flex-col",
        "bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-xl overflow-hidden",
        "papee-speech-bubble",
        // Desktop: floating panel near Papee
        !isMobile && [
          "w-80 max-h-[480px]",
          isRight ? "right-4 bottom-[calc(5rem+1rem)]" : "left-4 bottom-[calc(5rem+1rem)]",
        ],
        // Mobile: full width, above bottom nav + character
        isMobile && [
          "left-2 right-2 bottom-[calc(5rem+env(safe-area-inset-bottom)+4rem)] max-h-[55vh]",
        ],
      )}
      role="dialog"
      aria-label="Chat with Papee"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-3 w-3 text-amber-500" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold">Papee</span>
            <span className="text-[10px] text-muted-foreground ml-1.5">Process Chain Manager</span>
          </div>
        </div>
        <button
          onClick={clearHistory}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
          aria-label="Clear chat"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          onClick={() => papee.setChatOpen(false)}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
          aria-label="Close chat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-auto-hide min-h-0 p-3 space-y-3"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="text-center py-8 px-2">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-xs font-medium text-foreground mb-1">Hi, I'm Papee!</p>
            <p className="text-[11px] text-muted-foreground mb-4 leading-relaxed">
              Your process chain manager. I can check on agents, show you standards, wake idle agents, grant secrets, and more.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {suggestedActions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="px-2.5 py-1.5 text-[11px] rounded-lg border border-border bg-background hover:bg-accent/50 hover:border-accent text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            Papee is thinking...
          </div>
        )}
      </div>

      {/* Quick suggestions */}
      {messages.length > 0 && !isLoading && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-1">
          {suggestedActions.slice(0, 2).map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => sendMessage(suggestion)}
              className="px-2 py-0.5 text-[10px] rounded-md border border-border/50 bg-muted/30 hover:bg-accent/50 text-muted-foreground transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/10 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Papee anything..."
          disabled={isLoading}
          className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
          aria-label="Message Papee"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            input.trim()
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/30",
            "disabled:opacity-30",
          )}
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    </>
  );
}

/* ---- Message Bubble ---- */

function MessageBubble({ message, onFollowUp }: { message: ChatMessage; onFollowUp?: (text: string) => void }) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const isUser = message.role === "user";

  async function handleAction(action: PapeeAction) {
    switch (action.type) {
      case "navigate":
        if (action.payload.path) {
          // Close chat but DON'T clear messages
          navigate(action.payload.path);
        }
        break;
      case "wake_agent":
        if (action.payload.agentId && selectedCompanyId) {
          try {
            await agentsApi.wakeup(action.payload.agentId, {
              source: "on_demand",
              triggerDetail: "manual",
              reason: action.payload.reason ?? "Woken by Papee at user request",
            }, selectedCompanyId);
            // Add a confirmation message to chat instead of navigating
            const papee = (window as any).__papeeSetMessages;
            // We can't access context here, but the action button feedback is visual enough
          } catch {
            // silently fail — the toast system will handle errors
          }
        }
        break;
      case "show_issue":
        if (action.payload.issueId) {
          // Use relative path that works with the company prefix
          navigate(`issues/${action.payload.issueId}`);
        }
        break;
      case "grant_secret":
        if (action.payload.path) navigate(action.payload.path);
        break;
    }
  }

  return (
    <div className={cn("flex gap-1.5", isUser ? "justify-end" : "justify-start")}>
      {/* Papee avatar for non-user messages */}
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="h-2.5 w-2.5 text-amber-500" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] text-xs leading-relaxed",
          isUser
            ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2"
            : "rounded-2xl rounded-bl-sm bg-muted/40 text-foreground px-3 py-2",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-xs dark:prose-invert max-w-none [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-xs [&_p]:text-xs [&_p]:my-1 [&_li]:text-xs [&_code]:text-[10px] [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:text-[10px] [&_pre]:bg-muted/60 [&_pre]:p-2 [&_pre]:rounded-md [&_pre]:my-1.5 [&_table]:text-[10px] [&_hr]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_strong]:font-semibold">
            <MarkdownBody>{message.content}</MarkdownBody>
          </div>
        )}

        {/* Action buttons */}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 pt-1.5 border-t border-border/30">
            {message.actions.map((action, i) => (
              <button
                key={i}
                onClick={() => handleAction(action)}
                className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
