import * as vscode from 'vscode';

let aiBridgeWebview: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // === Register the Chat Sidebar View ===
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('puterCodingAgent.chatView', chatProvider)
  );

  // === Command: Open real browser popup for Puter auth ===
  const openAuthPopup = vscode.commands.registerCommand('puter.openAuthPopup', async () => {
    const authUrl = 'https://puter.com/?embedded_in_popup=true&request_auth=true';

    // Open a real browser popup (not a VS Code panel)
    const popup = window.open(
      authUrl,
      'puterAuthPopup',
      'width=500,height=700,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
      vscode.window.showErrorMessage('Popup blocked. Allow popups or manually visit: ' + authUrl);
      return;
    }

    // Poll every 500ms to detect when Puter closes the popup (it does this after login)
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        // Notify both webviews that auth is done
        vscode.commands.executeCommand('puter.authPopupClosed');
      }
    }, 500);

    // Optional: auto-close check after 5 minutes if something goes wrong
    setTimeout(() => {
      if (!popup.closed) {
        clearInterval(checkClosed);
      }
    }, 5 * 60 * 1000);
  });
  context.subscriptions.push(openAuthPopup);

  // === Dummy command just to notify webviews that popup closed ===
  const authClosedCmd = vscode.commands.registerCommand('puter.authPopupClosed', () => {
    // The actual work is done in main.js and bridge.js
  });
  context.subscriptions.push(authClosedCmd);

  // === Create hidden AI bridge webview (for inline completions & auth checks) ===
  aiBridgeWebview = vscode.window.createWebviewPanel(
    'puterAIBridge',
    'Puter AI Bridge',
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    }
  );
  aiBridgeWebview.webview.html = getAIBridgeHtml(aiBridgeWebview.webview, context.extensionUri);
  context.subscriptions.push(aiBridgeWebview);

  // Forward popup request from bridge to main extension
  aiBridgeWebview.webview.onDidReceiveMessage((msg) => {
    if (msg.command === 'triggerAuthPopup') {
      vscode.commands.executeCommand('puter.openAuthPopup');
    }
  });

  // === Inline Completion Provider (like Copilot) ===
  const completionProvider = vscode.languages.registerInlineCompletionItemProvider('*', {
    async provideInlineCompletionItems(document, position, context, token) {
      const isSignedIn = await checkSignedInStatus();
      if (!isSignedIn) {
        // Trigger auth only once
        vscode.commands.executeCommand('puter.openAuthPopup');
        return new vscode.InlineCompletionList([]);
      }

      const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
      const prompt = `Complete this code:\n${prefix}`;

      try {
        const response = await callAIViaBridge(prompt);
        if (response && response.trim()) {
          return new vscode.InlineCompletionList([
            new vscode.InlineCompletionItem(response)
          ]);
        }
      } catch (err: any) {
        console.error('Inline completion error:', err);
      }
      return new vscode.InlineCompletionList([]);
    }
  });
  context.subscriptions.push(completionProvider);
}

// === Check if user is already signed in ===
async function checkSignedInStatus(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!aiBridgeWebview) {
      resolve(false);
      return;
    }
    const id = Math.random().toString(36).substring(7);
    const listener = aiBridgeWebview.webview.onDidReceiveMessage((msg) => {
      if (msg.id === id) {
        listener.dispose();
        resolve(!!msg.signedIn);
      }
    });
    aiBridgeWebview.webview.postMessage({ command: 'checkAuth', id });
  });
}

// === Call AI via hidden bridge webview ===
function callAIViaBridge(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!aiBridgeWebview) {
      reject('AI bridge not ready');
      return;
    }

    const id = Math.random().toString(36).substring(7);
    const listener = aiBridgeWebview.webview.onDidReceiveMessage((msg) => {
      if (msg.id === id) {
        listener.dispose();
        if (msg.response) resolve(msg.response);
        else reject(msg.error || 'Unknown error');
      }
    });

    aiBridgeWebview.webview.postMessage({
      command: 'chat',
      query,
      id,
      model: 'claude-opus-4-5'
    });
  });
}

// === HTML for the hidden AI bridge webview ===
function getAIBridgeHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'bridge.js'));
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <script src="https://js.puter.com/v2/"></script>
    </head>
    <body>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

// === Chat Sidebar Webview ===
class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle insert code
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'insertCode') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, message.code);
          });
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri. joinPath(this._extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'marked', 'marked.min.js'));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Puter Coding Agent</title>
      <link href="${styleUri}" rel="stylesheet">
      <script src="https://js.puter.com/v2/"></script>
      <script src="${markedUri}"></script>
    </head>
    <body>
      <div id="chat-container">
        <div id="messages"></div>
        <div class="input-area">
          <input type="text" id="input" placeholder="Ask for code, fixes, explanations..." />
          <button id="send">Send</button>
        </div>
      </div>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

export function deactivate() {
  if (aiBridgeWebview) {
    aiBridgeWebview.dispose();
  }
}
