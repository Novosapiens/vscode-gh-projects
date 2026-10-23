import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  // Short user-data-dir: macOS caps unix socket paths at 103 chars.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghp-'));
  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? 'stable',
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions', '--disable-workspace-trust', '--skip-welcome', `--user-data-dir=${userDataDir}`],
  });
}

main().catch((err: unknown) => {
  console.error('Integration tests failed', err);
  process.exit(1);
});
