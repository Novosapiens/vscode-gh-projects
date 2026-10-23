import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createFakeApi, detailRequests, failures, items, projects, writes } from './fakeApi';

interface Board {
  projectId: string;
  current?: { items: { id: string; fieldValues: Record<string, { optionId?: string }> }[]; viewId?: string; filter: { text: string; labels: string[] } };
  refresh(): Promise<void>;
  setFilter(filter: unknown): Promise<void>;
  setField(requestId: string, itemId: string, fieldId: string, input: unknown): Promise<boolean>;
  loadDetail(itemId: string): Promise<void>;
  openInPrExtension(itemId: string): Promise<boolean>;
  panel: vscode.WebviewPanel;
}
interface Api {
  __setApiFactory(factory: () => unknown): void;
  __boards(): Board[];
}

suite('board webview', () => {
  let api: Api;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<Api>('guilletin63.vscode-gh-projects');
    assert.ok(ext);
    api = await ext.activate();
    api.__setApiFactory(createFakeApi);
  });

  test('opens one panel per project and loads every item', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    assert.ok(board, 'openBoard returns the panel');
    await board.refresh();
    assert.strictEqual(board.current?.items.length, items.length);
    assert.strictEqual(board.current?.viewId, 'V1', 'defaults to the board view');
    assert.strictEqual(board.panel.webview.options.enableScripts, true);
    assert.match(board.panel.webview.html, /Content-Security-Policy/);
    assert.match(board.panel.webview.html, /script-src 'nonce-[A-Za-z0-9_-]+'/);
    assert.doesNotMatch(board.panel.webview.html, /<script(?![^>]*nonce=)/, 'every script carries the nonce');

    const again = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    assert.strictEqual(again, board, 'reuses the existing panel');
    assert.strictEqual(api.__boards().length, 1);
    board.panel.dispose();
    assert.strictEqual(api.__boards().length, 0);
  });

  test('remembers the filter per project in workspaceState', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    await board.refresh();
    assert.deepStrictEqual(board.current?.filter.labels, []);
    await board.setFilter({ text: 'login', labels: ['bug'], assignees: [], fields: {} });
    board.panel.dispose();

    const reopened = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    assert.notStrictEqual(reopened, board);
    await reopened.refresh();
    assert.strictEqual(reopened.current?.filter.text, 'login');
    assert.deepStrictEqual(reopened.current?.filter.labels, ['bug']);
    await reopened.setFilter({ text: '', labels: [], assignees: [], fields: {} });
    reopened.panel.dispose();
  });

  test('moves a card by writing the column field, and keeps state on failure', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    await board.refresh();
    const ok = await board.setField('r1', 'PVTI_1', 'F1', { kind: 'singleSelect', optionId: 'done' });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(writes.at(-1), { itemId: 'PVTI_1', fieldId: 'F1', input: { kind: 'singleSelect', optionId: 'done' } });
    assert.strictEqual(board.current?.items.find((i) => i.id === 'PVTI_1')?.fieldValues.F1?.optionId, 'done');

    failures.next = true;
    const failed = await board.setField('r2', 'PVTI_1', 'F1', { kind: 'singleSelect', optionId: 'todo' });
    assert.strictEqual(failed, false);
    assert.strictEqual(board.current?.items.find((i) => i.id === 'PVTI_1')?.fieldValues.F1?.optionId, 'done', 'host state unchanged');

    const invalid = await board.setField('r3', 'PVTI_1', 'F1', { kind: 'singleSelect', optionId: 'nope' });
    assert.strictEqual(invalid, false, 'unknown options are rejected before calling GitHub');
    board.panel.dispose();
  });

  test('loads item details and only offers GitHub Pull Requests when installed', async () => {
    const project = projects['octo-user']?.[0];
    const board = (await vscode.commands.executeCommand('ghProjects.openBoard', { project })) as Board;
    await board.refresh();
    await board.loadDetail('PVTI_3');
    assert.strictEqual(detailRequests.at(-1), 'PVTI_3');
    const installed = vscode.extensions.getExtension('GitHub.vscode-pull-request-github') !== undefined;
    assert.strictEqual(await board.openInPrExtension('PVTI_3'), installed ? true : false);
    board.panel.dispose();
  });
});
