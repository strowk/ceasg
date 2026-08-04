import * as vscode from 'vscode';
import {
  HostToWebview, WebviewToHost, isUpdateMessage, isReadyMessage, isDiagnosticMessage,
} from '../shared/messages';
import { findMermaidBlocks, modeForType } from './blockLocator';
import { ensureBlockId } from './blockText';
import { computeInnerEdit, locateById, sameMermaidSource } from './documentSync';
import { getWebviewHtml } from './webviewHtml';
import type { Diagnostic } from '../core';
import { appendDiagnostic } from './diagnosticChannel';

interface Session {
  panel: vscode.WebviewPanel;
  documentUri: vscode.Uri;
  blockId: string;
  version: number;
  init: HostToWebview;
  lastWebviewSource: string;
}

function randomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) { id += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return id;
}

export class PanelManager {
  private sessions = new Map<string, Session>();
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
  ) {}

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
    const mode = modeForType(block.type);

    const panel = vscode.window.createWebviewPanel(
      'ceasgEditor', 'Mermaid Editor', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] },
    );

    const session: Session = { panel, documentUri, blockId, version: 0,
      init: { type: 'init', mode, source, version: 0 }, lastWebviewSource: '' };
    this.sessions.set(key, session);
    // No diagnostic scope is set here. Core's dedupe state is a module global,
    // and every diagnostic that dedupe exists for (`unknown-shape` and friends)
    // is raised while parsing or rendering — which happens only in the webview,
    // a separate realm with its own copy of that global. So suppressions are
    // already per webview instance, i.e. per document and block, and they are
    // discarded with the panel; a scope set on the host's copy could neither
    // reach them nor be cleared into them.
    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);

    const disposables: vscode.Disposable[] = [];

    disposables.push(panel.webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      if (isDiagnosticMessage(msg)) {
        appendDiagnostic(this.channel, {
          code: msg.code as Diagnostic['code'],
          key: msg.key,
          message: msg.message,
          detail: msg.detail,
        });
        return;
      }
      if (isReadyMessage(msg)) { panel.webview.postMessage(session.init); return; }
      if (isUpdateMessage(msg)) {
        session.version = msg.version;
        session.lastWebviewSource = msg.source;
        const doc = await vscode.workspace.openTextDocument(documentUri);
        const e = computeInnerEdit(doc.getText(), blockId, msg.source);
        if (!e) { return; }
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.replace(documentUri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.replacement);
        await vscode.workspace.applyEdit(wsEdit);
      }
    }));

    panel.onDidDispose(() => {
      this.sessions.delete(key);
      disposables.forEach((d) => d.dispose());
    });
  }

  handleSave(document: vscode.TextDocument): void {
    for (const session of this.sessions.values()) {
      if (session.documentUri.toString() !== document.uri.toString()) { continue; }
      const block = locateById(document.getText(), session.blockId);
      if (!block) {
        const msg: HostToWebview = { type: 'blockRemoved' };
        session.panel.webview.postMessage(msg);
        continue;
      }
      if (sameMermaidSource(block.source, session.lastWebviewSource)) { continue; }
      const msg: HostToWebview = { type: 'externalUpdate', source: block.source, version: session.version };
      session.panel.webview.postMessage(msg);
    }
  }
}
