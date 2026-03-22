"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

export function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}

      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover transition-all flex items-center justify-center"
        style={{ animation: open ? "none" : "pulse-glow 2s ease-in-out infinite" }}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </>
  );
}
