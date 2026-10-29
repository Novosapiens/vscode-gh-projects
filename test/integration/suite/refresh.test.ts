import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createFakeApi, projects } from './fakeApi';

interface Board {
  refresh(): Promise<void>;
  setField(requestId: string, itemId: string, fieldId: string, input: unknown): Promise<boolean>;
  panel: vscode.WebviewPanel;
  current?: { loadedAt: string };
}
interface Api {
  __setApiFactory(factory: () => unknown): void;
  __statusText(): string;
  __refreshCounter(): Promise<void>;
}

suite('refresh and status bar', () => {
  let api: Api;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<Api>('novosapiens.gh-vs-projects-board');
    assert.ok(ext);
    api = await ext.activate();
    api.__setApiFactory(createFakeApi);
  });

  test('the refresh command reloads open boards', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    await board.refresh();
    const first = board.current?.loadedAt;
    await new Promise((r) => setTimeout(r, 5));
    await vscode.commands.executeCommand('ghProjects.refresh');
    assert.notStrictEqual(board.current?.loadedAt, first);
    board.panel.dispose();
  });

  test('status bar counts my items in "In progress" of the last opened project', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    await board.refresh();
    await api.__refreshCounter();
    // fake items: option index i % 3 === 1 is "In progress", every 10th item has no status
    const expected = Array.from({ length: 250 }, (_, i) => i).filter((i) => i % 10 !== 0 && i % 3 === 1).length;
    assert.strictEqual(api.__statusText(), `$(project) ${expected} in progress`);

    // Moving one of my "In progress" items (index 1) out of the column updates the counter.
    await board.setField('move-out', 'PVTI_1', 'F1', { kind: 'singleSelect', optionId: 'done' });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(api.__statusText(), `$(project) ${expected - 1} in progress`);
    await board.setField('move-back', 'PVTI_1', 'F1', { kind: 'singleSelect', optionId: 'doing' });
    board.panel.dispose();

    await vscode.workspace.getConfiguration('ghProjects').update('inProgressColumn', 'Done', vscode.ConfigurationTarget.Global);
    await api.__refreshCounter();
    assert.match(api.__statusText(), / done$/);
    await vscode.workspace.getConfiguration('ghProjects').update('inProgressColumn', undefined, vscode.ConfigurationTarget.Global);
  });

  test('polling is off by default', () => {
    assert.strictEqual(vscode.workspace.getConfiguration('ghProjects').get('refreshInterval'), 0);
  });
});
