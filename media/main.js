// media/main.js
const vscode = acquireVsCodeApi();
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');

let pendingQuery = null;          // stores the query while we wait for auth
let retryAfterAuth = false;       // tells us to retry when popup closes

function addMessage(text, isUser = false, isMarkdown = false) {
  const div = document.createElement('div');
  div.className = isUser ? 'message user' : 'message ai';
  if (isMarkdown) div.innerHTML = marked.parse(text);
  else div.innerText = text;

  if (!isUser) {
    const btn = document.createElement('button');
    btn.innerText = 'Insert';
    btn.onclick = () => vscode.postMessage({ command: 'insertCode', code: text });
    div.appendChild(btn);
  }
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Main send handler
async function trySend() {
  const query = input.value.trim();
  if (!query) return;
  addMessage(query, true);
  input.value = '';
  pendingQuery = query;

  if (puter.auth.isSignedIn()) {
    await doAiCall(query);
  } else {
    addMessage('Opening Puter sign-in popup…', false);
    retryAfterAuth = true;
    vscode.commands.executeCommand('puter.openAuthPopup');
  }
}

async function doAiCall(query) {
  addMessage('Thinking…', false);
  const thinking = messagesDiv.lastChild;

  try {
    const resp = await puter.ai.chat(query, { model: 'claude-opus-4-5' });
    thinking.remove();
    addMessage(resp, false, true);
  } catch (e) {
    thinking.remove();
    addMessage('Error: ' + e.message, false);
  }
}

// Listen for the popup closing → retry the pending query
window.addEventListener('message', (event) => {
  if (event.data?.command === 'authPopupClosed' && retryAfterAuth && pendingQuery) {
    retryAfterAuth = false;
    // Small delay so cookies are fully set
    setTimeout(() => doAiCall(pendingQuery), 800);
    pendingQuery = null;
  }
});

// Hook up UI
sendButton.onclick = trySend;
input.addEventListener('keypress', e => { if (e.key === 'Enter') trySend(); });
