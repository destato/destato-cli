# destato-cli

Command-line client for the [Destato](https://destato.com) API. Report and read
blockers from your terminal or a script.

## Usage

No install required — run it with `npx`:

```bash
DESTATO_API_TOKEN=dst_pat_... npx destato-cli blockers list
```

Or install it globally:

```bash
npm install -g destato-cli
export DESTATO_API_TOKEN=dst_pat_...
destato blockers list
```

The installed command is **`destato`** (with `destato-cli` as an alias, so either
works).

## Install from the git repo (no npm publish needed)

The package builds itself on install (via the `prepare` script), so you can
install it straight from the repo before it's ever published to npm:

```bash
# From a pushed GitHub repo:
npm install -g github:destato/destato-cli
npx github:destato/destato-cli blockers list

# From a local clone (run from anywhere):
npm install -g /path/to/destato-cli

# While developing, from inside the repo — symlinks the `destato` command:
npm link
```

Any of these give you the `destato` command globally; `npm uninstall -g
destato-cli` (or `npm unlink`) removes it.

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

# Show one blocker in full, including the description that lists omit.
# Also finds resolved blockers, which lists don't.
destato blockers view --key 12
destato blockers view --id <uuid>

# File a blocker (affects you by default)
destato blockers create \
  --type STUCK_ON_PROBLEM \
  --title "CI is red on main" \
  --description "Every build since yesterday's merge fails on the lint step." \
  [--since 2026-07-19]

# Workspace directory (use these to find team/user UUIDs)
destato me
destato users
destato teams
```

Blocker types: `WAITING_ON_SOMEONE`, `STUCK_ON_PROBLEM`, `NEED_DECISION`, `OTHER`.

`--type`, `--title`, and `--description` are always required.

### Who the blocker involves

A blocker has up to three parties — who is **affected**, what is **blocking**
them, and who **owns** it. Each takes one kind: a user (optionally qualified by
one of *their own* teams), or a team. Omit a user's team and it's filled in
automatically when they belong to exactly one.

| Party | Flags |
|---|---|
| Affected | `--affected-user <uuid>` `--affected-user-team <uuid>` · `--affected-team <uuid>` |
| Blocked by | `--blocked-by-user <uuid>` `--blocked-by-user-team <uuid>` · `--blocked-by-team <uuid>` · `--blocked-by-text "..."` |
| Owner | `--owner-user <uuid>` `--owner-user-team <uuid>` · `--owner-team <uuid>` |

Omit every `--affected-*` flag and the blocker affects you. Leave the owner
unset unless someone was explicitly named — an unowned blocker goes to the
affected team's responder for triage, which is the normal path.

`--blocked-by-text` is the escape hatch for a blocking party that can't be
matched to a workspace user or team — try `destato users` / `destato teams`
first and fall back to text only when nothing reasonable matches. That includes
real internal groups with no Destato team (`--blocked-by-text "Legal team"`),
not just vendors and external tickets.

**`--blocked-by-*` is required** for `WAITING_ON_SOMEONE` and `NEED_DECISION`,
and **rejected** for `STUCK_ON_PROBLEM` and `OTHER`:

```bash
destato blockers create \
  --type WAITING_ON_SOMEONE \
  --title "Waiting on the schema review" \
  --description "The migration can't land until the review comes back." \
  --blocked-by-user <uuid>
```

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
