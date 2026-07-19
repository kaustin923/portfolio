import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildConsentUrl, upsertEnvLine } from '../scripts/youtube-oauth.js';

test('upsertEnvLine replaces the first existing value and preserves other lines', () => {
  assert.equal(
    upsertEnvLine(
      'FIRST=untouched\n\nYOUTUBE_REFRESH_TOKEN=old\nLAST=untouched',
      'YOUTUBE_REFRESH_TOKEN',
      'new-token',
    ),
    'FIRST=untouched\n\nYOUTUBE_REFRESH_TOKEN=new-token\nLAST=untouched',
  );
});

test('upsertEnvLine writes replacement values literally', () => {
  assert.equal(
    upsertEnvLine(
      'YOUTUBE_REFRESH_TOKEN=old\nLAST=untouched',
      'YOUTUBE_REFRESH_TOKEN',
      '$&-new-token',
    ),
    'YOUTUBE_REFRESH_TOKEN=$&-new-token\nLAST=untouched',
  );
});

test('upsertEnvLine uncomments a commented value', () => {
  assert.equal(
    upsertEnvLine(
      'FIRST=untouched\n  #  YOUTUBE_REFRESH_TOKEN=placeholder\nLAST=untouched',
      'YOUTUBE_REFRESH_TOKEN',
      'new-token',
    ),
    'FIRST=untouched\nYOUTUBE_REFRESH_TOKEN=new-token\nLAST=untouched',
  );
});

test('upsertEnvLine appends when absent without adding a trailing newline', () => {
  assert.equal(
    upsertEnvLine('FIRST=untouched\nLAST=untouched', 'YOUTUBE_REFRESH_TOKEN', 'new-token'),
    'FIRST=untouched\nLAST=untouched\nYOUTUBE_REFRESH_TOKEN=new-token',
  );
});

test('upsertEnvLine preserves other bytes and a trailing newline when appending', () => {
  const content = 'FIRST=untouched\r\n\r\n# unrelated comment\r\n';
  assert.equal(
    upsertEnvLine(content, 'YOUTUBE_REFRESH_TOKEN', 'new-token'),
    `${content}YOUTUBE_REFRESH_TOKEN=new-token\r\n`,
  );
});

test('buildConsentUrl requests offline YouTube upload access with consent and state', () => {
  const consentUrl = new URL(
    buildConsentUrl({ clientId: 'client-id', port: 43210, state: 'test-state' }),
  );

  assert.equal(consentUrl.origin, 'https://accounts.google.com');
  assert.equal(consentUrl.pathname, '/o/oauth2/v2/auth');
  assert.equal(consentUrl.searchParams.get('client_id'), 'client-id');
  assert.equal(consentUrl.searchParams.get('redirect_uri'), 'http://localhost:43210/callback');
  assert.equal(consentUrl.searchParams.get('response_type'), 'code');
  assert.equal(
    consentUrl.searchParams.get('scope'),
    'https://www.googleapis.com/auth/youtube.upload',
  );
  assert.equal(consentUrl.searchParams.get('access_type'), 'offline');
  assert.equal(consentUrl.searchParams.get('prompt'), 'consent');
  assert.equal(consentUrl.searchParams.get('state'), 'test-state');
});
