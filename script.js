const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettings = document.getElementById('close-settings');
const usernameSetting = document.getElementById('username-setting');
const clearChatBtn = document.getElementById('clear-chat-btn');

// Ссылка на твой сервер на Render
const SERVER_URL = "https://flare-chat-e89g.onrender.com";

// Загрузка настроек из памяти
let userName = localStorage.getItem('flare_name') || "Пользователь";
if(usernameSetting) usernameSetting.value = userName;

// Открытие/закрытие настроек
if (settingsBtn) {
    settingsBtn.onclick = () => settingsPanel.classList.remove('hidden');
}
if (closeSettings) {
    closeSettings.onclick = () => {
        settingsPanel.classList.add('hidden');
        userName = usernameSetting.value || "Пользователь";
        localStorage.setItem('flare_name', userName);
    };
}

// Очистка чата
if (clearChatBtn) {
    clearChatBtn.onclick = () => {
        if (confirm("Точно удалить всю историю?")) {
            messagesDiv.innerHTML = '<div class="message ai">История очищена. Чем помочь?</div>';
        }
    };
}

// Отправка сообщения
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    const loadingMsg = addMessage("Flare-Ai думает...", 'ai');

    try {
        const response = await fetch(`${SERVER_URL}/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: `[Пользователь: ${userName}] ${text}` })
        });

        if (!response.ok) throw new Error("Ошибка сервера");

        const data = await response.json();
        loadingMsg.remove();
        addMessage(data.reply, 'ai');

    } catch (error) {
        loadingMsg.remove();
        addMessage("Ошибка: не могу достучаться до сервера. Render спит?", 'ai');
    }
}

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return msgDiv;
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}
if (userInput) {
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}
