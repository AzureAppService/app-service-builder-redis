function readConfig(env = process.env) {
  const named = ['REDIS_HOST', 'REDIS_PORT', 'REDIS_USERNAME', 'REDIS_TLS'].some(name => env[name] !== undefined);
  if (named && env.REDIS_ENDPOINT !== undefined) {
    throw new Error('Remove REDIS_ENDPOINT before using the Connections host/port mappings.');
  }
  if (named && (env.REDIS_TLS !== 'true' ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(env.REDIS_USERNAME ?? '') ||
    env.REDIS_USERNAME === '00000000-0000-0000-0000-000000000000')) {
    throw new Error('Connections requires REDIS_TLS=true and the selected managed identity principal ID in REDIS_USERNAME.');
  }
  const endpoint = named ? `${env.REDIS_HOST ?? ''}:${env.REDIS_PORT ?? ''}` : env.REDIS_ENDPOINT;
  if (!endpoint || !/^[a-zA-Z0-9.-]+:\d+$/.test(endpoint)) {
    throw new Error('REDIS_ENDPOINT must be hostname:port from Azure Managed Redis (no URL or credentials)');
  }
  const [host, portText] = endpoint.split(':');
  const port = Number(portText);
  if (port < 1 || port > 65535) throw new Error('REDIS_ENDPOINT port must be 1-65535');
  const namespace = env.REDIS_NAMESPACE ?? 'demo';
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(namespace)) {
    throw new Error('REDIS_NAMESPACE must contain 1-40 letters, digits, underscores or hyphens');
  }
  const mode = env.REDIS_AUTH_MODE ?? 'managed-identity';
  if (!['managed-identity', 'developer'].includes(mode)) {
    throw new Error('REDIS_AUTH_MODE must be managed-identity or developer');
  }
  if (mode === 'developer' && (env.IDENTITY_ENDPOINT || env.MSI_ENDPOINT || env.WEBSITE_INSTANCE_ID)) {
    throw new Error('Developer authentication is local-only; use managed-identity in Azure');
  }
  return { endpoint, host, port, namespace, mode, clientId: env.AZURE_CLIENT_ID, username: named ? env.REDIS_USERNAME : undefined };
}

function connectionCredential(credential, username) {
  if (!username) return credential;
  return {
    async getToken(...args) {
      const token = await credential.getToken(...args);
      let principal;
      try {
        principal = JSON.parse(Buffer.from(token.token.split('.')[1], 'base64url').toString()).oid;
      } catch {
        throw new Error('Redis identity token does not contain a valid principal.');
      }
      if (typeof principal !== 'string' || principal.toLowerCase() !== username.toLowerCase()) {
        throw new Error('Redis SDK identity does not match the identity selected in Connections.');
      }
      return token;
    },
  };
}

function keyPrefix(namespace) {
  // A shared hash tag keeps each sample's transactions on one OSS cluster slot.
  return `pulseboard:{${namespace}}:`;
}

module.exports = { readConfig, keyPrefix, connectionCredential };
