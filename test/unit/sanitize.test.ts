// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../../src/webview/sanitize';

const render = (html: string) => {
  const div = document.createElement('div');
  div.append(sanitizeHtml(html));
  return div.innerHTML;
};

describe('sanitizeHtml', () => {
  it('keeps GitHub markdown output', () => {
    const html = '<h2>Steps</h2><ul><li><code>npm ci</code></li></ul><a href="https://github.com/o/r/pull/1">#1</a><img src="https://user-images.githubusercontent.com/x.png" alt="x">';
    expect(render(html)).toBe(html);
  });

  it('drops active content, handlers, inline styles and unsafe URLs', () => {
    const out = render(
      '<p onclick="x()" style="color:red">hi<script>alert(1)</script></p><iframe src="https://evil"></iframe><a href="javascript:alert(1)">x</a><img src="data:text/html,1"><form><input></form>',
    );
    expect(out).toBe('<p>hi</p><a>x</a><img>');
  });
});
