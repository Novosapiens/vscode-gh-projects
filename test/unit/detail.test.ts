import { describe, expect, it } from 'vitest';
import { mapItemDetail } from '../../src/api/mappers';
import type { RawItemDetailResponse } from '../../src/api/raw';
import { parseWebviewMessage } from '../../src/shared/protocol';
import { fixture } from './fixtures';

describe('mapItemDetail', () => {
  it('maps a recorded issue detail', () => {
    const d = mapItemDetail(fixture<RawItemDetailResponse>('item-detail-issue'))!;
    expect(d.itemId).toMatch(/^PVTI_/);
    expect(d.bodyHTML).toContain('<p>');
    expect(d.author?.login).toBe('octo-user');
    expect(typeof d.comments).toBe('number');
    expect(d.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.milestone).toBeUndefined();
  });

  it('maps a recorded draft detail (creator instead of author, no comments)', () => {
    const d = mapItemDetail(fixture<RawItemDetailResponse>('item-detail-draft'))!;
    expect(d.author?.login).toBe('octo-user');
    expect(d.comments).toBeUndefined();
  });

  it('maps pull request branches and handles missing nodes', () => {
    const d = mapItemDetail({
      node: {
        id: 'PVTI_1',
        content: { __typename: 'PullRequest', bodyHTML: '', headRefName: 'feat/x', baseRefName: 'main', comments: { totalCount: 0 } },
      },
    });
    expect(d).toMatchObject({ headRef: 'feat/x', baseRef: 'main', comments: 0, bodyHTML: '' });
    expect(mapItemDetail({ node: null })).toBeUndefined();
  });
});

describe('detail messages', () => {
  it('validates detail requests and links', () => {
    expect(parseWebviewMessage({ type: 'openDetail', itemId: 'PVTI_1' })).toEqual({ type: 'openDetail', itemId: 'PVTI_1' });
    expect(parseWebviewMessage({ type: 'openInPrExtension' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'copyLink', url: 'https://github.com/o/r/issues/1' })).toBeDefined();
    expect(parseWebviewMessage({ type: 'copyLink', url: 'https://example.com' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openExternal', url: 'https://example.com/docs' })).toBeDefined();
    expect(parseWebviewMessage({ type: 'openExternal', url: 'file:///etc/passwd' })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'openExternal', url: 'command:workbench.action.quit' })).toBeUndefined();
  });

  it('validates field edits', () => {
    expect(parseWebviewMessage({ type: 'setField', requestId: 'r', itemId: 'i', fieldId: 'f', input: null })).toMatchObject({ input: null });
    expect(parseWebviewMessage({ type: 'setField', requestId: 'r', itemId: 'i', fieldId: 'f', input: { kind: 'number', number: 'x' } })).toBeUndefined();
    expect(parseWebviewMessage({ type: 'setField', requestId: 'r', itemId: 'i', fieldId: 'f', input: { kind: 'eval' } })).toBeUndefined();
  });
});
