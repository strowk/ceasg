import * as vscode from 'vscode';
import { formatDiagnostic, setDiagnosticSink } from '../core';
import type { Diagnostic } from '../core';

/** Append one diagnostic to the ceasg output channel. */
export function appendDiagnostic(channel: vscode.OutputChannel, d: Diagnostic): void {
  channel.appendLine(formatDiagnostic(d));
}

/**
 * Create the ceasg output channel and route extension-host diagnostics to it.
 * The WYSIWYG webview reaches this channel by posting a `diagnostic` message,
 * which PanelManager forwards. The Markdown preview has no channel back to the
 * host, so its warnings stay on the preview's console.
 */
export function installDiagnosticChannel(
  context: vscode.ExtensionContext,
): vscode.OutputChannel {
  const channel = vscode.window.createOutputChannel('ceasg');
  context.subscriptions.push(channel);
  setDiagnosticSink((d) => appendDiagnostic(channel, d));
  return channel;
}
