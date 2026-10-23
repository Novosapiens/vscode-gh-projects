// Search box + filter menus. Pure rendering: state lives in the BoardFilter passed in.
import type { BoardFilter, FacetValue, Facets } from '../model/filter';
import { NONE, activeFilterCount } from '../model/filter';
import { h } from './dom';

export interface FilterBarProps {
  filter: BoardFilter;
  facets: Facets;
  shown: number;
  total: number;
  /** Menu currently open (kept across re-renders). */
  openMenu: string | undefined;
  onOpenMenu(key: string | undefined): void;
  onChange(filter: BoardFilter, opts?: { debounce?: boolean }): void;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function menu(
  key: string,
  title: string,
  values: FacetValue[],
  selected: string[],
  props: FilterBarProps,
  onToggle: (value: string) => void,
): HTMLElement {
  const details = h('details', { class: 'filter-menu', 'data-menu': key, open: props.openMenu === key });
  const summary = h(
    'summary',
    { class: selected.length ? 'active' : '', 'aria-label': `Filter by ${title}` },
    title,
    selected.length ? h('span', { class: 'count' }, String(selected.length)) : null,
  );
  details.append(summary);
  details.addEventListener('toggle', () => {
    // 'toggle' is async: ignore it when it lands on a menu that a re-render already replaced.
    if (!details.isConnected) return;
    if (details.open) props.onOpenMenu(key);
    else if (props.openMenu === key) props.onOpenMenu(undefined);
  });
  const list = h('ul', { class: 'menu', role: 'group', 'aria-label': title });
  if (values.length === 0) list.append(h('li', { class: 'muted' }, 'No values'));
  for (const v of values) {
    const input = h('input', {
      type: 'checkbox',
      checked: selected.includes(v.value),
      'data-focus-key': `${key}:${v.value}`,
    });
    input.addEventListener('change', () => onToggle(v.value));
    const swatch = v.color
      ? /^[0-9a-f]{6}$/i.test(v.color)
        ? h('span', { class: 'label-dot', 'aria-hidden': 'true' })
        : h('span', { class: `dot color-${v.color}`, 'aria-hidden': 'true' })
      : null;
    if (swatch && /^[0-9a-f]{6}$/i.test(v.color ?? '')) swatch.style.setProperty('--label-color', `#${v.color}`);
    list.append(
      h(
        'li',
        {},
        h('label', { class: v.count === 0 && !selected.includes(v.value) ? 'muted' : '' }, input, swatch, h('span', { class: 'menu-label' }, v.label), h('span', { class: 'menu-count' }, String(v.count))),
      ),
    );
  }
  details.append(list);
  return details;
}

function chip(text: string, onRemove: () => void): HTMLElement {
  const remove = h('button', { type: 'button', class: 'chip-remove', 'aria-label': `Remove filter ${text}`, title: 'Remove' }, '×');
  remove.addEventListener('click', onRemove);
  return h('li', { class: 'filter-chip' }, h('span', {}, text), remove);
}

export function filterBar(props: FilterBarProps): HTMLElement {
  const { filter, facets } = props;
  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Filter by keyword, #number, repo…',
    'aria-label': 'Search items',
    value: filter.text,
    'data-focus-key': 'search',
  });
  search.addEventListener('input', () => props.onChange({ ...filter, text: search.value }, { debounce: true }));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
      search.value = '';
      props.onChange({ ...filter, text: '' });
    }
  });

  const menus: HTMLElement[] = [
    menu('labels', 'Label', facets.labels, filter.labels, props, (v) => props.onChange({ ...filter, labels: toggle(filter.labels, v) })),
    menu('assignees', 'Assignee', facets.assignees, filter.assignees, props, (v) =>
      props.onChange({ ...filter, assignees: toggle(filter.assignees, v) }),
    ),
    ...facets.fields.map(({ field, values }) =>
      menu(`field:${field.id}`, field.name, values, filter.fields[field.id] ?? [], props, (v) =>
        props.onChange({ ...filter, fields: { ...filter.fields, [field.id]: toggle(filter.fields[field.id] ?? [], v) } }),
      ),
    ),
  ];

  const chips: HTMLElement[] = [];
  for (const l of filter.labels) chips.push(chip(`label: ${l}`, () => props.onChange({ ...filter, labels: filter.labels.filter((x) => x !== l) })));
  for (const a of filter.assignees) {
    chips.push(
      chip(`assignee: ${a === NONE ? 'none' : a}`, () => props.onChange({ ...filter, assignees: filter.assignees.filter((x) => x !== a) })),
    );
  }
  for (const { field, values } of facets.fields) {
    for (const id of filter.fields[field.id] ?? []) {
      const label = values.find((v) => v.value === id)?.label ?? id;
      chips.push(
        chip(`${field.name.toLowerCase()}: ${label}`, () =>
          props.onChange({ ...filter, fields: { ...filter.fields, [field.id]: (filter.fields[field.id] ?? []).filter((x) => x !== id) } }),
        ),
      );
    }
  }

  const active = activeFilterCount(filter);
  const clear = h('button', { type: 'button', class: 'link-button', disabled: active === 0 }, active ? `Clear filters (${active})` : 'Clear filters');
  clear.addEventListener('click', () => props.onChange({ text: '', labels: [], assignees: [], fields: {} }));

  return h(
    'div',
    { class: 'filter-bar', role: 'search' },
    h('div', { class: 'filter-row' }, search, ...menus, h('span', { class: 'spacer' }), h('span', { class: 'muted', 'aria-live': 'polite' }, props.shown === props.total ? `${props.total} items` : `Showing ${props.shown} of ${props.total}`), clear),
    chips.length ? h('ul', { class: 'filter-chips', 'aria-label': 'Active filters' }, chips) : null,
  );
}
