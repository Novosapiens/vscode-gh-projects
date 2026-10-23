// Opens the extension in an Extension Development Host, replays a scenario and captures the
// window through the Chrome DevTools Protocol (no macOS screen-recording permission needed).
//
//   npm run screenshot -- --scenario tree --theme dark --out docs/screenshots/m2-tree.png
//
// Real data: the token of `gh auth token` (or GHP_GH_USER's) is passed to the harness extension
// through the child environment only. Scenarios must stay READ-ONLY unless they target the
// sandbox project.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { connectToWebview, connectToWorkbench } from './cdp.mjs';
import { scenarios } from './scenarios.mjs';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'activitybar' },
    theme: { type: 'string', default: 'dark' },
    out: { type: 'string' },
    width: { type: 'string', default: '1400' },
    height: { type: 'string', default: '860' },
    settle: { type: 'string', default: '4000' },
  },
});
const scenario = scenarios[values.scenario];
if (!scenario) throw new Error(`unknown scenario ${values.scenario}; known: ${Object.keys(scenarios).join(', ')}`);
const out = resolve(values.out ?? `screenshots/tmp/${values.scenario}-${values.theme}.png`);
const debug = (m) => process.env.GHP_DEBUG && console.error(`[screenshot] ${m}`);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

const exe = await downloadAndUnzipVSCode('stable');
const userDir = mkdtempSync(join(tmpdir(), 'ghp-'));
mkdirSync(join(userDir, 'User'), { recursive: true });
writeFileSync(
  join(userDir, 'User', 'settings.json'),
  JSON.stringify({
    'workbench.colorTheme': values.theme === 'light' ? 'Default Light Modern' : 'Default Dark Modern',
    'workbench.startupEditor': 'none',
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'window.commandCenter': false,
    'workbench.tips.enabled': false,
    ...scenario.settings,
  }),
);

const token = scenario.needsToken
  ? execFileSync('gh', ['auth', 'token', ...(process.env.GHP_GH_USER ? ['-u', process.env.GHP_GH_USER] : [])], { encoding: 'utf8' }).trim()
  : '';
const port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(
  exe,
  [
    `--extensionDevelopmentPath=${root}`,
    `--extensionDevelopmentPath=${join(root, 'test', 'harness')}`,
    `--user-data-dir=${userDir}`,
    `--extensions-dir=${join(userDir, 'extensions')}`,
    `--remote-debugging-port=${port}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
  ],
  {
    env: { ...process.env, GHP_HARNESS_TOKEN: token, GHP_HARNESS_STEPS: JSON.stringify(scenario.steps) },
    stdio: 'ignore',
  },
);

// Never leave a dev host behind if something hangs.
const watchdog = setTimeout(() => {
  console.error('screenshot timed out');
  child.kill();
  process.exit(1);
}, 120_000);

try {
  debug(`launching on port ${port}`);
  const cdp = await connectToWorkbench(port);
  debug('connected');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Number(values.width),
    height: Number(values.height),
    deviceScaleFactor: 2,
    mobile: false,
  });
  const waitFor = async (expr) => {
    debug(`waiting for ${expr.slice(0, 80)}`);
    const deadline = Date.now() + 60000;
    while (!(await cdp.evaluate(expr))) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expr}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  if (scenario.waitFor) await waitFor(scenario.waitFor);
  // Optional UI actions in the workbench renderer (e.g. expanding a tree row) before capturing.
  let webview;
  for (const action of scenario.actions ?? []) {
    if (action.eval) await cdp.evaluate(action.eval);
    // `webview`: a function source `(doc) => …` evaluated inside the board webview document.
    if (action.webview) {
      webview ??= await connectToWebview(port);
      const deadline = Date.now() + 60000;
      while (!(await webview.evaluate(action.webview))) {
        if (Date.now() > deadline) throw new Error(`webview action never succeeded: ${action.webview.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (action.waitFor) await waitFor(action.waitFor);
    if (action.wait) await new Promise((r) => setTimeout(r, action.wait));
  }
  await new Promise((r) => setTimeout(r, Number(values.settle)));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await cdp.screenshot());
  cdp.close();
  webview?.close();
  console.log(`saved ${out}`);
} finally {
  clearTimeout(watchdog);
  child.kill();
  rmSync(userDir, { recursive: true, force: true });
}
