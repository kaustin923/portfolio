"use client";

const SUGGESTIONS = [
  "What's Kyle's background?",
  "Tell me about his AI projects",
  "What tech does he work with?",
  "Why is he looking for a new role?",
];

interface ChatSuggestionsProps {
  onSelect: (message: string) => void;
}

export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="min-h-[44px] flex items-center rounded-full border border-border text-muted text-xs px-3 py-1.5 hover:border-primary hover:text-primary hover:bg-primary-light/50 transition-colors"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
