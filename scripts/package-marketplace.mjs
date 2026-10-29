// Packages the Marketplace .vsix into marketplace/: built with MARKETPLACE=1 (no updates from
// GitHub releases, VS Code updates it) and without the update command and setting.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const original = await readFile('package.json', 'utf8');
const manifest = JSON.parse(original);
const { contributes } = manifest;
contributes.commands = contributes.commands.filter((c) => c.command !== 'ghProjects.checkForUpdates');
delete contributes.configuration.properties['ghProjects.checkForUpdates'];

await mkdir('marketplace', { recursive: true });
await writeFile('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
try {
  execFileSync('npx', ['vsce', 'package', '--no-dependencies', '--out', `marketplace/${manifest.name}-${manifest.version}.vsix`], {
    stdio: 'inherit',
    env: { ...process.env, MARKETPLACE: '1' },
  });
} finally {
  await writeFile('package.json', original);
}
