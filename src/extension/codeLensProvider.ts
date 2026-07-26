import * as vscode from 'vscode';
import { findMermaidBlocks } from './blockLocator';

export class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findMermaidBlocks(document.getText()).map((block, index) => {
      const line = document.positionAt(block.fenceStart).line;
      return new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
        title: '◇ Open visual editor',
        command: 'ceasg.openEditor',
        arguments: [document.uri, index],
      });
    });
  }
}
