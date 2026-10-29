import { describe, expect, it } from 'vitest';
import { mapItems, mapProjectDetails } from '../../src/api/mappers';
import type { RawItemsResponse, RawProjectDetailsResponse } from '../../src/api/raw';
import { NO_VALUE_COLUMN, buildColumns, cardBuiltins, cardFields, defaultView, resolveGroupField } from '../../src/model/board';
import type { ProjectField, ProjectItem, ProjectView } from '../../src/model/types';
import { fixture } from './fixtures';

const select = (id: string, name: string, options: string[]): ProjectField => ({
  id,
  name,
  dataType: 'SINGLE_SELECT',
  kind: 'singleSelect',
  options: options.map((o) => ({ id: `${id}-${o}`, name: o, color: 'GRAY' })),
});
const item = (id: string, values: Record<string, string> = {}): ProjectItem => ({
  id,
  type: 'Issue',
  title: id,
  labels: [],
  assignees: [],
  updatedAt: '',
  fieldValues: Object.fromEntries(
    Object.entries(values).map(([fieldId, optionId]) => [fieldId, { kind: 'singleSelect', fieldId, optionId, name: optionId }]),
  ),
});

describe('resolveGroupField', () => {
  const status = select('S', 'Status', ['Todo', 'Done']);
  const priority = select('P', 'Priority', ['P0']);
  const text: ProjectField = { id: 'T', name: 'Notes', dataType: 'TEXT', kind: 'text' };

  it('prefers the explicit choice, then the view, then Status, then the first select', () => {
    const view = { id: 'V', number: 1, name: 'B', layout: 'board' as const, filter: '', columnFieldId: 'P' };
    expect(resolveGroupField([status, priority], view, 'S')?.id).toBe('S');
    expect(resolveGroupField([status, priority], view)?.id).toBe('P');
    expect(resolveGroupField([priority, status])?.id).toBe('S');
    expect(resolveGroupField([text, priority])?.id).toBe('P');
    expect(resolveGroupField([text])).toBeUndefined();
  });

  it('ignores a view column field that is not single-select', () => {
    const view = { id: 'V', number: 1, name: 'B', layout: 'board' as const, filter: '', columnFieldId: 'T' };
    expect(resolveGroupField([text, status], view)?.id).toBe('S');
  });
});

describe('buildColumns', () => {
  const status = select('S', 'Status', ['Todo', 'Done']);

  it('groups by option in option order and keeps empty columns', () => {
    const cols = buildColumns([item('a', { S: 'S-Todo' }), item('b', { S: 'S-Todo' })], status);
    expect(cols.map((c) => [c.name, c.items.map((i) => i.id)])).toEqual([
      ['Todo', ['a', 'b']],
      ['Done', []],
    ]);
  });

  it('puts items without a value (or with a stale option) in a leading "No <field>" column', () => {
    const cols = buildColumns([item('a'), item('b', { S: 'S-Gone' }), item('c', { S: 'S-Done' })], status);
    expect(cols[0]).toMatchObject({ id: NO_VALUE_COLUMN, name: 'No Status' });
    expect(cols[0]?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(cols.find((c) => c.name === 'Done')?.items.map((i) => i.id)).toEqual(['c']);
  });

  it('shows a single column when there is no single-select field', () => {
    expect(buildColumns([item('a')], undefined)).toEqual([{ id: NO_VALUE_COLUMN, name: 'Items', items: [item('a')] }]);
  });

  it('puts every recorded item of the >100-item project in a Status column', () => {
    const p = mapProjectDetails(fixture<RawProjectDetailsResponse>('project'))!;
    const custom = new Set(p.fields.filter((f) => f.kind !== 'builtin').map((f) => f.id));
    const items = [
      ...mapItems(fixture<RawItemsResponse>('items-page1'), custom).nodes,
      ...mapItems(fixture<RawItemsResponse>('items-page2'), custom).nodes,
    ];
    const field = resolveGroupField(p.fields, defaultView(p));
    expect(field?.name).toBe('Status');
    const cols = buildColumns(items, field);
    expect(items.length).toBeGreaterThan(100);
    expect(cols.reduce((n, c) => n + c.items.length, 0)).toBe(items.length);
    expect(cols.filter((c) => c.id !== NO_VALUE_COLUMN).map((c) => c.name)).toEqual(['Backlog', 'Ready', 'In progress', 'In review', 'Done']);
  });
});

describe('cardFields / defaultView', () => {
  it('excludes built-ins and the grouping field', () => {
    const fields: ProjectField[] = [
      { id: 'title', name: 'Title', dataType: 'TITLE', kind: 'builtin' },
      select('S', 'Status', []),
      select('P', 'Priority', []),
    ];
    expect(cardFields(fields, 'S').map((f) => f.id)).toEqual(['P']);
  });

  it('shows the built-in fields the view shows, in its order', () => {
    const builtin = (id: string, dataType: string): ProjectField => ({ id, name: id, dataType, kind: 'builtin' });
    const fields: ProjectField[] = [
      builtin('title', 'TITLE'),
      builtin('ms', 'MILESTONE'),
      builtin('pr', 'LINKED_PULL_REQUESTS'),
      builtin('parent', 'PARENT_ISSUE'),
      builtin('subs', 'SUB_ISSUES_PROGRESS'),
      builtin('rev', 'REVIEWERS'),
      select('S', 'Status', []),
    ];
    const view = (visibleFieldIds?: string[]): ProjectView => ({ id: 'v', number: 1, name: 'Board', layout: 'board', filter: '', ...(visibleFieldIds ? { visibleFieldIds } : {}) });
    expect(cardBuiltins(fields, view(['title', 'pr', 'S', 'rev', 'ms', 'subs', 'parent']))).toEqual(['linkedPullRequests', 'milestone', 'subIssues', 'parent']);
    expect(cardBuiltins(fields, view(['title', 'S']))).toEqual([]);
    expect(cardBuiltins(fields, view())).toEqual([]);
    expect(cardBuiltins(fields)).toEqual([]);
  });

  it('picks the first board view', () => {
    const p = mapProjectDetails(fixture<RawProjectDetailsResponse>('project'))!;
    expect(defaultView(p)?.layout).toBe('board');
  });
});
