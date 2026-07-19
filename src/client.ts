import { Config } from './config';

// Thrown for any non-2xx API response; carries the status so the top-level
// handler can render a helpful message (e.g. a hint on 401).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
  createdAt: string;
  blockedSince: string | null;
  relationships: string[];
  flagged: boolean;
  snoozedUntil: string | null;
  aging: boolean;
  delayed: boolean;
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

export interface CreateBlockerInput {
  type: string;
  title: string;
  affectedTeamId: string;
  description?: string;
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
      throw new ApiError(res.status, await extractError(res));
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

  createBlocker(input: CreateBlockerInput): Promise<Blocker> {
    return this.request('POST', '/v1/blockers', input);
  }

  listUsers(): Promise<DirectoryUser[]> {
    return this.request('GET', '/v1/users');
  }

  listTeams(): Promise<DirectoryTeam[]> {
    return this.request('GET', '/v1/teams');
  }
}

// Pulls the most useful message out of an error response: Nest's JSON
// `{ message }` (string or array) when present, else the raw text/status.
async function extractError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const message = json.message ?? json.error;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  } catch {
    // not JSON
  }
  return text || `HTTP ${res.status}`;
}
