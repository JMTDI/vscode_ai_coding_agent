import * as vscode from 'vscode';

let aiBridgeWebview: vscode.WebviewPanel | undefined;
let authPopupWebview: vscode.WebviewPanel | undefined;   // <-- for real popup

export function activate(context: vscode.ExtensionContext) {
  // === Chat sidebar ===
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('puterCodingAgent.chatView', chatProvider)
  );

  // === Command: Open real browser popup for Puter auth ===
  const openAuthPopup = vscode.commands.registerCommand('puter.openAuthPopup', async () => {
    // Clean up any old popup
    if (authPopupWebview) {
      authPopupWebview.dispose();
    }

    const authUrl = 'https://puter.com/?embedded_in_popup=true&request_auth=true';

    // Create a hidden webview that opens as a real popup window
    authPopupWebview = vscode.window.createWebviewPanel(
      'puterAuth',
      'Puter Sign-In',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // This makes it behave like a real popup (size, no tabs, auto-close support)
    authPopupWebview.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://js.puter.com/v2/"></script>
        <script>
          // Puter closes the window automatically after login
          window.location = "${authUrl}";
        </script>
      </head>
      <body style="margin:0">
        <div style="padding:20px;font-family:system-ui;text-align:center;">
          Redirecting to Puter sign-in...
        </div>
      </body>
      </html>`;

    // Detect when Puter closes the window (it does this after successful login)
    const checkClosed = setInterval(() => {
      if (authPopupWebview && !authPopupWebview.visible) {
        clearInterval(checkClosed);
        authPopupWebview?.dispose();
        authPopupWebview = undefined;
        // Notify chat & bridge that auth is done
        vscode.commands.executeCommand('puter.authPopupClosed');
      }
    }, 500);
  });
  context.subscriptions.push(openAuthPopup);

  // Dummy command — webviews listen for this
  const authClosedCmd = vscode.commands.registerCommand('puter.authPopupClosed', () => {
    // nothing here — main.js and bridge.js do the retry
  });
  context.subscriptions.push(authClosedCmd);

  // === Hidden AI bridge webview ===
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

  // Forward popup request from bridge
  aiBridgeWebview.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'triggerAuthPopup') {
      vscode.commands.executeCommand('puter.openAuthPopup');
    }
  });

  // === Inline completions (Copilot-style) ===
  const completionProvider = vscode.languages.registerInlineCompletionItemProvider('*', {
    async provideInlineCompletionItems(document, position) {
      const isSignedIn = await checkSignedInStatus();
      if (!isSignedIn) {
        vscode.commands.executeCommand('puter.openAuthPopup');
        return new vscode.InlineCompletionList([]);
      }

      const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
      const prompt = `Complete this code:\n${prefix}`;

      try {
        const response = await callAIViaBridge(prompt);
        if (response?.trim()) {
          return new vscode.InlineCompletionList([new vscode.InlineCompletionItem(response)]);
        }
      } catch (e: any) {
        console.error('Completion error:', e);
      }
      return new vscode.InlineCompletionList([]);
    }
  });
  context.subscriptions.push(completionProvider);
}

// === Auth status check ===
async function checkSignedInStatus(): Promise<boolean> {
  return new Promise(resolve => {
    if (!aiBridgeWebview) return resolve(false);
    const id = Math.random().toString(36);
    const listener = aiBridgeWebview.webview.onDidReceiveMessage(msg => {
      if (msg.id === id) {
        listener.dispose();
        resolve(!!msg.signedIn);
      }
    });
    aiBridgeWebview.webview.postMessage({ command: 'checkAuth', id });
  });
}

// === Call AI ===
function callAIViaBridge(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!aiBridgeWebview) return reject('Bridge not ready');

    const id = Math.random().toString(36);
    const listener = aiBridgeWebview.webview.onDidReceiveMessage(msg => {
      if (msg.id === id) {
        listener.dispose();
        msg.response ? resolve(msg.response) : reject(msg.error || 'Unknown error');
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

// === Bridge HTML ===
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

// === Chat view provider ===
class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'insertCode') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit(edit => edit.insert(editor.selection.active, msg.code));
        }
      }
    });
  }

  private _getHtml(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'marked', 'marked.min.js'));

    return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Puter Coding Agent</title>
      <link href="${styleUri}" rel="stylesheet">
      <script src="https://js.puter.com/v2/"></script>
      <script src="${markedUri}"></script>
    </head>
    <body>
      <div id="chat-container">
        <div id="messages"></div>
        <div class="input-area">
          <input type="text" id="input" placeholder="Ask anything..." />
          <button id="send">Send</button>
        </div>
      </div>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

export function deactivate() {
  aiBridgeWebview?.dispose();
  authPopupWebview?.dispose();
}
