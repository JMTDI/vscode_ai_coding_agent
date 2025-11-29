const vscode = acquireVsCodeApi();
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');

function addMessage(text, isUser = false) {
  const msgDiv = document.createElement('div');
  msgDiv.className = isUser ? 'message user' : 'message ai';
  msgDiv.innerText = text;
  if (!isUser) {
    const insertBtn = document.createElement('button');
    insertBtn.innerText = 'Insert Code';
    insertBtn.onclick = () => vscode.postMessage({ command: 'insertCode', code: text });
    msgDiv.appendChild(insertBtn);
  }
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

sendButton.addEventListener('click', async () => {
  const query = input.value.trim();
  if (!query) return;
  addMessage(query, true);
  input.value = '';

  try {
    const response = await puter.ai.chat(query, { model: 'claude-opus-4-5' });
    addMessage(response);
  } catch (error) {
    addMessage('Error: ' + error.message);
  }
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendButton.click();
});
