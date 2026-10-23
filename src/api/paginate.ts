import type { Page } from '../model/types';

/** Hard stop so a broken cursor can never loop forever (100 pages x 100 = 10k nodes). */
export const MAX_PAGES = 100;

/** Follows `endCursor` until `hasNextPage` is false and concatenates every page. */
export async function paginate<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  onPage?: (loaded: number) => void,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(cursor);
    all.push(...page.nodes);
    onPage?.(all.length);
    if (!page.hasNextPage || !page.endCursor || page.endCursor === cursor) return all;
    cursor = page.endCursor;
  }
  return all;
}
