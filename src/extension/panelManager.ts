import * as vscode from 'vscode';
import { HostToWebview, WebviewToHost, isUpdateMessage, isReadyMessage, PaneMode } from '../shared/messages';
import { findMermaidBlocks } from './blockLocator';
import { ensureBlockId } from './blockText';
import { computeInnerEdit, locateById } from './documentSync';
import { getWebviewHtml } from './webviewHtml';

interface Session {
  panel: vscode.WebviewPanel;
  documentUri: vscode.Uri;
  blockId: string;
  version: number;
  init: HostToWebview;
}

function randomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) { id += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return id;
}

// Phase 5 replaces this with modeForType(type). Phase 0 forces preview for every block.
function modeForBlock(_type: string): PaneMode { return 'preview'; }

export class PanelManager {
  private sessions = new Map<string, Session>();
  constructor(private readonly context: vscode.ExtensionContext) {}

  private key(uri: vscode.Uri, blockId: string): string { return `${uri.toString()}#${blockId}`; }

  async open(documentUri: vscode.Uri, blockIndex: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const block = findMermaidBlocks(document.getText())[blockIndex];
    if (!block) { return; }

    let blockId = block.id;
    if (!blockId) {
      blockId = randomId();
      const edit = new vscode.WorkspaceEdit();
      const withId = ensureBlockId(block.source, blockId);
      edit.replace(
        documentUri,
        new vscode.Range(document.positionAt(block.innerStart), document.positionAt(block.innerEnd)),
        withId.endsWith('\n') ? withId : withId + '\n',
      );
      await vscode.workspace.applyEdit(edit);
    }

    const key = this.key(documentUri, blockId);
    const existing = this.sessions.get(key);
    if (existing) { existing.panel.reveal(vscode.ViewColumn.Beside); return; }

    const current = locateById((await vscode.workspace.openTextDocument(documentUri)).getText(), blockId);
    const source = current ? current.source : block.source;
    const mode = modeForBlock(block.type);

    const panel = vscode.window.createWebviewPanel(
      'ceasgEditor', 'Mermaid Editor', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] },
    );

    const session: Session = { panel, documentUri, blockId, version: 0,
      init: { type: 'init', mode, source, version: 0 } };
    this.sessions.set(key, session);

    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);
    panel.onDidDispose(() => this.sessions.delete(key), null, this.context.subscriptions);

    panel.webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      if (isReadyMessage(msg)) { panel.webview.postMessage(session.init); return; }
      if (isUpdateMessage(msg)) {
        session.version = msg.version;
        const doc = await vscode.workspace.openTextDocument(documentUri);
        const e = computeInnerEdit(doc.getText(), blockId, msg.source);
        if (!e) { return; }
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.replace(documentUri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.replacement);
        await vscode.workspace.applyEdit(wsEdit);
      }
    }, null, this.context.subscriptions);
  }

  handleSave(document: vscode.TextDocument): void {
    for (const session of this.sessions.values()) {
      if (session.documentUri.toString() !== document.uri.toString()) { continue; }
      const block = locateById(document.getText(), session.blockId);
      if (!block) { continue; }
      const msg: HostToWebview = { type: 'externalUpdate', source: block.source, version: session.version };
      session.panel.webview.postMessage(msg);
    }
  }
}
