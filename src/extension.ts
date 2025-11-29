import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('puterCodingAgent.chatView', provider)
  );
}

export function deactivate() {}

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

    // Handle messages from the webview (e.g., insert code)
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

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Puter Coding Agent</title>
        <link href="${styleUri}" rel="stylesheet">
        <script src="https://js.puter.com/v2/"></script>
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
