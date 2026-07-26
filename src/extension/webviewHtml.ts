import * as vscode from 'vscode';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) { t += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return t;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
</head><body>
<div id="app"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
}
