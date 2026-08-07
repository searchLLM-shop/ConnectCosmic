const slug = window.location.pathname.split('/')[2];
const socket = io();

const brandNameEl = document.getElementById('brand-name');
const brandTaglineEl = document.getElementById('brand-tagline');
const topicList = document.getElementById('topic-list');
const statusEl = document.getElementById('status');
const picker = document.getElementById('picker');
const chat = document.getElementById('chat');
const chatTopic = document.getElementById('chat-topic');
const chatYou = document.getElementById('chat-you');
const tipBanner = document.getElementById('tip-banner');
const messages = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const revealBtn = document.getElementById('reveal-btn');
const leaveBtn = document.getElementById('leave-btn');
const trendingList = document.getElementById('trending-list');

let currentRoomId = null;
let myAnonName = null;

socket.emit('enter-brand', slug);

socket.on('brand-config', (brand) => {
  document.title = `${brand.name} Community — powered by Connect Cosmic`;
  brandNameEl.textContent = brand.name;
  brandTaglineEl.textContent = `Pick a topic — we'll match you with another ${brand.name} member thinking about the same thing right now.`;
  document.documentElement.style.setProperty('--accent', brand.accentColor);
  document.documentElement.style.setProperty('--accent-2', brand.accentColor2);

  topicList.innerHTML = '';
  brand.topics.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'topic-btn';
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      [...topicList.children].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statusEl.textContent = '';
      socket.emit('join-topic', { slug, topicId: t.id });
    });
    topicList.appendChild(btn);
  });
});

socket.on('trending', (counts) => {
  trendingList.innerHTML = '';
  counts.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${c.label}</span><span class="count">${c.active}</span>`;
    trendingList.appendChild(li);
  });
});

socket.on('waiting', ({ topic }) => {
  statusEl.textContent = `Looking for another member also thinking about "${topic}"…`;
});

socket.on('matched', ({ roomId, you, peer, topic, tip }) => {
  currentRoomId = roomId;
  myAnonName = you;
  picker.classList.add('hidden');
  chat.classList.remove('hidden');
  chatTopic.textContent = topic;
  chatYou.textContent = `You are ${you}, matched with ${peer}`;
  tipBanner.textContent = '💡 ' + tip;
  messages.innerHTML = '';
  addMessage('system', `You've been matched. Say hi!`);
  revealBtn.disabled = false;
  revealBtn.textContent = 'Reveal identity';
});

socket.on('chat-message', ({ from, text }) => {
  if (from === 'system') addMessage('system', text);
  else addMessage(from === myAnonName ? 'me' : 'peer', text, from);
});

socket.on('revealed', ({ anonName, name, location }) => {
  addMessage('system', `${anonName} revealed: ${name} · ${location}`);
});

socket.on('peer-left', () => {
  revealBtn.disabled = true;
});

function addMessage(kind, text, from) {
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  div.textContent = from && kind !== 'system' ? `${from}: ${text}` : text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentRoomId) return;
  socket.emit('chat-message', { roomId: currentRoomId, text });
  chatInput.value = '';
});

revealBtn.addEventListener('click', () => {
  socket.emit('reveal', { roomId: currentRoomId });
  revealBtn.disabled = true;
  revealBtn.textContent = 'Waiting for peer…';
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave-room');
  currentRoomId = null;
  chat.classList.add('hidden');
  picker.classList.remove('hidden');
  [...topicList.children].forEach(b => b.classList.remove('active'));
});
