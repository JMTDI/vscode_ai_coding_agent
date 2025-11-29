import * as vscode from 'vscode';

let aiBridgeWebview: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Chat view provider
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('puterCodingAgent.chatView', chatProvider)
  );

  // Create hidden webview for AI bridge
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

  // Inline completion provider
  const completionProvider = vscode.languages.registerInlineCompletionItemProvider('*', {
    async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken) {
      const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
      const prompt = `Complete the following code:\n${prefix}\n`; // Simple prompt; customize as needed
      const response = await callAIViaBridge(prompt);
      if (response) {
        return new vscode.InlineCompletionList([new vscode.InlineCompletionItem(response)]);
      }
      return new vscode.InlineCompletionList([]);
    }
  });
  context.subscriptions.push(completionProvider);
}

export function deactivate() {
  if (aiBridgeWebview) {
    aiBridgeWebview.dispose();
  }
}

// Function to call AI via the hidden webview bridge
function callAIViaBridge(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!aiBridgeWebview) {
      reject('AI bridge not initialized');
      return;
    }

    const id = Math.random().toString(36).substring(7);
    const listener = aiBridgeWebview.webview.onDidReceiveMessage((message) => {
      if (message.id === id && message.response) {
        listener.dispose();
        resolve(message.response);
      } else if (message.error) {
        listener.dispose();
        reject(message.error);
      }
    });

    aiBridgeWebview.webview.postMessage({ command: 'chat', query, id, model: 'claude-opus-4-5' });
  });
}

// HTML for hidden AI bridge webview
function getAIBridgeHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'bridge.js'));
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://js.puter.com/v2/"></script>
    </head>
    <body>
      <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

// Chat view remains similar
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

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'insertCode') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, message.code);
          });
        } else {
          vscode.window.showErrorMessage('No active editor to insert code.');
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'marked', 'marked.min.js')); // Add marked dep

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
          <input type="text" id="input" placeholder="Ask for code help..." />
          <button id="send">Send</button>
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
