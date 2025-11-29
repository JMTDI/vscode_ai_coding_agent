window.addEventListener('message', async (event) => {
  const message = event.data;
  if (message.command === 'chat') {
    try {
      const response = await puter.ai.chat(message.query, { model: message.model });
      window.vscode.postMessage({ id: message.id, response }); // Note: vscode api not needed in panel, but postMessage works via webview
    } catch (error) {
      window.vscode.postMessage({ id: message.id, error: error.message });
    }
  }
});
