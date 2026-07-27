"use client";

import type { ChatSuggestion } from "@/types";

interface ChatSuggestionsProps {
  suggestions: ChatSuggestion[];
  onSelect: (question: string) => void;
  /** Short line above the chips, e.g. "Try one of these". */
  heading: string;
  disabled?: boolean;
}

export function ChatSuggestions({
  suggestions,
  onSelect,
  heading,
  disabled = false,
}: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="pt-3">
      <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
        {heading}
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.question}
            type="button"
            disabled={disabled}
            title={suggestion.question}
            onClick={() => onSelect(suggestion.question)}
            className="focus-ring inline-flex min-h-[44px] items-center rounded-full border border-border bg-card px-3.5 py-2 text-xs text-muted transition-colors hover:border-primary hover:bg-primary-light hover:text-primary disabled:opacity-50"
          >
            {suggestion.label}
            {/* Screen readers get the whole question, not just the short chip. */}
            <span className="sr-only">: {suggestion.question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
