'use strict';

// Interactive frontend for the todo server. Vanilla JS, no framework.
// Talks JSON to the same-origin API; every mutating request carries
// X-Requested-With so the server's CSRF guard accepts it.

const app = document.getElementById('app');
const flashEl = document.getElementById('flash');

let state = { categories: [], todos: [] };
let flashTimer = null;

function flash(msg) {
  flashEl.textContent = msg;
  flashEl.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2200);
}

async function api(method, path, body) {
  const opt = { method, headers: { 'X-Requested-With': 'fetch' } };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(path, opt);
  let data = null;
  const txt = await r.text();
  if (txt) { try { data = JSON.parse(txt); } catch { data = { error: txt }; } }
  if (!r.ok) {
    const err = new Error((data && data.error) || 'request failed');
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function reload() {
  state = await api('GET', '/api/todos');
  render();
}

// ---- rendering ----

function todosFor(catId) {
  return state.todos.filter((t) => t.category_id === catId);
}

function render() {
  app.innerHTML = '';
  for (const cat of state.categories) {
    app.appendChild(renderCategory(cat));
  }
}

function renderCategory(cat) {
  const sec = document.createElement('section');

  const h2 = document.createElement('h2');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = cat.name;
  name.title = 'Click to rename';
  name.tabIndex = 0;
  editableText(name, false, (v) => mutate(() => api('PATCH', `/api/categories/${cat.id}`, { name: v })));
  h2.appendChild(name);

  const delBtn = document.createElement('button');
  delBtn.className = 'cat-del';
  delBtn.type = 'button';
  delBtn.textContent = 'remove';
  delBtn.title = 'Delete category (must be empty)';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete category "${cat.name}"? It must be empty.`)) return;
    try { await api('DELETE', `/api/categories/${cat.id}`); }
    catch (e) {
      flash(e.status === 409 ? 'Category not empty — delete or move its items first.' : (e.message || 'error'));
      return;
    }
    await reload();
  });
  h2.appendChild(delBtn);
  sec.appendChild(h2);

  const ul = document.createElement('ul');
  for (const t of todosFor(cat.id)) ul.appendChild(renderTodo(t));
  sec.appendChild(ul);

  const addRow = document.createElement('div');
  addRow.className = 'addrow';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'add a todo…';
  input.maxLength = 500;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'add';
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await api('POST', '/api/todos', { category_id: cat.id, text }); }
    catch (e) { flash(e.message || 'failed'); return; }
    await reload();
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  addRow.appendChild(input);
  addRow.appendChild(btn);
  sec.appendChild(addRow);

  return sec;
}

function renderTodo(t) {
  const li = document.createElement('li');
  if (t.done) li.classList.add('done');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'cb';
  cb.checked = t.done;
  cb.title = 'Toggle complete';
  cb.addEventListener('click', async () => {
    // optimistic toggle
    li.classList.toggle('done', cb.checked);
    try { await api('PATCH', `/api/todos/${t.id}`, { done: cb.checked }); }
    catch (e) { flash(e.message || 'failed'); await reload(); }
  });
  li.appendChild(cb);

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = t.text;
  text.tabIndex = 0;
  editableText(text, false, async (v) => {
    if (v === t.text) return;
    try { await api('PATCH', `/api/todos/${t.id}`, { text: v }); }
    catch (e) { flash(e.message || 'failed'); }
    await reload();
  });
  li.appendChild(text);

  if (t.note) {
    li.appendChild(renderNote(t));
  } else {
    const add = document.createElement('span');
    add.className = 'add-note';
    add.textContent = '+ note';
    add.addEventListener('click', () => {
      add.replaceWith(renderNote(t, true));
    });
    li.appendChild(add);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.textContent = '×';
  del.title = 'Delete';
  del.addEventListener('click', async () => {
    if (!confirm('Delete this todo?')) return;
    try { await api('DELETE', `/api/todos/${t.id}`); }
    catch (e) { flash(e.message || 'failed'); return; }
    await reload();
  });
  li.appendChild(del);

  return li;
}

function renderNote(t, startEditing) {
  const note = document.createElement('span');
  note.className = 'note';
  note.textContent = t.note || '';
  note.tabIndex = 0;
  editableText(note, true, async (v) => {
    const next = v === '' ? null : v;
    if (next === (t.note || null)) { await reload(); return; }
    try { await api('PATCH', `/api/todos/${t.id}`, { note: next }); }
    catch (e) { flash(e.message || 'failed'); }
    await reload();
  });
  if (startEditing) setTimeout(() => note.focus(), 0);
  return note;
}

// Make an element inline-editable. On commit calls onSave(value).
// Enter commits (unless multiline), Escape reverts.
function editableText(el, multiline, onSave) {
  el.addEventListener('focus', () => {
    el.dataset.orig = el.textContent;
  });
  el.addEventListener('blur', () => {
    const v = el.textContent;
    const orig = el.dataset.orig;
    delete el.dataset.orig;
    if (v !== orig) onSave(v);
    else if (multiline) { /* no change */ }
  });
  el.addEventListener('keydown', (e) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      el.textContent = el.dataset.orig || '';
      el.blur();
    } else if (multiline && (e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      el.blur();
    }
  });
}

// Run a mutation, report failures.
async function mutate(fn) {
  try { await fn(); }
  catch (e) { flash(e.message || 'failed'); }
  await reload();
}

// new category
document.getElementById('newcat-add').addEventListener('click', addCategory);
document.getElementById('newcat-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
});
async function addCategory() {
  const input = document.getElementById('newcat-name');
  const name = input.value.trim();
  if (!name) return;
  input.value = '';
  try { await api('POST', '/api/categories', { name }); }
  catch (e) { flash(e.message || 'failed'); return; }
  await reload();
}

reload().catch((e) => { flash(e.message || 'failed to load'); });
