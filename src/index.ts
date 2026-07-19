#!/usr/bin/env node
import { Command } from 'commander';
import { registerBlockers } from './commands/blockers';
import { registerDirectory } from './commands/directory';
import { DEFAULT_API_URL } from './config';

// package.json ships in the published tarball (npm always includes it), so this
// resolves at runtime from dist/ -> ../package.json.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('destato')
  .description('Command-line client for the Destato API')
  .version(pkg.version, '-v, --version')
  .option('--json', 'output raw JSON instead of a table')
  .option(
    '--url <url>',
    `API base URL (overrides DESTATO_API_URL; default ${DEFAULT_API_URL})`,
  )
  .addHelpText(
    'after',
    '\nAuthentication:\n' +
      '  Set DESTATO_API_TOKEN to a Personal Access Token (Integrations →\n' +
      '  API tokens). Example:\n\n' +
      '    DESTATO_API_TOKEN=dst_pat_... destato blockers list\n',
  );

registerBlockers(program);
registerDirectory(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
});
