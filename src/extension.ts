import * as vscode from 'vscode';
import { MermaidCodeLensProvider } from './extension/codeLensProvider';
import { PanelManager } from './extension/panelManager';

export function activate(context: vscode.ExtensionContext) {
  const panels = new PanelManager(context);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new MermaidCodeLensProvider()),
    vscode.commands.registerCommand('ceasg.openEditor', (uri: vscode.Uri, blockIndex: number) => {
      void panels.open(uri, blockIndex);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => panels.handleSave(doc)),
  );
}

export function deactivate() {}
