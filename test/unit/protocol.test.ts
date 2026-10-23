import { describe, expect, it } from 'vitest';
import { parseWebviewMessage } from '../../src/shared/protocol';

describe('parseWebviewMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'selectView', viewId: 'V' })).toEqual({ type: 'selectView', viewId: 'V' });
    expect(parseWebviewMessage({ type: 'openExternal', url: 'https://github.com/o/r/issues/1' })).toBeDefined();
  });

  it('rejects malformed messages and non-http(s) URLs', () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage({ type: 'selectView' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'nope' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openExternal', url: 'vscode://some.ext/run' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openExternal', url: 'javascript:alert(1)' })).toBeUndefined();
  });
});
