import * as vscode from 'vscode';
import { MermaidCodeLensProvider } from './extension/codeLensProvider';
import { PanelManager } from './extension/panelManager';
import { installMermaidFence } from './preview/markdownItMermaid';

export function activate(context: vscode.ExtensionContext) {
  const panels = new PanelManager(context);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new MermaidCodeLensProvider()),
    vscode.commands.registerCommand('ceasg.openEditor', (uri: vscode.Uri, blockIndex: number) => {
      void panels.open(uri, blockIndex);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => panels.handleSave(doc)),
  );

  return {
    extendMarkdownIt(md: unknown) {
      const enabled = () =>
        vscode.workspace.getConfiguration('ceasg').get<string>('previewRendering', 'on') !== 'off';
      return installMermaidFence(md as Parameters<typeof installMermaidFence>[0], enabled);
    },
  };
}

export function deactivate() {}
