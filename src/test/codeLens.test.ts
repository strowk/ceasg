import * as assert from 'assert';
import * as vscode from 'vscode';

suite('CodeLens', () => {
  test('one openEditor lens per mermaid block', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown', content: '# T\n\n```mermaid\ngraph TD\n  A --> B\n```\n\ntext\n',
    });
    await vscode.window.showTextDocument(doc);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>('vscode.executeCodeLensProvider', doc.uri);
    assert.ok(lenses && lenses.length === 1, `expected 1 lens, got ${lenses?.length}`);
    assert.strictEqual(lenses[0].command?.command, 'ceasg.openEditor');
  });
});
