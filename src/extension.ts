import * as vscode from 'vscode';
import { MermaidCodeLensProvider } from './extension/codeLensProvider';
import { installDiagnosticChannel } from './extension/diagnosticChannel';
import { PanelManager } from './extension/panelManager';
import { installMermaidFence } from './preview/markdownItMermaid';
import { clearDiagnostics, reportAliasCollisions } from './core';

export function activate(context: vscode.ExtensionContext) {
  const channel = installDiagnosticChannel(context);
  // Now that the sink writes to the channel, surface any registry problem that
  // was invisible at module-load time.
  reportAliasCollisions();
  const panels = new PanelManager(context, channel);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, new MermaidCodeLensProvider()),
    vscode.commands.registerCommand('ceasg.openEditor', (uri: vscode.Uri, blockIndex: number) => {
      void panels.open(uri, blockIndex);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => panels.handleSave(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => clearDiagnostics(doc.uri.toString())),
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
