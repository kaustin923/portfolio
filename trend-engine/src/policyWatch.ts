import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getTelegramFetch } from './approval/telegram.js';
import { config } from './config.js';

export interface PolicyPage {
  name: string;
  url: string;
  note: string;
}

export const POLICY_REGISTRY: readonly PolicyPage[] = [
  {
    name: 'youtube-monetization-policies',
    url: 'https://support.google.com/youtube/answer/1311392?hl=en',
    note: 'rulebook-cited; page hosts reused-content and inauthentic-content sections; inauthentic-content anchor: #zippy=%2Cinauthentic-content',
  },
  {
    name: 'tiktok-creator-rewards',
    url: 'https://support.tiktok.com/en/business-and-creator/creator-rewards-program/creator-rewards-program',
    note: 'rulebook-cited; originality scoring',
  },
  {
    name: 'tiktok-originality-policy',
    url: 'https://www.tiktok.com/creator-academy/article/tiktok-originality-policy',
    note: 'rulebook-cited',
  },
  {
    name: 'meta-originality-standard',
    url: 'https://www.facebook.com/help/1348682518563619',
    note: 'canonical best-known URL — verify on first live check',
  },
  {
    name: 'x-creator-monetization-standards',
    url: 'https://help.x.com/en/rules-and-policies/content-monetization-standards',
    note: 'canonical help-center URL',
  },
] as const;

export type PolicyFetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let injectedPolicyFetch: PolicyFetchFn | undefined;

/** Every policy-page request goes through this seam so tests stay offline. */
export function getPolicyFetch(): PolicyFetchFn {
  return injectedPolicyFetch ?? ((input, init) => globalThis.fetch(input, init));
}

export function setPolicyFetch(fn: PolicyFetchFn): void {
  injectedPolicyFetch = fn;
}

export function resetPolicyFetch(): void {
  injectedPolicyFetch = undefined;
}

export function normalizePolicyHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashPolicy(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

interface StoredPolicyPage {
  url: string;
  sha256: string;
  lastCheckedAt: string;
  lastChangedAt?: string;
}

interface PolicyHashState {
  checkedAt: string;
  pages: Record<string, StoredPolicyPage>;
}

export interface PolicyCheckResult {
  name: string;
  url: string;
  status: 'changed' | 'unchanged' | 'unreachable';
  httpStatus?: number;
}

export interface CheckPoliciesOptions {
  force?: boolean;
  dryRun?: boolean;
  dir?: string;
  now?: Date;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MIN_POLICY_TEXT_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredPolicyPage(value: unknown): value is StoredPolicyPage {
  if (!isRecord(value)) return false;
  return (
    typeof value.url === 'string' &&
    typeof value.sha256 === 'string' &&
    typeof value.lastCheckedAt === 'string' &&
    (value.lastChangedAt === undefined || typeof value.lastChangedAt === 'string')
  );
}

function isPolicyHashState(value: unknown): value is PolicyHashState {
  if (!isRecord(value) || typeof value.checkedAt !== 'string' || !isRecord(value.pages)) {
    return false;
  }
  return Object.values(value.pages).every(isStoredPolicyPage);
}

async function loadPolicyHashState(targetDir: string): Promise<PolicyHashState> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(targetDir, 'policy-hashes.json'), 'utf8'),
    );
    if (!isPolicyHashState(parsed)) {
      throw new Error('policy-hashes.json has an unsupported shape');
    }
    return parsed;
  } catch (err) {
    console.warn('[policy] failed to load policy hashes; starting fresh:', err);
    return { checkedAt: '', pages: {} };
  }
}

function checkedWithinInterval(checkedAt: string, now: Date): boolean {
  const timestamp = Date.parse(checkedAt);
  return Number.isFinite(timestamp) && now.getTime() - timestamp < CHECK_INTERVAL_MS;
}

async function fetchPolicyPage(
  page: PolicyPage,
): Promise<{ normalized?: string; httpStatus?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await getPolicyFetch()(page.url, { signal: controller.signal });
    if (response.status !== 200) {
      console.warn(
        `[policy] unreachable: ${page.name} (${page.url}) returned HTTP ${response.status}`,
      );
      return { httpStatus: response.status };
    }

    const normalized = normalizePolicyHtml(await response.text());
    if (normalized.length <= MIN_POLICY_TEXT_LENGTH) {
      console.warn(
        `[policy] unreachable: ${page.name} (${page.url}) returned only ${normalized.length} normalized characters`,
      );
      return { httpStatus: response.status };
    }
    return { normalized, httpStatus: response.status };
  } catch {
    console.warn(`[policy] unreachable: ${page.name} (${page.url}) request failed`);
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPolicyChangeNotification(name: string): Promise<void> {
  const token = config.approval.telegramBotToken;
  const chatId = config.approval.telegramChatId;
  if (!token || !chatId) return;

  try {
    const response = await getTelegramFetch()(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `policy page changed: ${name} — review before next publish`,
        }),
      },
    );
    if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`);
  } catch {
    console.warn(`[policy] Telegram notification failed for ${name} (non-fatal)`);
  }
}

export async function checkPolicies(
  opts: CheckPoliciesOptions = {},
): Promise<PolicyCheckResult[]> {
  const dryRun = opts.dryRun ?? config.dryRun;
  if (dryRun) {
    console.log('[policy] DRY_RUN — network policy checks are disabled');
    return [];
  }

  const targetDir = opts.dir ?? config.dataDir;
  const now = opts.now ?? new Date();
  const checkedAt = now.toISOString();
  const state = await loadPolicyHashState(targetDir);
  if (!opts.force && checkedWithinInterval(state.checkedAt, now)) return [];

  const fetchedPages = await Promise.all(
    POLICY_REGISTRY.map(async (page) => ({ page, fetched: await fetchPolicyPage(page) })),
  );
  const results: PolicyCheckResult[] = [];

  await mkdir(targetDir, { recursive: true });
  for (const { page, fetched } of fetchedPages) {
    if (fetched.normalized === undefined) {
      results.push({
        name: page.name,
        url: page.url,
        status: 'unreachable',
        ...(fetched.httpStatus !== undefined ? { httpStatus: fetched.httpStatus } : {}),
      });
      continue;
    }

    const previous = state.pages[page.name];
    const sha256 = hashPolicy(fetched.normalized);
    const changed = previous !== undefined && previous.sha256 !== sha256;
    state.pages[page.name] = {
      url: page.url,
      sha256,
      lastCheckedAt: checkedAt,
      ...(changed
        ? { lastChangedAt: checkedAt }
        : previous?.lastChangedAt
          ? { lastChangedAt: previous.lastChangedAt }
          : {}),
    };

    if (changed) {
      await appendFile(
        join(targetDir, 'policy-drift.jsonl'),
        `${JSON.stringify({
          ts: checkedAt,
          name: page.name,
          url: page.url,
          oldHash: previous.sha256,
          newHash: sha256,
        })}\n`,
      );
      await sendPolicyChangeNotification(page.name);
    }

    results.push({
      name: page.name,
      url: page.url,
      status: changed ? 'changed' : 'unchanged',
      httpStatus: fetched.httpStatus,
    });
  }

  state.checkedAt = checkedAt;
  await writeFile(join(targetDir, 'policy-hashes.json'), JSON.stringify(state, null, 2));
  return results;
}

export async function main(): Promise<void> {
  if (config.dryRun) {
    for (const page of POLICY_REGISTRY) {
      console.log(`[policy] registered: ${page.name} — ${page.url} — ${page.note}`);
    }
  }

  const results = await checkPolicies({ force: true });
  for (const result of results) {
    const http = result.httpStatus === undefined ? 'no HTTP response' : `HTTP ${result.httpStatus}`;
    console.log(`[policy] ${result.name}: ${http} — ${result.status}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
