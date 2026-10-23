import { describe, expect, it, vi } from 'vitest';
import type { RateLimitNotice } from '../../src/api/client';
import { AuthError, GraphQLClient, GraphQLError, RateLimitError } from '../../src/api/client';

type Reply = { status?: number; headers?: Record<string, string>; body: unknown };

function setup(replies: Reply[], opts: { now?: number } = {}) {
  const calls: { auth: string; body: unknown }[] = [];
  const notices: RateLimitNotice[] = [];
  const sleeps: number[] = [];
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ auth: headers.get('authorization') ?? '', body: JSON.parse(String(init?.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  });
  const tokens: boolean[] = [];
  const client = new GraphQLClient({
    tokenProvider: async ({ write }) => {
      tokens.push(write);
      return write ? 'WRITE' : 'READ';
    },
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    now: () => opts.now ?? 1_000_000,
    onRateLimit: (n) => notices.push(n),
  });
  return { client, calls, notices, sleeps, tokens };
}

describe('GraphQLClient', () => {
  it('sends the query with a bearer token and returns data', async () => {
    const { client, calls, tokens } = setup([{ body: { data: { viewer: { login: 'me' } } } }]);
    await expect(client.request('query { viewer { login } }', { a: 1 })).resolves.toEqual({ viewer: { login: 'me' } });
    expect(calls[0]).toEqual({ auth: 'bearer READ', body: { query: 'query { viewer { login } }', variables: { a: 1 } } });
    expect(tokens).toEqual([false]);
  });

  it('uses the write token for writes', async () => {
    const { client, calls } = setup([{ body: { data: { ok: true } } }]);
    await client.request('mutation { x }', {}, { write: true });
    expect(calls[0]?.auth).toBe('bearer WRITE');
  });

  it('retries a secondary rate limit after retry-after and reports it', async () => {
    const { client, notices, sleeps } = setup([
      { status: 403, headers: { 'retry-after': '3' }, body: { message: 'You have exceeded a secondary rate limit' } },
      { body: { data: { ok: 1 } } },
    ]);
    await expect(client.request('q')).resolves.toEqual({ ok: 1 });
    expect(sleeps).toEqual([3000]);
    expect(notices).toEqual([{ waitMs: 3000, attempt: 1, reason: 'secondary' }]);
  });

  it('waits until x-ratelimit-reset on a primary limit', async () => {
    const now = 1_700_000_000_000;
    const { client, sleeps } = setup(
      [
        { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 10) }, body: { message: 'API rate limit exceeded' } },
        { body: { data: { ok: 1 } } },
      ],
      { now },
    );
    await client.request('q');
    expect(sleeps).toEqual([11_000]);
  });

  it('treats GraphQL RATE_LIMITED errors as rate limits with exponential backoff', async () => {
    const { client, sleeps, notices } = setup([
      { body: { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] } },
      { body: { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] } },
      { body: { data: { ok: 1 } } },
    ]);
    await client.request('q');
    expect(sleeps).toEqual([1500, 3000]);
    expect(notices.map((n) => n.reason)).toEqual(['primary', 'primary']);
  });

  it('retries transient 502s', async () => {
    const { client, notices } = setup([{ status: 502, body: {} }, { body: { data: { ok: 1 } } }]);
    await client.request('q');
    expect(notices[0]?.reason).toBe('transient');
  });

  it('gives up with RateLimitError when the wait is too long', async () => {
    const now = 1_700_000_000_000;
    const { client, sleeps } = setup(
      [{ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 3600) }, body: {} }],
      { now },
    );
    const err = await client.request('q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).resetAt).toBe(now + 3600_000);
    expect(sleeps).toEqual([]);
  });

  it('gives up after maxRetries', async () => {
    const replies = Array.from({ length: 5 }, () => ({ status: 429, body: {} }));
    const { client, sleeps } = setup(replies);
    await expect(client.request('q')).rejects.toBeInstanceOf(RateLimitError);
    expect(sleeps).toHaveLength(4);
  });

  it('maps 401 to AuthError and GraphQL errors to GraphQLError', async () => {
    const a = setup([{ status: 401, body: { message: 'Bad credentials' } }]);
    await expect(a.client.request('q')).rejects.toBeInstanceOf(AuthError);

    const b = setup([{ body: { data: null, errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'needs read:project' }] } }]);
    const err = await b.client.request('q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect((err as GraphQLError).types).toEqual(['INSUFFICIENT_SCOPES']);
  });

  it('keeps partial data when some paths fail', async () => {
    const { client } = setup([{ body: { data: { a: 1 }, errors: [{ type: 'FORBIDDEN', message: 'org hides it' }] } }]);
    await expect(client.request('q')).resolves.toEqual({ a: 1 });
  });

  it('fails a mutation that returns errors next to a null payload', async () => {
    const reply = {
      body: {
        data: { updateProjectV2ItemFieldValue: null },
        errors: [{ type: 'VALIDATION', message: 'The single select option Id does not belong to the field' }],
      },
    };
    const w = setup([reply]);
    await expect(w.client.request('mutation', {}, { write: true })).rejects.toBeInstanceOf(GraphQLError);
    const r = setup([reply]);
    await expect(r.client.request('query')).rejects.toBeInstanceOf(GraphQLError);
  });
});
