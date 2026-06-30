'use strict';

// Interactive todo backend — zero npm dependencies.
// Uses the built-in node:sqlite (Node 22+) and node:http. Serves a small
// JSON API plus the static frontend. Binds to 127.0.0.1 only; nginx handles
// TLS + HTTP Basic auth and proxies here.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.TODO_PORT || '8090', 10);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const DB_PATH = process.env.TODO_DB || path.join(ROOT, 'data', 'todo.db');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MAX_TEXT = 500;
const MAX_NOTE = 4000;
const MAX_CAT = 80;
const MAX_BODY = 1024 * 1024;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS todos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    text        TEXT    NOT NULL,
    note        TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category_id);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n) return;
  const data = require('./seed-data.js');
  const insCat = db.prepare('INSERT INTO categories(name, position) VALUES(?, ?)');
  const insTodo = db.prepare('INSERT INTO todos(category_id, text, note, position) VALUES(?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    data.forEach((cat, i) => {
      const catId = insCat.run(cat.name, i).lastInsertRowid;
      (cat.todos || []).forEach((t, j) =>
        insTodo.run(catId, t.text, t.note || null, j));
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
seed();

// ---- helpers ----

function clamp(v, max) {
  if (typeof v !== 'string') return null;
  v = v.trim().replace(/\r/g, '');
  if (!v) return null;
  return v.slice(0, max);
}

function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {});
  res.writeHead(status, h);
  res.end(typeof body === 'string' || Buffer.isBuffer(body)
    ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseJson(req) {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}

function requireMutationSafe(req, res) {
  // CSRF guard: a custom header cannot be set by a cross-origin browser
  // request without a CORS preflight, which this server never grants.
  if (req.headers['x-requested-with'] !== 'fetch') {
    send(res, 403, { error: 'missing required header' });
    return false;
  }
  return true;
}

function snapshot() {
  const cats = db.prepare(
    'SELECT id, name, position FROM categories ORDER BY position, id'
  ).all();
  const todos = db.prepare(
    'SELECT id, category_id, text, note, done, position FROM todos ORDER BY position, id'
  ).all();
  return {
    categories: cats,
    todos: todos.map((t) => ({ ...t, done: !!t.done })),
  };
}

function getTodo(id) {
  const t = db.prepare(
    'SELECT id, category_id, text, note, done, position FROM todos WHERE id = ?'
  ).get(id);
  return t ? { ...t, done: !!t.done } : null;
}

// ---- API handlers ----

function list(res) {
  send(res, 200, snapshot());
}

async function createTodo(req, res) {
  if (!requireMutationSafe(req, res)) return;
  let body;
  try { body = await parseJson(req); }
  catch (e) { return send(res, e.message === 'payload too large' ? 413 : 400, { error: e.message }); }

  const categoryId = Number(body.category_id);
  if (!Number.isInteger(categoryId) || categoryId < 1)
    return send(res, 400, { error: 'invalid category_id' });
  const text = clamp(body.text, MAX_TEXT);
  if (!text) return send(res, 400, { error: 'text required' });
  const note = clamp(body.note, MAX_NOTE);

  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId))
    return send(res, 404, { error: 'category not found' });

  const p = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM todos WHERE category_id = ?').get(categoryId).p;
  const r = db.prepare(
    'INSERT INTO todos(category_id, text, note, position) VALUES(?, ?, ?, ?)'
  ).run(categoryId, text, note, p);
  send(res, 201, getTodo(r.lastInsertRowid));
}

async function updateTodo(req, res, id) {
  if (!requireMutationSafe(req, res)) return;
  let body;
  try { body = await parseJson(req); }
  catch (e) { return send(res, e.message === 'payload too large' ? 413 : 400, { error: e.message }); }

  if (!db.prepare('SELECT id FROM todos WHERE id = ?').get(id))
    return send(res, 404, { error: 'not found' });

  const fields = [];
  const vals = [];
  if (body.text !== undefined) {
    const text = clamp(body.text, MAX_TEXT);
    if (!text) return send(res, 400, { error: 'text required' });
    fields.push('text = ?'); vals.push(text);
  }
  if (body.note !== undefined) {
    const note = clamp(body.note, MAX_NOTE);
    fields.push('note = ?'); vals.push(note);
  }
  if (body.done !== undefined) {
    fields.push('done = ?'); vals.push(body.done ? 1 : 0);
  }
  if (body.category_id !== undefined) {
    const cid = Number(body.category_id);
    if (!Number.isInteger(cid) || cid < 1)
      return send(res, 400, { error: 'invalid category_id' });
    if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(cid))
      return send(res, 404, { error: 'category not found' });
    fields.push('category_id = ?'); vals.push(cid);
  }
  if (body.position !== undefined && Number.isInteger(Number(body.position))) {
    fields.push('position = ?'); vals.push(Number(body.position));
  }
  if (fields.length) {
    vals.push(id);
    db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  send(res, 200, getTodo(id));
}

function deleteTodo(req, res, id) {
  if (!requireMutationSafe(req, res)) return;
  const r = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  if (!r.changes) return send(res, 404, { error: 'not found' });
  send(res, 200, { deleted: true });
}

async function createCategory(req, res) {
  if (!requireMutationSafe(req, res)) return;
  let body;
  try { body = await parseJson(req); }
  catch (e) { return send(res, e.message === 'payload too large' ? 413 : 400, { error: e.message }); }

  const name = clamp(body.name, MAX_CAT);
  if (!name) return send(res, 400, { error: 'name required' });
  const p = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get().p;
  const r = db.prepare('INSERT INTO categories(name, position) VALUES(?, ?)').run(name, p);
  send(res, 201, db.prepare('SELECT id, name, position FROM categories WHERE id = ?').get(r.lastInsertRowid));
}

async function updateCategory(req, res, id) {
  if (!requireMutationSafe(req, res)) return;
  let body;
  try { body = await parseJson(req); }
  catch (e) { return send(res, e.message === 'payload too large' ? 413 : 400, { error: e.message }); }

  const name = clamp(body.name, MAX_CAT);
  if (!name) return send(res, 400, { error: 'name required' });
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(id))
    return send(res, 404, { error: 'not found' });
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
  send(res, 200, db.prepare('SELECT id, name, position FROM categories WHERE id = ?').get(id));
}

function deleteCategory(req, res, id) {
  if (!requireMutationSafe(req, res)) return;
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(id))
    return send(res, 404, { error: 'not found' });
  const count = db.prepare('SELECT COUNT(*) AS n FROM todos WHERE category_id = ?').get(id).n;
  if (count > 0)
    return send(res, 409, { error: 'category not empty', count });
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  send(res, 200, { deleted: true });
}

// ---- routing ----

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function serveStatic(res, file, type) {
  const p = path.join(PUBLIC_DIR, file);
  fs.readFile(p, (err, buf) => {
    if (err) { send(res, 500, { error: 'static read failed' }); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function route(req, res, pathname, method) {
  if (method === 'GET' && STATIC[pathname]) {
    serveStatic(res, STATIC[pathname][0], STATIC[pathname][1]);
    return;
  }
  const mTodo = pathname.match(/^\/api\/todos\/(\d+)$/);
  const mCat = pathname.match(/^\/api\/categories\/(\d+)$/);

  if (pathname === '/api/todos') {
    if (method === 'GET') return list(res);
    if (method === 'POST') return createTodo(req, res);
  }
  if (mTodo) {
    const id = Number(mTodo[1]);
    if (method === 'PATCH') return updateTodo(req, res, id);
    if (method === 'DELETE') return deleteTodo(req, res, id);
  }
  if (pathname === '/api/categories') {
    if (method === 'POST') return createCategory(req, res);
  }
  if (mCat) {
    const id = Number(mCat[1]);
    if (method === 'PATCH') return updateCategory(req, res, id);
    if (method === 'DELETE') return deleteCategory(req, res, id);
  }
  send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  (async () => {
    let url;
    try { url = new URL(req.url, `http://${HOST}`); }
    catch { return send(res, 400, { error: 'bad request' }); }
    route(req, res, url.pathname, req.method);
  })().catch((err) => {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
    else try { res.end(); } catch {}
  });
});

server.on('clientError', (err, socket) => { socket.destroy(); });
server.listen(PORT, HOST, () => {
  console.log(`todo server listening on http://${HOST}:${PORT} (db: ${DB_PATH})`);
});

function shutdown() {
  server.close(() => { try { db.close(); } catch {} process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
