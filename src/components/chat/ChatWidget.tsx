"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

/**
 * Other parts of the site (the hero CTA, the navbar "Ask AI" buttons) ask for
 * the chat by dispatching this on `window` rather than reaching in here.
 */
const OPEN_CHAT_EVENT = "portfolio:open-chat";

/** One hint per session, not per page view. */
const HINT_KEY = "kyle-chat-hint-v1";
const HINT_APPEARS_MS = 3_500;
const HINT_LEAVES_MS = 11_000;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  /** The hint is a single moment: the button pulses and a small bubble shows. */
  const [hinting, setHinting] = useState(false);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const reduceMotion = useReducedMotion();

  // Send focus back where it came from when the panel closes.
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.sessionStorage.getItem(HINT_KEY) === "seen";
    } catch {
      // No sessionStorage, so skip the hint rather than repeat it forever.
    }
    if (seen) return;

    const appear = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(HINT_KEY, "seen");
      } catch {
        // Nothing to remember it with. It just shows once this page view.
      }
      setHinting(true);
    }, HINT_APPEARS_MS);

    const leave = window.setTimeout(() => setHinting(false), HINT_LEAVES_MS);

    return () => {
      window.clearTimeout(appear);
      window.clearTimeout(leave);
    };
  }, []);

  const openChat = useCallback(() => {
    setHinting(false);
    // Already open is a no-op: React bails out on an unchanged value, so the
    // panel keeps its conversation instead of remounting.
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleOpenRequest = () => openChat();
    window.addEventListener(OPEN_CHAT_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, handleOpenRequest);
  }, [openChat]);

  return (
    <>
      {open && <ChatPanel onClose={closeChat} />}

      {!open && (
        <div className="fixed right-4 bottom-6 z-50 flex items-center gap-2 sm:right-6">
          <AnimatePresence>
            {hinting && (
              <motion.span
                // Decorative only. The button below already says what this does.
                aria-hidden="true"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                transition={{ duration: reduceMotion ? 0 : 0.22 }}
                className="pointer-events-none hidden rounded-full border border-border bg-card px-3 py-2 text-xs text-muted shadow-lg sm:block"
              >
                Ask me about Kyle&apos;s work
              </motion.span>
            )}
          </AnimatePresence>

          <button
            ref={launcherRef}
            type="button"
            onClick={openChat}
            aria-label="Open chat"
            aria-haspopup="dialog"
            title="Ask about Kyle"
            className="focus-ring flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-1 ring-primary-deep/20 transition-transform hover:scale-105 hover:bg-primary-hover active:scale-95"
            style={
              // Three pulses on the first page of a session, then it settles.
              // globals.css neutralises this under prefers-reduced-motion, and
              // the guard keeps it from running at all.
              hinting && !reduceMotion
                ? { animation: "pulse-glow 2.4s ease-in-out 3" }
                : undefined
            }
          >
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
