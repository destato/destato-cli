import { Command } from 'commander';
import { printJson, printTable } from '../output';
import { run } from './shared';

export function registerDirectory(program: Command): void {
  program
    .command('users')
    .description('List the users in your workspace')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const users = await client.listUsers();
        if (opts.json) return printJson(users);
        printTable(users, [
          { header: 'NAME', value: (u) => u.name },
          { header: 'ROLE', value: (u) => u.role },
          {
            header: 'TEAMS',
            value: (u) => u.teams.map((t) => t.name).join(', ') || '-',
          },
          { header: 'ID', value: (u) => u.id },
        ]);
      }),
    );

  program
    .command('teams')
    .description('List the teams in your workspace')
    .action((_opts, command: Command) =>
      run(command, async (client, opts) => {
        const teams = await client.listTeams();
        if (opts.json) return printJson(teams);
        printTable(teams, [
          { header: 'KEY', value: (t) => `#${t.key}` },
          { header: 'NAME', value: (t) => t.name },
          { header: 'MEMBER', value: (t) => (t.isMember ? 'yes' : 'no') },
          { header: 'RESPONDER', value: (t) => t.responder?.name ?? '-' },
          { header: 'ID', value: (t) => t.id },
        ]);
      }),
    );
}
