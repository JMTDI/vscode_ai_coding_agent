const vscode = acquireVsCodeApi();
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');

function addMessage(text, isUser = false, isMarkdown = false) {
  const msgDiv = document.createElement('div');
  msgDiv.className = isUser ? 'message user' : 'message ai';
  if (isMarkdown) {
    msgDiv.innerHTML = marked.parse(text);
  } else {
    msgDiv.innerText = text;
  }
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

  addMessage('Thinking...', false); // Loading indicator
  const loadingMsg = messagesDiv.lastChild;

  try {
    const response = await puter.ai.chat(query, { model: 'claude-opus-4-5' });
    loadingMsg.remove();
    addMessage(response, false, true); // Render as markdown
  } catch (error) {
    loadingMsg.innerText = 'Error: ' + error.message;
  }
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendButton.click();
});
