// Minimal GitHub GraphQL client: auth through a token provider, rate-limit aware retries.
// It never logs headers or tokens.

export type TokenProvider = (opts: { write: boolean }) => Promise<string>;

export interface RateLimitNotice {
  /** How long the client waits before retrying. */
  waitMs: number;
  /** 1-based retry number. */
  attempt: number;
  reason: 'primary' | 'secondary' | 'transient';
}

export interface GraphQLClientOptions {
  tokenProvider: TokenProvider;
  endpoint?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  /** Longest single wait we accept; beyond it we fail with RateLimitError instead of hanging. */
  maxWaitMs?: number;
  baseDelayMs?: number;
  onRateLimit?: (notice: RateLimitNotice) => void;
  onWarning?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface GraphQLErrorEntry {
  message: string;
  type?: string;
  path?: (string | number)[];
}

export class GraphQLError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLErrorEntry[],
  ) {
    super(message);
    this.name = 'GraphQLError';
  }

  get types(): string[] {
    return this.errors.map((e) => e.type ?? '').filter(Boolean);
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class AuthError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    /** Epoch ms when the limit resets, when GitHub tells us. */
    readonly resetAt?: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface GraphQLBody<T> {
  data?: T | null;
  errors?: GraphQLErrorEntry[];
}

type Classified =
  | { kind: 'ok' }
  | { kind: 'retry'; reason: RateLimitNotice['reason']; waitMs?: number; resetAt?: number };

const DEFAULT_ENDPOINT = 'https://api.github.com/graphql';

export class GraphQLClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly maxWaitMs: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: GraphQLClientOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.maxRetries = options.maxRetries ?? 4;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}, opts: { write?: boolean } = {}): Promise<T> {
    const write = opts.write ?? false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.options.tokenProvider({ write });
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'vscode-gh-projects',
        },
        body: JSON.stringify({ query, variables }),
      });

      let body: GraphQLBody<T> | undefined;
      try {
        body = (await res.json()) as GraphQLBody<T>;
      } catch {
        body = undefined;
      }

      const verdict = this.classify(res, body);
      if (verdict.kind === 'retry') {
        const waitMs = verdict.waitMs ?? this.backoff(attempt);
        if (attempt >= this.maxRetries || waitMs > this.maxWaitMs) {
          throw new RateLimitError(
            verdict.reason === 'transient'
              ? `GitHub is not responding (HTTP ${res.status}).`
              : 'GitHub API rate limit exceeded.',
            verdict.resetAt,
          );
        }
        this.options.onRateLimit?.({ waitMs, attempt: attempt + 1, reason: verdict.reason });
        await this.sleep(waitMs);
        continue;
      }

      if (res.status === 401) throw new AuthError('GitHub rejected the credentials (401). Sign in again.');
      if (!res.ok) {
        const message = body?.errors?.[0]?.message ?? (body as { message?: string } | undefined)?.message;
        throw new HttpError(res.status, message ?? `GitHub API request failed (HTTP ${res.status}).`);
      }
      if (!body) throw new HttpError(res.status, 'GitHub API returned an invalid response.');

      if (body.errors?.length) {
        // A write with any error failed (GitHub answers `{ data: { mutation: null }, errors }`);
        // a read failed when nothing usable came back.
        const data = body.data as Record<string, unknown> | null | undefined;
        const nothing = !data || Object.values(data).every((v) => v === null);
        if (write || nothing) {
          throw new GraphQLError(body.errors.map((e) => e.message).join('; '), body.errors);
        }
        // Partial data (e.g. an org that hides its projects): keep the data, report the rest.
        this.options.onWarning?.(body.errors.map((e) => e.message).join('; '));
      }
      if (body.data === null || body.data === undefined) {
        throw new GraphQLError('GitHub API returned no data.', []);
      }
      return body.data;
    }
  }

  private classify(res: Response, body: GraphQLBody<unknown> | undefined): Classified {
    const retryAfter = numberHeader(res, 'retry-after');
    const remaining = numberHeader(res, 'x-ratelimit-remaining');
    const reset = numberHeader(res, 'x-ratelimit-reset');
    const resetAt = reset !== undefined ? reset * 1000 : undefined;
    const untilReset = resetAt !== undefined ? Math.max(0, resetAt - this.now()) + 1_000 : undefined;
    const rateLimitedType = body?.errors?.some((e) => e.type === 'RATE_LIMITED') ?? false;
    const message = (body?.errors?.[0]?.message ?? (body as { message?: string } | undefined)?.message ?? '').toLowerCase();

    if (res.status === 403 || res.status === 429 || rateLimitedType) {
      if (retryAfter !== undefined) return { kind: 'retry', reason: 'secondary', waitMs: retryAfter * 1000, resetAt };
      if (remaining === 0 || rateLimitedType) return { kind: 'retry', reason: 'primary', waitMs: untilReset, resetAt };
      if (message.includes('secondary rate limit') || message.includes('abuse')) {
        return { kind: 'retry', reason: 'secondary' };
      }
      if (res.status === 429) return { kind: 'retry', reason: 'secondary' };
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) return { kind: 'retry', reason: 'transient' };
    return { kind: 'ok' };
  }

  /** Exponential backoff with full jitter on top of the base. */
  private backoff(attempt: number): number {
    const exp = this.baseDelayMs * 2 ** attempt;
    return Math.round(exp + this.random() * exp);
  }
}

function numberHeader(res: Response, name: string): number | undefined {
  const raw = res.headers.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
