'use strict';
// Zero-dependency Node server for the Golden Hour voting app.
//  - Serves the static site (whitelisted files only).
//  - Implements the shared-storage API that storage.js expects:
//      GET  /api/votes/state    (organiser PIN required)  -> { votes, updatedAt }
//      POST /api/votes/submit   { voter, picks }          -> { ok: true }
//      POST /api/votes/reset    { confirm: "RESET" }      (organiser PIN required)
//  - Persists votes to DATA_DIR/votes.json (mount a Railway volume there).
//
// Env vars: PORT (set by Railway), DATA_DIR (default ./data), ORGANISER_PIN (default 2026).

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');
const ORGANISER_PIN = String(process.env.ORGANISER_PIN || '2026');
const MAX_BODY_BYTES = 10 * 1024;

if (!process.env.ORGANISER_PIN) {
  console.warn('WARNING: ORGANISER_PIN is not set, falling back to the default PIN.');
}

// ---- Attendee list: data.js is the single source of truth (shared with the browser) ----
const ATTENDEES = vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8') + '\n;ATTENDEES;', {}
);
const ATTENDEE_SET = new Set(ATTENDEES);

// ---- Persistent store ----
let store = { votes: {}, updatedAt: null };

function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(VOTES_FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8'));
    if (parsed && typeof parsed.votes === 'object' && parsed.votes !== null) store = parsed;
  } catch (err) {
    // Keep the unreadable file for inspection instead of silently overwriting it.
    const backup = VOTES_FILE + '.corrupt-' + Date.now();
    fs.renameSync(VOTES_FILE, backup);
    console.error('votes.json was unreadable, moved to ' + backup + ': ' + err.message);
  }
}

function saveStore() {
  store.updatedAt = new Date().toISOString();
  const tmp = VOTES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, VOTES_FILE); // atomic replace: never leaves a half-written file
}

loadStore();

// ---- Helpers ----
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function pinMatches(candidate) {
  return crypto.timingSafeEqual(sha(candidate), sha(ORGANISER_PIN));
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Brute-force guard for the 4-digit PIN: 10 wrong guesses per IP per 10 minutes.
const failures = new Map();
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
function isLockedOut(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.resetAt) { failures.delete(ip); return false; }
  return f.count >= FAIL_LIMIT;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() > f.resetAt) failures.set(ip, { count: 1, resetAt: Date.now() + FAIL_WINDOW_MS });
  else f.count++;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = text ? JSON.parse(text) : {};
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Returns true if the request carries the right PIN; otherwise sends 401/429 and returns false.
function requirePin(req, res) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    sendJson(res, 429, { error: 'Too many wrong PIN attempts. Please wait a few minutes.' });
    return false;
  }
  const pin = req.headers['x-organiser-pin'];
  if (typeof pin !== 'string' || !pinMatches(pin)) {
    recordFailure(ip);
    sendJson(res, 401, { error: 'Incorrect PIN.' });
    return false;
  }
  return true;
}

function validateSubmission(body) {
  const voter = body && body.voter;
  const picks = body && body.picks;
  if (typeof voter !== 'string' || !ATTENDEE_SET.has(voter)) return 'Unknown voter name.';
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > 3) return 'Pick between 1 and 3 people.';
  const seen = new Set();
  for (const p of picks) {
    if (typeof p !== 'string' || !ATTENDEE_SET.has(p)) return 'One of your picks is not on the attendee list.';
    if (p === voter) return "You can't vote for yourself.";
    if (seen.has(p)) return 'Each person can only be picked once.';
    seen.add(p);
  }
  return null;
}

// ---- API ----
async function handleApi(req, res, op) {
  if (op === 'state' && req.method === 'GET') {
    if (!requirePin(req, res)) return;
    return sendJson(res, 200, { votes: store.votes, updatedAt: store.updatedAt });
  }

  if (op === 'submit' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const err = validateSubmission(body);
    if (err) return sendJson(res, 400, { error: err });
    if (Object.prototype.hasOwnProperty.call(store.votes, body.voter)) {
      return sendJson(res, 409, { error: `${body.voter} has already voted. Each person can only vote once.` });
    }
    store.votes[body.voter] = body.picks.slice();
    saveStore();
    return sendJson(res, 200, { ok: true });
  }

  if (op === 'reset' && req.method === 'POST') {
    if (!requirePin(req, res)) return;
    const body = await readJsonBody(req);
    if (body.confirm !== 'RESET') return sendJson(res, 400, { error: 'Missing RESET confirmation.' });
    store = { votes: {}, updatedAt: null };
    saveStore();
    return sendJson(res, 200, { ok: true });
  }

  if (op === 'state' || op === 'submit' || op === 'reset') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  return sendJson(res, 404, { error: 'Not found.' });
}

// ---- Static files (whitelist, so server.js / data/ / package.json are never exposed) ----
const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/qr.html': 'qr.html',
  '/results.html': 'results.html',
  '/app.js': 'app.js',
  '/data.js': 'data.js',
  '/fx.js': 'fx.js',
  '/results.js': 'results.js',
  '/storage.js': 'storage.js',
  '/style.css': 'style.css'
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  const file = STATIC[pathname];
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Server error');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (_) {
    res.writeHead(400);
    return res.end();
  }

  if (pathname === '/healthz') return sendJson(res, 200, { ok: true });

  if (pathname.startsWith('/api/votes/')) {
    handleApi(req, res, pathname.slice('/api/votes/'.length)).catch(err => {
      if (res.headersSent) return;
      if (err && err.status) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: 'Internal server error.' });
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Voting app listening on port ${PORT}; data file: ${VOTES_FILE}; ${ATTENDEES.length} attendees`);
});
