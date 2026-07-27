"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import type { ChatMessage as ChatMessageType } from "@/types";

interface ChatMessageProps {
  message: ChatMessageType;
  /** True while the model is still writing this message. */
  streaming?: boolean;
  /** Runs when an internal link is followed, so the panel can get out of the way. */
  onNavigate?: () => void;
}

const LINK_CLASS =
  "focus-ring text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

function isInternal(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#");
}

/**
 * A deliberately small markdown surface: paragraphs, bold, italics, lists,
 * links, inline code. Headings collapse to bold text and images are dropped.
 * Raw HTML never renders, because `rehype-raw` is not in the pipeline and
 * `skipHtml` throws away any HTML nodes the parser does produce.
 */
function buildComponents(onNavigate?: () => void): Components {
  const heading = ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 font-semibold last:mb-0">{children}</p>
  );

  return {
    a: ({ href, children }) => {
      const target = typeof href === "string" ? href : "";
      if (!target) return <>{children}</>;

      if (isInternal(target)) {
        return (
          <Link href={target} className={LINK_CLASS} onClick={onNavigate}>
            {children}
          </Link>
        );
      }

      return (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => (
      <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => <li className="marker:text-subtle">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    code: ({ children }) => (
      <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="scroll-slim mb-2 overflow-x-auto rounded-lg bg-sunken p-2 text-xs last:mb-0">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-2 border-l-2 border-border-strong pl-3 text-muted last:mb-0">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
  };
}

export function ChatMessage({
  message,
  streaming = false,
  onNavigate,
}: ChatMessageProps) {
  const components = useMemo(() => buildComponents(onNavigate), [onNavigate]);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[92%] rounded-2xl rounded-bl-md bg-primary-light px-4 py-2.5 text-sm leading-relaxed break-words text-text ${
          // Making the trailing paragraph inline keeps the caret on the same
          // line as the last word instead of dropping it below the block.
          streaming ? "streaming-caret [&>p:last-child]:inline" : ""
        }`}
      >
        <Markdown components={components} disallowedElements={["img"]} skipHtml>
          {message.content}
        </Markdown>
      </div>
    </div>
  );
}
