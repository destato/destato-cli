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
    fail(err);
  }
}

function fail(err: unknown): never {
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
