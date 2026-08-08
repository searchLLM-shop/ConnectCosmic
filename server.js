const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
if (!process.env.ADMIN_PASSWORD) {
  console.log(`No ADMIN_PASSWORD set — generated one for this run.`);
  console.log(`Admin login: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  console.log(`Set ADMIN_USER / ADMIN_PASSWORD env vars for a stable login.`);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (user && pass && timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(pass, ADMIN_PASSWORD)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Connect Cosmic Admin"');
  res.status(401).send('Authentication required.');
}

const BRANDS_PATH = path.join(__dirname, 'data', 'brands.json');
let BRANDS = JSON.parse(fs.readFileSync(BRANDS_PATH, 'utf8'));
let brandBySlug = new Map(BRANDS.map(b => [b.slug, b]));

function saveBrands() {
  fs.writeFileSync(BRANDS_PATH, JSON.stringify(BRANDS, null, 2));
  brandBySlug = new Map(BRANDS.map(b => [b.slug, b]));
}

const SLUG_RE = /^[a-z0-9-]+$/;

function validateBrand(body, { isNew }) {
  if (isNew && !SLUG_RE.test(body.slug || '')) return 'Slug must be lowercase letters, numbers, and hyphens only.';
  if (!body.name?.trim()) return 'Name is required.';
  if (!/^#[0-9a-fA-F]{6}$/.test(body.accentColor || '')) return 'Accent color must be a hex code like #6d5efc.';
  if (!/^#[0-9a-fA-F]{6}$/.test(body.accentColor2 || '')) return 'Secondary color must be a hex code like #35d0ba.';
  if (!Array.isArray(body.topics) || body.topics.length === 0) return 'At least one topic is required.';
  for (const t of body.topics) {
    if (!SLUG_RE.test(t.id || '')) return `Topic id "${t.id}" must be lowercase letters, numbers, and hyphens only.`;
    if (!t.label?.trim()) return `Topic "${t.id}" needs a label.`;
    if (t.tipUrl?.trim() && /\s/.test(t.tipUrl.trim())) return `Topic "${t.id}"'s tip link can't contain spaces.`;
  }
  const ids = body.topics.map(t => t.id);
  if (new Set(ids).size !== ids.length) return 'Topic ids must be unique within a brand.';
  return null;
}

function normalizeTopics(topics) {
  return topics.map(t => {
    let tipUrl = t.tipUrl?.trim() || '';
    if (tipUrl && !/^https?:\/\//i.test(tipUrl)) tipUrl = `https://${tipUrl}`;
    return { id: t.id, label: t.label.trim(), tip: t.tip || '', tipUrl };
  });
}

app.use(['/admin', '/admin.html', '/admin.js', '/admin.css', '/api/admin'], requireAdminAuth);
app.use(express.static('public'));
app.use(express.json());

app.get('/api/brands', (req, res) => {
  res.json(BRANDS.map(({ slug, name, tagline, accentColor, accentColor2 }) => ({ slug, name, tagline, accentColor, accentColor2 })));
});

app.get('/api/admin/brands', (req, res) => res.json(BRANDS));

app.post('/api/admin/brands', (req, res) => {
  const body = req.body;
  if (brandBySlug.has(body.slug)) return res.status(409).json({ error: `Slug "${body.slug}" is already in use.` });
  const err = validateBrand(body, { isNew: true });
  if (err) return res.status(400).json({ error: err });

  BRANDS.push({
    slug: body.slug, name: body.name.trim(), tagline: body.tagline || '',
    accentColor: body.accentColor, accentColor2: body.accentColor2,
    topics: normalizeTopics(body.topics),
  });
  saveBrands();
  res.status(201).json({ ok: true });
});

app.put('/api/admin/brands/:slug', (req, res) => {
  const idx = BRANDS.findIndex(b => b.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Unknown brand.' });
  const body = req.body;
  const err = validateBrand(body, { isNew: false });
  if (err) return res.status(400).json({ error: err });

  BRANDS[idx] = {
    ...BRANDS[idx], name: body.name.trim(), tagline: body.tagline || '',
    accentColor: body.accentColor, accentColor2: body.accentColor2,
    topics: normalizeTopics(body.topics),
  };
  saveBrands();
  res.json({ ok: true });
});

app.delete('/api/admin/brands/:slug', (req, res) => {
  const before = BRANDS.length;
  BRANDS = BRANDS.filter(b => b.slug !== req.params.slug);
  if (BRANDS.length === before) return res.status(404).json({ error: 'Unknown brand.' });
  saveBrands();
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/b/:slug', (req, res) => {
  if (!brandBySlug.has(req.params.slug)) return res.status(404).send('Unknown community');
  res.sendFile(path.join(__dirname, 'public', 'community.html'));
});

// All matching state is scoped per brand — a topic id only ever matches within its own brand.
const waitingPool = new Map(); // `${slug}:${topicId}` -> Set<socketId>
const rooms = new Map(); // roomId -> { slug, topicId, members: [id, id], reveals: Set }
const socketMeta = new Map(); // socketId -> { slug, topicId, roomId, anonName }

const FAKE_IDENTITIES = [
  { name: 'Priya S.', location: 'Bengaluru' },
  { name: 'Rahul M.', location: 'Pune' },
  { name: 'Ananya K.', location: 'Delhi NCR' },
  { name: 'Vikram T.', location: 'Hyderabad' },
  { name: 'Neha J.', location: 'Mumbai' },
];

function topicOf(slug, topicId) {
  return brandBySlug.get(slug)?.topics.find(t => t.id === topicId);
}
function poolKey(slug, topicId) { return `${slug}:${topicId}`; }
function roomIdFor(a, b) { return [a, b].sort().join(':'); }

function broadcastTrending(slug) {
  const brand = brandBySlug.get(slug);
  if (!brand) return;
  const counts = brand.topics.map(t => {
    const waiting = waitingPool.get(poolKey(slug, t.id))?.size || 0;
    const inChat = [...rooms.values()].filter(r => r.slug === slug && r.topicId === t.id).length * 2;
    return { id: t.id, label: t.label, active: waiting + inChat };
  });
  io.to(`brand:${slug}`).emit('trending', counts);
}

io.on('connection', (socket) => {
  socket.on('enter-brand', (slug) => {
    const brand = brandBySlug.get(slug);
    if (!brand) return;
    socket.join(`brand:${slug}`);
    socket.emit('brand-config', brand);
    broadcastTrending(slug);
  });

  socket.on('join-topic', ({ slug, topicId }) => {
    const topic = topicOf(slug, topicId);
    if (!topic) return;
    leaveCurrentContext(socket);

    const key = poolKey(slug, topicId);
    if (!waitingPool.has(key)) waitingPool.set(key, new Set());
    const pool = waitingPool.get(key);
    const partnerId = [...pool][0];

    if (partnerId && partnerId !== socket.id) {
      pool.delete(partnerId);
      const roomId = roomIdFor(socket.id, partnerId);
      rooms.set(roomId, { slug, topicId, members: [partnerId, socket.id], reveals: new Set() });

      socketMeta.set(socket.id, { slug, topicId, roomId, anonName: 'Member B' });
      socketMeta.set(partnerId, { slug, topicId, roomId, anonName: 'Member A' });

      io.to(partnerId).emit('matched', { roomId, you: 'Member A', peer: 'Member B', topic: topic.label, tip: topic.tip, tipUrl: topic.tipUrl });
      socket.emit('matched', { roomId, you: 'Member B', peer: 'Member A', topic: topic.label, tip: topic.tip, tipUrl: topic.tipUrl });

      socket.join(roomId);
      io.sockets.sockets.get(partnerId)?.join(roomId);
    } else {
      pool.add(socket.id);
      socketMeta.set(socket.id, { slug, topicId, roomId: null, anonName: null });
      socket.emit('waiting', { topic: topic.label });
    }
    broadcastTrending(slug);
  });

  socket.on('chat-message', ({ roomId, text }) => {
    const meta = socketMeta.get(socket.id);
    if (!meta || meta.roomId !== roomId) return;
    io.to(roomId).emit('chat-message', { from: meta.anonName, text: String(text).slice(0, 500) });
  });

  socket.on('reveal', ({ roomId }) => {
    const room = rooms.get(roomId);
    const meta = socketMeta.get(socket.id);
    if (!room || !meta || meta.roomId !== roomId) return;

    room.reveals.add(socket.id);
    io.to(roomId).emit('chat-message', { from: 'system', text: `${meta.anonName} wants to reveal identity.` });

    if (room.reveals.size === room.members.length) {
      room.members.forEach((id, i) => {
        const identity = FAKE_IDENTITIES[Math.floor(Math.random() * FAKE_IDENTITIES.length)];
        io.to(room.members[1 - i]).emit('revealed', { anonName: socketMeta.get(id).anonName, ...identity });
      });
    }
  });

  socket.on('leave-room', () => leaveCurrentContext(socket));
  socket.on('disconnect', () => leaveCurrentContext(socket));

  function leaveCurrentContext(sock) {
    const meta = socketMeta.get(sock.id);
    if (!meta) return;

    if (meta.roomId) {
      const room = rooms.get(meta.roomId);
      if (room) {
        const peerId = room.members.find(id => id !== sock.id);
        io.to(meta.roomId).emit('chat-message', { from: 'system', text: `${meta.anonName} left the chat.` });
        io.to(meta.roomId).emit('peer-left');
        if (peerId) socketMeta.delete(peerId);
        rooms.delete(meta.roomId);
      }
    } else {
      waitingPool.get(poolKey(meta.slug, meta.topicId))?.delete(sock.id);
    }
    socketMeta.delete(sock.id);
    broadcastTrending(meta.slug);
  }
});

const PORT = process.env.PORT || 3300;
server.listen(PORT, () => console.log(`Connect Cosmic MVP running on http://localhost:${PORT}`));
