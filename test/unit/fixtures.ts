import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Loads `test/fixtures/<name>.json` and returns its `data` member. */
export function fixture<T>(name: string): T {
  const raw = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', `${name}.json`), 'utf8')) as { data: T };
  return raw.data;
}
