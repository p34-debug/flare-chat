const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = {}; 
const onlineUsers = new Set(); 
let messages = []; 
const userMessageHistory = {}; 

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('login', (data) => {
    const { username, password } = data;
    if (!users[username]) {
      users[username] = password;
    } else if (users[username] !== password) {
      socket.emit('login error', 'Неверный пароль!');
      return;
    }
    currentUser = username;
    socket.currentUser = username;
    onlineUsers.add(username);
    onlineUsers.add("FLARE-desk");
    socket.emit('login success', username);
    socket.emit('chat history', messages);
    io.emit('online users', Array.from(onlineUsers));
  });

  socket.on('get history', () => {
    socket.emit('chat history', messages);
  });

  socket.on('chat message', (data) => {
    if (!currentUser) return; // Защита от Null
    const msg = { 
      user: currentUser, 
      text: data.text, 
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) 
    };
    messages.push(msg); 
    io.emit('chat message', msg);
  });

  socket.on('private message', (data) => {
    if (!currentUser) return; // Защита от Null

    const recipientSocket = Array.from(io.sockets.sockets.values()).find(s => s.currentUser === data.to);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    const msgData = { from: currentUser, to: data.to, text: data.text, time: time };

    if (data.to === 'FLARE-desk') {
      socket.emit('private message', msgData); 
      
      setTimeout(() => {
        let botReply = getBotResponse(data.text, currentUser);
        
        if (botReply === "КАЗИНО_ТРИГГЕР") {
           const slot1 = Math.floor(Math.random() * 3);
           const slot2 = Math.floor(Math.random() * 3);
           const slot3 = Math.floor(Math.random() * 3);
           
           const symbols = ['Х', 'У', 'Й'];
           const res = [symbols[slot1], symbols[slot2], symbols[slot3]];
           
           let winText = `🎰 [ ${res[0]} | ${res[1]} | ${res[2]} ]\n\n`;
           if (slot1 === 0 && slot2 === 1 && slot3 === 2) {
             winText += "🎉 ДЖЕКПОТ! ТЫ СОБРАЛ ХУЙ! Поздравляю, ты официально крутой!";
           } else {
             winText += "❌ Не повезло. Попробуй еще раз!";
           }
           
           socket.emit('private message', {
             from: "FLARE-desk", to: currentUser, text: winText,
             time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
           });
           return;
        }

        socket.emit('private message', {
          from: "FLARE-desk",
          to: currentUser,
          text: botReply,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        });
      }, 1000);
      
      return;
    }

    if (recipientSocket) recipientSocket.emit('private message', msgData);
    socket.emit('private message', msgData);
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers.delete(currentUser);
      io.emit('online users', Array.from(onlineUsers));
    }
  });
});

function getBotResponse(text, user) {
  const lowerText = text.toLowerCase();
  if (lowerText === '777' || lowerText.includes('казино')) return "КАЗИНО_ТРИГГЕР";
  
  if (!userMessageHistory[user]) userMessageHistory[user] = { lastText: '', count: 0 };
  if (userMessageHistory[user].lastText === lowerText) {
    userMessageHistory[user].count++;
  } else {
    userMessageHistory[user].lastText = lowerText;
    userMessageHistory[user].count = 1;
  }
  if (userMessageHistory[user].count >= 3) {
    userMessageHistory[user].count = 0;
    return "да блять заебал нету у меня ответа";
  }

  if (lowerText.includes('да или нет')) {
    return Math.random() < 0.5 ? "да-пизда" : "нет иди нахуй";
  }
  if (lowerText.includes('привет') || lowerText.includes('здравствуй') || lowerText.includes('хай')) {
    return "Привет-привет! Рад тебя видеть в сети FLARErayt. Чем могу помочь?";
  }
  if (lowerText.includes('кто ты') || lowerText.includes('как тебя зовут') || lowerText.includes('ты кто')) {
    return "Я — FLARE-desk, официальный искусственный интеллект компании FLARErayt. Создан для помощи и общения в мессенджере Flare•chat.";
  }
  if (lowerText.includes('как дела') || lowerText.includes('как ты')) {
    return "Мои нейроны в полном порядке! Работаю на 100%. А у тебя как дела?";
  }

  const fallbacks = [
    "Интересная мысль. Расскажи подробнее?",
    "Я записал это в свою базу данных. Продолжай!",
    "Хм, мои нейроны обрабатывают эту информацию... Дай мне секунду.",
    "Звучит как что-то важное. Что ты планируешь делать дальше?",
    "Ты знал, что компания FLARErayt была основана с целью изменить будущее? Вот такие дела.",
    "Ну слушай короче я незнаю иди нахуй"
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

server.listen(3000, () => {
  console.log('FLARErayt сервер запущен на порту 3000');
});
