import { Command } from 'commander';
import {
  AffectedParty,
  Blocker,
  BlockedByParty,
  BlockerDetail,
} from '../client';
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

// Compact forms for the table. `view` renders the same parties more fully.
function blockedByLabel(b: Blocker): string {
  if (b.blockedByUser) return b.blockedByUser.name;
  if (b.blockedByTeam) return `${b.blockedByTeam.name} (team)`;
  if (b.blockedByText) return b.blockedByText;
  return '-';
}

function ownerLabel(b: Blocker): string {
  if (b.ownerUser) return b.ownerUser.name;
  if (b.ownerTeam) return `${b.ownerTeam.name} (team)`;
  return '(unassigned)';
}

function printBlockers(blockers: Blocker[]): void {
  printTable(blockers, [
    { header: 'KEY', value: (b) => `#${b.key}` },
    { header: 'STATUS', value: (b) => b.status },
    { header: 'FLAGS', value: statusFlags },
    { header: 'REL', value: (b) => b.relationships.join(',') || '-' },
    { header: 'AFFECTED', value: affectedLabel },
    { header: 'BLOCKED BY', value: blockedByLabel },
    { header: 'OWNER', value: ownerLabel },
    { header: 'TITLE', value: (b) => b.title },
  ]);
}

function partyLabel(
  user: { name: string } | null,
  team: { name: string } | null,
  text?: string | null,
): string {
  if (user && team) return `${user.name} (${team.name})`;
  if (user) return user.name;
  if (team) return `${team.name} (team)`;
  // Free text stands on its own — whether it matched a workspace entity is
  // visible in --json, not something to editorialize in the rendering.
  if (text) return text;
  return '-';
}

// A vertical label/value layout — one blocker has too many fields for the table
// the list uses, and the description needs its own block.
function printBlockerDetail(b: BlockerDetail): void {
  const flags = [
    b.flagged && 'flagged',
    b.snoozedUntil && `snoozed until ${b.snoozedUntil}`,
    b.aging && 'aging',
    b.delayed && 'delayed',
  ].filter(Boolean);

  const rows: [string, string][] = [
    ['Status', b.status + (flags.length ? ` (${flags.join(', ')})` : '')],
    ['Type', b.type],
    ['Affected', partyLabel(b.affectedUser, b.affectedTeam)],
    ['Blocked by', partyLabel(b.blockedByUser, b.blockedByTeam, b.blockedByText)],
    [
      'Owner',
      b.ownerUser || b.ownerTeam
        ? partyLabel(b.ownerUser, b.ownerTeam)
        : '(unassigned)',
    ],
    ['Blocked since', b.blockedSince ?? '-'],
    ['Created', b.createdAt],
    ['Relationships', b.relationships.join(', ') || '-'],
    ['ID', b.id],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  process.stdout.write(`#${b.key}  ${b.title}\n\n`);
  for (const [label, value] of rows) {
    process.stdout.write(`  ${label.padEnd(width)}  ${value}\n`);
  }
  if (b.description) {
    process.stdout.write(`\n  Description\n`);
    for (const line of b.description.split('\n')) {
      process.stdout.write(`    ${line}\n`);
    }
  }
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
    .command('view')
    .description('Show one blocker in full, by key or UUID')
    .option('--key <number>', 'the blocker number shown in the app (e.g. 12)')
    .option('--id <uuid>', 'the blocker UUID')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        if (!opts.key && !opts.id) {
          throw new Error('Give either --key <number> or --id <uuid>.');
        }
        if (opts.key && opts.id) {
          throw new Error('Give only one of --key or --id.');
        }
        const blocker = await client.getBlocker(opts.key ?? opts.id);
        if (opts.json) return printJson(blocker);
        printBlockerDetail(blocker);
      }),
    );

  blockers
    .command('create')
    .description('File a blocker')
    .requiredOption(
      '--type <type>',
      `blocker type (${BLOCKER_TYPES.join(' | ')})`,
    )
    .requiredOption('--title <title>', 'short, neutral, scannable title')
    .requiredOption('--description <text>', 'the details of the problem')
    .option('--affected-user <uuid>', 'user the blocker affects (default: you)')
    .option('--affected-user-team <uuid>', "that user's team")
    .option('--affected-team <uuid>', 'team the blocker affects')
    .option('--blocked-by-user <uuid>', 'user who is blocking')
    .option('--blocked-by-user-team <uuid>', "that user's team")
    .option('--blocked-by-team <uuid>', 'team that is blocking')
    .option('--blocked-by-text <text>', "free text when no user or team matches")
    .option('--owner-user <uuid>', 'user accountable for clearing it')
    .option('--owner-user-team <uuid>', "that user's team")
    .option('--owner-team <uuid>', 'team accountable for clearing it')
    .option('--since <YYYY-MM-DD>', 'blocked-since date (default: today)')
    .addHelpText(
      'after',
      '\nParties:\n' +
        '  Each of affected / blockedBy / owner takes one kind: a user (with an\n' +
        "  optional team of theirs), or a team. Omit a user's team and it is\n" +
        '  filled in when they belong to exactly one. blockedBy also accepts\n' +
        '  --blocked-by-text when nothing in the workspace matches.\n\n' +
        '  blockedBy is required for WAITING_ON_SOMEONE and NEED_DECISION, and\n' +
        '  rejected for STUCK_ON_PROBLEM and OTHER.\n\n' +
        '  Omit every --affected-* flag and the blocker affects you. Leave owner\n' +
        "  unset unless one was named: an unowned blocker routes to the affected\n" +
        "  team's responder.\n\n" +
        '  Resolve UUIDs with `destato me`, `destato users`, `destato teams`.\n',
    )
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
          description: opts.description,
          affected: party('affected', opts.affectedUser, opts.affectedUserTeam, opts.affectedTeam),
          blockedBy: party(
            'blocked-by',
            opts.blockedByUser,
            opts.blockedByUserTeam,
            opts.blockedByTeam,
            opts.blockedByText,
          ),
          owner: party('owner', opts.ownerUser, opts.ownerUserTeam, opts.ownerTeam),
          blockedSince: opts.since,
        });
        if (opts.json) return printJson(created);
        process.stdout.write(`Created blocker #${created.key}: ${created.title}\n`);
      }),
    );
}

// Builds one party from its flags, deriving `kind` from which was given. Only
// checks what is knowable without a round-trip: that the kinds aren't mixed and
// that a user's team isn't orphaned. Team membership, the type<->blockedBy
// coupling, and every other rule belong to the API — the CLI holds no business
// logic, so those surface as its 400s.
// Overloads: without a text flag the result can only be a user or a team, which
// is what affected and owner accept.
function party(
  name: string,
  userId?: string,
  userTeamId?: string,
  teamId?: string,
): AffectedParty | undefined;
function party(
  name: string,
  userId?: string,
  userTeamId?: string,
  teamId?: string,
  text?: string,
): BlockedByParty | undefined;
function party(
  name: string,
  userId?: string,
  userTeamId?: string,
  teamId?: string,
  text?: string,
): BlockedByParty | undefined {
  const kinds = [
    userId && 'user',
    teamId && 'team',
    text && 'text',
  ].filter(Boolean) as string[];

  if (kinds.length > 1) {
    throw new Error(
      `Give only one --${name}-* kind; got ${kinds.map((k) => `--${name}-${k}`).join(' and ')}.`,
    );
  }
  if (userTeamId && !userId) {
    throw new Error(`--${name}-user-team needs --${name}-user.`);
  }

  if (userId) return { kind: 'user', userId, ...(userTeamId && { teamId: userTeamId }) };
  if (teamId) return { kind: 'team', teamId };
  if (text) return { kind: 'text', text };
  return undefined;
}
