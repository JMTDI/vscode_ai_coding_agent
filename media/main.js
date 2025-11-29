// media/main.js
const vscode = acquireVsCodeApi();
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');

let isWaitingForAuth = false;

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

async function sendMessage() {
  if (isWaitingForAuth) return;   // prevent spam

  const query = input.value.trim();
  if (!query) return;

  addMessage(query, true);
  input.value = '';

  // If already signed in → normal flow
  if (puter.auth.isSignedIn()) {
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
    return;
  }

  // Not signed in → open popup exactly once
  if (!isWaitingForAuth) {
    isWaitingForAuth = true;
    addMessage('Opening Puter sign-in popup…', false);
    vscode.commands.executeCommand('puter.openAuthPopup');
  }
}

// Listen for popup closed → retry the last query automatically
window.addEventListener('message', (event) => {
  if (event.data?.command === 'authPopupClosed' && isWaitingForAuth) {
    isWaitingForAuth = false;
    addMessage('Signed in! Retrying your request…', false);
    // small delay so cookies are fully set
    setTimeout(() => {
      const lastUserMsg = [...messagesDiv.querySelectorAll('.user')].pop()?.innerText || 'hi';
      sendMessage();   // retry with last message
    }, 1000);
  }
});

sendButton.onclick = sendMessage;
input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
