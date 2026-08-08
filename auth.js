const crypto = require('crypto');
const store = require('./store');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(24).toString('base64url');
if (!process.env.SESSION_SECRET) {
  console.log(`No SESSION_SECRET set — generated one for this run.`);
  console.log(`Member logins won't survive a restart. Set SESSION_SECRET for stable sessions.`);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createMagicToken(email) {
  return sign({ type: 'magic', email, exp: Date.now() + 15 * 60 * 1000 });
}

function createSessionToken(memberId) {
  return sign({ type: 'session', memberId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

const SESSION_COOKIE = 'ccs_session';

function memberFromToken(token) {
  const payload = verify(token);
  if (!payload || payload.type !== 'session') return null;
  return store.members.find(m => m.id === payload.memberId) || null;
}

function memberFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return memberFromToken(cookies[SESSION_COOKIE]);
}

function memberFromSocket(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return memberFromToken(cookies[SESSION_COOKIE]);
}

function requireMemberAuth(req, res, next) {
  const member = memberFromRequest(req);
  if (!member) return res.status(401).json({ error: 'Not signed in.' });
  req.member = member;
  next();
}

function setSessionCookie(res, token, secure) {
  const maxAge = 30 * 24 * 60 * 60;
  const secureFlag = secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = {
  createMagicToken, createSessionToken, verify,
  memberFromRequest, memberFromSocket, requireMemberAuth,
  setSessionCookie, clearSessionCookie,
};
