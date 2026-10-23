import { describe, expect, it } from 'vitest';
import { mapItems, mapProjectDetails } from '../../src/api/mappers';
import type { RawItemsResponse, RawProjectDetailsResponse } from '../../src/api/raw';
import { countMine } from '../../src/model/stats';
import type { ProjectDetails, ProjectItem } from '../../src/model/types';
import { fixture } from './fixtures';

const project: ProjectDetails = {
  id: 'P',
  number: 1,
  title: 'T',
  url: '',
  ownerLogin: 'o',
  views: [],
  fields: [
    {
      id: 'S',
      name: 'Status',
      dataType: 'SINGLE_SELECT',
      kind: 'singleSelect',
      options: [
        { id: 'todo', name: 'Todo', color: 'GRAY' },
        { id: 'doing', name: 'In Progress', color: 'YELLOW' },
      ],
    },
  ],
};
const item = (id: string, optionId: string | undefined, assignees: string[]): ProjectItem => ({
  id,
  type: 'Issue',
  title: id,
  labels: [],
  assignees: assignees.map((login) => ({ login })),
  updatedAt: '',
  fieldValues: optionId ? { S: { kind: 'singleSelect', fieldId: 'S', optionId, name: '' } } : {},
});

describe('countMine', () => {
  const items = [item('a', 'doing', ['Me']), item('b', 'doing', ['other']), item('c', 'todo', ['me']), item('d', undefined, ['me']), item('e', 'doing', ['x', 'me'])];

  it('counts my items in the column, case-insensitively', () => {
    expect(countMine(project, items, 'me', 'In progress')).toBe(2);
    expect(countMine(project, items, 'me', 'todo')).toBe(1);
  });

  it('is 0 for an unknown column or no login', () => {
    expect(countMine(project, items, 'me', 'Blocked')).toBe(0);
    expect(countMine(project, items, '', 'In progress')).toBe(0);
  });

  it('works on the recorded items of the >100-item project', () => {
    const p = mapProjectDetails(fixture<RawProjectDetailsResponse>('project'))!;
    const all = mapItems(fixture<RawItemsResponse>('items-page1')).nodes.concat(mapItems(fixture<RawItemsResponse>('items-page2')).nodes);
    const n = countMine(p, all, 'octo-user', 'In progress');
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(all.length);
  });
});
