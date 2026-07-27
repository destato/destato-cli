import { Config } from './config';

// Thrown for any non-2xx API response; carries the status so the top-level
// handler can render a helpful message (e.g. a hint on 401).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // The parsed response body, when it was JSON. Kept so --json can emit the
    // API's own error shape (including Zod's `errors` list) rather than prose.
    readonly body?: unknown,
  ) {
    super(message);
  }
}

// Minimal typed view of the /v1 responses the CLI renders. Kept loose on purpose
// - the CLI mirrors the API's published shape without re-deriving all of it.
export interface Blocker {
  id: string;
  key: number;
  type: string;
  title: string;
  status: string;
  affectedTeam: { id: string; name: string } | null;
  affectedUser: { id: string; name: string } | null;
  blockedByUser: { id: string; name: string } | null;
  blockedByTeam: { id: string; name: string } | null;
  blockedByText: string | null;
  ownerUser: { id: string; name: string } | null;
  ownerTeam: { id: string; name: string } | null;
  createdAt: string;
  blockedSince: string | null;
  relationships: string[];
  flagged: boolean;
  snoozedUntil: string | null;
  aging: boolean;
  delayed: boolean;
}

// One blocker in full: the list shape plus the description, the one field a
// list holds back.
export interface BlockerDetail extends Blocker {
  description: string | null;
}

// One entry in a blocker's activity timeline. `changes` varies by eventType,
// so it stays untyped here exactly as it does in the published contract.
export interface StatusEvent {
  id: string;
  eventType:
    | 'CREATED'
    | 'STATUS_CHANGE'
    | 'UPDATED'
    | 'FLAGGED'
    | 'NOTE'
    | 'SNOOZED'
    | 'AGED';
  status: string | null;
  changes: Record<string, unknown> | null;
  note: string | null;
  // Null for a system-authored event (an aging crossing, an expired snooze).
  changedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  teams: { id: string; name: string }[];
}

export interface DirectoryTeam {
  id: string;
  key: number;
  name: string;
  isMember: boolean;
  responder: { id: string; name: string } | null;
}

// The three party unions the create endpoint takes. `kind` is explicit on the
// wire so exactly one variant is expressible; the CLI derives it from which
// flags were given. `text` is only ever valid for blockedBy.
export type UserParty = { kind: 'user'; userId: string; teamId?: string };
export type TeamParty = { kind: 'team'; teamId: string };
export type TextParty = { kind: 'text'; text: string };

export type AffectedParty = UserParty | TeamParty;
export type OwnerParty = UserParty | TeamParty;
export type BlockedByParty = UserParty | TeamParty | TextParty;

export interface CreateBlockerInput {
  type: string;
  title: string;
  description: string;
  // Omitted means the token's own user, with their sole team filled in.
  affected?: AffectedParty;
  // Required for WAITING_ON_SOMEONE and NEED_DECISION, rejected for the rest.
  blockedBy?: BlockedByParty;
  owner?: OwnerParty;
  blockedSince?: string;
}

// Every field optional — send only what changes. Explicit null on blockedBy or
// owner clears it. No reporter: who filed a blocker is fixed at creation.
export interface UpdateBlockerInput {
  type?: string;
  title?: string;
  description?: string;
  affected?: AffectedParty;
  blockedBy?: BlockedByParty | null;
  owner?: OwnerParty | null;
  blockedSince?: string;
}

export class DestatoClient {
  constructor(private readonly config: Config) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(
        0,
        `Could not reach ${this.config.baseUrl} (${(err as Error).message})`,
      );
    }

    if (!res.ok) {
      const { message, body } = await extractError(res);
      throw new ApiError(res.status, message, body);
    }
    // 204 No Content and other empty bodies.
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listMyBlockers(): Promise<Blocker[]> {
    return this.request('GET', '/v1/blockers');
  }

  listMyTeamsBlockers(): Promise<Blocker[]> {
    return this.request('GET', '/v1/blockers?scope=teams');
  }

  listTeamBlockers(teamId: string): Promise<Blocker[]> {
    return this.request('GET', `/v1/teams/${encodeURIComponent(teamId)}/blockers`);
  }

  // Takes a UUID or a #key; the API tells them apart by shape.
  getBlocker(idOrKey: string): Promise<BlockerDetail> {
    return this.request('GET', `/v1/blockers/${encodeURIComponent(idOrKey)}`);
  }

  updateBlocker(
    idOrKey: string,
    input: UpdateBlockerInput,
  ): Promise<BlockerDetail> {
    return this.request(
      'PATCH',
      `/v1/blockers/${encodeURIComponent(idOrKey)}`,
      input,
    );
  }

  getBlockerHistory(idOrKey: string): Promise<StatusEvent[]> {
    return this.request(
      'GET',
      `/v1/blockers/${encodeURIComponent(idOrKey)}/history`,
    );
  }

  resolveBlocker(idOrKey: string, note?: string): Promise<BlockerDetail> {
    return this.request(
      'POST',
      `/v1/blockers/${encodeURIComponent(idOrKey)}/resolve`,
      note ? { note } : {},
    );
  }

  reopenBlocker(idOrKey: string, note?: string): Promise<BlockerDetail> {
    return this.request(
      'POST',
      `/v1/blockers/${encodeURIComponent(idOrKey)}/reopen`,
      note ? { note } : {},
    );
  }

  addBlockerNote(idOrKey: string, note: string): Promise<BlockerDetail> {
    return this.request(
      'POST',
      `/v1/blockers/${encodeURIComponent(idOrKey)}/notes`,
      { note },
    );
  }

  createBlocker(input: CreateBlockerInput): Promise<BlockerDetail> {
    return this.request('POST', '/v1/blockers', input);
  }

  getMe(): Promise<DirectoryUser> {
    return this.request('GET', '/v1/me');
  }

  listUsers(): Promise<DirectoryUser[]> {
    return this.request('GET', '/v1/users');
  }

  listTeams(): Promise<DirectoryTeam[]> {
    return this.request('GET', '/v1/teams');
  }
}

// Pulls the most useful message out of an error response. Nest's default shape
// is `{ message }` (string or array). A /v1 body that fails Zod validation adds
// `errors` — the issue list — while `message` is only ever the useless constant
// "Validation failed", so the issues have to be rendered or the caller is told
// nothing about what was actually wrong.
async function extractError(
  res: Response,
): Promise<{ message: string; body?: unknown }> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const issues = formatZodIssues(json.errors);
    const message = json.message ?? json.error;
    const base = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : `HTTP ${res.status}`;
    return { message: issues ? `${base}\n${issues}` : base, body: json };
  } catch {
    // not JSON
  }
  return { message: text || `HTTP ${res.status}` };
}

// Renders Zod issues as one indented `field: message` line each. `path` is an
// array of keys; an empty one means the issue is about the body as a whole.
function formatZodIssues(errors: unknown): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  return errors
    .map((issue) => {
      const path = Array.isArray(issue?.path) ? issue.path.join('.') : '';
      const detail = issue?.message ?? 'invalid';
      return `  - ${path ? `${path}: ` : ''}${detail}`;
    })
    .join('\n');
}
