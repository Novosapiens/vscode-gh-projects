import type { ProjectDetails, ProjectField, ProjectItem, ProjectView, SelectOption } from './types';

export const NO_VALUE_COLUMN = '__none__';

export interface Column {
  /** Option id, or NO_VALUE_COLUMN for items without a value. */
  id: string;
  name: string;
  option?: SelectOption;
  items: ProjectItem[];
}

/**
 * Field the board is grouped by: the view's "Column by" field when it is single-select, then a
 * single-select field named Status, then the first single-select field.
 */
export function resolveGroupField(
  fields: ProjectField[],
  view?: ProjectView,
  preferredFieldId?: string,
): ProjectField | undefined {
  const selects = fields.filter((f) => f.kind === 'singleSelect');
  return (
    (preferredFieldId ? selects.find((f) => f.id === preferredFieldId) : undefined) ??
    (view?.columnFieldId ? selects.find((f) => f.id === view.columnFieldId) : undefined) ??
    selects.find((f) => f.name.toLowerCase() === 'status') ??
    selects[0]
  );
}

/** The view to show by default: the first board view, else the first view. */
export function defaultView(project: ProjectDetails): ProjectView | undefined {
  return project.views.find((v) => v.layout === 'board') ?? project.views[0];
}

/**
 * Columns in option order, with "No <field>" first like github.com. The no-value column is
 * only included when it has items (or `alwaysIncludeNone`, so it can be a drop target).
 */
export function buildColumns(
  items: ProjectItem[],
  field: ProjectField | undefined,
  opts: { alwaysIncludeNone?: boolean } = {},
): Column[] {
  if (!field) return [{ id: NO_VALUE_COLUMN, name: 'Items', items: [...items] }];
  const options = field.options ?? [];
  const byOption = new Map<string, ProjectItem[]>(options.map((o) => [o.id, []]));
  const none: ProjectItem[] = [];
  for (const item of items) {
    const value = item.fieldValues[field.id];
    const bucket = value?.kind === 'singleSelect' ? byOption.get(value.optionId) : undefined;
    (bucket ?? none).push(item);
  }
  const columns: Column[] = options.map((option) => ({
    id: option.id,
    name: option.name,
    option,
    items: byOption.get(option.id) ?? [],
  }));
  if (none.length > 0 || opts.alwaysIncludeNone) columns.unshift({ id: NO_VALUE_COLUMN, name: `No ${field.name}`, items: none });
  return columns;
}

/** Custom fields worth showing on a card (everything editable except the grouping field). */
export function cardFields(fields: ProjectField[], groupFieldId: string | undefined): ProjectField[] {
  return fields.filter((f) => f.kind !== 'builtin' && f.id !== groupFieldId);
}
