import type { FieldValue, ProjectField, ProjectItem } from './types';

/** Marker for "no value" in assignee and field filters. */
export const NONE = '__none__';

export interface BoardFilter {
  text: string;
  labels: string[];
  /** Logins, or NONE for unassigned. */
  assignees: string[];
  /** Single-select field id -> option ids (or NONE). */
  fields: Record<string, string[]>;
}

export const EMPTY_FILTER: BoardFilter = { text: '', labels: [], assignees: [], fields: {} };

export function isEmptyFilter(f: BoardFilter): boolean {
  return f.text.trim() === '' && f.labels.length === 0 && f.assignees.length === 0 && Object.values(f.fields).every((v) => v.length === 0);
}

/** Number of active filter groups (for the "Clear (n)" button). */
export function activeFilterCount(f: BoardFilter): number {
  return (
    (f.text.trim() ? 1 : 0) +
    (f.labels.length ? 1 : 0) +
    (f.assignees.length ? 1 : 0) +
    Object.values(f.fields).filter((v) => v.length > 0).length
  );
}

function valueText(v: FieldValue): string {
  switch (v.kind) {
    case 'singleSelect':
      return v.name;
    case 'text':
      return v.text;
    case 'number':
      return String(v.number);
    case 'date':
      return v.date;
    case 'iteration':
      return v.title;
  }
}

/** Everything visible on a card, lower-cased, for free-text search. */
export function searchableText(item: ProjectItem): string {
  return [
    item.title,
    item.number !== undefined ? `#${item.number}` : '',
    item.repository ?? '',
    item.type === 'DraftIssue' ? 'draft' : '',
    ...item.labels.map((l) => l.name),
    ...item.assignees.map((a) => a.login),
    ...Object.values(item.fieldValues).map(valueText),
  ]
    .join('\n')
    .toLowerCase();
}

function matchesText(item: ProjectItem, text: string): boolean {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = searchableText(item);
  return tokens.every((token) => {
    // "#12" means issue/PR number 12 exactly; a bare "12" can also appear in text ("2024").
    const ref = /^#(\d+)$/.exec(token);
    if (ref) return item.number === Number(ref[1]);
    if (/^\d+$/.test(token) && item.number === Number(token)) return true;
    return haystack.includes(token);
  });
}

/**
 * OR inside a filter group, AND across groups. Labels match by name (case-insensitive), so a
 * label shared by several repositories is one filter value.
 */
export function matchesFilter(item: ProjectItem, filter: BoardFilter): boolean {
  if (!matchesText(item, filter.text)) return false;
  if (filter.labels.length) {
    const names = new Set(item.labels.map((l) => l.name.toLowerCase()));
    if (!filter.labels.some((l) => names.has(l.toLowerCase()))) return false;
  }
  if (filter.assignees.length) {
    const logins = new Set(item.assignees.map((a) => a.login.toLowerCase()));
    const ok = filter.assignees.some((a) => (a === NONE ? logins.size === 0 : logins.has(a.toLowerCase())));
    if (!ok) return false;
  }
  for (const [fieldId, optionIds] of Object.entries(filter.fields)) {
    if (optionIds.length === 0) continue;
    const v = item.fieldValues[fieldId];
    const optionId = v?.kind === 'singleSelect' ? v.optionId : NONE;
    if (!optionIds.includes(optionId)) return false;
  }
  return true;
}

export function applyFilter(items: ProjectItem[], filter: BoardFilter): ProjectItem[] {
  return isEmptyFilter(filter) ? items : items.filter((i) => matchesFilter(i, filter));
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
  color?: string;
}

export interface Facets {
  labels: FacetValue[];
  assignees: FacetValue[];
  fields: { field: ProjectField; values: FacetValue[] }[];
}

/** Values offered by the filter menus, with how many items have each. */
export function buildFacets(items: ProjectItem[], fields: ProjectField[]): Facets {
  const labels = new Map<string, FacetValue>();
  const assignees = new Map<string, FacetValue>();
  let unassigned = 0;
  for (const item of items) {
    for (const l of item.labels) {
      const key = l.name.toLowerCase();
      const f = labels.get(key) ?? { value: l.name, label: l.name, count: 0, color: l.color };
      f.count++;
      labels.set(key, f);
    }
    if (item.assignees.length === 0) unassigned++;
    for (const a of item.assignees) {
      const key = a.login.toLowerCase();
      const f = assignees.get(key) ?? { value: a.login, label: a.login, count: 0 };
      f.count++;
      assignees.set(key, f);
    }
  }
  const byName = (a: FacetValue, b: FacetValue) => a.label.localeCompare(b.label);
  const assigneeValues = [...assignees.values()].sort(byName);
  if (unassigned) assigneeValues.push({ value: NONE, label: 'No assignee', count: unassigned });

  const selectFields = fields.filter((f) => f.kind === 'singleSelect');
  return {
    labels: [...labels.values()].sort(byName),
    assignees: assigneeValues,
    fields: selectFields.map((field) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        const v = item.fieldValues[field.id];
        const key = v?.kind === 'singleSelect' ? v.optionId : NONE;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const values: FacetValue[] = (field.options ?? []).map((o) => ({
        value: o.id,
        label: o.name,
        count: counts.get(o.id) ?? 0,
        color: o.color,
      }));
      values.push({ value: NONE, label: `No ${field.name}`, count: counts.get(NONE) ?? 0 });
      return { field, values };
    }),
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Accepts anything (workspaceState, webview message) and returns a valid filter. */
export function normalizeFilter(raw: unknown): BoardFilter {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_FILTER, fields: {} };
  const r = raw as Record<string, unknown>;
  const fields: Record<string, string[]> = {};
  if (typeof r.fields === 'object' && r.fields !== null) {
    for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) {
      const ids = strings(v);
      if (ids.length) fields[k] = ids;
    }
  }
  return {
    text: typeof r.text === 'string' ? r.text.slice(0, 500) : '',
    labels: strings(r.labels),
    assignees: strings(r.assignees),
    fields,
  };
}
