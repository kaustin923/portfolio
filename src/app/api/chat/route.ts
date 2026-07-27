import Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { systemPrompt } from "@/data/system-prompt";
import { checkRateLimit } from "@/lib/rate-limit";

/** Longest single message forwarded to the model. */
const MAX_MESSAGE_CHARS = 1000;
/** Most turns forwarded. Oldest are dropped, newest kept. */
const MAX_MESSAGES = 20;

/**
 * Written to the stream when generation fails partway through. The client
 * checks for this exact string so a truncated answer is not mistaken for a
 * finished one. Contains a NUL byte, so the model can never produce it.
 * ChatPanel.tsx holds a copy of this constant.
 */
const STREAM_ERROR_MARKER = "\u0000__CHAT_STREAM_ERROR__";

type ChatRole = "user" | "assistant";

interface ModelMessage {
  role: ChatRole;
  content: string;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

/**
 * Everything that reaches the model goes through here. Anything that is not a
 * plain user or assistant string is dropped rather than coerced, so a crafted
 * body cannot inject a different role or a non-text content block.
 */
function sanitizeMessages(payload: unknown): ModelMessage[] {
  if (!Array.isArray(payload)) return [];

  const cleaned: ModelMessage[] = [];

  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null) continue;

    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (!isChatRole(role)) continue;
    if (typeof content !== "string") continue;

    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;

    cleaned.push({ role, content: text });
  }

  const recent = cleaned.slice(-MAX_MESSAGES);

  // The Messages API requires the conversation to open on a user turn.
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();

  return recent;
}

/**
 * Built on first request rather than at module load, so a missing API key
 * surfaces as a 502 at runtime instead of breaking the build.
 */
let client: Anthropic | null = null;

function startStream(messages: ModelMessage[]) {
  if (!client) client = new Anthropic();

  return client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: systemPrompt,
    messages,
  });
}

export async function POST(request: Request) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many messages. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let messages: ModelMessage[];
  try {
    const body: unknown = await request.json();
    const raw =
      typeof body === "object" && body !== null
        ? (body as { messages?: unknown }).messages
        : undefined;
    messages = sanitizeMessages(raw);
  } catch {
    return Response.json({ error: "Could not read that request." }, { status: 400 });
  }

  if (messages.length === 0) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }

  let stream: ReturnType<typeof startStream>;
  try {
    stream = startStream(messages);
  } catch (err) {
    console.error("chat: could not start the model stream", err);
    return Response.json(
      { error: "The assistant is offline right now. Email kaustin923@gmail.com." },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  let clientGone = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        if (!clientGone) {
          console.error("chat: the model stream failed partway through", err);
          try {
            // Tell the client the answer is incomplete. Closing quietly here
            // would look identical to a finished response.
            controller.enqueue(encoder.encode(STREAM_ERROR_MARKER));
          } catch {
            // Nothing left to write to.
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed because the client disconnected.
        }
      }
    },
    cancel() {
      clientGone = true;
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
