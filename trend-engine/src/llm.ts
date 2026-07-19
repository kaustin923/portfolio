/**
 * Thin wrapper around the Anthropic SDK so every agent reasons the same way:
 * Claude Opus 4.8, adaptive thinking, and schema-validated structured output.
 *
 * Structured output is the important part — agents return typed JSON we can
 * hand straight to the next stage instead of parsing prose.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let _client: Anthropic | null = null;

/** Lazily construct the client so DRY_RUN paths never require an API key. */
export function client(): Anthropic {
  if (!_client) {
    // Zero-arg constructor resolves ANTHROPIC_API_KEY (or an `ant auth login`
    // profile) from the environment. See the Agent SDK auth notes.
    _client = new Anthropic();
  }
  return _client;
}

/**
 * Run a single structured-output turn and return the parsed object.
 *
 * `schema` is a JSON Schema. Per the structured-output rules, keep it to plain
 * types + enums + arrays with `additionalProperties: false` and `required` on
 * every object — no minLength/maximum/etc. (those are rejected).
 */
export async function structured<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await client().messages.create({
    model: config.model,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: config.effort,
      format: { type: 'json_schema', schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Model returned no text block for structured request');
  return JSON.parse(textBlock.text) as T;
}
