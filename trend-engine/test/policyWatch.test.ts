import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { resetTelegramFetch, setTelegramFetch } from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import {
  checkPolicies,
  hashPolicy,
  normalizePolicyHtml,
  POLICY_REGISTRY,
  resetPolicyFetch,
  setPolicyFetch,
} from '../src/policyWatch.js';

interface MutableApprovalConfig {
  telegramBotToken: string;
  telegramChatId: string;
}

function longHtml(text: string): string {
  return `<html><body><main>${text.repeat(600)}</main></body></html>`;
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-policy-watch-'));
  try {
    await run(dir);
  } finally {
    resetPolicyFetch();
    resetTelegramFetch();
    await rm(dir, { recursive: true, force: true });
  }
}

test('normalizePolicyHtml strips executable/style blocks and hashPolicy is deterministic', () => {
  const normalized = normalizePolicyHtml(`
    <html>
      <style>.hidden { display: none; }</style>
      <body>Hello <strong>policy</strong>\n\t world</body>
      <script>window.noise = '<p>ignore me</p>';</script>
    </html>
  `);

  assert.equal(normalized, 'Hello policy world');
  assert.equal(hashPolicy(normalized), hashPolicy('Hello policy world'));
  assert.match(hashPolicy(normalized), /^[a-f0-9]{64}$/);
});

test('checkPolicies records drift and updates policy hashes with injected fetches', async () => {
  await withTempDir(async (dir) => {
    setPolicyFetch(async () => new Response(longHtml('old policy '), { status: 200 }));
    await checkPolicies({ force: true, dryRun: false, dir, now: new Date('2026-07-18T00:00:00Z') });

    setPolicyFetch(async () => new Response(longHtml('changed policy '), { status: 200 }));
    const results = await checkPolicies({
      force: true,
      dryRun: false,
      dir,
      now: new Date('2026-07-19T00:00:00Z'),
    });

    assert.equal(results.length, POLICY_REGISTRY.length);
    assert.ok(results.every((result) => result.status === 'changed'));

    const driftLines = (await readFile(join(dir, 'policy-drift.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(driftLines.length, POLICY_REGISTRY.length);
    assert.deepEqual(Object.keys(driftLines[0]!).sort(), [
      'name',
      'newHash',
      'oldHash',
      'ts',
      'url',
    ]);

    const stored = JSON.parse(
      await readFile(join(dir, 'policy-hashes.json'), 'utf8'),
    ) as {
      checkedAt: string;
      pages: Record<string, { sha256: string; lastChangedAt?: string }>;
    };
    assert.equal(stored.checkedAt, '2026-07-19T00:00:00.000Z');
    for (const page of POLICY_REGISTRY) {
      assert.equal(stored.pages[page.name]?.sha256, hashPolicy(normalizePolicyHtml(longHtml('changed policy '))));
      assert.equal(stored.pages[page.name]?.lastChangedAt, stored.checkedAt);
    }
  });
});

test('checkPolicies throttles checks for 24 hours unless forced', async () => {
  await withTempDir(async (dir) => {
    let calls = 0;
    setPolicyFetch(async () => {
      calls += 1;
      return new Response(longHtml('baseline '), { status: 200 });
    });

    await checkPolicies({ force: true, dryRun: false, dir, now: new Date('2026-07-19T00:00:00Z') });
    calls = 0;
    const results = await checkPolicies({
      dryRun: false,
      dir,
      now: new Date('2026-07-19T23:59:59Z'),
    });

    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  });
});

test('checkPolicies performs no fetches in dry-run mode', async () => {
  await withTempDir(async (dir) => {
    let calls = 0;
    setPolicyFetch(async () => {
      calls += 1;
      throw new Error('must not fetch');
    });

    assert.deepEqual(await checkPolicies({ force: true, dryRun: true, dir }), []);
    assert.equal(calls, 0);
  });
});

test('non-200 and short policy responses retain stored hashes', async () => {
  await withTempDir(async (dir) => {
    const oldHash = 'a'.repeat(64);
    const pages = Object.fromEntries(
      POLICY_REGISTRY.map((page) => [
        page.name,
        {
          url: page.url,
          sha256: oldHash,
          lastCheckedAt: '2026-07-18T00:00:00.000Z',
        },
      ]),
    );
    await writeFile(
      join(dir, 'policy-hashes.json'),
      JSON.stringify({ checkedAt: '2026-07-18T00:00:00.000Z', pages }),
    );

    let calls = 0;
    setPolicyFetch(async () => {
      calls += 1;
      return calls % 2 === 0
        ? new Response(longHtml('unavailable '), { status: 503 })
        : new Response('<html><body>log in</body></html>', { status: 200 });
    });
    const results = await checkPolicies({
      force: true,
      dryRun: false,
      dir,
      now: new Date('2026-07-19T00:00:00Z'),
    });

    assert.ok(results.every((result) => result.status === 'unreachable'));
    const stored = JSON.parse(
      await readFile(join(dir, 'policy-hashes.json'), 'utf8'),
    ) as { checkedAt: string; pages: Record<string, { sha256: string; lastCheckedAt: string }> };
    assert.equal(stored.checkedAt, '2026-07-19T00:00:00.000Z');
    for (const page of POLICY_REGISTRY) {
      assert.equal(stored.pages[page.name]?.sha256, oldHash);
      assert.equal(stored.pages[page.name]?.lastCheckedAt, '2026-07-18T00:00:00.000Z');
    }
  });
});

test('Telegram notification failures do not fail a drift check', async () => {
  await withTempDir(async (dir) => {
    const approval = config.approval as unknown as MutableApprovalConfig;
    const originalToken = approval.telegramBotToken;
    const originalChatId = approval.telegramChatId;
    approval.telegramBotToken = 'test-token';
    approval.telegramChatId = 'test-chat';

    try {
      setPolicyFetch(async () => new Response(longHtml('baseline '), { status: 200 }));
      await checkPolicies({ force: true, dryRun: false, dir });

      setTelegramFetch(async () => {
        throw new Error('Telegram unavailable');
      });
      setPolicyFetch(async () => new Response(longHtml('changed '), { status: 200 }));
      await assert.doesNotReject(checkPolicies({ force: true, dryRun: false, dir }));
    } finally {
      approval.telegramBotToken = originalToken;
      approval.telegramChatId = originalChatId;
    }
  });
});
