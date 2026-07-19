/**
 * The "brain" of the system — Claude Fable 5.
 *
 * Two design goals:
 *   1. Fable is the reasoning engine for every judgement call (forecasting,
 *      copywriting). Fable has always-on thinking and we opt into server-side
 *      refusal fallback to Opus 4.8 by default.
 *   2. The brain is *injectable*. Every agent talks to the `LLM` interface, not
 *      the Anthropic client directly, so tests can swap in a deterministic mock
 *      and exercise the whole pipeline end-to-end with no API key. This is what
 *      lets us actually prove the system works.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

export interface StructuredRequest {
  system: string;
  user: string;
  /** JSON Schema — plain types + enums + arrays, `additionalProperties:false`. */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

/** The contract every agent depends on. Real impl below; mock impl in testing/. */
export interface LLM {
  /** One structured-output turn → validated, typed JSON. */
  structured<T>(req: StructuredRequest): Promise<T>;
  /** Web-search-backed freeform research (for forward-looking forecasting). */
  research(prompt: string): Promise<string>;
}

// ────────────────────────────────────────────────────────────────────────────
// Real implementation — Claude Fable 5
// ────────────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function client(): Anthropic {
  // Zero-arg constructor resolves ANTHROPIC_API_KEY (or an `ant auth login`
  // profile) from the environment.
  if (!_client) _client = new Anthropic();
  return _client;
}

const isFableFamily = (m: string) => m.startsWith('claude-fable') || m.startsWith('claude-mythos');

function textOf(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export const anthropicLLM: LLM = {
  async structured<T>(req: StructuredRequest): Promise<T> {
    const base: Record<string, unknown> = {
      model: config.model,
      max_tokens: req.maxTokens ?? 16000,
      output_config: {
        effort: config.effort,
        format: { type: 'json_schema', schema: req.schema },
      },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    };

    // Fable: thinking is always on (omit the param — an explicit config 400s),
    // and opt into server-side refusal fallback to Opus 4.8 by default.
    // Non-Fable models take the plain path with adaptive thinking.
    const res = isFableFamily(config.model)
      ? ((await (client().beta.messages.create as any)({
          ...base,
          betas: ['server-side-fallback-2026-06-01'],
          fallbacks: [{ model: config.fallbackModel }],
        })) as Anthropic.Message)
      : ((await (client().messages.create as any)({
          ...base,
          thinking: { type: 'adaptive' },
        })) as Anthropic.Message);

    if (res.stop_reason === 'refusal') {
      const cat = (res as any).stop_details?.category;
      throw new Error(`Fable declined the request (refusal${cat ? `: ${cat}` : ''}).`);
    }

    const text = textOf(res as any);
    if (!text) throw new Error('Model returned no text block for structured request');
    return JSON.parse(text) as T;
  },

  async research(prompt: string): Promise<string> {
    // Web-search server tool → live, forward-looking research. Handles the
    // server-side pause_turn loop with a small cap. No structured format here;
    // the caller feeds the result into a `structured()` call to rank it.
    let messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
    let text = '';
    for (let i = 0; i < 4; i++) {
      const res = (await (client().messages.create as any)({
        model: config.model,
        max_tokens: 8000,
        output_config: { effort: config.effort },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
        messages,
      })) as Anthropic.Message;
      text = textOf(res as any);
      if (res.stop_reason !== 'pause_turn') break;
      // Resume: re-send with the assistant turn appended (server continues).
      messages = [...messages, { role: 'assistant', content: res.content as any }];
    }
    return text;
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Injection point — agents call these; tests swap the impl.
// ────────────────────────────────────────────────────────────────────────────

let active: LLM = anthropicLLM;

/** Swap the brain (tests inject a deterministic mock). */
export function setLLM(impl: LLM): void {
  active = impl;
}
/** Restore the real Fable-backed brain. */
export function resetLLM(): void {
  active = anthropicLLM;
}

export function structured<T>(req: StructuredRequest): Promise<T> {
  return active.structured<T>(req);
}
export function research(prompt: string): Promise<string> {
  return active.research(prompt);
}
