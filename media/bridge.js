// media/bridge.js
const vscode = acquireVsCodeApi();

let retryQueue = [];   // {id, query, model}

async function processQueue() {
  if (retryQueue.length === 0) return;

  const item = retryQueue.shift();
  try {
    if (!puter.auth.isSignedIn()) throw new Error('Not authenticated');

    const resp = await puter.ai.chat(item.query, { model: item.model });
    vscode.postMessage({ id: item.id, response: resp });
  } catch (err) {
    vscode.postMessage({ id: item.id, error: err.message });
  }
  // continue with next item
  setTimeout(processQueue, 100);
}

window.addEventListener('message', async (event) => {
  const msg = event.data;

  if (msg.command === 'checkAuth') {
    vscode.postMessage({ id: msg.id, signedIn: puter.auth.isSignedIn() });
    return;
  }

  if (msg.command === 'chat') {
    if (puter.auth.isSignedIn()) {
      // already signed in → normal flow
      try {
        const resp = await puter.ai.chat(msg.query, { model: msg.model });
        vscode.postMessage({ id: msg.id, response: resp });
      } catch (e) {
        vscode.postMessage({ id: msg.id, error: e.message });
      }
    } else {
      // not signed in → open popup once, then retry everything
      retryQueue.push(msg);
      if (retryQueue.length === 1) {   // only open popup once
        vscode.postMessage({ command: 'triggerAuthPopup' }); // tell extension to open popup
      }
    }
  }
});

// When the main extension tells us the popup closed → retry queue
window.addEventListener('message', (event) => {
  if (event.data?.command === 'authPopupClosed') {
    setTimeout(processQueue, 1000);   // give cookies a moment
  }
});
