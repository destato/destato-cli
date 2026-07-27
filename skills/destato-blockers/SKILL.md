---
name: destato-blockers
description: Read and file Destato blockers from the command line via destato-cli. Use when the user asks what's blocking them or the team, wants their blockers listed or summarized, asks about a specific blocker, or wants to file/report a new blocker.
---

# Destato blockers

Read and file blockers through `destato-cli`, a thin client for the Destato
Public API (`/v1`).

## Setup check

The CLI needs `DESTATO_API_TOKEN` (a Personal Access Token, created in Destato
under **Integrations → API tokens**). If a command fails with a 401 or a missing
token error, tell the user to export it — do not try to find or invent a token:

```bash
export DESTATO_API_TOKEN=dst_pat_...
```

`DESTATO_API_URL` overrides the base URL (defaults to production). Only set it
if the user is pointing at a local or staging API.

Invoke the CLI as `destato` if it's on PATH, otherwise `npx destato-cli`.

## Listing blockers

Always pass `--json` — you are parsing the output, not showing a table to a
human. Summarize in prose afterwards.

```bash
destato blockers list --json          # open blockers you're involved in
destato blockers list --teams --json  # across all your teams
destato blockers list --team <team-uuid> --json
```

Default scope (no flags) is the user's own involvement: blockers they triage,
that affect them, or that they're blocking. Use `--teams` when the user asks
about "the team" or "everyone" rather than themselves.

Each blocker in the JSON array:

| Field | Meaning |
|---|---|
| `key` | Human-facing number — refer to blockers as `#12`, not by `id` |
| `id` | UUID, only needed for API calls |
| `type` | `WAITING_ON_SOMEONE` \| `STUCK_ON_PROBLEM` \| `NEED_DECISION` \| `OTHER` |
| `status` | Workflow status |
| `relationships` | Why this blocker is in *your* list (triage / affecting / blocking) |
| `affectedTeam` / `affectedUser` | Who is blocked |
| `blockedByUser` / `blockedByTeam` | Who is blocking, when it resolved to a real user or team |
| `blockedByText` | Free text, when it didn't resolve to either |
| `ownerUser` / `ownerTeam` | Who owns it; **both null means unowned** — it's sitting in the affected team's triage queue |
| `blockedSince` | When it started — use for "how long has this been stuck" |
| `flagged`, `snoozedUntil`, `aging`, `delayed` | Attention signals |

Lists carry every party, so you can answer "who is this waiting on?" and "who
owns it?" straight from a list. The **description** is the one field a list
holds back — for that, use `blockers view`.

When summarizing, lead with `flagged` and `aging`/`delayed` items — those are
the ones needing action. Mention `snoozedUntil` items only if the user asks for
everything.

## Getting one blocker

**Use `blockers view` — do not filter a list.**

```bash
destato blockers view --key 12 --json
destato blockers view --id <uuid> --json
```

It accepts either flag, not both. Two reasons to reach for it over a list:

- It returns the **`description`**, the one field lists hold back — so any
  question about *what the problem actually is* needs `view`.
- It returns **resolved** blockers, which never appear in any list. A blocker
  missing from `blockers list` may still be viewable.

If a lookup 404s, say so rather than guessing — the key may not exist, or the
blocker may be in a workspace the token can't see.

Every single-blocker command takes the same two flags: `--key <number>` or
`--id <uuid>` (`--uuid` is an accepted alias for `--id`).

## A blocker's history

```bash
destato blockers history --key 12 --json
```

The activity timeline, oldest first: creation, status changes, field edits,
flags, snoozes, aging crossings, and notes. Use it for "what's happened on
this?", "has anyone chased it?", or "why was this reopened?".

| Field | Meaning |
|---|---|
| `eventType` | `CREATED` \| `STATUS_CHANGE` \| `UPDATED` \| `FLAGGED` \| `NOTE` \| `SNOOZED` \| `AGED` |
| `status` | Set on `CREATED` and `STATUS_CHANGE` only |
| `note` | The note text, on `NOTE` events and on status changes that carried a reason |
| `changedBy` | **Null means the system did it** — an aging crossing, or a snooze the cron expired |
| `changes` | Shape depends on `eventType`: field diffs for `UPDATED`, `{isFlagged}`, `{snoozedUntil}`, `{level, hours}` |

An empty array is legitimate — older blockers may have no recorded events.

## Editing a blocker

```bash
destato blockers update --key 12 --title "..." --description "..."
destato blockers update --key 12 --affected-team <uuid>
destato blockers update --key 12 --owner-user <uuid>
destato blockers update --key 12 --clear-owner
```

Only the fields you pass change. Every party flag from `create` works here,
plus `--clear-blocked-by` and `--clear-owner` to remove a party. All the create
rules still apply — a named user's team must be one of theirs, `blockedSince`
can't be in the future, and so on.

**Read this before changing `--type`.** `blockedBy` is required for
`WAITING_ON_SOMEONE` and `NEED_DECISION` and rejected for `STUCK_ON_PROBLEM`
and `OTHER` — and on an edit that rule is checked against the blocker **as it
will be after your change**, not against what you sent. So a lone `--type` flag
usually fails:

| Changing type to | You must also pass |
|---|---|
| `WAITING_ON_SOMEONE` or `NEED_DECISION`, and it has no blocked-by | a `--blocked-by-*` flag, in the same command |
| `STUCK_ON_PROBLEM` or `OTHER`, and it has one | `--clear-blocked-by`, in the same command |

Check the blocker's current `blockedByUser`/`blockedByTeam`/`blockedByText`
first — a list or `view` already tells you — and send both changes together.
Doing it in two commands fails on the first one. Don't discover this by making
a failed call.

Two more things `update` will not do: **a resolved blocker can't be edited**
(reopen it first), and **who reported a blocker never changes** — there is no
reporter field.

## Changing a blocker's status

```bash
destato blockers resolve --key 12 --note "The vendor shipped the fix."
destato blockers reopen  --key 12 --note "It came back."
destato blockers add-note --key 12 --note "Chased the vendor, no reply yet."
```

`--note` is **optional** on `resolve` and `reopen`, **required** on `add-note`.

These are user-visible and notify teammates. **Confirm with the user before
running any of them** unless they've explicitly asked for that exact action on
that exact blocker.

Rules worth knowing before you call:

- Resolving an already-resolved blocker is a **400**, as is reopening an open
  one. Check `status` first — via `view` or a list — rather than calling and
  handling the error.
- **Pass the user's reason as `--note` whenever they gave one.** "Resolve 12,
  the vendor fixed it" means `--note "The vendor shipped the fix."` — the
  reason belongs on the timeline, not lost in your reply. Quote them closely;
  don't editorialize.
- Use `add-note` when the status isn't changing. Don't resolve something just
  to attach a comment.

## Finding UUIDs

Every party flag takes a UUID, never a name. Resolve them first:

```bash
destato me --json      # who this token is, and which teams they're on
destato users --json
destato teams --json
```

`destato me` is how you learn the user's own id and teams — the directory
carries no email and no "this is you" marker, so there is no other way. If a
name matches more than one team or person, ask which one instead of picking.

## Filing a blocker

Creating a blocker is user-visible work that notifies teammates in Slack.
**Confirm the title, type, and affected party with the user before running it**
unless they've already given all three explicitly.

```bash
destato blockers create \
  --type STUCK_ON_PROBLEM \
  --title "CI is red on main" \
  --description "Every build since yesterday's merge fails on the lint step." \
  [--affected-team <uuid>] [--since 2026-07-19]
```

### Choosing the type, and what it forces

| Type | `blockedBy` |
|---|---|
| `WAITING_ON_SOMEONE` | **required** |
| `NEED_DECISION` | **required** |
| `STUCK_ON_PROBLEM` | **rejected** — do not pass one |
| `OTHER` | **rejected** — do not pass one |

This is enforced by the API, not the CLI: get it wrong and you get a 400.

### The three parties

`affected`, `blockedBy`, and `owner` each name one party. Give **one kind** per
party — mixing flags for the same party is a local error before any request.

```bash
# a user (their team is optional; the API fills in their sole team)
--affected-user <uuid> [--affected-user-team <uuid>]
# a whole team
--affected-team <uuid>
# blockedBy only: nothing in the workspace matches
--blocked-by-text "Legal team"
```

The same pattern applies to `--blocked-by-*` and `--owner-*`.

**Always try to resolve a name to a real user or team first.** `--blocked-by-text`
is the fallback for anything that *can't* be structured — not a shortcut for
skipping the lookup. If the user says "we're waiting on the Legal team", check
`destato teams --json` for a Legal team and use `--blocked-by-team` if one
exists. Only when nothing reasonable matches does it become
`--blocked-by-text "Legal team"`. This applies just as much to internal groups
that simply have no Destato team as it does to vendors or external tickets — the
test is whether it resolves, not whether it's inside the company.

### Judgment rules — these matter

**Affected: default to the user.** Omit every `--affected-*` flag and the
blocker affects the invoking user, with their team filled in automatically.
Only name someone else when the user is unambiguously and explicitly reporting
on another person's or team's behalf. When in any doubt, leave it off.

**Owner: almost always leave it unset.** An unowned blocker automatically lands
in the affected team's triage queue and routes to that team's Responder — that
is the normal, desired path. Only pass `--owner-*` when the user has clearly
stated who should own it. Setting an owner when they didn't ask takes the
blocker *out* of triage and quietly makes someone accountable.

**Title: short, neutral, scannable.** A clear statement of the general problem,
optimized to be understood at a glance in a long list. Not a sentence of
narrative, not a plea, not the whole story. Aim for well under 100 characters.

**Description: the user's own words.** Pass their description close to
verbatim — fix spelling, punctuation, grammar, and formatting, and nothing
else. Do not summarize it, do not embellish it, do not add analysis. This field
is required.

**blockedSince: only set it when they say so.** It defaults to today. If the
user says something like "this has been blocking me for three days," compute
the date three days back and pass `--since YYYY-MM-DD`. It can be any past
date; a future date is rejected.

**blockedBy text: keep it short.** Under ~50 characters — a name, a vendor, a
ticket reference. Not a sentence.

Report back the `#key` from the output.

## Notes

- Non-zero exit means the command failed; surface the CLI's error message
  rather than retrying blindly.
- The CLI holds no business logic — if something can't be expressed as a flag
  above, it isn't supported. Don't call the API directly with `curl` to work
  around a gap; tell the user the CLI doesn't cover it.
