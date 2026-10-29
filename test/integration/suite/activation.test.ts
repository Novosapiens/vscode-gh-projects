import * as assert from 'node:assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'novosapiens.gh-vs-projects-board';

suite('activation', () => {
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'extension is installed in the development host');
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['ghProjects.signIn', 'ghProjects.refresh', 'ghProjects.addOwner', 'ghProjects.openBoard', 'ghProjects.openLastBoard']) {
      assert.ok(commands.includes(id), `command ${id} is registered`);
    }
  });
});
