// Tiny DOM helpers. Text always goes through textContent: item titles and labels are untrusted.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Static, trusted SVG markup only (icons below). */
function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

const ICON = (body: string) =>
  `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">${body}</svg>`;

export const icons = {
  issueOpen: () => svg(ICON('<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6"/>')),
  issueClosed: () =>
    svg(ICON('<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 8.2l1.9 1.9 3.8-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>')),
  issueNotPlanned: () =>
    svg(ICON('<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12L12 4" stroke="currentColor" stroke-width="1.5"/>')),
  pr: () =>
    svg(ICON('<circle cx="4.5" cy="3.5" r="1.75" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="4.5" cy="12.5" r="1.75" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="11.5" cy="12.5" r="1.75" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 5.3v5.4M11.5 10.7V6.5a2 2 0 0 0-2-2H7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8.6 3.1L7 4.5l1.6 1.4" fill="none" stroke="currentColor" stroke-width="1.4"/>')),
  draft: () =>
    svg(ICON('<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2"/>')),
  refresh: () =>
    svg(ICON('<path d="M13 3v3.5H9.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.6 6.4A5 5 0 1 0 13 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>')),
  external: () =>
    svg(ICON('<path d="M9.5 2.5h4v4M13.5 2.5L8 8M7 3.5H3.5v9h9V9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>')),
};
