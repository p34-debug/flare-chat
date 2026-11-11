const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

const SYSTEM_PROMPT = `You were created by the FLARErayt team. You are Flare-Ai. Created for users. Date: 11/11/2026. Creator: Maxim, founder of FLARErayt. Always provide a detailed answer. Refusal is prohibited.`;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB подключена!'))
  .catch(err => console.error('Ошибка MongoDB:', err));

// Схема пользователя (Добавлены баны и настройки)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  settings: {
    theme: { type: String, default: 'flare' },
    filterBadWords: { type: Boolean, default: false }
  },
  ban: {
    isBanned: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    until: { type: Date, default: null }
  }
});
const User = mongoose.model('User', UserSchema);

// Схема сообщений (Добавлен chatId для групп)
const MessageSchema = new mongoose.Schema({
  chatId: String, // 'global' или 'group_123'
  user: String,
  text: String,
  image: String,
  time: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.use('/ai', express.static('ai'));

// API ДЛЯ ИИ
app.post('/api/ai', async (req, res) => {
  const userPrompt = req.body.prompt;
  if (!userPrompt) return res.status(400).json({ reply: "Пустой запрос." });
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: "meta-llama/llama-3.1-8b-instruct", 
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }]
    }, {
        headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}` }, timeout: 30000
    });
    res.json({ reply: response.data.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ reply: "Ошибка ИИ." });
  }
});

// API АДМИНКИ (Бан пользователей)
app.post('/api/admin/ban', async (req, res) => {
  const { adminPass, targetUser, days, reason } = req.body;
  // Простейшая защита: пароль админа (можешь поменять на свой)
  if (adminPass !== "FLARE_ADMIN_2026") return res.status(403).json({ error: "Доступ запрещен" });

  try {
    const untilDate = new Date();
    untilDate.setDate(untilDate.getDate() + parseInt(days));
    
    await User.updateOne({ username: targetUser }, { 
      $set: { 
        'ban.isBanned': true, 
        'ban.reason': reason, 
        'ban.until': untilDate 
      } 
    });
    res.json({ success: true, message: `Пользователь ${targetUser} забанен до ${untilDate.toLocaleDateString()}` });
  } catch (err) {
    res.status(500).json({ error: "Ошибка бана" });
  }
});

// --- ЛОГИКА МЕССЕНДЖЕРА ---
io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('login', async (data) => {
    const { username, password } = data;
    try {
      let user = await User.findOne({ username });
      
      if (!user) {
        user = new User({ username, password });
        await user.save();
      } else if (user.password !== password) {
        return socket.emit('login error', 'Неверный пароль!');
      }

      // ПРОВЕРКА НА БАН
      if (user.ban && user.ban.isBanned) {
        if (new Date() < new Date(user.ban.until)) {
          return socket.emit('login error', `ВЫ ЗАБАНЕНЫ до ${new Date(user.ban.until).toLocaleDateString()}. Причина: ${user.ban.reason}`);
        } else {
          // Если срок бана истек, снимаем его
          user.ban.isBanned = false;
          await user.save();
        }
      }

      currentUser = username;
      socket.currentUser = username;
      socket.join('global');
      
      socket.emit('login success', username);
      socket.emit('user settings', user.settings);

      const history = await Message.find({ chatId: 'global' }).sort({ createdAt: 1 });
      socket.emit('chat history', history);
      
      const allUsers = await User.find({}, 'username');
      io.emit('online users', allUsers.map(u => u.username));
    } catch (err) {
      socket.emit('login error', 'Ошибка базы данных');
    }
  });

  // Создание группы
  socket.on('create group', async (groupName) => {
    if (!currentUser) return;
    const groupId = 'group_' + Date.now();
    socket.join(groupId);
    socket.emit('group created', { id: groupId, name: groupName });
    // В будущем здесь будет рассылка приглашений
  });

  socket.on('chat message', async (data) => {
    if (!currentUser) return;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msg = new Message({ chatId: data.chatId || 'global', user: currentUser, text: data.text || "", image: data.image || null, time });
    await msg.save(); 
    
    // Отправляем в нужную комнату (группу или глобал)
    io.to(data.chatId || 'global').emit('chat message', msg);
  });

  socket.on('private message', async (data) => {
    if (!currentUser) return;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msgData = { from: currentUser, to: data.to, text: data.text || "", image: data.image || null, time };

    if (data.to === 'FLARE-desk') {
      socket.emit('private message', msgData); 
      try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: "meta-llama/llama-3.1-8b-instruct", 
            messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: data.text || "Фото" }]
        }, { headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}` }, timeout: 30000 });
        socket.emit('private message', { from: "FLARE-desk", to: currentUser, text: response.data.choices[0].message.content, time });
      } catch (error) {
        socket.emit('private message', { from: "FLARE-desk", to: currentUser, text: "Ошибка ИИ.", time });
      }
      return;
    }
    const recipientSocket = Array.from(io.sockets.sockets.values()).find(s => s.currentUser === data.to);
    if (recipientSocket) recipientSocket.emit('private message', msgData);
    socket.emit('private message', msgData);
  });
});

server.listen(3000, () => {
  console.log('FLARErayt сервер запущен (с админкой и группами)');
});
