/** Where Novosapiens builds are released: a `novo-v<version>` tag with the .vsix attached. */
export const RELEASE_REPO = 'Novosapiens/vscode-gh-projects';
export const RELEASE_TAG_PREFIX = 'novo-v';

export interface Release {
  version: string;
  /** Release page on github.com. */
  url: string;
  vsix: { name: string; downloadUrl: string };
}

interface RawRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string }[];
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Negative, zero or positive like a sort comparator; versions are plain `x.y.z`. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = VERSION.exec(b)?.slice(1).map(Number) ?? [0, 0, 0];
  return pa.reduce((diff, n, i) => diff || n - (pb[i] ?? 0), 0);
}

/** Newest published Novosapiens release that has a .vsix, ignoring upstream tags. */
export function pickLatest(raw: RawRelease[]): Release | undefined {
  let latest: Release | undefined;
  for (const r of raw) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(RELEASE_TAG_PREFIX)) continue;
    const version = r.tag_name.slice(RELEASE_TAG_PREFIX.length);
    const asset = r.assets?.find((a) => a.name.endsWith('.vsix'));
    if (!VERSION.test(version) || !asset) continue;
    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { version, url: r.html_url, vsix: { name: asset.name, downloadUrl: asset.browser_download_url } };
    }
  }
  return latest;
}

export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<Release | undefined> {
  const res = await fetchFn(`https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`Checking for updates failed: GitHub answered ${res.status}.`);
  return pickLatest((await res.json()) as RawRelease[]);
}

export async function downloadVsix(release: Release, fetchFn: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await fetchFn(release.vsix.downloadUrl);
  if (!res.ok) throw new Error(`Downloading ${release.vsix.name} failed: GitHub answered ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}
