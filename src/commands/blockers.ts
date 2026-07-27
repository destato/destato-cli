import { Command } from 'commander';
import {
  AffectedParty,
  Blocker,
  BlockedByParty,
  BlockerDetail,
  StatusEvent,
  UpdateBlockerInput,
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

// Every single-blocker command takes --key or --id. --uuid is a documented
// alias for --id: the API's path segment accepts either form, so the only thing
// these flags decide is which value gets sent.
function addressOptions(command: Command): Command {
  return command
    .option('--key <number>', 'the blocker number shown in the app (e.g. 12)')
    .option('--id <uuid>', 'the blocker UUID')
    .option('--uuid <uuid>', 'alias for --id');
}

function address(opts: Record<string, any>): string {
  const id = opts.id ?? opts.uuid;
  if (opts.key && id) {
    throw new Error('Give only one of --key or --id.');
  }
  if (!opts.key && !id) {
    throw new Error('Give either --key <number> or --id <uuid>.');
  }
  return opts.key ?? id;
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Created',
  STATUS_CHANGE: 'Status changed',
  UPDATED: 'Updated',
  FLAGGED: 'Flagged',
  NOTE: 'Note',
  SNOOZED: 'Snoozed',
  AGED: 'Aging',
};

// A one-line summary per event, reading `changes` per eventType the way the
// app's detail view does — its shape differs for each.
function eventSummary(e: StatusEvent): string {
  const c = e.changes ?? {};
  switch (e.eventType) {
    case 'CREATED':
      return 'Created (Open)';
    case 'STATUS_CHANGE':
      return e.status === 'OPEN' ? 'Reopened' : 'Resolved';
    case 'UPDATED': {
      const fields = Object.entries(c as Record<string, any>).map(
        ([field, v]) => `${field}: ${v?.from ?? '-'} -> ${v?.to ?? '-'}`,
      );
      return fields.length ? fields.join('; ') : 'Updated';
    }
    case 'FLAGGED':
      return (c as { isFlagged?: boolean }).isFlagged ? 'Flagged' : 'Unflagged';
    case 'SNOOZED': {
      const until = (c as { snoozedUntil?: string | null }).snoozedUntil;
      if (until) return `Snoozed until ${until}`;
      // A null actor means the expiry cron cleared it, not a person.
      return e.changedBy ? 'Snooze cleared' : 'Snooze expired';
    }
    case 'AGED': {
      const { level, hours } = c as { level?: string; hours?: number };
      const label = level === 'DELAYED' ? 'Delayed' : 'Aging';
      return hours ? `${label} (after ${hours}h)` : label;
    }
    default:
      return EVENT_LABELS[e.eventType] ?? e.eventType;
  }
}

function printHistory(events: StatusEvent[]): void {
  if (events.length === 0) {
    process.stdout.write('No recorded activity.\n');
    return;
  }
  for (const e of events) {
    const when = e.createdAt.replace('T', ' ').slice(0, 16);
    const who = e.changedBy?.name ?? 'system';
    process.stdout.write(`  ${when}  ${who.padEnd(10)}  ${eventSummary(e)}\n`);
    if (e.note) {
      for (const line of e.note.split('\n')) {
        process.stdout.write(`      ${line}\n`);
      }
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

  addressOptions(
    blockers.command('view').description('Show one blocker in full'),
  ).action((_opts, command: Command) =>
    run(command, async (client, opts) => {
      const blocker = await client.getBlocker(address(opts));
      if (opts.json) return printJson(blocker);
      printBlockerDetail(blocker);
    }),
  );

  addressOptions(
    blockers
      .command('history')
      .description("Show a blocker's activity history, oldest first"),
  ).action((_opts, command: Command) =>
    run(command, async (client, opts) => {
      const events = await client.getBlockerHistory(address(opts));
      if (opts.json) return printJson(events);
      printHistory(events);
    }),
  );

  addressOptions(
    blockers.command('update').description('Edit an open blocker'),
  )
    .option('--type <type>', `blocker type (${BLOCKER_TYPES.join(' | ')})`)
    .option('--title <title>', 'new title')
    .option('--description <text>', 'new description')
    .option('--affected-user <uuid>', 'user the blocker affects')
    .option('--affected-user-team <uuid>', "that user's team")
    .option('--affected-team <uuid>', 'team the blocker affects')
    .option('--blocked-by-user <uuid>', 'user who is blocking')
    .option('--blocked-by-user-team <uuid>', "that user's team")
    .option('--blocked-by-team <uuid>', 'team that is blocking')
    .option('--blocked-by-text <text>', 'free text when no user or team matches')
    .option('--clear-blocked-by', 'remove the blocking party')
    .option('--owner-user <uuid>', 'user accountable for clearing it')
    .option('--owner-user-team <uuid>', "that user's team")
    .option('--owner-team <uuid>', 'team accountable for clearing it')
    .option('--clear-owner', 'remove the owner, returning it to triage')
    .option('--since <YYYY-MM-DD>', 'new blocked-since date')
    .addHelpText(
      'after',
      '\nOnly the fields you pass change. Party flags work as they do on\n' +
        'create; --clear-blocked-by and --clear-owner remove a party.\n\n' +
        'Changing --type: blockedBy is required for WAITING_ON_SOMEONE and\n' +
        'NEED_DECISION and rejected for STUCK_ON_PROBLEM and OTHER, and the\n' +
        'rule is checked against the blocker AFTER your change. So switching\n' +
        'to a type that needs one means passing a --blocked-by-* flag in the\n' +
        'same command, and switching to one that forbids it means passing\n' +
        '--clear-blocked-by. Doing it in two steps fails.\n\n' +
        'A resolved blocker cannot be edited, and who reported it never\n' +
        'changes.\n',
    )
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        if (opts.type && !BLOCKER_TYPES.includes(opts.type)) {
          throw new Error(
            `Invalid --type "${opts.type}". Expected one of: ${BLOCKER_TYPES.join(', ')}`,
          );
        }
        const blockedBy = party(
          'blocked-by',
          opts.blockedByUser,
          opts.blockedByUserTeam,
          opts.blockedByTeam,
          opts.blockedByText,
        );
        if (opts.clearBlockedBy && blockedBy) {
          throw new Error(
            'Give either --clear-blocked-by or a --blocked-by-* value, not both.',
          );
        }
        const owner = party(
          'owner',
          opts.ownerUser,
          opts.ownerUserTeam,
          opts.ownerTeam,
        );
        if (opts.clearOwner && owner) {
          throw new Error(
            'Give either --clear-owner or an --owner-* value, not both.',
          );
        }

        // Only keys actually present are sent: undefined means "leave alone",
        // null means "clear", which is the distinction the API relies on.
        const input: UpdateBlockerInput = {
          ...(opts.type && { type: opts.type }),
          ...(opts.title && { title: opts.title }),
          ...(opts.description && { description: opts.description }),
          ...(opts.since && { blockedSince: opts.since }),
          ...(party(
            'affected',
            opts.affectedUser,
            opts.affectedUserTeam,
            opts.affectedTeam,
          ) && {
            affected: party(
              'affected',
              opts.affectedUser,
              opts.affectedUserTeam,
              opts.affectedTeam,
            ),
          }),
          ...(opts.clearBlockedBy
            ? { blockedBy: null }
            : blockedBy && { blockedBy }),
          ...(opts.clearOwner ? { owner: null } : owner && { owner }),
        };

        if (Object.keys(input).length === 0) {
          throw new Error('Give at least one field to change.');
        }

        const blocker = await client.updateBlocker(address(opts), input);
        if (opts.json) return printJson(blocker);
        process.stdout.write(
          `Updated blocker #${blocker.key}: ${blocker.title}\n`,
        );
      }),
    );

  addressOptions(
    blockers.command('resolve').description('Mark a blocker resolved'),
  )
    .option('--note <text>', 'why it was resolved (recorded on the timeline)')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const blocker = await client.resolveBlocker(address(opts), opts.note);
        if (opts.json) return printJson(blocker);
        process.stdout.write(
          `Resolved blocker #${blocker.key}: ${blocker.title}\n`,
        );
      }),
    );

  addressOptions(
    blockers.command('reopen').description('Reopen a resolved blocker'),
  )
    .option('--note <text>', 'why it was reopened (recorded on the timeline)')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const blocker = await client.reopenBlocker(address(opts), opts.note);
        if (opts.json) return printJson(blocker);
        process.stdout.write(
          `Reopened blocker #${blocker.key}: ${blocker.title}\n`,
        );
      }),
    );

  addressOptions(
    blockers
      .command('add-note')
      .description('Add a note without changing the status'),
  )
    .requiredOption('--note <text>', 'the note')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const blocker = await client.addBlockerNote(address(opts), opts.note);
        if (opts.json) return printJson(blocker);
        process.stdout.write(`Added a note to blocker #${blocker.key}\n`);
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
