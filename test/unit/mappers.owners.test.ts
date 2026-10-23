import { describe, expect, it } from 'vitest';
import { mapOwnerLookup, mapProjects, mapViewer, mapViews } from '../../src/api/mappers';
import type { RawProjectsResponse, RawViewerResponse, RawViewsResponse } from '../../src/api/raw';
import { fixture } from './fixtures';

describe('mapViewer', () => {
  it('maps the signed-in user and an organizations page', () => {
    const { viewer, organizations } = mapViewer(fixture<RawViewerResponse>('viewer'));
    expect(viewer).toMatchObject({ login: 'octo-user', kind: 'User', isViewer: true });
    expect(organizations.hasNextPage).toBe(false);
    expect(organizations.nodes.every((o) => o.kind === 'Organization' && !o.isViewer)).toBe(true);
  });

  it('maps organizations of a synthetic page', () => {
    const { organizations } = mapViewer({
      viewer: {
        login: 'me',
        name: null,
        avatarUrl: null,
        organizations: {
          nodes: [{ login: 'acme', name: 'Acme', avatarUrl: 'https://x/a.png' }, null],
          pageInfo: { endCursor: 'c1', hasNextPage: true },
        },
      },
    });
    expect(organizations).toEqual({
      nodes: [{ login: 'acme', name: 'Acme', avatarUrl: 'https://x/a.png', kind: 'Organization', isViewer: false }],
      endCursor: 'c1',
      hasNextPage: true,
    });
  });
});

describe('mapOwnerLookup', () => {
  it('distinguishes users and organizations and marks them manual', () => {
    expect(mapOwnerLookup({ repositoryOwner: { __typename: 'Organization', login: 'acme' } })).toEqual({
      login: 'acme',
      kind: 'Organization',
      isViewer: false,
      isManual: true,
    });
    expect(mapOwnerLookup({ repositoryOwner: { __typename: 'User', login: 'bob' } })?.kind).toBe('User');
    expect(mapOwnerLookup({ repositoryOwner: null })).toBeUndefined();
  });
});

describe('mapProjects', () => {
  it('maps the recorded projects page', () => {
    const page = mapProjects(fixture<RawProjectsResponse>('projects'));
    expect(page.nodes.length).toBeGreaterThan(0);
    const sample = page.nodes.find((p) => p.title === 'Sample project');
    expect(sample).toMatchObject({
      number: 2,
      ownerLogin: 'octo-user',
      closed: false,
      url: 'https://github.com/users/octo-user/projects/2',
    });
    expect(sample?.itemCount).toBeGreaterThan(100);
    expect(sample?.id).toMatch(/^PVT_/);
  });

  it('returns an empty page for an unknown owner', () => {
    expect(mapProjects({ repositoryOwner: null })).toEqual({ nodes: [], endCursor: null, hasNextPage: false });
  });
});

describe('mapViews', () => {
  it('maps layouts and the board "column by" field', () => {
    const views = mapViews(fixture<RawViewsResponse>('views')).nodes;
    const board = views.find((v) => v.layout === 'board');
    const table = views.find((v) => v.layout === 'table');
    expect(board?.columnFieldId).toMatch(/^PVTSSF_/);
    expect(table).toBeDefined();
    expect(table?.columnFieldId).toBeUndefined();
    expect(views.every((v) => typeof v.filter === 'string')).toBe(true);
  });
});
