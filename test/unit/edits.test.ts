import { describe, expect, it } from 'vitest';
import type { GraphQLClient } from '../../src/api/client';
import { GitHubProjectsApi } from '../../src/api/projectsApi';
import { CLEAR_FIELD_VALUE_MUTATION, UPDATE_FIELD_VALUE_MUTATION } from '../../src/api/queries';
import { PendingEdits, setItemValue, toFieldValue, toGraphQLValue, validateInput } from '../../src/model/edits';
import type { ProjectField, ProjectItem } from '../../src/model/types';

const status: ProjectField = {
  id: 'S',
  name: 'Status',
  dataType: 'SINGLE_SELECT',
  kind: 'singleSelect',
  options: [
    { id: 'todo', name: 'Todo', color: 'GRAY' },
    { id: 'done', name: 'Done', color: 'GREEN' },
  ],
};
const sprint: ProjectField = {
  id: 'I',
  name: 'Sprint',
  dataType: 'ITERATION',
  kind: 'iteration',
  iterations: [{ id: 'it1', title: 'Sprint 1', startDate: '2026-10-12', duration: 14, completed: false }],
};
const card = (id: string, optionId?: string): ProjectItem => ({
  id,
  type: 'Issue',
  title: id,
  labels: [],
  assignees: [],
  updatedAt: '',
  fieldValues: optionId ? { S: { kind: 'singleSelect', fieldId: 'S', optionId, name: optionId } } : {},
});
const column = (items: ProjectItem[], id: string) => {
  const v = items.find((i) => i.id === id)?.fieldValues.S;
  return v?.kind === 'singleSelect' ? v.optionId : undefined;
};

describe('mutation inputs', () => {
  it('maps every input kind to ProjectV2FieldValue', () => {
    expect(toGraphQLValue({ kind: 'singleSelect', optionId: 'o' })).toEqual({ singleSelectOptionId: 'o' });
    expect(toGraphQLValue({ kind: 'iteration', iterationId: 'i' })).toEqual({ iterationId: 'i' });
    expect(toGraphQLValue({ kind: 'text', text: 't' })).toEqual({ text: 't' });
    expect(toGraphQLValue({ kind: 'number', number: 2.5 })).toEqual({ number: 2.5 });
    expect(toGraphQLValue({ kind: 'date', date: '2026-10-22' })).toEqual({ date: '2026-10-22' });
  });

  it('validates inputs against the field', () => {
    expect(validateInput(status, { kind: 'singleSelect', optionId: 'done' })).toBeUndefined();
    expect(validateInput(status, { kind: 'singleSelect', optionId: 'gone' })).toMatch(/Unknown option/);
    expect(validateInput(status, { kind: 'text', text: 'x' })).toMatch(/not a text field/);
    expect(validateInput(sprint, { kind: 'iteration', iterationId: 'it1' })).toBeUndefined();
    expect(validateInput({ ...status, kind: 'date' }, { kind: 'date', date: '22/10/2026' })).toMatch(/YYYY-MM-DD/);
    expect(validateInput({ ...status, kind: 'number' }, { kind: 'number', number: Number.NaN })).toMatch(/number/);
    expect(validateInput(status, null)).toBeUndefined();
  });

  it('builds optimistic model values', () => {
    expect(toFieldValue(status, { kind: 'singleSelect', optionId: 'done' })).toEqual({ kind: 'singleSelect', fieldId: 'S', optionId: 'done', name: 'Done' });
    expect(toFieldValue(sprint, { kind: 'iteration', iterationId: 'it1' })).toMatchObject({ title: 'Sprint 1', duration: 14 });
    expect(toFieldValue(status, null)).toBeUndefined();
  });

  it('sends update and clear mutations with the write token', async () => {
    const calls: { query: string; vars: unknown; write: boolean | undefined }[] = [];
    const client = {
      request: async (query: string, vars: unknown, opts?: { write?: boolean }) => {
        calls.push({ query, vars, write: opts?.write });
        return {};
      },
    } as unknown as GraphQLClient;
    const api = new GitHubProjectsApi(client);
    await api.setFieldValue('P', 'IT', 'S', { kind: 'singleSelect', optionId: 'done' });
    await api.setFieldValue('P', 'IT', 'S', null);
    expect(calls).toEqual([
      { query: UPDATE_FIELD_VALUE_MUTATION, vars: { projectId: 'P', itemId: 'IT', fieldId: 'S', value: { singleSelectOptionId: 'done' } }, write: true },
      { query: CLEAR_FIELD_VALUE_MUTATION, vars: { projectId: 'P', itemId: 'IT', fieldId: 'S' }, write: true },
    ]);
  });
});

describe('optimistic edits', () => {
  it('setItemValue is immutable and returns the previous value', () => {
    const items = [card('a', 'todo'), card('b')];
    const { items: next, previous } = setItemValue(items, 'a', 'S', undefined);
    expect(previous).toMatchObject({ optionId: 'todo' });
    expect(column(next, 'a')).toBeUndefined();
    expect(column(items, 'a')).toBe('todo');
    expect(next[1]).toBe(items[1]);
  });

  it('moves immediately and keeps the move on confirm', () => {
    const edits = new PendingEdits();
    const { requestId, items } = edits.apply([card('a', 'todo')], 'a', status, { kind: 'singleSelect', optionId: 'done' });
    expect(column(items, 'a')).toBe('done');
    edits.confirm(requestId);
    expect(edits.size).toBe(0);
    expect(column(edits.revert(items, requestId), 'a')).toBe('done');
  });

  it('rolls back a failed move to the original column, also from "no value"', () => {
    const edits = new PendingEdits();
    let items = [card('a', 'todo'), card('b')];
    const m1 = edits.apply(items, 'a', status, { kind: 'singleSelect', optionId: 'done' });
    items = m1.items;
    const m2 = edits.apply(items, 'b', status, { kind: 'singleSelect', optionId: 'todo' });
    items = m2.items;
    items = edits.revert(items, m1.requestId);
    expect(column(items, 'a')).toBe('todo');
    expect(column(items, 'b')).toBe('todo');
    items = edits.revert(items, m2.requestId);
    expect(column(items, 'b')).toBeUndefined();
  });

  it('re-applies in-flight moves on top of refreshed data', () => {
    const edits = new PendingEdits();
    edits.apply([card('a', 'todo')], 'a', status, { kind: 'singleSelect', optionId: 'done' });
    const refreshed = [card('a', 'todo'), card('c')];
    expect(column(edits.reapply(refreshed), 'a')).toBe('done');
  });
});
