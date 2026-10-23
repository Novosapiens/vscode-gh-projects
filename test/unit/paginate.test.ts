import { describe, expect, it } from 'vitest';
import { MAX_PAGES, paginate } from '../../src/api/paginate';

describe('paginate', () => {
  it('follows cursors until hasNextPage is false', async () => {
    const pages: Record<string, { nodes: number[]; endCursor: string | null; hasNextPage: boolean }> = {
      start: { nodes: [1, 2], endCursor: 'a', hasNextPage: true },
      a: { nodes: [3], endCursor: 'b', hasNextPage: true },
      b: { nodes: [4], endCursor: null, hasNextPage: false },
    };
    const seen: (string | null)[] = [];
    const all = await paginate(async (cursor) => {
      seen.push(cursor);
      return pages[cursor ?? 'start']!;
    });
    expect(all).toEqual([1, 2, 3, 4]);
    expect(seen).toEqual([null, 'a', 'b']);
  });

  it('stops on a repeated cursor and at MAX_PAGES', async () => {
    let calls = 0;
    await paginate(async () => {
      calls++;
      return { nodes: [calls], endCursor: 'same', hasNextPage: true };
    });
    expect(calls).toBe(2);

    calls = 0;
    await paginate(async () => {
      calls++;
      return { nodes: [], endCursor: `c${calls}`, hasNextPage: true };
    });
    expect(calls).toBe(MAX_PAGES);
  });
});
