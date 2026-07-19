# destato-cli

Command-line client for the [Destato](https://destato.com) API. Report and read
blockers from your terminal or a script.

## Usage

No install required — run it with `npx`:

```bash
DESTATO_API_TOKEN=dst_pat_... npx destato-cli blockers list
```

Or install it globally and use the `destato` command:

```bash
npm install -g destato-cli
export DESTATO_API_TOKEN=dst_pat_...
destato blockers list
```

## Authentication

Create a **Personal Access Token** in Destato under **Integrations → API tokens**,
then set it in your environment:

```bash
export DESTATO_API_TOKEN=dst_pat_...
```

A token acts as you within a single workspace. Keep it secret; anyone with it can
act as you.

## Commands

```bash
# List the open blockers you're involved in (triage + affecting + blocking)
destato blockers list
destato blockers list --teams              # across all your teams
destato blockers list --team <team-uuid>   # one team

# File a blocker (affects you and the given team, which you must belong to)
destato blockers create \
  --type STUCK_ON_PROBLEM \
  --title "CI is red on main" \
  --team <team-uuid> \
  [--description "..."] [--since 2026-07-19]

# Workspace directory (use these to find team/user UUIDs)
destato users list
destato teams list
```

Blocker types: `WAITING_ON_SOMEONE`, `STUCK_ON_PROBLEM`, `NEED_DECISION`, `OTHER`.

In `blockers list`, the `FLAGS` column is `F`lagged / `S`noozed / `A`ging /
`D`elayed (`·` when off).

## Options

| Flag | Description |
|---|---|
| `--json` | Output raw JSON instead of a table (good for scripts) |
| `--url <url>` | Override the API base URL (also `DESTATO_API_URL`; default `https://api.destato.com`) |
| `-v, --version` | Print the version |
| `-h, --help` | Help for any command |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DESTATO_API_TOKEN` | yes | Your Personal Access Token |
| `DESTATO_API_URL` | no | API base URL (defaults to production) |

Exit code is non-zero on any error (missing token, API error, etc.).

## Development

```bash
npm install
npm run build        # tsc -> dist/
node dist/index.js --help
```

Publishing is documented in [PUBLISHING.md](./PUBLISHING.md).
