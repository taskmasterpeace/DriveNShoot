// THE WORLD FORGE's spine in the page (docs/design/WEB_FORGE.md §3.1-3.2): the attached game tab, health, the rows on
// disk, the shared save / validate / push-live model, undo and redo per tab, toasts, the modal, the drawer and the
// command palette. Every write goes through patch() -> /forge/patch (tools/forge-io.mjs, the row law in rows.js); every
// push through the game's own `forgePush` command, so a click here and an agent's command are the same thing.

export const F = {
  tab: null, tabs: new Map(), order: [],
  game: { pin: new URLSearchParams(location.search).get('tab') || null, status: null, alive: false, active: null, kind: null },
  files: {}, docs: {}, live: true, health: {}, shardPort: Number(new URLSearchParams(location.search).get('shard') ?? 3280),
  stacks: new Map(), // tab id -> { undo: [], redo: [] }
  bus: new EventTarget(), probe: new URLSearchParams(location.search).has('probe'),
};
export const on = (type, fn) => F.bus.addEventListener(type, (e) => fn(e.detail));
export const emit = (type, detail) => F.bus.dispatchEvent(new CustomEvent(type, { detail }));
export const $ = (sel, root = document) => root.querySelector(sel);
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const ICON = {
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  terrain: '<path d="M2 19l6-9 4 5 3-4 7 8z"/><path d="M8 10l2-3"/>',
  brush: '<path d="M14 4l6 6-8 8H6v-6z"/><path d="M11 7l6 6M4 21c1-2 2-3 4-3"/>',
  town: '<path d="M3 21V9l5-3 5 3v12M13 21V5l4-2 4 2v16M6 12h4M6 16h4M16 9h2M16 13h2"/>',
  building: '<path d="M4 21V4h16v17M4 10h16M10 4v17M14 14h3"/><path d="M7 7h1M7 14h1"/>',
  site: '<path d="M12 2l3 6 6 1-4.5 4 1 6.5L12 16l-5.5 3.5 1-6.5L3 9l6-1z"/>',
  life: '<path d="M4 15c2-6 6-9 12-9 2 0 3 1 3 3 0 5-6 8-11 8"/><circle cx="16" cy="9" r="1"/><path d="M6 15l-2 5M10 17l-1 4"/>',
  voice: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  observe: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  select: '<path d="M5 3l14 8-6 2-2 6z"/>', insert: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6M12 3v3M12 18v3"/>',
  del: '<circle cx="12" cy="12" r="3"/><path d="M5 5l14 14"/>', exit: '<path d="M4 20V4M10 20V4"/><path d="M14 8h6l-3-3M20 8l-3 3"/>',
  city: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>', holdout: '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/>',
  rail: '<path d="M7 3l-3 18M17 3l3 18M5 8h14M4.5 13h15M4 18h16"/>', road: '<path d="M8 3L5 21M16 3l3 18M12 4v3M12 11v3M12 18v2"/>',
  measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  paint: '<path d="M14 4l6 6-8 8H6v-6z"/>', erase: '<path d="M16 4l5 5-9 9H7l-4-4z"/><path d="M9 18h12"/>', set: '<path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', pin: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  check: '<path d="M4 12l5 5L20 6"/>', push: '<path d="M12 19V5M5 12l7-7 7 7"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', knobs: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};
export const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICON[name] ?? ''}</svg>`;

// ---- http ------------------------------------------------------------------------------------------------------------
export async function getJSON(url) { const r = await fetch(url, { cache: 'no-store' }); return r.json(); }
export async function postJSON(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })); return { status: r.status, ...j }; }
// A command in the attached game tab (the bridge, /agent/cmd). A short default timeout: the forge never hangs on a game.
export async function cmd(name, args = {}, { timeoutMs = 20000 } = {}) {
  if (!F.game.alive) return { ok: false, error: 'no game tab attached (start one: npm run agent, or open /?agent=1)' };
  try { return await (await fetch('/agent/cmd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: name, args, tab: F.game.pin ?? undefined, timeoutMs }) })).json(); }
  catch (e) { return { ok: false, error: String(e.message ?? e) }; }
}

// ---- the rows on disk --------------------------------------------------------------------------------------------------
export async function loadDoc(file) {
  const r = await fetch(`/forge/data?file=${file}`, { cache: 'no-store' });
  const raw = await r.text();
  F.docs[file] = { raw, doc: JSON.parse(raw), hash: r.headers.get('x-forge-hash'), at: Date.now() };
  emit('doc', { file });
  return F.docs[file];
}
const stack = (tab) => { let s = F.stacks.get(tab); if (!s) F.stacks.set(tab, (s = { undo: [], redo: [] })); return s; };
// One write: ops on a file, labelled for the undo list, pushed live when LIVE is on. Returns the server's reply.
export async function patch(file, ops, { label = 'edit', tab = F.tab, expect, force, quiet } = {}) {
  const r = await postJSON('/forge/patch', { file, ops, expect, force, who: `forge:${tab}` });
  if (r.status === 409 && r.conflict) {
    const go = await confirmBox('CHANGED ON DISK', `Someone else changed ${r.rows.join(', ')} since you opened it. Reload their version, or write yours over it?`, 'WRITE MINE', 'RELOAD THEIRS');
    if (go) return patch(file, ops, { label, tab, force: true, quiet });
    await loadDoc(file); toast('Reloaded the rows on disk', 'warn'); return r;
  }
  if (!r.ok) { toast(r.error ?? 'write refused', 'bad', 'NOT WRITTEN'); return r; }
  const s = stack(tab);
  s.undo.push({ file, inverse: r.inverse, label, rows: Object.keys(r.rows ?? {}) }); if (s.undo.length > 120) s.undo.shift();
  s.redo.length = 0;
  await afterWrite(file, r, label, quiet);
  return r;
}
async function afterWrite(file, r, label, quiet) {
  await loadDoc(file);
  emit('written', { file, r, label });
  if (!quiet) toast(`${label} · ${r.changed?.length ?? 0} row${r.changed?.length === 1 ? '' : 's'} · ${r.hash}`, 'ok', 'WRITTEN');
  refreshFiles();
  if (F.live && F.game.alive) await push(file, Object.keys(r.rows ?? {}));
  updateStatus();
}
export async function undo(tab = F.tab) {
  const s = stack(tab), e = s.undo.pop();
  if (!e) return toast('Nothing to undo on this tab', 'warn');
  const r = await postJSON('/forge/patch', { file: e.file, ops: e.inverse, who: `forge:${tab}:undo` });
  if (!r.ok) { s.undo.push(e); return toast(r.error, 'bad', 'UNDO REFUSED'); }
  s.redo.push({ file: e.file, inverse: r.inverse, label: e.label, rows: e.rows });
  await afterWrite(e.file, r, `undo ${e.label}`);
}
export async function redo(tab = F.tab) {
  const s = stack(tab), e = s.redo.pop();
  if (!e) return toast('Nothing to redo on this tab', 'warn');
  const r = await postJSON('/forge/patch', { file: e.file, ops: e.inverse, who: `forge:${tab}:redo` });
  if (!r.ok) { s.redo.push(e); return toast(r.error, 'bad', 'REDO REFUSED'); }
  s.undo.push({ file: e.file, inverse: r.inverse, label: e.label, rows: e.rows });
  await afterWrite(e.file, r, `redo ${e.label}`);
}
export const stackOf = stack;
// Push a file's rows into the attached game (forgePush: only the chunks the rows reach are laid out again).
export async function push(file, rows = null) {
  if (!F.game.alive) { F.lastPush = { file, ok: false, why: 'no game' }; updateStatus(); return null; }
  const r = await cmd('forgePush', { file, ...(rows?.length ? { rows: rows.join(',') } : {}) }, { timeoutMs: 60000 });
  const one = r?.[file] ?? r;
  F.lastPush = { file, ok: !!r?.ok && one?.ok !== false, at: Date.now(), chunks: Array.isArray(one?.chunks) ? one.chunks.length : one?.chunks, ms: one?.ms, why: r?.error ?? one?.reason, needsReload: one?.needsReload };
  if (one?.needsReload) toast(one.reason, 'warn', 'RELOAD THE GAME TAB');
  else if (!r?.ok) toast(r?.error ?? 'push failed', 'bad', 'NOT PUSHED');
  emit('pushed', F.lastPush);
  updateStatus();
  return r;
}

// ---- health: the game tab, the shard, the harness, the files ----------------------------------------------------------------
export async function refreshFiles() { try { const s = await getJSON('/forge/status'); F.files = s.files; F.log = s.log; } catch { F.files = {}; } updateStatus(); }
async function pollGame() {
  let s = null;
  try { s = await getJSON('/agent/status'); } catch {}
  F.game.status = s;
  const list = s?.tabList ?? [];
  const want = F.game.pin ? list.find((t) => t.id === F.game.pin) : list.find((t) => t.active) ?? list[0];
  const was = F.game.alive;
  F.game.alive = !!want; F.game.active = want?.id ?? null; F.game.kind = want?.kind ?? null; F.game.busy = !!want && want.lastPollMsAgo > 4000;
  F.health.game = !want ? 'stale' : F.game.busy ? 'warn' : 'live';
  F.health.harness = list.some((t) => t.kind === 'agent') ? 'live' : 'off';
  if (was !== F.game.alive) emit('game', F.game);
  paintBar();
}
async function pollShard() {
  try { const h = await getJSON(`/forge/shard?port=${F.shardPort}`); F.health.shard = h.ok ? 'live' : 'off'; F.shard = h; } catch { F.health.shard = 'off'; }
  F.health.files = Object.values(F.files).every((f) => f && !f.error && !f.missing && f.roundTrips !== false) && Object.keys(F.files).length ? 'live' : 'stale';
  paintBar();
}
export function startHealth() {
  pollGame(); refreshFiles().then(pollShard);
  setInterval(pollGame, 2000);
  setInterval(() => { refreshFiles(); pollShard(); }, 6000);
}
function paintBar() {
  const led = $('#led'), name = $('#tabname'), kind = $('#tabkind');
  if (!led) return;
  led.className = `led ${F.health.game === 'live' ? 'live' : F.health.game === 'warn' ? 'warn' : 'stale'}`;
  name.textContent = F.game.alive ? `TAB ${F.game.active}` : 'NO GAME';
  kind.textContent = F.game.alive ? `${F.game.pin ? 'pinned' : 'auto'} · ${F.game.kind ?? ''}${F.game.busy ? ' · busy' : ''}` : 'start npm run agent';
  const dots = [['game', 'GAME', 'the attached game tab: polling (green), deep in a long command (amber), none (rust)'], ['shard', 'SHARD', `the shard server on :${F.shardPort} (/health)`], ['harness', 'HARNESS', 'a headless agent harness tab (npm run agent) is connected'], ['files', 'FILES', 'the forge files exist and round-trip byte for byte']];
  $('#health').innerHTML = dots.map(([k, l, t]) => `<span class="hdot" title="${esc(t)}: ${F.health[k] ?? '…'}"><i class="led ${F.health[k] === 'live' ? 'live' : F.health[k] === 'warn' ? 'warn' : F.health[k] === 'off' ? '' : 'stale'}"></i>${l}</span>`).join('');
}
export async function pickGameTab() {
  const list = F.game.status?.tabList ?? [];
  const opts = [['', `AUTO · whichever tab the bridge drives${F.game.active && !F.game.pin ? ` (now ${F.game.active})` : ''}`], ...list.map((t) => [t.id, `${t.id} · ${t.kind} · open ${t.openFor}s${t.active ? ' · active' : ''}`])];
  const v = await modal({ title: 'ATTACH TO A GAME TAB', fields: [{ key: 'tab', label: 'Game tab', type: 'select', value: F.game.pin ?? '', options: opts, help: 'Pushes, teleports, screenshots and the OBSERVE tab all go to this tab. AUTO follows the bridge (the newest tab, or the one running).' }], ok: 'ATTACH' });
  if (!v) return;
  F.game.pin = v.tab || null;
  const u = new URL(location.href); if (F.game.pin) u.searchParams.set('tab', F.game.pin); else u.searchParams.delete('tab'); history.replaceState(null, '', u);
  await pollGame(); emit('game', F.game);
}

// ---- the status strip ------------------------------------------------------------------------------------------------------
export function updateStatus() {
  const f = F.files, fx = (k) => (f[k] ? `<b>${k}.json</b> ${f[k].hash ?? '?'} · ${Object.values(f[k].rows ?? {}).reduce((a, b) => a + b, 0)} rows${f[k].roundTrips === false ? ' <span class="bad">· does not round-trip</span>' : ''}` : '');
  const sf = $('#stFiles'); if (!sf) return;
  sf.innerHTML = ['usmap', 'brush'].map(fx).filter(Boolean).join(' &nbsp;·&nbsp; ') || '—';
  const s = stack(F.tab);
  $('#stUndo').innerHTML = `<b>${(F.tabs.get(F.tab)?.label ?? '').toUpperCase()}</b> undo ${s.undo.length}${s.undo.length ? ` <span class="warn">(${esc(s.undo[s.undo.length - 1].label)})</span>` : ''} · redo ${s.redo.length}`;
  const c = F.check;
  $('#stCheck').innerHTML = c ? `checks: <span class="${c.ok ? 'ok' : 'bad'}">${c.text}</span>` : '';
  const p = F.lastPush;
  $('#stPush').innerHTML = p ? `push: <span class="${p.ok ? 'ok' : p.why === 'no game' ? 'warn' : 'bad'}">${p.ok ? `${p.file} · ${p.chunks ?? 0} chunk(s) · ${p.ms ?? '?'} ms` : esc(p.why ?? 'failed')}</span>` : '';
}

// ---- toasts, modal, drawer, palette ------------------------------------------------------------------------------------------
export function toast(msg, kind = '', head = '') {
  const t = el('div', { class: `toast ${kind}` }, head ? el('b', {}, head) : null, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3600);
}
// A form in the shared dialog. fields: [{key, label, type: text|number|select|textarea|checkbox, value, options, help}].
export function modal({ title, fields = [], body = null, ok = 'SAVE', cancel = 'CANCEL', wide = false, validate = null }) {
  const dlg = $('#modal');
  dlg.classList.toggle('wide', !!wide);
  $('#modalTitle').textContent = title;
  const mb = $('#modalBody'); mb.innerHTML = '';
  if (body) mb.append(typeof body === 'string' ? el('div', { html: body }) : body);
  const inputs = {};
  for (const f of fields) {
    let inp;
    if (f.type === 'select') { inp = el('select', { name: f.key }); for (const o of f.options) { const [v, l] = Array.isArray(o) ? o : [o, o]; inp.append(el('option', { value: v, selected: String(v) === String(f.value ?? '') ? true : undefined }, l)); } }
    else if (f.type === 'textarea') { inp = el('textarea', { name: f.key, spellcheck: 'false' }); inp.value = f.value ?? ''; }
    else if (f.type === 'checkbox') { inp = el('input', { type: 'checkbox', name: f.key, checked: f.value ? true : undefined, style: { height: '18px', width: '18px' } }); }
    else { inp = el('input', { type: f.type ?? 'text', name: f.key, step: f.step ?? 'any' }); inp.value = f.value ?? ''; }
    inputs[f.key] = inp;
    mb.append(el('label', {}, f.label, inp, f.help ? el('span', { class: 'help' }, f.help) : null));
  }
  const err = el('div', { class: 'err' }); mb.append(err);
  const foot = $('#modalFoot'); foot.innerHTML = '';
  const bc = el('button', { class: 'btn ghost', value: 'cancel' }, cancel), bo = el('button', { class: 'btn on', value: 'ok' }, ok);
  foot.append(bc, bo);
  return new Promise((res) => {
    const collect = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.type === 'checkbox' ? i.checked : i.value]));
    bo.onclick = (e) => { e.preventDefault(); const v = collect(); const bad = validate?.(v); if (bad) { err.textContent = bad; return; } dlg.close('ok'); res(v); };
    bc.onclick = (e) => { e.preventDefault(); dlg.close('cancel'); res(null); };
    dlg.onclose = () => { if (dlg.returnValue !== 'ok') res(null); };
    dlg.returnValue = '';
    dlg.showModal();
    (Object.values(inputs)[0] ?? bo).focus?.();
  });
}
export async function confirmBox(title, text, yes = 'YES', no = 'CANCEL') { return !!(await modal({ title, body: `<p>${esc(text)}</p>`, ok: yes, cancel: no })); }
export function openDrawer(title, html) { $('#drawerTitle').textContent = title; $('#drawerBody').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
export function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
// A design doc, read-only, in the dialog (docs/design/*.md through /forge/file).
export async function showDoc(path) {
  const r = await fetch(`/forge/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) return toast(`${path} is not readable here`, 'bad');
  const md = await r.text();
  const html = md.split('\n').map((l) => {
    if (/^#{1,3} /.test(l)) { const n = l.match(/^#+/)[0].length; return `<h${n}>${esc(l.replace(/^#+ /, ''))}</h${n}>`; }
    if (/^\|/.test(l)) return `<div class="tr">${esc(l)}</div>`;
    if (/^\s*[-*] /.test(l)) return `<li>${esc(l.replace(/^\s*[-*] /, ''))}</li>`;
    return l.trim() ? `<p>${esc(l)}</p>` : '';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  await modal({ title: path.split('/').pop(), body: el('div', { class: 'docview', html }), ok: 'CLOSE', cancel: 'BACK', wide: true });
}
// The command palette: providers return [{label, hint, tag, run}] for a query.
const providers = [];
export const addPalette = (fn) => providers.push(fn);
export function openPalette() {
  const p = $('#palette'), inp = $('#palInput'), list = $('#palList');
  let items = [], i = 0;
  const render = () => {
    const q = inp.value.trim().toLowerCase();
    items = providers.flatMap((fn) => fn(q) ?? []).filter((it) => !q || `${it.label} ${it.hint ?? ''} ${it.tag ?? ''}`.toLowerCase().includes(q)).slice(0, 40);
    i = Math.min(i, Math.max(0, items.length - 1));
    list.innerHTML = '';
    items.forEach((it, k) => list.append(el('li', { class: k === i ? 'on' : '', onclick: () => { close(); it.run(); } }, it.tag ? el('i', {}, it.tag) : null, el('b', {}, it.label), el('span', {}, it.hint ?? ''))));
  };
  const close = () => { p.classList.add('hidden'); inp.onkeydown = inp.oninput = null; };
  inp.value = ''; p.classList.remove('hidden'); inp.focus(); render();
  inp.oninput = () => { i = 0; render(); };
  inp.onkeydown = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { i = Math.min(items.length - 1, i + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { i = Math.max(0, i - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[i]) { close(); items[i].run(); }
  };
  p.onclick = (e) => { if (e.target === p) close(); };
}
