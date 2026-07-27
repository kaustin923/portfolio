"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, RotateCcw, X } from "lucide-react";
import { chatSuggestions } from "@/data/knowledge-base";
import type { ChatMessage as ChatMessageType, ChatSuggestion } from "@/types";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { ChatSuggestions } from "./ChatSuggestions";

const GREETING: ChatMessageType = {
  role: "assistant",
  content:
    "Hi! I'm an AI that can answer questions about Kyle's background, skills, and experience. What would you like to know?",
};

/** Turns sent to the API. The route enforces the same cap. */
const MAX_TURNS = 20;
const MAX_INPUT_CHARS = 1000;

/** Chips shown before the first question, and after each answer. */
const OPENING_CHIPS = 4;
const FOLLOW_UP_CHIPS = 3;

/** Survives a trip to a project page and back. Cleared by the clear button. */
const STORAGE_KEY = "kyle-chat-v1";

/** Must match STREAM_ERROR_MARKER in src/app/api/chat/route.ts. */
const STREAM_ERROR_MARKER = "\u0000__CHAT_STREAM_ERROR__";

/** Treat the reader as "at the bottom" within this many pixels. */
const BOTTOM_SLACK_PX = 64;

interface StoredChat {
  messages: ChatMessageType[];
  used: string[];
}

function readStored(): StoredChat | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { messages, used } = parsed as { messages?: unknown; used?: unknown };
    if (!Array.isArray(messages)) return null;

    const clean = messages.filter((entry): entry is ChatMessageType => {
      if (typeof entry !== "object" || entry === null) return false;
      const { role, content } = entry as Partial<ChatMessageType>;
      return (
        (role === "user" || role === "assistant") && typeof content === "string"
      );
    });

    return {
      messages: clean,
      used: Array.isArray(used)
        ? used.filter((q): q is string => typeof q === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function withGreeting(messages: ChatMessageType[]): ChatMessageType[] {
  const first = messages[0];
  if (first && first.role === "assistant" && first.content === GREETING.content) {
    return messages;
  }
  return [GREETING, ...messages];
}

/**
 * Removes the failure marker, including a partial one still arriving at the
 * tail of the stream, so it never flashes inside the message bubble.
 */
function stripMarker(text: string): string {
  const found = text.indexOf(STREAM_ERROR_MARKER);
  if (found !== -1) return text.slice(0, found);

  const maxPartial = Math.min(STREAM_ERROR_MARKER.length - 1, text.length);
  for (let length = maxPartial; length > 0; length--) {
    if (text.endsWith(STREAM_ERROR_MARKER.slice(0, length))) {
      return text.slice(0, -length);
    }
  }

  return text;
}

function replaceLast(
  messages: ChatMessageType[],
  content: string
): ChatMessageType[] {
  if (messages.length === 0) return messages;
  const next = messages.slice();
  next[next.length - 1] = { role: "assistant", content };
  return next;
}

/**
 * Walks the suggestion list from a rotating start point so different visits do
 * not open with the same four chips, and skips anything already asked.
 */
function pickSuggestions(
  count: number,
  cursor: number,
  used: ReadonlySet<string>
): ChatSuggestion[] {
  const picked: ChatSuggestion[] = [];
  const total = chatSuggestions.length;

  for (let step = 0; step < total && picked.length < count; step++) {
    const candidate = chatSuggestions[(cursor + step) % total];
    if (used.has(candidate.question)) continue;
    picked.push(candidate);
  }

  return picked;
}

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(() => {
    const stored = readStored();
    if (!stored || stored.messages.length === 0) return [GREETING];
    return withGreeting(stored.messages);
  });
  const [used, setUsed] = useState<Set<string>>(() => {
    const stored = readStored();
    return new Set(stored?.used ?? []);
  });
  // Starts at the top of the curated list so the opening chips are stable for
  // screenshots and tests, then rotates as questions get asked.
  const [cursor, setCursor] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const atBottomRef = useRef(true);
  const messagesRef = useRef(messages);
  const usedRef = useRef(used);
  const wasStreaming = useRef(false);

  // Mirrored in effects rather than during render, so the values event handlers
  // and the unmount cleanup read are always ones React has committed.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    usedRef.current = used;
  }, [used]);

  /* ---------------------------------------------------------------- storage */

  const persist = useCallback(
    (list: ChatMessageType[], asked: ReadonlySet<string>) => {
      // An aborted answer leaves an empty bubble behind. Don't store it.
      const last = list[list.length - 1];
      const clean =
        last && last.role === "assistant" && !last.content.trim()
          ? list.slice(0, -1)
          : list;

      try {
        if (clean.length <= 1 && asked.size === 0) {
          window.sessionStorage.removeItem(STORAGE_KEY);
          return;
        }
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ messages: clean, used: [...asked] })
        );
      } catch {
        // Private mode or a full quota. Losing history is not worth throwing.
      }
    },
    []
  );

  useEffect(() => {
    // Skip mid-stream so a long answer does not write on every token.
    if (streaming) return;
    persist(messages, used);
  }, [messages, used, streaming, persist]);

  useEffect(() => {
    // Closing the panel mid-answer should still keep what arrived.
    return () => {
      abortRef.current?.abort();
      persist(messagesRef.current, usedRef.current);
    };
  }, [persist]);

  /* ------------------------------------------------------------ scrolling */

  const scrollToBottom = useCallback(() => {
    const region = scrollRef.current;
    if (!region) return;
    region.scrollTop = region.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    const region = scrollRef.current;
    if (!region) return;
    const distance =
      region.scrollHeight - region.scrollTop - region.clientHeight;
    const near = distance < BOTTOM_SLACK_PX;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);

  useEffect(() => {
    // Only follow the answer if the reader has not scrolled up to re-read.
    if (!atBottomRef.current) return;
    const region = scrollRef.current;
    if (region) region.scrollTop = region.scrollHeight;
  }, [messages]);

  /* ------------------------------------------------- focus and keyboard */

  useEffect(() => {
    inputRef.current?.focus();
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    // The textarea is disabled while an answer streams, which drops focus to
    // the body. Take it back when the answer lands, but only if the reader has
    // not moved focus somewhere deliberate in the meantime.
    if (
      wasStreaming.current &&
      !streaming &&
      document.activeElement === document.body
    ) {
      inputRef.current?.focus();
    }
    wasStreaming.current = streaming;
  }, [streaming]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      // The panel claims aria-modal, so Tab has to stay inside it.
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /* --------------------------------------------------------------- actions */

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
    setMessages([GREETING]);
    setUsed(new Set());
    setCursor(0);
    setError(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up.
    }
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const content = raw.trim().slice(0, MAX_INPUT_CHARS);
      if (!content || streamingRef.current) return;

      setError(null);
      setUsed((prev) => new Set(prev).add(content));
      setCursor((prev) => prev + FOLLOW_UP_CHIPS);
      streamingRef.current = true;
      setStreaming(true);

      // A new question always pulls the view back down.
      atBottomRef.current = true;
      setAtBottom(true);

      const history: ChatMessageType[] = [
        ...messagesRef.current,
        { role: "user", content },
      ];
      setMessages([...history, { role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // history[0] is the local greeting, which the model never sent.
          body: JSON.stringify({ messages: history.slice(1).slice(-MAX_TURNS) }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const data: unknown = await response.json().catch(() => null);
          const message =
            typeof data === "object" &&
            data !== null &&
            typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : "Something went wrong.";
          throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let received = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // A chunk can land in the moment between clearing the chat and the
          // abort taking effect. Without this it would overwrite the greeting.
          if (controller.signal.aborted) return;
          received += decoder.decode(value, { stream: true });
          setMessages((prev) => replaceLast(prev, stripMarker(received)));
        }
        received += decoder.decode();

        if (controller.signal.aborted) return;

        const failed = received.includes(STREAM_ERROR_MARKER);
        const answer = stripMarker(received).trim();
        setMessages((prev) => replaceLast(prev, answer));

        if (failed) {
          setError("That answer got cut off partway through.");
        } else if (!answer) {
          setError("Nothing came back. Try asking again.");
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        // Drop the empty bubble so a failed turn does not leave a blank card.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !last.content.trim()) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    []
  );

  /* -------------------------------------------------------------- render */

  const started = messages.length > 1;
  const lastMessage = messages[messages.length - 1];
  const answerIsDone =
    !streaming && lastMessage?.role === "assistant" && lastMessage.content.trim().length > 0;

  const visibleSuggestions = started
    ? answerIsDone
      ? pickSuggestions(FOLLOW_UP_CHIPS, cursor, used)
      : []
    : pickSuggestions(OPENING_CHIPS, cursor, used);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Ask about Kyle"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-card shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[640px] sm:max-h-[calc(100dvh-6rem)] sm:w-[420px] sm:rounded-2xl sm:border"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-primary-light/40 px-4 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            <span
              className={`h-2 w-2 shrink-0 rounded-full bg-primary ${
                streaming ? "animate-pulse" : ""
              }`}
              aria-hidden="true"
            />
            Ask about Kyle
          </p>
          <p className="truncate text-xs text-muted">
            Answers come from this site.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {started && (
            <button
              type="button"
              onClick={clearChat}
              aria-label="Clear chat"
              className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-text"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-text"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scroll-slim h-full overflow-y-auto overscroll-contain px-4 py-4"
        >
          <div
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Conversation"
            className="space-y-3"
          >
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                message={message}
                streaming={
                  streaming &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
                onNavigate={onClose}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="pt-3 text-xs text-red-700">
              {error} You can also reach Kyle at{" "}
              <a
                href="mailto:kaustin923@gmail.com"
                className="focus-ring underline underline-offset-2"
              >
                kaustin923@gmail.com
              </a>
              .
            </p>
          )}

          <ChatSuggestions
            suggestions={visibleSuggestions}
            onSelect={sendMessage}
            disabled={streaming}
            heading={started ? "Ask next" : "Start here"}
          />
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="focus-ring absolute right-4 bottom-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-raised text-muted shadow-lg transition-colors hover:text-primary"
            aria-label="Jump to the latest message"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <ChatInput onSend={sendMessage} disabled={streaming} inputRef={inputRef} />
    </div>
  );
}
