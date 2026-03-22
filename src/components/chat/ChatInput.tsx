"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border p-3"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about Kyle's experience..."
        disabled={disabled}
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted/60 text-text"
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
