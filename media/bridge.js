const vscode = acquireVsCodeApi();

window.addEventListener('message', async (event) => {
  const message = event.data;
  if (message.command === 'chat') {
    try {
      const response = await puter.ai.chat(message.query, { model: message.model });
      vscode.postMessage({ id: message.id, response });
    } catch (error) {
      vscode.postMessage({ id: message.id, error: error.message });
    }
  }
});
