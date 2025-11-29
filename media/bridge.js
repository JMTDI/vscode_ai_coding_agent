const vscode = acquireVsCodeApi();

window.addEventListener('message', async (event) => {
  const message = event.data;
  const id = message.id;

  if (message.command === 'checkAuth') {
    try {
      const signedIn = puter.auth.isSignedIn();
      vscode.postMessage({ id, signedIn });
    } catch (error) {
      vscode.postMessage({ id, signedIn: false, error: error.message });
    }
    return;
  }

  if (message.command === 'chat') {
    try {
      if (!puter.auth.isSignedIn()) {
        vscode.postMessage({ id, error: 'Not signed in. Use command palette: Puter: Sign In' });
        return;
      }
      const response = await puter.ai.chat(message.query, { model: message.model });
      vscode.postMessage({ id, response });
    } catch (error) {
      vscode.postMessage({ id, error: error.message });
    }
  }
});
