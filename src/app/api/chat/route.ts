import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt } from "@/data/system-prompt";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  // Rate limiting
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many messages. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Validate message format
    const validMessages = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, 1000), // Cap message length
      })
    );

    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: validMessages,
    });

    // Create a ReadableStream from the Anthropic stream
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                new TextEncoder().encode(event.delta.text)
              );
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return Response.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
