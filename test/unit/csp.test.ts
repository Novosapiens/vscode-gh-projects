import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce } from '../../src/views/csp';

describe('csp', () => {
  it('creates unique url-safe nonces', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('only allows nonce scripts and no remote sources', () => {
    const csp = buildCsp('vscode-webview://abc', 'N0NCE');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-N0NCE'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*https/);
  });
});
