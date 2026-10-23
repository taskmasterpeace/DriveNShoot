// THE OBSERVER (docs/design/WEB_OBSERVER.md): watch a running game from another tab or window, select anyone, drive
// it with the same COMMANDS agents use, replay recorded sessions with a heatmap. Talks only to the dev server:
//   GET  /agent/feed      the latest frame + new events (pushed by the game tab while somebody watches)
//   POST /agent/cmd       {cmd, args, tab} - every control here is a COMMANDS row (there is no second API)
//   GET  /agent/sessions, /agent/session?id=   recorded sessions on disk (web/sessions/)

import { MapView, flagCanvas, flagURL, EVENT_STYLE } from './map.js';
import { drawPortrait } from '../ui/portrait.js';
import { parseSession, sessionAt, heatmap, FLAG, KEYS } from '../agent/recorder.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => Math.round(v * 10) / 10;
const fmtT = (t) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtAge = (t) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`; }; // game time since boot, on the wire
const fmtHMS = (t) => { const s = Math.max(0, Math.floor(t)), h = Math.floor(s / 3600); return h ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmtT(s); };

const params = new URLSearchParams(location.search);
const S = {
  obs: `o${Math.random().toString(36).slice(2, 8)}`,
  tab: params.get('tab') || null, // null: whichever tab the bridge drives
  tabList: [], boot: null, since: 0,
  snap: null, prev: null, snapAt: 0, prevAt: 0, ageMs: null, factions: null,
  base: null, tiles: new Map(), tileAsk: 0, tileBusy: false,
  events: [], ripples: [], feedFilter: 'all',
  sel: null, follow: false, cam: { on: false, busy: false, url: null, at: 0 },
  layers: { people: true, vehicles: true, doors: true, events: true, labels: true, flags: false },
  mode: 'live', replay: null, heatLayer: 'off', heatAll: false, heatCache: new Map(),
  perfHist: [], lastCard: '', lastCensus: '', lastFacs: '', lastPerf: 0,
  pos: new Map(), connected: false,
};
const view = new MapView($('map'));

// ------------------------------------------------------------------------------------------------ the wire to the game
async function cmd(name, args = {}, { log = true, quiet = false } = {}) {
  const t0 = performance.now();
  let r;
  try {
    const res = await fetch('/agent/cmd', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: name, args, ...(S.tab ? { tab: S.tab } : {}) }) });
    r = await res.json();
  } catch (e) { r = { ok: false, error: String(e.message ?? e) }; }
  if (log) logCmd(name, args, r, performance.now() - t0, quiet);
  return r;
}
function logCmd(name, args, r, ms, quiet) {
  const li = document.createElement('li');
  if (!r.ok) li.className = 'bad';
  const a = Object.entries(args).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
  li.innerHTML = `<i></i><span title="${esc(r.ok ? JSON.stringify(r).slice(0, 600) : r.error + (r.hint ? ` — ${r.hint}` : ''))}">${esc(name)} ${esc(a)}${r.ok ? '' : ` → ${esc(r.error)}`}</span><em>${Math.round(ms)}ms</em>`;
  if (quiet && r.ok) return;
  const ol = $('cmdlog'); ol.prepend(li); while (ol.children.length > 40) ol.lastChild.remove();
}

async function poll() {
  let delay = S.mode === 'replay' ? 600 : 200;
  try {
    const q = new URLSearchParams({ obs: S.obs, since: String(S.since), boot: S.boot ?? '' });
    if (S.tab) q.set('tab', S.tab);
    const vr = view.viewRect();
    if ((vr[2] - vr[0]) * (vr[3] - vr[1]) < 900 * 900) q.set('bbox', vr.map((v) => Math.round(v)).join(','));
    if (S.sel) q.set('sel', S.sel);
    const f = await fetch(`/agent/feed?${q}`, { cache: 'no-store' }).then((r) => r.json());
    S.tabList = f.tabList ?? [];
    if (!f.ok || !f.snap) { setStale(true, f.ok ? 'the game tab has not sent a frame yet - it starts the moment it sees this page polling (give it a second)' : 'no game tab is connected to this dev server. Open the game (http://localhost:PORT/) in another window, or run npm run agent.'); }
    else onFrame(f);
  } catch (e) { setStale(true, `the dev server is not answering (${e.message})`); delay = 1500; }
  renderTabChip();
  setTimeout(poll, delay);
}
function setStale(on, why) {
  S.connected = !on;
  $('stale').classList.toggle('hidden', !on || S.mode === 'replay');
  if (why) $('staleWhy').textContent = why;
  $('led').className = `led ${on ? 'stale' : 'live'}`;
}

function onFrame(f) {
  if (f.boot !== S.boot) { S.boot = f.boot; S.since = 0; S.events = []; if (S.mode === 'live') $('feed').innerHTML = ''; S.prev = null; S.primed = false; S.ripples = []; } // a reload: the replay's wire is not the live one
  S.factions = f.factions ?? S.factions;
  S.ageMs = f.ageMs;
  const stale = f.ageMs > 4000;
  setStale(stale, stale ? `the game tab stopped sending frames ${Math.round(f.ageMs / 1000)} s ago (paused by the browser while hidden, or busy)` : null);
  if (f.snap !== S.snap && f.snap.t !== S.snap?.t) { S.prev = S.snap; S.prevAt = S.snapAt; S.snap = f.snap; S.snapAt = performance.now(); }
  else S.snap = f.snap;
  // The first batch is history (what led up to opening the page): it goes on the wire, not as ripples on the map.
  const history = !S.primed; S.primed = true;
  for (const e of f.events) if (e.seq > S.since) { S.since = e.seq; addEvent(e, history); }
  if (!S.base && f.hasBase) loadBase();
  for (const k of f.tileKeys ?? []) if (!S.tiles.has(k)) { S.tiles.set(k, null); const img = new Image(); img.onload = () => S.tiles.set(k, img); img.src = `/agent/tile?key=${encodeURIComponent(k)}${S.tab ? `&tab=${S.tab}` : ''}`; }
  if (performance.now() - S.lastPerf > 400) { S.lastPerf = performance.now(); renderTop(); renderPerf(); renderFactions(); renderCensus(); if (S.mode === 'live') renderCard(); camTick(); }
}

// The map's ground comes over the feed (the game sends it once somebody watches), never through the command queue.
async function loadBase() {
  if (S.baseBusy) return;
  S.baseBusy = true;
  try {
    const r = await fetch(`/agent/mapbase${S.tab ? `?tab=${S.tab}` : ''}`, { cache: 'no-store' }).then((x) => x.json());
    if (r.ok) {
      const img = new Image();
      img.onload = () => { r.islandImg = img; S.base = r; };
      img.src = r.island.image;
      if (!S.centred && S.snap) { view.cx = S.snap.player.x; view.cz = S.snap.player.z; S.centred = true; }
    }
  } catch {}
  S.baseBusy = false;
}

// -------------------------------------------------------------------------------------------- positions between frames
function interpolate() {
  const s = S.snap, p = S.prev;
  S.pos.clear();
  if (!s) return;
  const span = Math.max(60, S.snapAt - S.prevAt), k = p ? Math.min(1, (performance.now() - S.snapAt) / span) : 1;
  const prevPos = new Map();
  if (p) { for (const c of p.chars) prevPos.set(c[0], c); prevPos.set(p.player.id, [p.player.id, p.player.x, p.player.z, p.player.face]); for (const v of p.vehicles) prevPos.set(v[0], [v[0], v[2], v[3], v[4]]); }
  const lerpA = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  const put = (id, x, z, h) => {
    const o = prevPos.get(id);
    if (!o || Math.hypot(o[1] - x, o[2] - z) > 25) { S.pos.set(id, { x, z, h }); return; }
    S.pos.set(id, { x: o[1] + (x - o[1]) * k, z: o[2] + (z - o[2]) * k, h: lerpA(o[3], h) });
  };
  for (const c of s.chars) put(c[0], c[1], c[2], c[3]);
  for (const v of s.vehicles) { const o = prevPos.get(v[0]); put(v[0], v[2], v[3], v[4]); if (!o) continue; }
  put(s.player.id, s.player.vehicle ? (s.vehicles.find((v) => v[0] === s.player.vehicle.id)?.[2] ?? s.player.x) : s.player.x, s.player.vehicle ? (s.vehicles.find((v) => v[0] === s.player.vehicle.id)?.[3] ?? s.player.z) : s.player.z, s.player.face);
}

// ------------------------------------------------------------------------------------------------------ the event wire
const CLASS = {
  combat: new Set(['kill', 'hurt', 'downed', 'thrown', 'detonated', 'fire', 'residentDied', 'respawn', 'playerDied', 'windowShattered', 'doorKick', 'doorBash', 'tyrePopped', 'breach', 'tankerExploded', 'echoStrike', 'sprinterBurst', 'grabbed', 'flung', 'draggedOut', 'trainHit', 'jam', 'gunBroke', 'ignited', 'caltrops', 'scattered']),
  society: new Set(['deed', 'rumor', 'rumorHop', 'rumorSilenced', 'witnessRuns', 'witnessPaid', 'witnessCowed', 'witnessBrave', 'wordArrived', 'memory', 'vendetta', 'roleTier', 'roleSuspended', 'roleCall', 'sworn', 'officeLost', 'jobStarted', 'jobProgress', 'jobPaid', 'recruited', 'talk', 'refused', 'territory', 'questComplete', 'treated', 'dialogueChoice', 'shout']),
  director: new Set(['director', 'directorSkip', 'radio', 'radioDigest', 'hordeSpawned', 'infectedSpawned', 'convoySpotted', 'convoyEngaged', 'convoyLooted', 'choirSite', 'choirSilenced', 'baseAlarm', 'baseCalm', 'newDay']),
  trade: new Set(['trade', 'restocked', 'dealt', 'stole', 'itemFound', 'pickup', 'containerOpened', 'consumed', 'itemUsed']),
};
const NOISY = new Set(['bark', 'residentBark', 'greet', 'streamStall', 'zoom', 'waypoint', 'hmrRestored', 'npcSleep', 'npcWoke', 'need', 'honk', 'observerProbe', 'toast', 'boarded', 'panelLost', 'seatChanged', 'vehicleDamage', 'vaulted', 'dived', 'water', 'pack', 'loaded', 'saved', 'autosaved', 'leftVehicle', 'slipped', 'lockHit', 'boardsHit', 'residentsPromoted', 'windowShot', 'windowCracked', 'tyrePopped', 'trainArrived', 'trainDeparted', 'skillUp']);
const classOf = (t) => { for (const [k, set] of Object.entries(CLASS)) if (set.has(t)) return k; return 'world'; };
const charRow = (id) => S.snap?.chars.find((c) => c[0] === id || c[13] === id);
let whoCtx = null; // a replayed event: the names and flags the recorder kept beside its ids
function who(id) {
  if (!id) return 'someone';
  if (S.snap && id === S.snap.player.id) return `<img class="flagimg" src="${flagURL(S.snap.player.flag || 'US')}" alt="">YOU`;
  if (whoCtx) for (const k of ['by', 'victim', 'id', 'witness']) if (whoCtx[k] === id && whoCtx[`${k}N`]) return `${whoCtx[`${k}F`] ? `<img class="flagimg" src="${flagURL(whoCtx[`${k}F`])}" alt="">` : ''}${esc(whoCtx[`${k}N`])}`;
  const r = whoCtx ? null : charRow(id);
  if (!r) return esc(id);
  return `${r[5] ? `<img class="flagimg" src="${flagURL(r[5])}" alt="${esc(r[5])}">` : ''}${esc(r[9] || r[0])}`;
}
// A character's kind (c.faction) as the faction table names it; the infected's kind never reaches the screen.
const KIND_FACTION = { zombie: 'infected', raider: 'dustwolves', drifter: 'drifters', warden: 'rusthaven', town: 'rusthaven', soldier: 'remnant' };
const KIND_LABEL = { zombie: 'infected', raider: 'raider (Dustwolf)', drifter: 'drifter', warden: 'warden (Rust Haven)', soldier: 'soldier (Remnant)' };
const fname = (f) => esc(S.factions?.[f]?.name ?? f ?? '');
function describe(e) {
  switch (e.type) {
    case 'kill': return `${who(e.victim)} <i>(${fname(KIND_FACTION[e.faction] ?? e.faction)})</i> ${e.downed ? 'downed' : 'killed'} by ${e.by ? who(e.by) : 'the world'} · ${esc(e.cause ?? '')}`;
    case 'hurt': return `YOU took ${e.amount} from ${e.by ? who(e.by) : esc(e.cause ?? 'something')} → ${e.hp} hp`;
    case 'downed': return `${who(e.id)} is down, up in ${e.backInSeconds}s`;
    case 'deed': return `you: <b style="color:inherit">${esc(e.verb)}</b> ${e.targetName ? esc(e.targetName) : ''} ${e.faction ? `(${fname(e.faction)})` : ''} · ${e.unwitnessed ? 'nobody saw' : `${Array.isArray(e.witnesses) ? e.witnesses.length : e.witnesses ?? 0} saw`}`;
    case 'rumor': return `word reached ${fname(e.faction)}: ${esc(e.verb)} (${e.delta > 0 ? '+' : ''}${e.delta} → ${e.standing})${e.witnessName ? ` from ${esc(e.witnessName)}` : ''}`;
    case 'witnessRuns': return `${who(e.id)} runs to tell ${fname(e.faction)} (${esc(e.verb)}, ${e.dist} m)`;
    case 'director': return `${esc(e.tpl)} ${esc(e.phase)}${e.outcome ? ` · ${esc(e.outcome)}` : ''}${e.members ? ` · ${e.members.length} people` : ''}`;
    case 'trade': return `${esc(e.side)} ${esc(e.item)} ×${e.n} with ${esc(e.trader)} · $${e.cash}`;
    case 'roleTier': return `the world calls you <b style="color:inherit">${esc(e.role)}</b>: ${esc(e.from)} → ${esc(e.to)}`;
    case 'memory': return `${esc(e.npc)} remembers: ${esc(e.kind)}${e.heard ? ' (heard)' : ''}`;
    case 'vendetta': return `${esc(e.name)} wants you dead (${esc(e.kind)})`;
    case 'residentDied': return `${esc(e.name)} of ${esc(e.house)} died (${e.left} left)`;
    case 'playerDied': return 'YOU DIED';
    case 'respawn': return `you woke at the clinic (${e.x}, ${e.z})`;
    case 'radio': case 'radioDigest': return esc(e.text ?? e.line ?? e.lines?.[0] ?? 'on air');
    case 'error': return esc(e.msg).slice(0, 160);
    default: {
      const SKIP = ['seq', 't', 'type', 's', 'y', 'px', 'pz', 'at', 'you', 'byYou'];
      return Object.entries(e).filter(([k, v]) => !SKIP.includes(k) && !/^(by|victim|id|witness)[NF]$/.test(k) && !(whoCtx && (k === 'x' || k === 'z')) && v !== null && v !== '' && typeof v !== 'object').slice(0, 4)
        .map(([k, v]) => (typeof v === 'string' && /^c\d+$/.test(v) ? `<i style="color:var(--dim);font-style:normal">${esc(k)}</i> ${who(v)}`
          : typeof v === 'string' && /^v\d+$/.test(v) && S.snap?.vehicles.some((q) => q[0] === v) ? `<i style="color:var(--dim);font-style:normal">${esc(k)}</i> ${esc(S.snap.vehicles.find((q) => q[0] === v)[11])}`
          : `<i style="color:var(--dim);font-style:normal">${esc(k)}</i> ${esc(v)}`)).join(' · ');
    }
  }
}
function eventPos(e) {
  if (Number.isFinite(e.x) && Number.isFinite(e.z)) return { x: e.x, z: e.z };
  for (const k of ['victim', 'id', 'witness', 'npc']) { const r = e[k] && (charRow(e[k]) ?? (S.snap && e[k] === S.snap.player.id ? [0, S.snap.player.x, S.snap.player.z] : null)); if (r) return { x: r[1], z: r[2] }; }
  if (e.type === 'hurt' || e.type === 'deed' || e.type === 'trade' || e.type === 'roleTier') return S.snap ? { x: S.snap.player.x, z: S.snap.player.z } : null;
  return null;
}
function addEvent(e, history = false) {
  S.events.push(e); if (S.events.length > 400) S.events.shift();
  const p = eventPos(e);
  if (p && !history && !NOISY.has(e.type)) S.ripples.push({ ...p, type: e.type, at: performance.now(), life: e.type === 'director' ? 10 : 6, label: e.type === 'kill' ? (charRow(e.victim)?.[8] ? charRow(e.victim)[9] : '') : e.type === 'director' ? `${e.tpl} ${e.phase}` : e.type === 'deed' ? e.verb : '', hub: e.hub });
  if (S.ripples.length > 120) S.ripples.splice(0, S.ripples.length - 120);
  if (S.mode === 'live') feedLine(e, p, true);
}
function feedLine(e, p, live) {
  const cls = classOf(e.type);
  if (NOISY.has(e.type) && S.feedFilter !== 'world') return;
  if (S.feedFilter !== 'all' && S.feedFilter !== cls) return;
  const li = document.createElement('li');
  li.className = `ev ${cls}`;
  li.innerHTML = `<time title="game time since the page loaded">${fmtAge(e.t)}</time><div><b>${esc(e.type)}</b>${describe(e)}</div>`;
  if (p) li.onclick = () => { view.cx = p.x; view.cz = p.z; if (view.s < 2) view.s = 2.5; S.follow = false; renderFollow(); const id = e.victim ?? e.id ?? e.witness; if (id && charRow(id)) select(charRow(id)[0]); };
  const ol = $('feed');
  if (live) ol.prepend(li); else ol.append(li);
  while (ol.children.length > 160) ol.lastChild.remove();
  $('feedCount').textContent = `${S.events.length}`;
}
function refeed() {
  $('feed').innerHTML = '';
  if (S.mode === 'replay' && S.replay) { replayFeed(true); return; }
  for (const e of S.events.slice(-160)) feedLine(e, eventPos(e), true);
}

// ------------------------------------------------------------------------------------------------------------- panels
function renderTabChip() {
  const t = S.tab ? S.tabList.find((x) => x.id === S.tab) : S.tabList.find((x) => x.active);
  $('tabname').textContent = t ? `TAB ${t.id}` : 'NO GAME';
  $('tabkind').textContent = t ? `${t.kind}${t.active ? ' · driven' : ''}${S.tabList.length > 1 ? ` · 1 of ${S.tabList.length}` : ''}` : '';
}
function renderTop() {
  const s = S.snap; if (!s) return;
  $('clk').textContent = s.clock;
  $('clkSub').textContent = `${s.phase} · ${s.weatherLabel} · DAY ${s.day}${s.fast ? ' · ×40' : ''}`;
  $('btnPause').classList.toggle('on', s.paused);
  $('btnPause').querySelector('span').textContent = s.paused ? 'PAUSED' : 'PAUSE';
  $('btnGod').classList.toggle('on', s.player.god);
  const R = s.rec;
  $('rec').classList.toggle('off', !R?.on);
  $('recTime').textContent = R ? `REC ${fmtHMS(R.seconds)}${R.saved ? ' · SAVED' : ''}` : 'REC —';
  $('rec').title = R ? `session ${R.id}: ${R.samples} samples${R.saved ? `, last written ${R.saved.at} to ${R.saved.path}` : ', not on disk yet'}` : '';
}
function sparkline(canvas, vals, budget) {
  const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(2, devicePixelRatio);
  canvas.width = w * d; canvas.height = h * d;
  const g = canvas.getContext('2d'); g.scale(d, d);
  const max = Math.max(budget * 1.6, ...vals);
  g.strokeStyle = 'rgba(227,167,47,0.25)'; g.setLineDash([3, 3]); const by = h - (budget / max) * h; g.beginPath(); g.moveTo(0, by); g.lineTo(w, by); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(227,167,47,0.12)'; g.strokeStyle = '#e3a72f'; g.lineWidth = 1.5; g.beginPath();
  vals.forEach((v, i) => { const x = (i / Math.max(1, vals.length - 1)) * w, y = h - (v / max) * h; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
  g.fillStyle = '#9a8a6a'; g.font = "600 10px 'Barlow Condensed'"; g.textAlign = 'right'; g.fillText(`${budget.toFixed(1)} ms budget`, w - 4, by - 3);
}
function renderPerf() {
  const p = S.snap?.perf; if (!p) return;
  S.perfHist.push(p.frameMs ?? 0); if (S.perfHist.length > 150) S.perfHist.shift();
  const cls = (v, w, b) => (v >= b ? 'bad' : v >= w ? 'warn' : '');
  const st = (k, v, c = '') => `<div class="stat"><span>${k}</span><b class="${c}">${v}</b></div>`;
  $('perf').innerHTML = `<canvas class="spark" id="spark"></canvas>`
    + st('fps', p.fps, cls(-p.fps, -45, -30)) + st('frame', `${p.frameMs ?? '—'} ms`, cls(p.frameMs, 20, 33))
    + st('draw calls', `${p.drawCalls}<small style="color:var(--dim)">/150</small>`, cls(p.drawCalls, 120, 150)) + st('triangles', `${Math.round(p.triangles / 1000)}k`)
    + st('stalls', `${p.stalls}${p.byCause?.cross || p.byCause?.promote ? ` <small>(${p.byCause.cross ?? 0} cross · ${p.byCause.promote ?? 0} promote)</small>` : ''}`, cls((p.byCause?.cross ?? 0) + (p.byCause?.promote ?? 0), 1, 3))
    + st('pump p95', `${p.pump?.p95 ?? '—'} ms`, cls(p.pump?.p95 ?? 0, 2, 4)) + st('chunks', `${p.hot} hot · ${p.layouts}`)
    + st('heap', p.heapMB ? `${p.heapMB} MB` : '—') + st('errors', p.errors, p.errors ? 'bad' : '') + st('feed age', `${S.ageMs ?? '—'} ms`, cls(S.ageMs ?? 0, 800, 3000));
  $('perfSub').textContent = `${p.alive}/${p.chars} people · ${p.vehicles} vehicles`;
  sparkline($('spark'), S.perfHist, 16.7);
}
function renderFactions() {
  const F = S.factions; if (!F) return;
  const rows = Object.entries(F).filter(([, f]) => f.standing !== null && f.standing !== undefined);
  const key = JSON.stringify(rows.map(([id, f]) => [id, f.reading, f.tier]));
  if (key === S.lastFacs) return; S.lastFacs = key;
  $('factions').innerHTML = rows.map(([id, f]) => `<div class="facrow" title="${esc(f.name)}: standing ${f.standing}, read as ${f.reading} (roles)${f.wars?.length ? ` · at war with ${f.wars.join(', ')}` : ''}"><div class="nm"><i style="background:${esc(f.color)}"></i>${esc(f.name)}</div><div class="gauge"><i style="left:${(f.reading + 100) / 2}%"></i></div><div class="tier ${esc(f.tier)}">${f.hostile ? '⚠ ' : ''}${esc(f.tier)} ${f.reading > 0 ? '+' : ''}${f.reading}</div></div>`).join('');
}
function renderCensus() {
  const s = S.snap; if (!s) return;
  const by = {};
  for (const c of s.chars) { const f = (by[c[4]] ??= { alive: 0, dead: 0, fight: 0 }); if (c[6] === 'dead') f.dead++; else { f.alive++; if (c[6] === 'fighting' || c[6] === 'hunting') f.fight++; } }
  const key = JSON.stringify(by); if (key === S.lastCensus) return; S.lastCensus = key;
  const total = s.chars.length || 1;
  $('census').innerHTML = Object.entries(by).sort((a, b) => b[1].alive - a[1].alive).map(([f, n]) => {
    const col = S.factions?.[f]?.color ?? '#9a8a6a', all = n.alive + n.dead;
    return `<div class="census-row"><div><span>${esc(S.factions?.[f]?.name ?? f)}</span><div class="stack"><i style="width:${(n.alive / total) * 100}%;background:${col}"></i><i style="width:${(n.dead / total) * 100}%;background:oklch(0.35 0.06 30)"></i></div></div><b>${n.alive}${n.fight ? ` <small style="color:var(--rust)">${n.fight}⚔</small>` : ''}${n.dead ? ` <small style="color:var(--dim)">+${n.dead}†</small>` : ''}</b></div>`;
  }).join('');
  $('censusSub').textContent = `${s.chars.filter((c) => c[6] !== 'dead').length} alive`;
}

// ------------------------------------------------------------------------------------------------------- the card
const portraits = new Map();
function portraitOf(id, p, flag) {
  const k = `${id}:${flag}`;
  if (!portraits.has(k)) { try { portraits.set(k, drawPortrait({ ...p, flag: flag || 'US' })); } catch { portraits.set(k, null); } }
  return portraits.get(k);
}
const meter = (cls, v, label, txt) => `<div class="bar-row"><span>${label}</span><div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(1, v)) * 100}%"></i></div><b>${txt}</b></div>`;
function renderCard() {
  const el = $('card'), s = S.snap;
  if (!s) { el.innerHTML = emptyCard('Waiting for the game…'); return; }
  const isPlayer = !S.sel || S.sel === s.player.id;
  const d = isPlayer ? { player: true, ...s.player } : s.detail?.[S.sel];
  if (!isPlayer && !d) {
    const row = charRow(S.sel);
    if (!row) { S.sel = null; S.follow = false; renderFollow(); return renderCard(); }
    el.innerHTML = emptyCard(`Reading ${esc(row[9])}…`); return;
  }
  const key = JSON.stringify(d) + S.cam.url;
  if (key === S.lastCard) return; S.lastCard = key;
  const scroll = el.scrollTop;
  el.innerHTML = isPlayer ? playerCard(d) : personCard(d);
  const slot = el.querySelector('.portrait');
  if (slot) { const pc = portraitOf(d.id, d.portrait ?? { seed: 11 }, d.flag); if (pc) slot.prepend(pc); }
  el.scrollTop = scroll;
  el.querySelectorAll('[data-card]').forEach((b) => b.onclick = () => cardAction(b.dataset.card, d));
}
const emptyCard = (msg) => `<div class="empty"><div class="ring"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg></div><div>${msg}</div></div>`;
function playerCard(p) {
  const n = p.needs ?? {}, mag = `${p.mag}/${p.magSize}`;
  return `<div class="who"><div class="portrait"><img class="fl" src="${flagURL(p.flag || 'US')}" alt=""></div><div>
    <h3>YOU</h3><div class="meta"><span class="tag">${esc(p.id)}</span>${p.god ? '<span class="tag ok">GOD</span>' : ''}${p.wanted ? `<span class="tag hot">WANTED ${'★'.repeat(p.wanted)}</span>` : ''}${p.alive ? '' : '<span class="tag hot">DEAD</span>'}</div>
    <div class="state">${esc(p.location)}<small>${esc(p.district)}${p.inside ? ' · inside' : ''}${p.floor ? ` · floor ${p.floor}` : ''}</small></div></div></div>
    <div class="bars">${meter('hp', p.hp / p.maxHp, 'HEALTH', `${p.hp}/${p.maxHp}`)}${meter('', p.stamina, 'STAMINA', `${Math.round(p.stamina * 100)}%`)}${meter('water', n.water ?? 0, 'WATER', `${Math.round((n.water ?? 0) * 100)}%`)}${meter('food', n.food ?? 0, 'FOOD', `${Math.round((n.food ?? 0) * 100)}%`)}${meter('rest', n.rest ?? 0, 'REST', `${Math.round((n.rest ?? 0) * 100)}%`)}</div>
    ${n.fever ? `<div class="hint">Bite fever: ${esc(JSON.stringify(n.fever))}</div>` : ''}
    <div class="sect"><h4>Kit</h4><dl class="kv"><dt>Weapon</dt><dd>${esc(p.weapon)} · ${mag} · ${p.ammo?.[p.weapon] ?? Object.values(p.ammo ?? {}).join('/')} in pockets</dd><dt>Guns</dt><dd>${esc(p.guns.join(', '))}</dd><dt>Throw</dt><dd>${Object.entries(p.throwables).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')}</dd><dt>Cash</dt><dd>$${p.cash} · ${p.kills} kills</dd>${p.vehicle ? `<dt>Driving</dt><dd>${esc(p.vehicle.name)} ${p.vehicle.hp}/${p.vehicle.maxHp} · ${p.vehicle.speed} m/s</dd>` : ''}${p.roles?.length ? `<dt>Called</dt><dd>${p.roles.map((r) => `${esc(r.name ?? r.id)} (${esc(r.tier)})`).join(', ')}</dd>` : ''}</dl></div>
    <div class="sect"><h4>Pack · ${esc(p.pack.worn ?? 'no pack')} · ${p.pack.kg} kg · ${p.pack.litres}/${p.pack.cap} L</h4><ul class="items">${p.pack.items.map((i) => `<li><span>${esc(i.name)}${i.cond !== undefined && i.cond !== null ? ` <small style="color:var(--dim)">${Math.round(i.cond * 100)}%</small>` : ''}</span><span>×${i.n} · ${i.kg} kg</span></li>`).join('') || '<li><span>empty</span><span></span></li>'}</ul></div>
    <div class="actions"><button type="button" class="btn mini" data-card="heal">HEAL</button><button type="button" class="btn mini" data-card="give">GIVE</button><button type="button" class="btn mini" data-card="look">LOOK</button><button type="button" class="btn mini danger" data-card="kill">KILL</button></div>`;
}
function personCard(d) {
  const facCol = d.color ?? S.factions?.[d.faction]?.color ?? '#9a8a6a';
  const mem = d.memory;
  const memHtml = d.named
    ? `<div class="sect"><h4>What ${esc(d.name.split(' ')[0])} remembers of you · opinion ${mem?.opinion ?? '—'}${mem?.refuses ? ' · REFUSES' : ''}${mem?.vendetta ? ' · VENDETTA' : ''}</h4><ul class="items mem">${(mem?.memories ?? []).map((m) => `<li><span>${esc(m.kind)}${m.heard ? ' (heard)' : ''}${m.about ? ` · ${esc(m.about)}` : ''}</span><span>${m.now > 0 ? '+' : ''}${m.now}</span></li>`).join('') || '<li><span>nothing yet - a clean slate</span><span></span></li>'}</ul></div>`
    : `<div class="sect"><h4>Memory</h4><div class="hint">Not a named person: reads you by ${esc(d.factionName)} standing ${mem?.standing ?? '—'} (${esc(mem?.tier ?? '—')}).</div></div>`;
  const inv = d.inventory ?? {};
  const items = [...(inv.gun ? [`<li><span>${esc(inv.gun)}</span><span>in hand</span></li>`] : []), ...(inv.carry ?? []).map((c) => `<li><span>${esc(c)}</span><span>carried</span></li>`), ...(inv.box?.items ?? []).map((i) => `<li><span>${esc(i.name)}</span><span>×${i.n}</span></li>`)];
  return `<div class="who"><div class="portrait"><img class="fl" src="${flagURL(d.flag)}" alt="${esc(d.flag)}"></div><div>
    <h3>${esc(d.name)}</h3><div class="meta"><span class="tag fac" style="background:${esc(facCol)}">${esc(d.factionName)}</span><span class="tag">${esc(d.id)}</span>${d.essential ? '<span class="tag ok">ESSENTIAL</span>' : ''}${d.hostileToPlayer ? '<span class="tag hot">HOSTILE TO YOU</span>' : ''}</div>
    <div class="state">${esc(d.state)}<small>ai: ${esc(d.aiRaw ?? '—')}${d.downedFor ? ` · up in ${d.downedFor}s` : ''}</small></div></div></div>
    ${S.cam.on ? `<div class="cam"><span class="camtag">● CAM ${esc(d.id)}</span>${S.cam.url ? `<img src="${S.cam.url}" alt="live camera on ${esc(d.name)}">` : ''}</div>` : ''}
    <div class="bars">${meter('hp', d.hp / d.maxHp, 'HEALTH', `${d.hp}/${d.maxHp}`)}</div>
    <div class="sect"><h4>Now</h4><dl class="kv"><dt>Target</dt><dd>${d.target ? `${esc(d.target.name)} · ${d.target.dist} m` : '—'}</dd><dt>Grudge</dt><dd>${esc(d.grudge ?? '—')}</dd><dt>Weapon</dt><dd>${esc(d.weaponName ?? 'unarmed')}${d.weapon ? ` · ${d.mag} in it${d.reloading ? ' · reloading' : ''}` : ''}</dd><dt>Where</dt><dd>${esc(d.location)} (${d.x}, ${d.z})${d.gy ? ` · up ${d.gy} m` : ''} · ${d.dist} m from you</dd>${d.vehicle ? `<dt>Vehicle</dt><dd>${esc(d.vehicle)}</dd>` : ''}${d.telling ? `<dt>Telling</dt><dd>${esc(d.telling.verb)} → (${d.telling.hub?.x}, ${d.telling.hub?.z})</dd>` : ''}${d.infected ? `<dt>Infected</dt><dd>${esc(d.infected.kind)} · speed ${d.infected.zSpeed}${d.infected.aura !== 1 ? ` · aura ×${d.infected.aura}` : ''}</dd>` : ''}</dl></div>
    <div class="sect"><h4>Needs & body</h4><dl class="kv"><dt>Bleeding</dt><dd>${d.body.bleed > 0.05 ? `yes (${d.body.bleed})` : 'no'} · soaked ${Math.round(d.body.blood * 100)}%</dd><dt>Asleep</dt><dd>${d.body.asleep ? 'yes' : 'no'}${d.body.knocked ? ' · knocked flat' : ''}${d.body.flee ? ` · fleeing ${d.body.flee}s` : ''}</dd>${d.household ? `<dt>Household</dt><dd>${esc(d.household.name)} (${esc(d.household.kind)}) · ${esc(d.household.where ?? '—')}</dd><dt>Today</dt><dd>${d.household.plan ? (d.household.plan.out ? `out ${d.household.plan.leave}h → back ${d.household.plan.back}h, ${d.household.plan.stops} stops` : 'home all day') : '—'}</dd>` : ''}</dl></div>
    <div class="sect"><h4>Carrying</h4><ul class="items">${items.join('') || '<li><span>nothing</span><span></span></li>'}</ul></div>
    ${memHtml}
    <div class="actions"><button type="button" class="btn mini ${S.follow ? 'on' : ''}" data-card="follow">FOLLOW</button><button type="button" class="btn mini ${S.cam.on ? 'on' : ''}" data-card="cam">CAM</button><button type="button" class="btn mini" data-card="heal">HEAL</button><button type="button" class="btn mini danger" data-card="kill">KILL</button><button type="button" class="btn mini" data-card="goto">GO TO</button><button type="button" class="btn mini" data-card="look">LOOK</button><button type="button" class="btn mini" data-card="talkto">FACE</button><button type="button" class="btn mini" data-card="deselect">CLOSE</button></div>`;
}
async function cardAction(a, d) {
  if (a === 'follow') { S.follow = !S.follow; renderFollow(); S.lastCard = ''; renderCard(); }
  if (a === 'cam') { S.cam.on = !S.cam.on; S.cam.url = null; S.lastCard = ''; renderCard(); camTick(true); }
  if (a === 'deselect') select(null);
  if (a === 'heal') await cmd('heal', { id: d.id });
  if (a === 'give') openModal('give');
  if (a === 'goto') await cmd('teleport', { x: d.x + 2.5, z: d.z + 2.5 });
  if (a === 'talkto') await cmd('aim', { x: d.x, z: d.z });
  if (a === 'look') lookAt(d.x, d.z, d.name ?? 'YOU');
  if (a === 'kill') confirmModal(`KILL ${d.player ? 'YOURSELF' : (d.name ?? d.id).toUpperCase()}?`, `This runs <code>kill id=${esc(d.id)}</code> in the game: full gore, a body, and the world's memory of it${d.player ? ' (you wake at the clinic)' : ''}. It cannot be undone.`, 'KILL', () => cmd('kill', { id: d.id }));
}
async function camTick(force) {
  if (!S.cam.on || !S.sel || S.cam.busy || S.mode !== 'live') return;
  if (!force && performance.now() - S.cam.at < 1200) return;
  const d = S.snap?.detail?.[S.sel]; if (!d) return;
  S.cam.busy = true; S.cam.at = performance.now();
  const r = await cmd('screenshot', { x: d.x, z: d.z, zoom: 17, tilt: 0.35, width: 480, height: 270, quality: 0.72 }, { log: false });
  if (r.ok) { S.cam.url = r.image; S.lastCard = ''; renderCard(); }
  S.cam.busy = false;
}
function select(id) {
  S.sel = id; S.lastCard = '';
  if (!id) { S.follow = false; S.cam.on = false; }
  renderFollow(); renderCard();
}
function renderFollow() {
  const row = S.sel && charRow(S.sel);
  $('followTag').classList.toggle('hidden', !(S.follow && S.sel));
  $('followName').textContent = row ? row[9] : S.sel === S.snap?.player.id ? 'YOU' : '';
}

// ------------------------------------------------------------------------------------------------------ the modals
const modal = $('modal');
function openModal(kind, extra = {}) {
  const C = S.base?.catalog ?? { weapons: [], weather: [], events: [], hunters: [], flags: ['US'], spawn: ['raider', 'drifter'], ammo: [], throwables: [] };
  const p = S.snap?.player ?? { x: 0, z: 0 };
  const opts = (list, sel) => list.map((o) => { const id = o.id ?? o; return `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(o.name ?? o.label ?? o)}</option>`; }).join('');
  let title = '', body = '', foot = '', submit = null;
  const go = (label) => `<button type="button" class="btn ghost" value="cancel" data-close>CANCEL</button><button type="submit" class="btn on" value="ok">${label}</button>`;
  if (kind === 'time') {
    const h = S.snap ? Math.round(S.snap.hour * 4) / 4 : 12;
    title = 'SET THE CLOCK';
    body = `<div class="big-hour" id="mHourLbl">${fmtHour(h)}</div><label class="field"><span>Hour of day</span><input type="range" name="hour" min="0" max="23.75" step="0.25" value="${h}" id="mHour"></label>
      <div class="grid-btns">${[[6, 'DAWN'], [12, 'NOON'], [18.5, 'DUSK'], [23, 'NIGHT'], [2, '2 AM'], [9, 'MORNING']].map(([v, l]) => `<button type="button" class="btn" data-hour="${v}">${l}</button>`).join('')}</div>
      <label class="tog"><input type="checkbox" name="fast" ${S.snap?.fast ? 'checked' : ''}> TIME ×40</label>`;
    foot = go('SET TIME');
    submit = (f) => cmd('setTime', { hour: +f.hour, fast: !!f.fast });
  }
  if (kind === 'weather') {
    title = 'WEATHER';
    body = `<div class="grid-btns">${C.weather.map((w) => `<button type="button" class="btn ${S.snap?.weather === w.id ? 'on' : ''}" data-weather="${esc(w.id)}">${esc(w.label)}</button>`).join('')}</div><label class="tog"><input type="checkbox" name="instant" checked> SNAP INSTANTLY (else blend over ~6 s)</label>`;
    foot = '<button type="button" class="btn ghost" data-close>CLOSE</button>';
  }
  if (kind === 'spawn') {
    const at = extra.at ?? { x: p.x + 12, z: p.z };
    title = 'SPAWN';
    body = `<div class="row2"><label class="field"><span>Kind</span><select name="kind">${opts(C.spawn.map((k) => ({ id: k, name: KIND_LABEL[k] ?? k })), 'raider')}</select></label><label class="field"><span>Count</span><input type="number" name="count" value="3" min="1" max="40"></label></div>
      <div class="row3"><label class="field"><span>X</span><input type="number" name="x" value="${Math.round(at.x)}"></label><label class="field"><span>Z</span><input type="number" name="z" value="${Math.round(at.z)}"></label><label class="field"><span>HP</span><input type="number" name="hp" placeholder="default"></label></div>
      <div class="row2"><label class="field"><span>Name (optional)</span><input type="text" name="name" placeholder="by kind"></label><label class="field"><span>Weapon</span><select name="weapon"><option value="">by kind</option>${opts(C.weapons)}</select></label></div>
      <label class="field"><span>Flag (optional) · <b id="mFlagName">random</b></span><div class="flagpick" id="mFlags">${C.flags.map((f) => `<button type="button" data-flag="${esc(f)}" title="${esc(f)}"></button>`).join('')}</div><input type="hidden" name="flag" id="mFlag"></label>
      <div class="row2"><label class="tog"><input type="checkbox" name="angry"> ANGRY AT THE PLAYER</label><label class="tog"><input type="checkbox" name="runner"> SPRINTER (infected)</label></div>
      <div class="hint">Tip: right-click the map to spawn exactly there.</div>`;
    foot = go('SPAWN');
    submit = (f) => cmd('spawn', { kind: f.kind, count: +f.count || 1, x: +f.x, z: +f.z, ...(f.hp ? { hp: +f.hp } : {}), ...(f.name ? { name: f.name } : {}), ...(f.weapon ? { weapon: f.weapon } : {}), ...(f.flag ? { flag: f.flag } : {}), angry: !!f.angry, ...(f.kind === 'zombie' ? { runner: !!f.runner } : {}) });
  }
  if (kind === 'give') {
    title = 'GIVE THE PLAYER';
    body = `<div class="row2"><label class="field"><span>Cash</span><input type="number" name="cash" placeholder="0"></label><label class="field"><span>Health</span><input type="number" name="hp" placeholder="0"></label></div>
      <label class="field"><span>Gun (slung, loaded)</span><select name="weapon"><option value="">—</option>${opts(C.weapons)}</select></label>
      <div class="row4">${C.ammo.map((a) => `<label class="field"><span>${esc(a)} rds</span><input type="number" name="${esc(a)}" placeholder="0"></label>`).join('')}</div>
      <div class="row3">${C.throwables.map((t) => `<label class="field"><span>${esc(t)}</span><input type="number" name="${esc(t)}" placeholder="0"></label>`).join('')}</div>`;
    foot = go('GIVE');
    submit = (f) => { const a = {}; for (const [k, v] of Object.entries(f)) if (v !== '' && v !== undefined) a[k] = k === 'weapon' ? v : +v; return cmd('give', a); };
  }
  if (kind === 'event') {
    title = 'DIRECTOR';
    body = `<label class="field"><span>Event</span><select name="tpl">${opts(C.events)}</select></label><label class="field"><span>Hunters' faction (hunters only)</span><select name="faction"><option value="">—</option>${opts(C.hunters)}</select></label>
      <div class="field"><span>Running now</span><div class="running" id="mRunning"><div>…</div></div></div><div class="hint" id="mDirHint"></div>`;
    foot = `<button type="button" class="btn ghost" data-dir="${S.snap?.director === 'paused' ? 'resume' : 'pause'}">${S.snap?.director === 'paused' ? 'RESUME DIRECTOR' : 'PAUSE DIRECTOR'}</button>${go('FIRE')}`;
    submit = (f) => cmd('fireEvent', { tpl: f.tpl, ...(f.faction ? { faction: f.faction } : {}) });
    setTimeout(refreshDirector, 0);
  }
  if (kind === 'teleport') {
    const at = extra.at ?? { x: Math.round(view.cx), z: Math.round(view.cz) };
    title = 'TELEPORT';
    body = `<div class="row2"><label class="field"><span>X</span><input type="number" name="x" value="${Math.round(at.x)}"></label><label class="field"><span>Z</span><input type="number" name="z" value="${Math.round(at.z)}"></label></div>
      <label class="field"><span>…or a town / exit</span><select name="town"><option value="">— use x, z —</option>${(S.base?.towns ?? []).map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}</select></label>
      <div class="hint">Right-click anywhere on the map to teleport there in one click.</div>`;
    foot = go('TELEPORT');
    submit = (f) => cmd('teleport', f.town ? { town: f.town } : { x: +f.x, z: +f.z });
  }
  if (kind === 'sessions') {
    title = 'RECORDED SESSIONS';
    body = `<div class="sessions" id="mSessions"><div class="hint">Reading web/sessions…</div></div>`;
    foot = '<button type="button" class="btn ghost" data-close>CLOSE</button>';
    setTimeout(listSessions, 0);
  }
  if (kind === 'tabs') {
    title = 'WHICH GAME';
    body = `<div class="sessions">${[{ id: '', kind: 'whichever the bridge drives', active: true }, ...S.tabList].map((t) => `<button type="button" class="sess" data-tab="${esc(t.id)}"><b>${t.id ? `TAB ${esc(t.id)}` : 'AUTO'}</b><span>${esc(t.kind)}${t.id && t.active ? ' · driven' : ''}</span><span>${t.id ? `open ${t.openFor}s · polled ${Math.round(t.lastPollMsAgo / 1000)}s ago` : 'follows the newest tab'}</span><span>${(S.tab ?? '') === t.id ? 'WATCHING' : ''}</span></button>`).join('')}</div>
      <div class="hint">A person playing in one window and the headless harness in another are separate tabs. Commands from this page go only to the tab you watch.</div>`;
    foot = '<button type="button" class="btn ghost" data-close>CLOSE</button>';
  }
  $('modalTitle').textContent = title; $('modalBody').innerHTML = body; $('modalFoot').innerHTML = foot;
  modal.dataset.kind = kind;
  modal._submit = submit;
  wireModal(kind, C);
  modal.showModal();
}
const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function wireModal(kind, C) {
  const b = $('modalBody');
  modal.querySelectorAll('[data-close]').forEach((x) => x.onclick = () => modal.close());
  if (kind === 'time') { const r = $('mHour'); r.oninput = () => $('mHourLbl').textContent = fmtHour(+r.value); b.querySelectorAll('[data-hour]').forEach((x) => x.onclick = () => { r.value = x.dataset.hour; r.oninput(); }); }
  if (kind === 'weather') b.querySelectorAll('[data-weather]').forEach((x) => x.onclick = async () => { const inst = b.querySelector('[name=instant]').checked; await cmd('setWeather', { key: x.dataset.weather, instant: inst }); modal.close(); });
  if (kind === 'spawn') b.querySelectorAll('[data-flag]').forEach((x) => { const c = flagCanvas(x.dataset.flag, 30, 20); if (c) x.append(c.cloneNode ? cloneCanvas(c) : c); x.onclick = () => { b.querySelectorAll('[data-flag]').forEach((y) => y.classList.remove('on')); x.classList.add('on'); $('mFlag').value = x.dataset.flag; $('mFlagName').textContent = x.dataset.flag; }; });
  if (kind === 'event') modal.querySelectorAll('[data-dir]').forEach((x) => x.onclick = async () => { await cmd('director', { action: x.dataset.dir }); modal.close(); });
  if (kind === 'tabs') b.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { S.tab = x.dataset.tab || null; S.boot = null; S.snap = null; S.base = null; S.tiles.clear(); view.tileCache.clear(); modal.close(); const u = new URL(location.href); if (S.tab) u.searchParams.set('tab', S.tab); else u.searchParams.delete('tab'); history.replaceState(null, '', u); });
}
function cloneCanvas(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
async function refreshDirector() {
  const r = await cmd('director', {}, { log: false });
  const el = $('mRunning'); if (!el) return;
  const act = r.active ?? r.running ?? [];
  el.innerHTML = act.length ? act.map((e) => `<div><span>${esc(e.tpl ?? e.id)} · ${esc(e.id)}</span><button type="button" class="btn mini danger" data-cancel="${esc(e.id)}">END</button></div>`).join('') : '<div><span>nothing running</span></div>';
  el.querySelectorAll('[data-cancel]').forEach((x) => x.onclick = async () => { await cmd('cancelEvent', { id: x.dataset.cancel }); refreshDirector(); });
  const hint = $('mDirHint'); if (hint && r.ok) hint.textContent = `Director ${r.paused ? 'PAUSED' : 'live'}${r.nextEvalIn !== undefined ? ` · next look in ${Math.round(r.nextEvalIn)} s` : ''}${r.eligible?.length ? ` · could fire: ${r.eligible.map((e) => e.tpl).join(', ')}` : ''}.`;
}
$('modalForm').addEventListener('submit', async (ev) => {
  const sub = ev.submitter?.value;
  if (sub === 'cancel' || !modal._submit) return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData($('modalForm')));
  for (const el of $('modalForm').querySelectorAll('input[type=checkbox]')) f[el.name] = el.checked;
  const r = await modal._submit(f);
  if (r?.ok) modal.close();
});
function confirmModal(title, html, label, fn) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = `<div class="hint" style="font-size:14px;color:var(--sand)">${html}</div>`;
  $('modalFoot').innerHTML = `<button type="button" class="btn ghost" data-close>CANCEL</button><button type="submit" class="btn danger on" value="ok" style="background:linear-gradient(oklch(0.58 0.19 28),oklch(0.45 0.16 28));border-color:oklch(0.6 0.19 28);color:var(--bone)">${label}</button>`;
  modal._submit = fn; wireModal('confirm');
  modal.showModal();
}
async function lookAt(x, z, name) {
  $('modalTitle').textContent = `LOOK · ${String(name).toUpperCase()}`;
  $('modalBody').innerHTML = '<div class="hint">Rendering…</div>';
  $('modalFoot').innerHTML = '<button type="button" class="btn ghost" data-close>CLOSE</button>';
  modal._submit = null; wireModal('look'); modal.showModal();
  const r = await cmd('look', { x, z, zoom: 26, width: 960, height: 540 });
  if (!r.ok) { $('modalBody').innerHTML = `<div class="hint">${esc(r.error)}</div>`; return; }
  $('modalBody').innerHTML = `<img src="${r.image}" style="width:100%;border-radius:4px;border:1px solid var(--edge)" alt="what the game camera sees there"><div class="hint">${esc(r.caption)}</div>
    <ul class="items">${r.people.slice(0, 8).map((q) => `<li><span><img class="flagimg" style="width:16px;height:11px;margin-right:4px" src="${flagURL(q.flag)}" alt="">${esc(q.name)} · ${esc(q.factionName)}</span><span>${esc(q.state)} · ${q.dist} m</span></li>`).join('')}</ul>`;
  modal.style.width = 'min(760px, 94vw)';
  modal.addEventListener('close', () => { modal.style.width = ''; }, { once: true });
}

// ------------------------------------------------------------------------------------------------------ replay
async function listSessions() {
  const el = $('mSessions'); if (!el) return;
  let list = [];
  try { list = (await fetch('/agent/sessions', { cache: 'no-store' }).then((r) => r.json())).sessions ?? []; } catch {}
  const live = S.snap?.rec;
  el.innerHTML = `<button type="button" class="sess" data-sess="live"><b>LIVE RING · this tab</b><span>${live ? `${fmtHMS(live.seconds)} · ${live.samples} samples` : 'no recorder'}</span><span>the session recording right now (${esc(live?.id ?? '')})</span><span>NOW</span></button>`
    + (list.length ? list.map((s) => `<button type="button" class="sess" data-sess="${esc(s.id)}"><b>${esc(s.id)}</b><span>${fmtHMS(s.seconds ?? 0)} · ${s.agentTab ? 'AGENT' : 'PERSON'}</span><span>${esc((s.started ?? '').replace('T', ' ').slice(0, 16))} · ${s.kills} kills · ${s.deaths} deaths · ${s.events} events</span><span>${Math.round(s.bytes / 1024)} KB</span></button>`).join('') : '<div class="hint">Nothing on disk yet. A person\'s tab writes its session every 2 minutes; SAVE in the bar writes this one now.</div>');
  el.querySelectorAll('[data-sess]').forEach((x) => x.onclick = () => { modal.close(); loadReplay(x.dataset.sess); });
}
async function loadReplay(id) {
  let raw;
  if (id === 'live') { const r = await cmd('session', { full: true }); if (!r.ok) return; raw = r.session; }
  else { try { raw = await fetch(`/agent/session?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => r.json()); } catch (e) { logCmd('session', { id }, { ok: false, error: e.message }, 0); return; } }
  let P;
  try { P = parseSession(raw); } catch (e) { logCmd('session', { id }, { ok: false, error: e.message }, 0); return; }
  S.replay = { S: P, t: P.t0, playing: false, frame: null, id };
  setMode('replay');
  const C = P.cols; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < P.n; i++) { x0 = Math.min(x0, C.x[i]); x1 = Math.max(x1, C.x[i]); z0 = Math.min(z0, C.z[i]); z1 = Math.max(z1, C.z[i]); }
  if (P.n) { view.cx = (x0 + x1) / 2; view.cz = (z0 + z1) / 2; view.s = Math.max(0.05, Math.min(6, 0.8 * Math.min(view.W / Math.max(60, x1 - x0), view.H / Math.max(60, z1 - z0)))); }
  S.follow = false; renderFollow();
  drawTicks(); scrub(P.t0); S.heatCache.clear(); updateHeat();
}
function scrub(t) {
  const R = S.replay; if (!R) return;
  R.t = Math.max(R.S.t0, Math.min(R.S.t1, t));
  R.frame = sessionAt(R.S, R.t);
  const k = (R.t - R.S.t0) / Math.max(0.001, R.S.t1 - R.S.t0);
  $('tlRange').value = Math.round(k * 1000);
  $('tlHead').style.left = `${k * 100}%`;
  $('tlTime').textContent = fmtT(R.t - R.S.t0);
  renderReplayCard();
  // The wire follows the scrubber at most 4 times a second, and always lands on where it stopped.
  clearTimeout(R.feedTimer);
  if (performance.now() - (R.feedAt ?? 0) > 250) { R.feedAt = performance.now(); replayFeed(); }
  else R.feedTimer = setTimeout(() => { R.feedAt = performance.now(); replayFeed(); }, 260);
}
function drawTicks() {
  const R = S.replay, c = $('tlTicks'), w = c.clientWidth, h = c.clientHeight, d = Math.min(2, devicePixelRatio);
  c.width = w * d; c.height = h * d;
  const g = c.getContext('2d'); g.scale(d, d);
  g.fillStyle = 'oklch(0.13 0.01 60)'; g.fillRect(0, 0, w, h);
  if (!R) return;
  const span = Math.max(0.001, R.S.t1 - R.S.t0), C = R.S.cols;
  // hp as a band, driving shaded, then event ticks
  g.fillStyle = 'rgba(227,167,47,0.13)';
  for (let i = 0; i < R.S.n; i++) if (C.flags[i] & FLAG.veh) g.fillRect(((C.t[i] - R.S.t0) / span) * w, 0, Math.max(1, w / R.S.n), h);
  g.strokeStyle = 'rgba(196,80,42,0.8)'; g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i < R.S.n; i += Math.max(1, Math.floor(R.S.n / w))) { const x = ((C.t[i] - R.S.t0) / span) * w, y = h - 3 - (C.hp[i] / 100) * (h - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  for (const e of R.S.events) {
    const sty = EVENT_STYLE[e.y]; if (!sty || e.y === 'enterVehicle' || e.y === 'exitVehicle') continue;
    const x = ((e.t - R.S.t0) / span) * w;
    g.fillStyle = sty.col; g.fillRect(x - 1, e.y === 'kill' || e.y === 'playerDied' ? 0 : h * 0.55, 2, e.y === 'kill' || e.y === 'playerDied' ? h : h * 0.45);
  }
}
function renderReplayCard() {
  const R = S.replay, f = R?.frame; if (!f) return;
  const keys = Object.entries(KEYS).map(([k, b]) => `<kbd class="${f.keys & b ? 'on' : ''}">${k.replace(/^Key/, '').replace('Mouse', 'M')}</kbd>`).join('');
  const flags = Object.entries(FLAG).filter(([, b]) => f.flags & b).map(([k]) => `<span class="tag ${k === 'dead' || k === 'hurt' ? 'hot' : k === 'veh' ? 'ok' : ''}">${k}</span>`).join('');
  $('card').innerHTML = `<header class="ph"><h2>REPLAY</h2><span class="sub">${esc(R.id === 'live' ? 'live ring' : R.id)} · ${fmtHMS(R.S.seconds)}</span></header>
    <div class="state">${fmtT(R.t - R.S.t0)}<small>game t ${r1(f.t)} · (${f.x}, ${f.z})${f.gy ? ` · up ${f.gy} m` : ''}</small></div>
    <div class="bars">${meter('hp', f.hp / 100, 'HEALTH', `${f.hp}`)}${meter('', Math.min(1, f.spd / 40), 'SPEED', `${f.spd} m/s`)}</div>
    <div class="sect"><h4>State</h4><div class="meta" style="display:flex;gap:5px;flex-wrap:wrap">${flags || '<span class="tag">on foot</span>'}</div></div>
    <div class="sect"><h4>Keys held or tapped</h4><div class="keys">${keys}</div></div>
    <div class="sect"><h4>Session</h4><dl class="kv"><dt>Started</dt><dd>${esc((R.S.started ?? '').replace('T', ' ').slice(0, 19))}</dd><dt>Samples</dt><dd>${R.S.n} at ${R.S.rate} Hz</dd><dt>Events</dt><dd>${R.S.events.length}</dd><dt>End</dt><dd>${R.S.end ? `day ${R.S.end.day} ${esc(R.S.end.clock)} · $${R.S.end.cash} · ${R.S.end.kills} kills` : '—'}</dd></dl></div>
    <div class="actions"><button type="button" class="btn mini" id="rpGoto" title="replay goto=true: stand the live player there">GO THERE</button><button type="button" class="btn mini" id="rpLive">BACK LIVE</button></div>`;
  $('rpGoto').onclick = () => cmd('teleport', { x: f.x, z: f.z });
  $('rpLive').onclick = () => setMode('live');
}
function replayFeed(all) {
  const R = S.replay; if (!R) return;
  const ol = $('feed'); ol.innerHTML = '';
  const near = R.S.events.filter((e) => e.t <= R.t && !NOISY.has(e.y) && (S.feedFilter === 'all' || classOf(e.y) === S.feedFilter)).slice(all ? -160 : -60).reverse();
  for (const e of near) {
    const ev = { ...e, type: e.y, seq: e.s };
    const li = document.createElement('li');
    li.className = `ev ${classOf(e.y)}${Math.abs(e.t - R.t) < 3 ? ' near' : ''}`;
    li.innerHTML = `<time>${fmtT(e.t - R.S.t0)}</time><div><b>${esc(e.y)}</b>${describeReplay(ev)}</div>`;
    li.onclick = () => { scrub(e.t); view.cx = e.x; view.cz = e.z; };
    ol.append(li);
  }
  $('feedCount').textContent = `${near.length} of ${R.S.events.length} by ${fmtT(R.t - R.S.t0)}`;
}
function describeReplay(e) {
  whoCtx = e;
  try {
    if (e.y === 'kill') return `${e.you ? 'YOU' : who(e.victim)} ${e.downed ? 'downed' : 'killed'}${e.byYou ? ' by YOU' : e.by ? ` by ${who(e.by)}` : ''} · ${esc(e.cause ?? '')}`;
    if (e.y === 'hurt') return `YOU took ${e.amount} from ${e.by ? who(e.by) : esc(e.cause ?? 'something')}${e.hp !== undefined ? ` → ${e.hp} hp` : ''}`;
    return describe(e);
  } finally { whoCtx = null; }
}
function setMode(m) {
  S.mode = m;
  $('modeLive').classList.toggle('on', m === 'live'); $('modeReplay').classList.toggle('on', m === 'replay');
  $('timeline').classList.toggle('hidden', m !== 'replay'); $('heatbar').classList.toggle('hidden', m !== 'replay');
  $('mapwrap').classList.toggle('replay', m === 'replay');
  if (m === 'replay' && !S.replay) { openModal('sessions'); }
  if (m === 'live') { if (S.replay) S.replay.playing = false; S.lastCard = ''; renderCard(); setStale(!S.connected); }
  else $('stale').classList.add('hidden');
  refeed();
}
async function updateHeat() {
  const R = S.replay;
  if (!R || S.heatLayer === 'off') { S.heat = null; return; }
  const key = `${S.heatLayer}:${S.heatAll}:${R.id}`;
  if (S.heatCache.has(key)) { S.heat = S.heatCache.get(key); return; }
  let list = [R.S];
  if (S.heatAll) {
    try {
      const all = (await fetch('/agent/sessions', { cache: 'no-store' }).then((r) => r.json())).sessions ?? [];
      const got = await Promise.all(all.filter((s) => !s.broken && s.id !== R.id).slice(0, 40).map((s) => fetch(`/agent/session?id=${encodeURIComponent(s.id)}`).then((r) => r.json()).then(parseSession).catch(() => null)));
      list = [R.S, ...got.filter(Boolean)];
    } catch {}
  }
  const H = heatmap(list, S.heatLayer, S.heatLayer === 'went' ? 8 : 12);
  H.sessions = list.length;
  S.heatCache.set(key, H); S.heat = H;
}

// ------------------------------------------------------------------------------------------------------ the map, live
let drag = null;
const mapEl = $('map');
mapEl.addEventListener('wheel', (e) => { e.preventDefault(); const r = mapEl.getBoundingClientRect(); view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
mapEl.addEventListener('mousedown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }; mapEl.classList.add('drag'); hideCtx(); });
addEventListener('mousemove', (e) => {
  const r = mapEl.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; S.follow = false; renderFollow(); } view.cx = drag.cx - dx / view.s; view.cz = drag.cz - dy / view.s; }
  if (sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height) {
    const [wx, wz] = view.s2w(sx, sy);
    $('cursorPos').textContent = `${Math.round(wx)}, ${Math.round(wz)} m`;
    hoverAt(sx, sy, e);
  } else $('hover').classList.add('hidden');
});
addEventListener('mouseup', (e) => {
  if (!drag) return;
  mapEl.classList.remove('drag');
  if (!drag.moved) {
    const r = mapEl.getBoundingClientRect(), h = view.pick(e.clientX - r.left, e.clientY - r.top);
    if (h?.kind === 'char') select(h.id === S.sel ? null : h.id);
    else if (h?.kind === 'revent') { scrub(h.e.t); }
    else if (!h) select(null);
  }
  drag = null;
});
mapEl.addEventListener('dblclick', (e) => { const r = mapEl.getBoundingClientRect(), h = view.pick(e.clientX - r.left, e.clientY - r.top); if (h?.kind === 'char') { select(h.id); S.follow = true; renderFollow(); } });
mapEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const r = mapEl.getBoundingClientRect(), [wx, wz] = view.s2w(e.clientX - r.left, e.clientY - r.top), h = view.pick(e.clientX - r.left, e.clientY - r.top);
  const x = Math.round(wx * 10) / 10, z = Math.round(wz * 10) / 10;
  const items = [
    ['Teleport the player here', () => cmd('teleport', { x, z })],
    ['Spawn here…', () => openModal('spawn', { at: { x, z } })],
    ['Look here (screenshot + who)', () => lookAt(x, z, `${Math.round(x)}, ${Math.round(z)}`)],
    ['Raiders here (3, angry)', () => cmd('spawn', { kind: 'raider', count: 3, x, z, angry: true })],
    ['Set the GPS waypoint here', () => cmd('waypoint', { x, z })],
  ];
  if (h?.kind === 'char' && h.id !== S.snap?.player.id) items.unshift(['Select ' + (charRow(h.id)?.[9] ?? h.id), () => select(h.id)], ['Kill ' + (charRow(h.id)?.[9] ?? h.id) + '…', () => cardAction('kill', { id: h.id, name: charRow(h.id)?.[9] })], ['Heal ' + (charRow(h.id)?.[9] ?? h.id), () => cmd('heal', { id: h.id })]);
  if (h?.kind === 'vehicle') items.unshift([`Explode ${h.name}`, () => confirmModal(`EXPLODE ${String(h.name).toUpperCase()}?`, `Runs <code>explode id=${esc(h.id)}</code>.`, 'EXPLODE', () => cmd('explode', { id: h.id }))], [`Teleport beside ${h.name}`, () => cmd('teleport', { x: x + 3, z })]);
  showCtx(e.clientX, e.clientY, `${Math.round(x)}, ${Math.round(z)} · ${S.snap ? '' : 'no game'}`, items);
});
function showCtx(x, y, head, items) {
  const el = $('ctx');
  el.innerHTML = `<div class="ctxh">${esc(head)}</div>` + items.map(([l], i) => `<button type="button" data-i="${i}">${esc(l)}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.onclick = () => { hideCtx(); items[+b.dataset.i][1](); });
  el.classList.remove('hidden');
  el.style.left = `${Math.min(x, innerWidth - 220)}px`; el.style.top = `${Math.min(y, innerHeight - el.offsetHeight - 10)}px`;
}
const hideCtx = () => $('ctx').classList.add('hidden');
addEventListener('keydown', (e) => {
  if (modal.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === 'Escape') { select(null); hideCtx(); }
  if (e.key === 'f' && S.sel) { S.follow = !S.follow; renderFollow(); }
  if (e.key === ' ' && S.mode === 'replay' && S.replay) { e.preventDefault(); S.replay.playing = !S.replay.playing; }
});
function hoverAt(sx, sy, e) {
  const h = view.pick(sx, sy), el = $('hover');
  if (!h || drag?.moved) { el.classList.add('hidden'); return; }
  let html = '';
  if (h.kind === 'char') {
    if (h.id === S.snap?.player.id) html = `<img class="flagimg" src="${flagURL(S.snap.player.flag || 'US')}" alt=""><b>YOU</b> · ${S.snap.player.hp} hp`;
    else { const r = charRow(h.id); if (r) html = `${r[5] ? `<img class="flagimg" src="${flagURL(r[5])}" alt="">` : ''}<b>${esc(r[9])}</b><br>${esc(S.factions?.[r[4]]?.name ?? r[4])} · ${esc(r[6])} · ${r[7]} hp${r[12] ? ' · <span style="color:#ff6a4a">hostile</span>' : ''}`; }
  } else if (h.kind === 'vehicle') html = `<b>${esc(h.name)}</b> · ${esc(h.type)}`;
  else if (h.kind === 'revent') html = `<b>${esc(h.e.y)}</b> at ${fmtT(h.e.t - (S.replay?.S.t0 ?? 0))}<br>${describeReplay({ ...h.e, type: h.e.y })}`;
  if (!html) { el.classList.add('hidden'); return; }
  el.innerHTML = html; el.classList.remove('hidden');
  const r = $('mapwrap').getBoundingClientRect();
  el.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 290)}px`; el.style.top = `${e.clientY - r.top + 12}px`;
}

// ------------------------------------------------------------------------------------------------------ buttons
document.querySelector('.bar').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'pause') await cmd('pause', { on: !S.snap?.paused });
  if (a === 'step1') await cmd('step', { seconds: 1 });
  if (a === 'step5') await cmd('step', { seconds: 5 });
  if (a === 'god') await cmd('god', { on: !S.snap?.player.god });
  if (a === 'recSave') await cmd('record', { save: true });
  if (a === 'recNew') confirmModal('START A NEW SESSION?', 'The recorder starts a fresh ring with a new id (record reset=true). Save the current one first if you want to keep it.', 'NEW SESSION', () => cmd('record', { reset: true, on: true }));
  if (['time', 'weather', 'spawn', 'give', 'event', 'teleport'].includes(a)) openModal(a);
});
$('tabchip').onclick = () => openModal('tabs');
document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
$('layers').addEventListener('click', (e) => { const b = e.target.closest('[data-layer]'); if (!b) return; S.layers[b.dataset.layer] = !S.layers[b.dataset.layer]; b.classList.toggle('on', S.layers[b.dataset.layer]); });
$('heatbar').addEventListener('click', (e) => { const b = e.target.closest('[data-heat]'); if (!b) return; S.heatLayer = b.dataset.heat; document.querySelectorAll('[data-heat]').forEach((x) => x.classList.toggle('on', x === b && S.heatLayer !== 'off')); updateHeat(); });
$('heatAll').onchange = (e) => { S.heatAll = e.target.checked; updateHeat(); };
$('feedFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; S.feedFilter = b.dataset.f; document.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); refeed(); });
document.querySelector('.zoomer').addEventListener('click', (e) => {
  const b = e.target.closest('[data-zoom]'); if (!b) return;
  if (b.dataset.zoom === 'in') view.zoomAt(view.W / 2, view.H / 2, 1.6);
  if (b.dataset.zoom === 'out') view.zoomAt(view.W / 2, view.H / 2, 1 / 1.6);
  if (b.dataset.zoom === 'you' && S.snap) { view.cx = S.snap.player.x; view.cz = S.snap.player.z; S.follow = false; renderFollow(); }
});
document.querySelector('[data-act=unfollow]').onclick = () => { S.follow = false; renderFollow(); };
$('tlRange').oninput = (e) => { const R = S.replay; if (R) scrub(R.S.t0 + (e.target.value / 1000) * (R.S.t1 - R.S.t0)); };
$('tlPlay').onclick = () => { if (S.replay) S.replay.playing = !S.replay.playing; };
$('tlPick').onclick = () => openModal('sessions');
addEventListener('resize', () => { if (S.replay) drawTicks(); });

// ------------------------------------------------------------------------------------------------------ the loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const R = S.replay;
  if (S.mode === 'replay' && R) {
    if (R.playing) { scrub(R.t + dt * +$('tlSpeed').value); if (R.t >= R.S.t1) R.playing = false; }
    $('tlPlay').textContent = R.playing ? '❚❚' : '▶';
  }
  if (S.mode === 'live') {
    interpolate();
    if (S.follow && S.sel) { const q = S.pos.get(S.sel); if (q) { view.cx += (q.x - view.cx) * Math.min(1, dt * 6); view.cz += (q.z - view.cz) * Math.min(1, dt * 6); } }
  }
  const sc = view.niceScale();
  $('scale').querySelector('i').style.width = `${sc.px}px`; $('scale').querySelector('span').textContent = sc.label;
  view.draw({
    base: S.base, tiles: [...S.tiles].filter(([, v]) => v), snap: S.mode === 'live' ? S.snap : null, factions: S.factions, sel: S.mode === 'live' ? S.sel : null, layers: S.layers, pos: S.pos,
    ripples: S.mode === 'live' ? S.ripples : [], replay: S.mode === 'replay' && R ? R : null, heat: S.mode === 'replay' ? S.heat : null,
  });
  requestAnimationFrame(frame);
}
renderCard();
requestAnimationFrame(frame);
poll();
window.OBS = { S, view, cmd, select, loadReplay, setMode, scrub, openModal }; // for agents driving this page with a browser tool
// An edit to the observer's own files reloads this page only. Without this boundary Vite finds no importer that accepts
// the change and full-reloads EVERY page on the server, the game tab included (it lost a selftest run that way).
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
