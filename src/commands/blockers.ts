import { Command } from 'commander';
import { Blocker } from '../client';
import { printJson, printTable, statusFlags } from '../output';
import { run } from './shared';

const BLOCKER_TYPES = [
  'WAITING_ON_SOMEONE',
  'STUCK_ON_PROBLEM',
  'NEED_DECISION',
  'OTHER',
];

function affectedLabel(b: Blocker): string {
  if (b.affectedUser) return b.affectedUser.name;
  if (b.affectedTeam) return `${b.affectedTeam.name} (team)`;
  return '-';
}

function printBlockers(blockers: Blocker[]): void {
  printTable(blockers, [
    { header: 'KEY', value: (b) => `#${b.key}` },
    { header: 'STATUS', value: (b) => b.status },
    { header: 'FLAGS', value: statusFlags },
    { header: 'REL', value: (b) => b.relationships.join(',') || '-' },
    { header: 'AFFECTED', value: affectedLabel },
    { header: 'TITLE', value: (b) => b.title },
  ]);
}

export function registerBlockers(program: Command): void {
  const blockers = program
    .command('blockers')
    .description('List and create blockers');

  blockers
    .command('list')
    .description('List the open blockers you are involved in')
    .option('--teams', "list blockers across all your teams instead of your own")
    .option('--team <uuid>', 'list blockers for one team (by team UUID)')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const data = opts.team
          ? await client.listTeamBlockers(opts.team)
          : opts.teams
            ? await client.listMyTeamsBlockers()
            : await client.listMyBlockers();
        if (opts.json) return printJson(data);
        printBlockers(data);
        process.stdout.write('\nFlags: F=flagged S=snoozed A=aging D=delayed\n');
      }),
    );

  blockers
    .command('create')
    .description('File a blocker that affects you and the given team')
    .requiredOption(
      '--type <type>',
      `blocker type (${BLOCKER_TYPES.join(' | ')})`,
    )
    .requiredOption('--title <title>', 'short title')
    .requiredOption('--team <uuid>', 'affected team UUID (a team you belong to)')
    .option('--description <text>', 'optional longer description')
    .option('--since <YYYY-MM-DD>', 'optional blocked-since date')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        if (!BLOCKER_TYPES.includes(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${BLOCKER_TYPES.join(', ')}`,
          );
        }
        const created = await client.createBlocker({
          type: opts.type,
          title: opts.title,
          affectedTeamId: opts.team,
          description: opts.description,
          blockedSince: opts.since,
        });
        if (opts.json) return printJson(created);
        process.stdout.write(`Created blocker #${created.key}: ${created.title}\n`);
      }),
    );
}
