import * as vscode from 'vscode';
import { MermaidCodeLensProvider } from './extension/codeLensProvider';
import { installDiagnosticChannel } from './extension/diagnosticChannel';
import { PanelManager } from './extension/panelManager';
import { installMermaidFence } from './preview/markdownItMermaid';
import { reportAliasCollisions } from './core';

export function activate(context: vscode.ExtensionContext) {
  const channel = installDiagnosticChannel(context);
  // Now that the sink writes to the channel, surface any registry problem that
  // was invisible at module-load time. This is the host's only diagnostic: it
  // never parses or renders, so it has nothing to clear when a document closes
  // (the webview that does render keeps its own suppressions, and drops them
  // with the panel).
  reportAliasCollisions();
  const panels = new PanelManager(context, channel);
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
