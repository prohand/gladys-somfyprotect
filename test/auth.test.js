import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSomfyAuth, TOKEN_URL } from '../src/somfy/auth.js';
import { SomfyAuthError, SomfyRateLimitError } from '../src/somfy/errors.js';
import { accountHash, createMemoryTokenStore } from '../src/somfy/tokenStore.js';

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fakeSso(answers) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, params: Object.fromEntries(new URLSearchParams(init.body)) });
    const answer = answers.shift();
    if (!answer) {
      throw new Error('unexpected SSO call');
    }
    return answer();
  };
  return { fetch, requests };
}

const token =
  (n, extra = {}) =>
  () =>
    jsonResponse(200, {
      access_token: `access-${n}`,
      refresh_token: `refresh-${n}`,
      expires_in: 3600,
      ...extra,
    });

test('logs in with the password grant, then reuses the token', async () => {
  const sso = fakeSso([token(1)]);
  const store = createMemoryTokenStore();
  const auth = createSomfyAuth({
    username: 'me@example.com',
    password: 'pw',
    tokenStore: store,
    ...sso,
  });
  assert.equal(await auth.getAccessToken(), 'access-1');
  assert.equal(await auth.getAccessToken(), 'access-1');
  assert.equal(sso.requests.length, 1);
  assert.equal(sso.requests[0].url, TOKEN_URL);
  assert.equal(sso.requests[0].params.grant_type, 'password');
  assert.equal(sso.requests[0].params.username, 'me@example.com');
  assert.ok(sso.requests[0].params.client_id);
  assert.equal(store.saved.get(accountHash('me@example.com')).refresh_token, 'refresh-1');
});

test('concurrent callers share one login', async () => {
  const sso = fakeSso([token(1)]);
  const auth = createSomfyAuth({
    username: 'a',
    password: 'b',
    tokenStore: createMemoryTokenStore(),
    ...sso,
  });
  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
  assert.deepEqual(tokens, ['access-1', 'access-1']);
  assert.equal(sso.requests.length, 1);
});

test('an expired token is renewed with the refresh token, not the password', async () => {
  let clock = 0;
  const sso = fakeSso([token(1), token(2)]);
  const auth = createSomfyAuth({
    username: 'a',
    password: 'b',
    tokenStore: createMemoryTokenStore(),
    now: () => clock,
    ...sso,
  });
  await auth.getAccessToken();
  clock += 3600 * 1000;
  assert.equal(await auth.getAccessToken(), 'access-2');
  assert.equal(sso.requests[1].params.grant_type, 'refresh_token');
  assert.equal(sso.requests[1].params.refresh_token, 'refresh-1');
});

test('a refused refresh token falls back to the password grant', async () => {
  const store = createMemoryTokenStore();
  await store.save('a', { access_token: 'old', refresh_token: 'stale', expires_at: 0 });
  const sso = fakeSso([() => jsonResponse(400, { error: 'invalid_grant' }), token(3)]);
  const auth = createSomfyAuth({ username: 'a', password: 'b', tokenStore: store, ...sso });
  assert.equal(await auth.getAccessToken(), 'access-3');
  assert.deepEqual(
    sso.requests.map((r) => r.params.grant_type),
    ['refresh_token', 'password'],
  );
});

test('a saved token of another account is never used', async () => {
  const store = createMemoryTokenStore();
  await store.save('other@example.com', {
    access_token: 'theirs',
    refresh_token: 'theirs',
    expires_at: Date.now() + 3_600_000,
  });
  const sso = fakeSso([token(1)]);
  const auth = createSomfyAuth({
    username: 'me@example.com',
    password: 'b',
    tokenStore: store,
    ...sso,
  });
  assert.equal(await auth.getAccessToken(), 'access-1');
});

test('a wrong password is a SomfyAuthError', async () => {
  const sso = fakeSso([() => jsonResponse(400, { error: 'invalid_grant' })]);
  const auth = createSomfyAuth({
    username: 'a',
    password: 'wrong',
    tokenStore: createMemoryTokenStore(),
    ...sso,
  });
  await assert.rejects(auth.getAccessToken(), SomfyAuthError);
});

test('a 429 blocks further logins until its delay has passed', async () => {
  let clock = 0;
  const sso = fakeSso([
    () => jsonResponse(429, {}, { 'X-RateLimit-Retry-After': '120' }),
    token(1),
  ]);
  const auth = createSomfyAuth({
    username: 'a',
    password: 'b',
    tokenStore: createMemoryTokenStore(),
    now: () => clock,
    ...sso,
  });
  await assert.rejects(auth.getAccessToken(), (err) => {
    assert.ok(err instanceof SomfyRateLimitError);
    assert.equal(err.retryAfter, 120);
    return true;
  });
  // Still blocked: no request reaches the SSO.
  clock += 60_000;
  await assert.rejects(auth.getAccessToken(), SomfyRateLimitError);
  assert.equal(sso.requests.length, 1);
  clock += 61_000;
  assert.equal(await auth.getAccessToken(), 'access-1');
});

test('invalidate() makes the next call renew the token', async () => {
  const sso = fakeSso([token(1), token(2)]);
  const auth = createSomfyAuth({
    username: 'a',
    password: 'b',
    tokenStore: createMemoryTokenStore(),
    ...sso,
  });
  await auth.getAccessToken();
  auth.invalidate();
  assert.equal(await auth.getAccessToken(), 'access-2');
});
