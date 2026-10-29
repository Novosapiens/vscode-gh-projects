import * as vscode from 'vscode';
import type { Release } from '../api/releases';
import { compareVersions, downloadVsix, fetchLatestRelease } from '../api/releases';
import { getLog, reportError } from './notify';

const LAST_CHECK_KEY = 'ghProjects.lastUpdateCheck';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Updates for the Novosapiens build, which is installed from a .vsix and so is never updated by
 * the Marketplace: looks for a newer GitHub release and installs its .vsix when the user agrees.
 */
export class Updater {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private get currentVersion(): string {
    return (this.context.extension.packageJSON as { version: string }).version;
  }

  /** At startup: at most once a day, only speaks up when there is an update. */
  async checkInBackground(): Promise<void> {
    if (!vscode.workspace.getConfiguration('ghProjects').get<boolean>('checkForUpdates', true)) return;
    const last = this.context.globalState.get<number>(LAST_CHECK_KEY, 0);
    if (Date.now() - last < DAY_MS) return;
    await this.context.globalState.update(LAST_CHECK_KEY, Date.now());
    try {
      const release = await fetchLatestRelease();
      if (release && compareVersions(release.version, this.currentVersion) > 0) await this.offer(release);
    } catch (err) {
      reportError('Checking for updates', err);
    }
  }

  /** From the command: always reports the outcome. */
  async check(): Promise<void> {
    let release: Release | undefined;
    try {
      release = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Checking for GitHub Projects updates' },
        () => fetchLatestRelease(),
      );
    } catch (err) {
      void vscode.window.showErrorMessage(reportError('Checking for updates', err));
      return;
    }
    await this.context.globalState.update(LAST_CHECK_KEY, Date.now());
    if (release && compareVersions(release.version, this.currentVersion) > 0) await this.offer(release);
    else void vscode.window.showInformationMessage(`GitHub Projects ${this.currentVersion} is the latest version.`);
  }

  private async offer(release: Release): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `GitHub Projects ${release.version} is available (you have ${this.currentVersion}).`,
      'Install',
      'Release Notes',
    );
    if (choice === 'Release Notes') await vscode.env.openExternal(vscode.Uri.parse(release.url));
    if (choice === 'Install') await this.install(release);
  }

  private async install(release: Release): Promise<void> {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing GitHub Projects ${release.version}` },
        async () => {
          const dir = this.context.globalStorageUri;
          await vscode.workspace.fs.createDirectory(dir);
          const file = vscode.Uri.joinPath(dir, release.vsix.name);
          await vscode.workspace.fs.writeFile(file, await downloadVsix(release));
          await vscode.commands.executeCommand('workbench.extensions.installExtension', file);
          await vscode.workspace.fs.delete(file);
        },
      );
    } catch (err) {
      void vscode.window.showErrorMessage(reportError(`Installing ${release.version}`, err));
      return;
    }
    getLog().info(`Installed GitHub Projects ${release.version}`);
    const choice = await vscode.window.showInformationMessage(
      `GitHub Projects ${release.version} is installed. Reload the window to use it.`,
      'Reload Window',
    );
    if (choice === 'Reload Window') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
