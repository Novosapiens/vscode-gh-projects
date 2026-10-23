import { describe, expect, it } from 'vitest';
import { mapItems, mapProjectDetails } from '../../src/api/mappers';
import type { RawItemsResponse, RawProjectDetailsResponse } from '../../src/api/raw';
import {
  EMPTY_FILTER,
  NONE,
  activeFilterCount,
  applyFilter,
  buildFacets,
  isEmptyFilter,
  matchesFilter,
  normalizeFilter,
} from '../../src/model/filter';
import type { BoardFilter } from '../../src/model/filter';
import type { ProjectField, ProjectItem } from '../../src/model/types';
import { fixture } from './fixtures';

const priority: ProjectField = {
  id: 'P',
  name: 'Priority',
  dataType: 'SINGLE_SELECT',
  kind: 'singleSelect',
  options: [
    { id: 'p0', name: 'P0', color: 'RED' },
    { id: 'p1', name: 'P1', color: 'GRAY' },
  ],
};

function item(partial: Partial<ProjectItem> & { id: string }): ProjectItem {
  return { type: 'Issue', title: partial.id, labels: [], assignees: [], fieldValues: {}, updatedAt: '', ...partial };
}

const a = item({
  id: 'a',
  number: 12,
  title: 'Fix login crash',
  repository: 'octo/web',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  assignees: [{ login: 'alice' }],
  fieldValues: { P: { kind: 'singleSelect', fieldId: 'P', optionId: 'p0', name: 'P0' } },
});
const b = item({
  id: 'b',
  number: 120,
  title: 'Add dark mode',
  repository: 'octo/app',
  labels: [{ name: 'feature', color: '0e8a16' }, { name: 'Bug', color: 'd73a4a' }],
  assignees: [{ login: 'bob' }, { login: 'alice' }],
});
const c = item({ id: 'c', type: 'DraftIssue', title: 'Idea: offline sync' });
const items = [a, b, c];
const f = (patch: Partial<BoardFilter>): BoardFilter => ({ ...EMPTY_FILTER, fields: {}, ...patch });
const ids = (filter: BoardFilter) => applyFilter(items, filter).map((i) => i.id);

describe('free text', () => {
  it('matches title, repo, labels, assignees and field values, all tokens required', () => {
    expect(ids(f({ text: 'login' }))).toEqual(['a']);
    expect(ids(f({ text: 'octo/app' }))).toEqual(['b']);
    expect(ids(f({ text: 'BUG' }))).toEqual(['a', 'b']);
    expect(ids(f({ text: 'alice dark' }))).toEqual(['b']);
    expect(ids(f({ text: 'p0' }))).toEqual(['a']);
    expect(ids(f({ text: 'draft' }))).toEqual(['c']);
    expect(ids(f({ text: '   ' }))).toEqual(['a', 'b', 'c']);
  });

  it('matches #number exactly', () => {
    expect(ids(f({ text: '#12' }))).toEqual(['a']);
    expect(ids(f({ text: '#120' }))).toEqual(['b']);
  });
});

describe('facet filters', () => {
  it('ORs values inside a group and ANDs groups', () => {
    expect(ids(f({ labels: ['bug'] }))).toEqual(['a', 'b']);
    expect(ids(f({ labels: ['feature', 'bug'] }))).toEqual(['a', 'b']);
    expect(ids(f({ labels: ['bug'], assignees: ['bob'] }))).toEqual(['b']);
    expect(ids(f({ assignees: [NONE] }))).toEqual(['c']);
    expect(ids(f({ assignees: ['ALICE'] }))).toEqual(['a', 'b']);
  });

  it('filters single-select values including "no value"', () => {
    expect(ids(f({ fields: { P: ['p0'] } }))).toEqual(['a']);
    expect(ids(f({ fields: { P: [NONE] } }))).toEqual(['b', 'c']);
    expect(ids(f({ fields: { P: ['p0', NONE] } }))).toEqual(['a', 'b', 'c']);
    expect(ids(f({ fields: { P: [] } }))).toEqual(['a', 'b', 'c']);
    expect(matchesFilter(a, f({ fields: { P: ['p1'] }, text: 'login' }))).toBe(false);
  });
});

describe('helpers', () => {
  it('counts active groups', () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
    expect(activeFilterCount(f({ text: 'x', labels: ['bug'], fields: { P: ['p0'], Q: [] } }))).toBe(3);
  });

  it('builds facets with counts, merging labels by name', () => {
    const facets = buildFacets(items, [priority]);
    expect(facets.labels.map((l) => [l.label, l.count])).toEqual([
      ['bug', 2],
      ['feature', 1],
    ]);
    expect(facets.assignees.map((x) => [x.value, x.count])).toEqual([
      ['alice', 2],
      ['bob', 1],
      [NONE, 1],
    ]);
    expect(facets.fields[0]?.values.map((v) => [v.label, v.count])).toEqual([
      ['P0', 1],
      ['P1', 0],
      ['No Priority', 2],
    ]);
  });

  it('normalizes untrusted input', () => {
    expect(normalizeFilter(undefined)).toEqual(EMPTY_FILTER);
    expect(normalizeFilter({ text: 3, labels: ['x', 1], assignees: 'no', fields: { P: ['p0', null], Q: [] } })).toEqual({
      text: '',
      labels: ['x'],
      assignees: [],
      fields: { P: ['p0'] },
    });
  });

  it('filters the recorded items of the >100-item project by Status and label', () => {
    const p = mapProjectDetails(fixture<RawProjectDetailsResponse>('project'))!;
    const custom = new Set(p.fields.filter((x) => x.kind !== 'builtin').map((x) => x.id));
    const all = [
      ...mapItems(fixture<RawItemsResponse>('items-page1'), custom).nodes,
      ...mapItems(fixture<RawItemsResponse>('items-page2'), custom).nodes,
    ];
    const status = p.fields.find((x) => x.name === 'Status')!;
    const done = status.options!.find((o) => o.name === 'Done')!;
    const facet = buildFacets(all, p.fields).fields.find((x) => x.field.id === status.id)!;
    const doneCount = facet.values.find((v) => v.value === done.id)!.count;
    expect(applyFilter(all, f({ fields: { [status.id]: [done.id] } }))).toHaveLength(doneCount);
    const bug = applyFilter(all, f({ labels: ['bug'] }));
    expect(bug.every((i) => i.labels.some((l) => l.name === 'bug'))).toBe(true);
  });
});
