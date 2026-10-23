import type { FieldValue, ProjectField, ProjectItem } from './types';

/** A value to write to a project field; `null` clears it. */
export type FieldInput =
  | { kind: 'singleSelect'; optionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'number'; number: number }
  | { kind: 'date'; date: string }
  | { kind: 'iteration'; iterationId: string }
  | null;

/** GraphQL `ProjectV2FieldValue` input for a FieldInput (null = clear mutation). */
export function toGraphQLValue(input: Exclude<FieldInput, null>): Record<string, string | number> {
  switch (input.kind) {
    case 'singleSelect':
      return { singleSelectOptionId: input.optionId };
    case 'text':
      return { text: input.text };
    case 'number':
      return { number: input.number };
    case 'date':
      return { date: input.date };
    case 'iteration':
      return { iterationId: input.iterationId };
  }
}

/** The model value an input will produce, used for optimistic updates. */
export function toFieldValue(field: ProjectField, input: FieldInput): FieldValue | undefined {
  if (input === null) return undefined;
  switch (input.kind) {
    case 'singleSelect': {
      const option = field.options?.find((o) => o.id === input.optionId);
      return option ? { kind: 'singleSelect', fieldId: field.id, optionId: option.id, name: option.name } : undefined;
    }
    case 'iteration': {
      const it = field.iterations?.find((i) => i.id === input.iterationId);
      return it
        ? { kind: 'iteration', fieldId: field.id, iterationId: it.id, title: it.title, startDate: it.startDate, duration: it.duration }
        : undefined;
    }
    case 'text':
      return { kind: 'text', fieldId: field.id, text: input.text };
    case 'number':
      return { kind: 'number', fieldId: field.id, number: input.number };
    case 'date':
      return { kind: 'date', fieldId: field.id, date: input.date };
  }
}

/** Checks an input against the field (kind, known option/iteration, valid number/date). */
export function validateInput(field: ProjectField, input: FieldInput): string | undefined {
  if (input === null) return undefined;
  if (input.kind !== field.kind) return `${field.name} is not a ${input.kind} field.`;
  switch (input.kind) {
    case 'singleSelect':
      return field.options?.some((o) => o.id === input.optionId) ? undefined : `Unknown option for ${field.name}.`;
    case 'iteration':
      return field.iterations?.some((i) => i.id === input.iterationId) ? undefined : `Unknown iteration for ${field.name}.`;
    case 'number':
      return Number.isFinite(input.number) ? undefined : `${field.name} must be a number.`;
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? undefined : `${field.name} must be a date (YYYY-MM-DD).`;
    case 'text':
      return undefined;
  }
}

export interface AppliedEdit {
  items: ProjectItem[];
  /** Value before the edit, to roll back. */
  previous: FieldValue | undefined;
}

/** Returns new items with one field value replaced (immutable). */
export function setItemValue(items: ProjectItem[], itemId: string, fieldId: string, value: FieldValue | undefined): AppliedEdit {
  let previous: FieldValue | undefined;
  const next = items.map((item) => {
    if (item.id !== itemId) return item;
    previous = item.fieldValues[fieldId];
    const fieldValues = { ...item.fieldValues };
    if (value) fieldValues[fieldId] = value;
    else delete fieldValues[fieldId];
    return { ...item, fieldValues };
  });
  return { items: next, previous };
}

/**
 * Optimistic edits that are still waiting for GitHub. Each one remembers the previous value so
 * a failure puts the card back exactly where it was, even if other edits landed meanwhile.
 */
export class PendingEdits {
  private readonly pending = new Map<
    string,
    { itemId: string; field: ProjectField; input: FieldInput; previous: FieldValue | undefined }
  >();
  private seq = 0;

  apply(
    items: ProjectItem[],
    itemId: string,
    field: ProjectField,
    input: FieldInput,
  ): { requestId: string; items: ProjectItem[] } {
    const requestId = `edit-${++this.seq}`;
    const { items: next, previous } = setItemValue(items, itemId, field.id, toFieldValue(field, input));
    this.pending.set(requestId, { itemId, field, input, previous });
    return { requestId, items: next };
  }

  /** GitHub accepted the edit. */
  confirm(requestId: string): void {
    this.pending.delete(requestId);
  }

  /** GitHub rejected the edit: restore the previous value. */
  revert(items: ProjectItem[], requestId: string): ProjectItem[] {
    const p = this.pending.get(requestId);
    if (!p) return items;
    this.pending.delete(requestId);
    return setItemValue(items, p.itemId, p.field.id, p.previous).items;
  }

  /** Re-applies in-flight edits on top of freshly loaded items (a refresh during a move). */
  reapply(items: ProjectItem[]): ProjectItem[] {
    let next = items;
    for (const p of this.pending.values()) {
      next = setItemValue(next, p.itemId, p.field.id, toFieldValue(p.field, p.input)).items;
    }
    return next;
  }

  get size(): number {
    return this.pending.size;
  }
}
