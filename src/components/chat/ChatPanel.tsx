"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, RotateCcw } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/types";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatSuggestions } from "./ChatSuggestions";

const GREETING: ChatMessageType = {
  role: "assistant",
  content:
    "Hi! I'm an AI that can answer questions about Kyle's background, skills, and experience. What would you like to know?",
};

const MAX_MESSAGES = 20;

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([GREETING]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const clearChat = useCallback(() => {
    setMessages([GREETING]);
    setError(null);
    setShowSuggestions(true);
  }, []);

  const sendMessage = async (content: string) => {
    setError(null);
    setShowSuggestions(false);
    const userMessage: ChatMessageType = { role: "user", content };
    const newMessages = [...messages, userMessage].slice(-MAX_MESSAGES);
    setMessages(newMessages);
    setStreaming(true);

    try {
      // Filter out greeting for API call
      const apiMessages = newMessages
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantContent = "";

      // Add empty assistant message to fill via streaming
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantContent,
          };
          return updated;
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] h-[500px] max-h-[70vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary-light/30">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-text">
            Ask about Kyle
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <button
              onClick={clearChat}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-border/50 transition-colors"
              aria-label="Clear chat"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-border/50 transition-colors"
          >
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {error && (
          <div className="text-xs text-red-600 text-center py-2">
            {error}. Try again or reach Kyle at{" "}
            <a href="mailto:kaustin923@gmail.com" className="underline">
              kaustin923@gmail.com
            </a>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {showSuggestions && <ChatSuggestions onSelect={sendMessage} />}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={streaming} />
    </div>
  );
}
