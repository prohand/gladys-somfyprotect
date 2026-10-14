import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, createSomfyApi } from '../src/somfy/api.js';
import { SomfyError, SomfyRateLimitError } from '../src/somfy/errors.js';

function fakeAuth() {
  let n = 0;
  return {
    invalidated: 0,
    async getAccessToken() {
      return `token-${n}`;
    },
    invalidate() {
      this.invalidated += 1;
      n += 1;
    },
  };
}

function fakeFetch(answers) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({
      url,
      method: init.method,
      auth: init.headers.Authorization,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return answers.shift()();
  };
  return { fetch, requests };
}

const json = (status, body) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('reads the sites and the devices of a site', async () => {
  const http = fakeFetch([
    json(200, { items: [{ site_id: 's1' }] }),
    json(200, { items: [{ device_id: 'd1' }] }),
  ]);
  const api = createSomfyApi({ auth: fakeAuth(), fetch: http.fetch });
  assert.deepEqual(await api.getSites(), [{ site_id: 's1' }]);
  assert.deepEqual(await api.getDevices('s1'), [{ device_id: 'd1' }]);
  assert.equal(http.requests[0].url, `${API_URL}/v3/site`);
  assert.equal(http.requests[1].url, `${API_URL}/v3/site/s1/device`);
  assert.equal(http.requests[0].auth, 'Bearer token-0');
});

test('a 401 renews the token once and replays the call', async () => {
  const auth = fakeAuth();
  const http = fakeFetch([json(401, {}), json(200, {})]);
  const api = createSomfyApi({ auth, fetch: http.fetch });
  await api.setSecurityLevel('s1', 'armed');
  assert.equal(auth.invalidated, 1);
  assert.deepEqual(
    http.requests.map((r) => [r.method, r.url, r.auth, r.body]),
    [
      ['PUT', `${API_URL}/v3/site/s1/security`, 'Bearer token-0', { status: 'armed' }],
      ['PUT', `${API_URL}/v3/site/s1/security`, 'Bearer token-1', { status: 'armed' }],
    ],
  );
});

test('an unknown security level never reaches Somfy', async () => {
  const http = fakeFetch([]);
  const api = createSomfyApi({ auth: fakeAuth(), fetch: http.fetch });
  await assert.rejects(api.setSecurityLevel('s1', 'maximum'), /Unknown security level/);
  assert.equal(http.requests.length, 0);
});

test('HTTP errors and rate limits are told apart', async () => {
  const http = fakeFetch([
    json(500, { error: 'boom' }),
    () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
  ]);
  const api = createSomfyApi({ auth: fakeAuth(), fetch: http.fetch });
  await assert.rejects(
    api.stopAlarm('s1'),
    (err) => err instanceof SomfyError && err.status === 500,
  );
  await assert.rejects(api.stopAlarm('s1'), (err) => {
    assert.ok(err instanceof SomfyRateLimitError);
    assert.equal(err.retryAfter, 30);
    return true;
  });
});

test('a camera snapshot comes back as bytes', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const http = fakeFetch([() => new Response(jpeg, { status: 200 })]);
  const api = createSomfyApi({ auth: fakeAuth(), fetch: http.fetch });
  const image = await api.cameraSnapshot('s1', 'c1');
  assert.ok(Buffer.isBuffer(image));
  assert.deepEqual([...image], [...jpeg]);
  assert.equal(http.requests[0].url, `${API_URL}/video/site/s1/device/c1/snapshot`);
});

test('ids are escaped in the paths', async () => {
  const http = fakeFetch([json(200, {})]);
  const api = createSomfyApi({ auth: fakeAuth(), fetch: http.fetch });
  await api.deviceAction('s/1', 'd?1', 'shutter_open');
  assert.equal(http.requests[0].url, `${API_URL}/v3/site/s%2F1/device/d%3F1/action`);
});
