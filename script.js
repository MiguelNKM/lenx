// DOM Elements
const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');
const menuButton = document.getElementById('menuButton');
const closeSidebar = document.querySelector('.close-sidebar');
const newChatButton = document.getElementById('newChatButton');
const chatList = document.getElementById('chatList');
const chatHistory = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const voiceButton = document.getElementById('voiceButton');
const voiceRecording = document.getElementById('voiceRecording');
const scrollToBottom = document.getElementById('scrollToBottom');
const loadingIndicator = document.getElementById('loadingIndicator');
const aboutButton = document.getElementById('aboutButton');
const aboutModal = document.getElementById('aboutModal');
const closeAbout = document.getElementById('closeAbout');

// App State
let currentChatId = null;
let chatHistoryData = [];
let isRecording = false;
let recognition = null;

// Initialize the app
window.addEventListener('DOMContentLoaded', () => {
  updateChatList();
  setupEventListeners();
  autoResizeTextarea();

  const chats = JSON.parse(localStorage.getItem('chats') || '{}'); // ✅ fixed
  const mostRecentChat = Object.entries(chats).sort(([, a], [, b]) => b.timestamp - a.timestamp)[0];
  if (mostRecentChat) {
    loadChat(mostRecentChat[0]);
  }
});

function setupEventListeners() {
  menuButton.addEventListener('click', toggleSidebar);
  closeSidebar.addEventListener('click', toggleSidebar);
  newChatButton.addEventListener('click', startNewChat);
  sendButton.addEventListener('click', handleSendMessage);

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  voiceButton.addEventListener('click', toggleVoiceRecording);
  scrollToBottom.addEventListener('click', scrollChatToBottom);
  aboutButton.addEventListener('click', () => aboutModal.style.display = 'block');
  closeAbout.addEventListener('click', () => aboutModal.style.display = 'none');

  window.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.style.display = 'none';

    if (window.innerWidth < 768 && !sidebar.contains(e.target) && 
        e.target !== menuButton && sidebar.classList.contains('active')) {
      toggleSidebar();
    }
  });
}

function toggleSidebar() {
  sidebar.classList.toggle('active');
  main.classList.toggle('sidebar-open');
}

function startNewChat() {
  currentChatId = Date.now().toString();
  chatHistoryData = [];
  chatHistory.innerHTML = '';
  userInput.value = '';
  userInput.focus();

  if (window.innerWidth < 768) {
    toggleSidebar();
  }
}

async function handleSendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  if (!currentChatId) startNewChat();

  appendMessage('user', message);
  chatHistoryData.push({ role: 'user', content: message });
  userInput.value = '';
  autoResizeTextarea();

  loadingIndicator.style.display = 'flex';
  scrollChatToBottom();

  try {
    const response = await getAIResponse(chatHistoryData);
    appendMessage('assistant', response);
    chatHistoryData.push({ role: 'assistant', content: response });
    saveChatToLocalStorage();
    updateChatList();
  } catch (error) {
    console.error('Error:', error);
    appendMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
  } finally {
    loadingIndicator.style.display = 'none';
    scrollChatToBottom();
  }
}

function appendMessage(role, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role}`;
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.innerHTML = `
    <div class="message-avatar">
      ${role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-sender">${role === 'user' ? 'You' : 'Len X'}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      <div class="message-text">${formatMessage(content)}</div>
      ${role === 'assistant' ? `
        <div class="message-actions">
          <button class="message-action" onclick="speakText(this.parentElement.parentElement.querySelector('.message-text').textContent)">
            <i class="fas fa-volume-up"></i> Speak
          </button>
          <button class="message-action" onclick="copyToClipboard(this)">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
      ` : ''}
    </div>
  `;

  chatHistory.appendChild(messageDiv);
  scrollChatToBottom();
}

function formatMessage(message) {
  if (!message) return '';

  return message
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^-{3,}/gm, '<hr>')
    .replace(/^\d+\.\s(.*$)/gm, '<li>$1</li>')
    .replace(/^\-\s(.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^>\s(.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, ' ');
}

async function getAIResponse(history) {
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const API_KEY = 'Bearer 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';
  const models = [
    "deepseek/deepseek-r1-0528:free",
    "mistralai/mistral-7b-instruct:free"
  ];

  for (let model of models) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'Len X'
        },
        body: JSON.stringify({ 
          model, 
          messages: history, 
          temperature: 0.7, 
          max_tokens: 1000 
        })
      });

      if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
    } catch (err) {
      console.warn(`Model ${model} failed:`, err);
    }
  }
  throw new Error("All model requests failed. Please try again later.");
}

function saveChatToLocalStorage() {
  if (!currentChatId) return;

  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  chats[currentChatId] = {
    history: chatHistoryData,
    name: getChatName(chatHistoryData),
    timestamp: Date.now()
  };
  localStorage.setItem('chats', JSON.stringify(chats));
}

function getChatName(history) {
  const firstUserMessage = history.find(m => m.role === 'user');
  return firstUserMessage ? 
    firstUserMessage.content.split('\n')[0].substring(0, 50) : 
    'New Chat';
}

function updateChatList() {
  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  chatList.innerHTML = '';

  Object.entries(chats)
    .sort(([, a], [, b]) => b.timestamp - a.timestamp)
    .forEach(([id, chat]) => {
      const li = document.createElement('li');
      li.className = `chat-item ${id === currentChatId ? 'active' : ''}`;
      li.innerHTML = `
        <span class="chat-item-name">${chat.name}</span>
        <button class="chat-item-delete" data-chat-id="${id}"><i class="fas fa-trash"></i></button>
      `;

      li.addEventListener('click', () => loadChat(id));
      li.querySelector('.chat-item-delete').addEventListener('click', e => {
        e.stopPropagation();
        deleteChat(id);
      });

      chatList.appendChild(li);
    });
}

function loadChat(id) {
  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  const chat = chats[id];

  if (chat) {
    currentChatId = id;
    chatHistoryData = [...(chat.history || [])];
    chatHistory.innerHTML = '';

    chatHistoryData.forEach(m => appendMessage(m.role, m.content));
    scrollChatToBottom();

    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  }
}

function deleteChat(id) {
  if (!confirm('Are you sure you want to delete this chat?')) return;

  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  delete chats[id];
  localStorage.setItem('chats', JSON.stringify(chats));

  if (currentChatId === id) {
    startNewChat();
  }

  updateChatList();
}

function toggleVoiceRecording() {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    return;
  }

  isRecording ? stopVoiceRecording() : startVoiceRecording();
}

function startVoiceRecording() {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    voiceRecording.style.display = 'flex';
    voiceButton.innerHTML = '<i class="fas fa-stop"></i>';
    voiceButton.classList.add('recording');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    autoResizeTextarea();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    stopVoiceRecording();
    if (event.error === 'not-allowed') {
      alert('Microphone access denied. Please allow microphone access.');
    }
  };

  recognition.onend = () => {
    if (isRecording) stopVoiceRecording();
  };

  recognition.start();
}

function stopVoiceRecording() {
  isRecording = false;
  if (recognition) recognition.stop();
  recognition = null;
  voiceRecording.style.display = 'none';
  voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
  voiceButton.classList.remove('recording');
}

function scrollChatToBottom() {
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = `${Math.min(userInput.scrollHeight, 200)}px`;
}

// Global Utilities
window.speakText = function(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
  } else {
    alert('Text-to-speech not supported in this browser.');
  }
};

window.copyToClipboard = function(button) {
  const text = button.closest('.message-content').querySelector('.message-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => {
      button.innerHTML = original;
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
    alert('Failed to copy. Try again.');
  });
};
