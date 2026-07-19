// Runtime configuration, resolved from the environment (with an optional
// per-invocation --url override applied by the caller).

export const DEFAULT_API_URL = 'https://api.destato.com';

export interface Config {
  token: string;
  baseUrl: string;
}

export class ConfigError extends Error {}

// Resolves the token and base URL. `urlOverride` comes from a global --url flag
// and wins over DESTATO_API_URL, which in turn wins over the production default.
export function resolveConfig(urlOverride?: string): Config {
  const token = process.env.DESTATO_API_TOKEN;
  if (!token) {
    throw new ConfigError(
      'DESTATO_API_TOKEN is not set. Create a token in Destato under ' +
        'Integrations → API tokens, then run:\n\n' +
        '  DESTATO_API_TOKEN=dst_pat_... destato blockers list',
    );
  }
  const baseUrl = (
    urlOverride ??
    process.env.DESTATO_API_URL ??
    DEFAULT_API_URL
  ).replace(/\/+$/, '');
  return { token, baseUrl };
}
