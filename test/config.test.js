const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readConfig, keyPrefix, connectionCredential } = require('../server/cache/config');

const named = {
  REDIS_HOST: 'sample.eastus.redis.azure.net', REDIS_PORT: '10000',
  REDIS_USERNAME: '11111111-2222-3333-4444-555555555555', REDIS_TLS: 'true',
};

test('uses complete Connections mappings and refuses mixed or unsafe configuration', () => {
  const config = readConfig(named);
  assert.equal(config.endpoint, 'sample.eastus.redis.azure.net:10000');
  assert.equal(config.username, named.REDIS_USERNAME);
  for (const name of Object.keys(named)) {
    assert.throws(() => readConfig({ ...named, [name]: '' }));
  }
  assert.throws(() => readConfig({ ...named, REDIS_ENDPOINT: config.endpoint }));
  assert.throws(() => readConfig({ ...named, REDIS_TLS: 'false' }));
});

test('Connections identity must match the refreshed SDK token principal without exposing it', async () => {
  const token = { token: `header.${Buffer.from(JSON.stringify({ oid: named.REDIS_USERNAME })).toString('base64url')}.signature` };
  let calls = 0;
  const credential = connectionCredential({ async getToken(scope) {
    assert.equal(scope, 'scope');
    calls++;
    return token;
  } }, named.REDIS_USERNAME);
  assert.equal(await credential.getToken('scope'), token);
  assert.equal(await credential.getToken('scope'), token);
  assert.equal(calls, 2);
  const mismatch = connectionCredential({ async getToken() { return token; } }, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  await assert.rejects(mismatch.getToken('scope'), /does not match/);
  await assert.rejects(connectionCredential({ async getToken() { return { token: 'invalid' }; } }, named.REDIS_USERNAME).getToken('scope'), /valid principal/);
});

test('requires explicit endpoint and disallows credentials, URLs and invalid ports', () => {
  for (const endpoint of [undefined, 'redis://localhost:6379', 'rediss://token@cache:10000', 'cache', 'cache:0', 'cache:65536']) {
    assert.throws(() => readConfig({ REDIS_ENDPOINT: endpoint }));
  }
});

test('defaults to system managed identity and a cluster-safe namespace', () => {
  const config = readConfig({ REDIS_ENDPOINT: 'sample.eastus.redis.azure.net:10000' });
  assert.equal(config.mode, 'managed-identity');
  assert.equal(config.clientId, undefined);
  assert.equal(keyPrefix(config.namespace), 'pulseboard:{demo}:');
});

test('accepts explicit local developer and user assigned identity configuration', () => {
  assert.equal(readConfig({ REDIS_ENDPOINT: 'sample:10000', REDIS_AUTH_MODE: 'developer' }).mode, 'developer');
  assert.equal(readConfig({ REDIS_ENDPOINT: 'sample:10000', AZURE_CLIENT_ID: 'user-identity-client' }).clientId, 'user-identity-client');
});

test('rejects namespace injection and hosted developer credential fallback', () => {
  for (const namespace of ['*', 'a}:*', '', 'a'.repeat(41), 'a:b']) {
    assert.throws(() => readConfig({ REDIS_ENDPOINT: 'sample:10000', REDIS_NAMESPACE: namespace }));
  }
  assert.throws(() => readConfig({ REDIS_ENDPOINT: 'sample:10000', REDIS_AUTH_MODE: 'keys' }));
  assert.throws(() => readConfig({ REDIS_ENDPOINT: 'sample:10000', REDIS_AUTH_MODE: 'developer', IDENTITY_ENDPOINT: 'http://identity' }));
});
