// Defence in depth for issue bodies. GitHub's bodyHTML is already sanitised server-side and the
// CSP blocks scripts and inline handlers; this strips anything active before it reaches the DOM.

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META', 'BASE']);
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'xlink:href', 'poster']);

function safeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('https://') || v.startsWith('http://') || v.startsWith('#') || v.startsWith('mailto:');
}

export function sanitizeHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const remove: Element[] = [];
  for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
    if (DROP.has(node.tagName)) {
      remove.push(node);
      continue;
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style' || (URL_ATTRS.has(name) && !attr.value.split(',').every((p) => safeUrl(p.trim().split(/\s+/)[0] ?? '')))) {
        node.removeAttribute(attr.name);
      }
    }
  }
  remove.forEach((n) => n.remove());
  return template.content;
}
