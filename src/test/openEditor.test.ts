import * as assert from 'assert';
import * as vscode from 'vscode';

suite('openEditor', () => {
  test('assigns a ceasg id on first open', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown', content: '```mermaid\ngraph TD\n  A --> B\n```\n',
    });
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('ceasg.openEditor', doc.uri, 0);
    let text = '';
    for (let i = 0; i < 20; i++) {
      text = doc.getText();
      if (/%%\s*ceasg:/.test(text)) { break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(/%%\s*ceasg:\{"id":"[a-z0-9]{8}"\}\s*%%/.test(text), `no id comment in:\n${text}`);
  });
});
