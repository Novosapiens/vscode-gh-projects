import { describe, expect, it, vi } from 'vitest';
import { compareVersions, downloadVsix, fetchLatestRelease, pickLatest } from '../../src/api/releases';

const release = (tag: string, extra: object = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/Novosapiens/vscode-gh-projects/releases/tag/${tag}`,
  assets: [{ name: `vscode-gh-projects-${tag}.vsix`, browser_download_url: `https://dl/${tag}.vsix` }],
  ...extra,
});

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('1.4.10', '1.4.9')).toBeGreaterThan(0);
    expect(compareVersions('1.4.1', '1.5.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});

describe('pickLatest', () => {
  it('picks the highest novo-v release with a .vsix', () => {
    const latest = pickLatest([release('novo-v1.4.1'), release('novo-v1.10.0'), release('novo-v1.9.3')]);
    expect(latest).toEqual({
      version: '1.10.0',
      url: 'https://github.com/Novosapiens/vscode-gh-projects/releases/tag/novo-v1.10.0',
      vsix: { name: 'vscode-gh-projects-novo-v1.10.0.vsix', downloadUrl: 'https://dl/novo-v1.10.0.vsix' },
    });
  });

  it('ignores upstream tags, drafts, prereleases, odd versions and releases without a .vsix', () => {
    expect(
      pickLatest([
        release('v9.0.0'),
        release('novo-v9.0.1', { draft: true }),
        release('novo-v9.0.2', { prerelease: true }),
        release('novo-v9.0'),
        release('novo-v9.0.3', { assets: [] }),
        release('novo-v1.0.0'),
      ])?.version,
    ).toBe('1.0.0');
    expect(pickLatest([])).toBeUndefined();
  });
});

describe('fetchLatestRelease', () => {
  it('reads the Novosapiens releases', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([release('novo-v1.4.2')])));
    await expect(fetchLatestRelease(fetchMock as unknown as typeof fetch)).resolves.toMatchObject({ version: '1.4.2' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/Novosapiens/vscode-gh-projects/releases?per_page=30', expect.anything());
  });

  it('fails on an HTTP error', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 403 }));
    await expect(fetchLatestRelease(fetchMock as unknown as typeof fetch)).rejects.toThrow('GitHub answered 403');
  });
});

describe('downloadVsix', () => {
  it('returns the file bytes', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const latest = pickLatest([release('novo-v1.4.2')])!;
    await expect(downloadVsix(latest, fetchMock as unknown as typeof fetch)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith('https://dl/novo-v1.4.2.vsix');
  });
});
