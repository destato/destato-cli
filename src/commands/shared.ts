import { Command } from 'commander';
import { resolveConfig, ConfigError } from '../config';
import { ApiError, DestatoClient } from '../client';

export interface GlobalOptions {
  json?: boolean;
  url?: string;
}

// Wraps a command action: resolves config, builds the client, and turns any
// ConfigError/ApiError into a clean stderr message + non-zero exit instead of a
// raw stack trace. `opts` are the merged global+local options.
export async function run(
  command: Command,
  handler: (client: DestatoClient, opts: GlobalOptions & any) => Promise<void>,
): Promise<void> {
  const opts = command.optsWithGlobals() as GlobalOptions & Record<string, any>;
  try {
    const config = resolveConfig(opts.url);
    await handler(new DestatoClient(config), opts);
  } catch (err) {
    fail(err, opts.json);
  }
}

function fail(err: unknown, json?: boolean): never {
  // Under --json the caller is parsing stderr too, so emit the API's own error
  // shape rather than prose. Anything that never reached the API has no body,
  // so it gets a minimal equivalent.
  if (json) {
    const body =
      err instanceof ApiError && err.body !== undefined
        ? err.body
        : { message: (err as Error).message };
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exit(1);
  }

  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`);
  } else if (err instanceof ApiError) {
    process.stderr.write(`Error: ${err.message}\n`);
    if (err.status === 401) {
      process.stderr.write(
        'Your token was rejected. Check DESTATO_API_TOKEN, or create a new ' +
          'token under Integrations → API tokens.\n',
      );
    }
  } else {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
  }
  process.exit(1);
}
