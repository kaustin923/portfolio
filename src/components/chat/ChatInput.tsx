"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Send } from "lucide-react";

/** Matches the per-message cap the API enforces. */
const MAX_CHARS = 1000;
const MAX_HEIGHT_PX = 120;

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  /** Lets the panel move focus here when it opens. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({ onSend, disabled, inputRef }: ChatInputProps) {
  const [value, setValue] = useState("");
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? fallbackRef;
  const fieldId = useId();

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value, ref]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_CHARS - value.length;

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-border bg-card px-3 pt-2 pb-2"
    >
      <div className="flex items-end gap-2">
        <label htmlFor={fieldId} className="sr-only">
          Ask a question about Kyle
        </label>
        <textarea
          id={fieldId}
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Answering..." : "Ask about Kyle's experience"}
          className="scroll-slim min-h-[44px] flex-1 resize-none bg-transparent py-3 text-sm leading-snug text-text outline-none placeholder:text-subtle disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-subtle">
        <span className="hidden sm:inline">
          Enter to send. Shift + Enter for a new line.
        </span>
        <span aria-hidden="true" />
        {remaining <= 150 && (
          <span className="tabular">{remaining} characters left</span>
        )}
      </div>
    </form>
  );
}
