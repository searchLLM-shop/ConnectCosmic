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
  document.title = `${brand.name} Community — powered by Connect8 AI`;
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

socket.on('matched', ({ roomId, you, peer, topic, tip, tipUrl }) => {
  currentRoomId = roomId;
  myAnonName = you;
  picker.classList.add('hidden');
  chat.classList.remove('hidden');
  chatTopic.textContent = topic;
  chatYou.textContent = `You are ${you}, matched with ${peer}`;
  renderTip(tip, tipUrl);
  messages.innerHTML = '';
  addMessage('system', `You've been matched. Say hi!`);
  revealBtn.disabled = false;
  revealBtn.textContent = 'Reveal identity';
});

socket.on('chat-message', ({ from, text }) => {
  if (from === 'system') addMessage('system', text);
  else addMessage(from === myAnonName ? 'me' : 'peer', text, from);
});

socket.on('revealed', ({ anonName, name, location, saved }) => {
  const detail = location ? `${name} · ${location}` : name;
  addMessage('system', `${anonName} revealed: ${detail}`);
  addMessage('system', saved
    ? '✓ Saved to your connections — find it in the Community tab.'
    : 'Sign in from the Community tab to save this connection for next time.');
});

socket.on('peer-left', () => {
  revealBtn.disabled = true;
});

socket.on('ai-tip', ({ title, body, link }) => {
  addMessage('system', `🤖 Based on your conversation, here's something from the brand:`);
  tipBanner.innerHTML = '';
  tipBanner.hidden = false;
  tipBanner.classList.add('ai-tip');
  tipBanner.append('🤖 ');
  const strong = document.createElement('strong');
  strong.textContent = title + ': ';
  tipBanner.appendChild(strong);
  tipBanner.append(body + ' ');
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Learn more →';
    tipBanner.appendChild(a);
  }
});

function renderTip(tip, tipUrl) {
  tipBanner.innerHTML = '';
  tipBanner.classList.remove('ai-tip');
  if (!tip) { tipBanner.hidden = true; return; }
  tipBanner.hidden = false;
  tipBanner.append('💡 ' + tip + ' ');
  if (tipUrl) {
    const link = document.createElement('a');
    link.href = tipUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Learn more →';
    tipBanner.appendChild(link);
  }
}

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

// --- Community tab: auth, feed, connections ---

const authStatusEl = document.getElementById('auth-status');
const tabBtns = document.querySelectorAll('.tab-btn');
const viewMatch = document.getElementById('view-match');
const viewCommunity = document.getElementById('view-community');
const signedOutPanel = document.getElementById('signed-out-panel');
const signedInPanel = document.getElementById('signed-in-panel');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginStatus = document.getElementById('login-status');
const devLinkBox = document.getElementById('dev-link-box');
const feedList = document.getElementById('feed-list');
const connectionsList = document.getElementById('connections-list');

let currentMember = null;

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    viewMatch.classList.toggle('hidden', tab !== 'match');
    viewCommunity.classList.toggle('hidden', tab !== 'community');
    if (tab === 'community') loadCommunity();
  });
});

async function refreshAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentMember = await res.json();
      authStatusEl.innerHTML = '';
      authStatusEl.append(`Signed in as ${currentMember.displayName} `);
      const btn = document.createElement('button');
      btn.className = 'ghost-btn small';
      btn.textContent = 'Log out';
      btn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentMember = null;
        refreshAuth();
      });
      authStatusEl.appendChild(btn);
    } else {
      currentMember = null;
      authStatusEl.textContent = '';
    }
  } catch {
    currentMember = null;
  }
  signedOutPanel.classList.toggle('hidden', !!currentMember);
  signedInPanel.classList.toggle('hidden', !currentMember);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginStatus.textContent = 'Sending…';
  devLinkBox.classList.add('hidden');
  const res = await fetch('/api/auth/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: loginEmail.value.trim(), slug }),
  });
  const data = await res.json();
  if (!res.ok) { loginStatus.textContent = data.error || 'Something went wrong.'; return; }
  loginStatus.textContent = 'Check your email for a sign-in link.';
  if (data.devMagicLink) {
    devLinkBox.innerHTML = '';
    devLinkBox.classList.remove('hidden');
    devLinkBox.append('Dev mode — no email service configured yet. ');
    const a = document.createElement('a');
    a.href = data.devMagicLink;
    a.textContent = 'Click to sign in →';
    devLinkBox.appendChild(a);
  }
});

async function loadCommunity() {
  if (!currentMember) return;
  const [feedRes, connRes] = await Promise.all([
    fetch(`/api/b/${slug}/feed`),
    fetch(`/api/b/${slug}/connections`),
  ]);
  renderFeed(await feedRes.json());
  renderConnections(await connRes.json());
}

const TYPE_LABEL = { promotion: '🎁 Promotion', support: '🛟 Support', feedback: '⭐ Feedback' };

function renderFeed(items) {
  feedList.innerHTML = '';
  if (!items.length) {
    feedList.innerHTML = '<p class="hint">No posts from this brand yet.</p>';
    return;
  }
  items.forEach(post => {
    const card = document.createElement('div');
    card.className = 'feed-card';

    const header = document.createElement('div');
    header.className = 'feed-card-header';
    header.innerHTML = `<span class="feed-type">${TYPE_LABEL[post.type] || post.type}</span><span class="feed-date">${new Date(post.createdAt).toLocaleDateString()}</span>`;
    card.appendChild(header);

    const title = document.createElement('h3');
    title.textContent = post.title;
    card.appendChild(title);

    const body = document.createElement('p');
    body.textContent = post.body;
    card.appendChild(body);

    if (post.link) {
      const a = document.createElement('a');
      a.href = post.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'Learn more →';
      a.className = 'feed-link';
      card.appendChild(a);
    }

    if (post.type === 'feedback') {
      const ratingRow = document.createElement('div');
      ratingRow.className = 'rating-row';
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'star-btn' + (post.myRating && i <= post.myRating ? ' filled' : '');
        star.textContent = '★';
        star.addEventListener('click', async () => {
          await fetch(`/api/b/${slug}/feed/${post.id}/rating`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: i }),
          });
          loadCommunity();
        });
        ratingRow.appendChild(star);
      }
      const avgLabel = document.createElement('span');
      avgLabel.className = 'rating-avg';
      avgLabel.textContent = post.avgRating ? `${post.avgRating.toFixed(1)}★ (${post.ratingCount})` : 'No ratings yet';
      ratingRow.appendChild(avgLabel);
      card.appendChild(ratingRow);
    }

    const commentsToggle = document.createElement('button');
    commentsToggle.type = 'button';
    commentsToggle.className = 'ghost-btn small';
    commentsToggle.textContent = `💬 ${post.commentCount} comment${post.commentCount === 1 ? '' : 's'}`;
    const commentsBox = document.createElement('div');
    commentsBox.className = 'comments-box hidden';
    commentsToggle.addEventListener('click', async () => {
      commentsBox.classList.toggle('hidden');
      if (!commentsBox.classList.contains('hidden')) await loadComments(post.id, commentsBox);
    });
    card.appendChild(commentsToggle);
    card.appendChild(commentsBox);

    feedList.appendChild(card);
  });
}

async function loadComments(postId, box) {
  box.textContent = 'Loading…';
  const res = await fetch(`/api/b/${slug}/feed/${postId}/comments`);
  const comments = await res.json();
  box.innerHTML = '';
  comments.forEach(c => {
    const row = document.createElement('div');
    row.className = 'comment-row';
    const strong = document.createElement('strong');
    strong.textContent = c.displayName + ': ';
    row.appendChild(strong);
    row.append(c.body);
    box.appendChild(row);
  });

  const form = document.createElement('form');
  form.className = 'comment-form';
  const input = document.createElement('input');
  input.placeholder = 'Add a comment…';
  input.required = true;
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Post';
  form.appendChild(input);
  form.appendChild(submitBtn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    await fetch(`/api/b/${slug}/feed/${postId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    input.value = '';
    await loadComments(postId, box);
  });
  box.appendChild(form);
}

function renderConnections(list) {
  connectionsList.innerHTML = '';
  if (!list.length) {
    connectionsList.innerHTML = '<p class="hint">No saved connections yet — reveal identities during a match to save one.</p>';
    return;
  }
  list.forEach(c => {
    const row = document.createElement('div');
    row.className = 'connection-row';
    const name = document.createElement('div');
    name.className = 'connection-name';
    name.textContent = c.peerDisplayName;
    const meta = document.createElement('div');
    meta.className = 'connection-meta';
    meta.textContent = `via "${c.viaTopic}" · ${new Date(c.createdAt).toLocaleDateString()}`;
    row.appendChild(name);
    row.appendChild(meta);
    connectionsList.appendChild(row);
  });
}

refreshAuth();
