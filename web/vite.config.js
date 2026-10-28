import { defineConfig } from 'vite';
import { forgeIO } from './tools/forge-io.mjs'; // THE WORLD FORGE's file side (docs/design/WEB_FORGE.md)
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SESSIONS = join(ROOT, 'sessions');

// Agent bridge: lets any shell agent drive the running game over HTTP.
//   POST /agent/cmd   {cmd, args, tab?} | {batch:[{cmd,args}...], tab?}  -> waits for the browser's result
//   GET  /agent/status                                       -> is a game tab connected? (tabList: every live tab)
//   GET  /agent/next   (browser long-poll)   POST /agent/result (browser reply)
// THE OBSERVER (observe.html, docs/design/WEB_OBSERVER.md) rides beside it, never through the command queue, so a long
// command (a selftest, a scenario) never freezes the view:
//   POST /agent/feed   the game tab: {tab, snap?} -> {want} (what the observers want; null = nobody is watching)
//   GET  /agent/feed   an observer: ?tab=&obs=&since=&boot=&bbox=x0,z0,x1,z1&sel=ids -> the latest frame + new events
//   POST /agent/session  a recorded session -> web/sessions/<id>.json   GET /agent/sessions   GET /agent/session?id=
function agentBridge() {
  const queue = [];
  const pending = new Map();
  const waiters = []; // { tab, give }
  let lastPoll = 0;
  let seq = 0;
  const clientErrors = [];
  const tabs = new Map(); // tab id -> { first, last, kind }
  // Commands go to ONE tab. Sticky: the current tab keeps the job until it stops polling;
  // then the most recently opened live tab takes over. A job with `tab` goes to that tab only.
  let current = null;
  // A tab is alive while it polls for work OR pushes observer frames (a tab deep in a long command does only the latter).
  const alive = (id) => (tabs.has(id) && Date.now() - tabs.get(id).last < 25000) || Date.now() - (feeds.get(id)?.at ?? 0) < 25000;
  const activeTab = () => {
    if (current && alive(current)) return current;
    let best = null;
    for (const [id, t] of tabs) if (Date.now() - t.last < 25000 && (!best || t.first > tabs.get(best).first)) best = id;
    return (current = best);
  };
  const tabList = () => [...tabs].filter(([id]) => alive(id)).map(([id, t]) => ({ id, kind: t.kind ?? 'unknown', active: id === activeTab(), lastPollMsAgo: Date.now() - t.last, openFor: Math.round((Date.now() - t.first) / 1000) }));

  // ---- the observer feed: per game tab, its latest frame, a ring of its events, and what its observers want ----
  const feeds = new Map(); // tab -> { snap, at, boot, events: [], factions, base, wants: Map(obs -> {bbox, sel, at}) }
  const feedOf = (tab) => { let f = feeds.get(tab); if (!f) feeds.set(tab, (f = { snap: null, at: 0, boot: null, events: [], factions: null, base: null, tiles: new Map(), wants: new Map() })); return f; };
  // The tab an observer means when it names none: the one the bridge drives, else (busy in a long command, so not
  // polling) the one that sent a frame last.
  const watchedTab = () => {
    const a = activeTab(); if (a) return a;
    let best = null; for (const [id, f] of feeds) if (Date.now() - f.at < 25000 && (!best || f.at > feeds.get(best).at)) best = id;
    return best;
  };
  const mergedWant = (f) => {
    let bbox = null; const sel = new Set(); let n = 0;
    for (const [obs, w] of f.wants) {
      if (Date.now() - w.at > 4000) { f.wants.delete(obs); continue; }
      n++;
      for (const id of w.sel) if (sel.size < 4) sel.add(id);
      if (w.bbox) bbox = bbox ? [Math.min(bbox[0], w.bbox[0]), Math.min(bbox[1], w.bbox[1]), Math.max(bbox[2], w.bbox[2]), Math.max(bbox[3], w.bbox[3])] : w.bbox.slice();
    }
    // The map's ground rides the feed too (once per boot, then each streamed chunk's tile once), so a page opened while a
    // long command holds the queue still gets its map.
    const tiles = (f.snap?.layouts ?? []).filter((k) => !f.tiles.has(k)).slice(0, 8);
    return n ? { observers: n, bbox, sel: [...sel], interval: 200, factions: !f.factions || Date.now() - (f.factionsAt ?? 0) > 2000, base: !f.base, tiles } : null;
  };

  const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
  const readBody = (req, raw = false) => new Promise((ok) => { let b = ''; req.setEncoding?.('utf8'); req.on('data', (c) => (b += c)); req.on('end', () => { if (raw) return ok(b); try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
  const dispatch = () => {
    for (let wi = 0; wi < waiters.length && queue.length; wi++) {
      const w = waiters[wi], act = activeTab() === w.tab;
      const ji = queue.findIndex((j) => (j.tab ? j.tab === w.tab : act));
      if (ji < 0) continue;
      const [job] = queue.splice(ji, 1);
      waiters.splice(wi, 1); wi--;
      w.give(job);
    }
  };
  const sessionIndex = new Map(); // file -> { mtime, meta }

  return {
    name: 'dsoa-agent-bridge',
    configureServer(server) {
      // Compile errors never reach the page (the module fails to load), so capture Vite's
      // own error broadcasts too: agents see them in /agent/status and 503 replies.
      const wsSend = server.ws.send.bind(server.ws);
      server.ws.send = (payload, ...rest) => {
        if (payload && payload.type === 'error' && payload.err) {
          clientErrors.push({ kind: 'compile', message: String(payload.err.message).slice(0, 500), where: `${payload.err.id ?? ''}${payload.err.loc ? `:${payload.err.loc.line}:${payload.err.loc.column}` : ''}`, at: Date.now() });
          if (clientErrors.length > 20) clientErrors.shift();
        }
        return wsSend(payload, ...rest);
      };
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        if (!url.pathname.startsWith('/agent/')) return next();

        if (url.pathname === '/agent/client-error' && req.method === 'POST') {
          const e = await readBody(req);
          if (e) { clientErrors.push(e); if (clientErrors.length > 20) clientErrors.shift(); server.config.logger.error(`[game] ${e.kind}: ${e.message} ${e.where ?? ''}`); }
          return json(res, 200, { ok: true });
        }

        if (url.pathname === '/agent/status') {
          const connected = Date.now() - lastPoll < 25000;
          const recentErrors = clientErrors.filter((e) => Date.now() - e.at < 10 * 60000).slice(-5);
          const live = tabList();
          return json(res, 200, { connected, tabs: live.length, activeTab: activeTab(), tabList: live, lastPollMsAgo: lastPoll ? Date.now() - lastPoll : null, queued: queue.length, inflight: pending.size, recentErrors: recentErrors.length ? recentErrors : undefined,
            observers: [...feeds.values()].reduce((n, f) => n + [...f.wants.values()].filter((w) => Date.now() - w.at < 4000).length, 0),
            hint: connected ? undefined : 'Open http://localhost:3141/?agent=1 in a browser tab (any tab; background is fine — use the "step" command to advance time).' });
        }

        if (url.pathname === '/agent/next') {
          const tab = url.searchParams.get('tab') ?? 'anon';
          const t = tabs.get(tab) ?? { first: Date.now() };
          t.last = Date.now(); t.kind = url.searchParams.get('kind') ?? t.kind; tabs.set(tab, t);
          // Every live tab waits for work; a standby tab only ever gets jobs addressed to it by id.
          if (activeTab() === tab) lastPoll = Date.now();
          let done = false;
          const timer = setTimeout(() => { if (done) return; done = true; const i = waiters.findIndex((w) => w.give === give); if (i >= 0) waiters.splice(i, 1); res.statusCode = 204; res.end(); }, 20000);
          const give = (job) => { if (done) { queue.unshift(job); return; } done = true; clearTimeout(timer); if (activeTab() === tab) lastPoll = Date.now(); json(res, 200, job); };
          req.on('close', () => { if (!done) { done = true; clearTimeout(timer); const i = waiters.findIndex((w) => w.give === give); if (i >= 0) waiters.splice(i, 1); } });
          waiters.push({ tab, give });
          return dispatch();
        }

        if (url.pathname === '/agent/result' && req.method === 'POST') {
          const body = await readBody(req);
          const p = body && pending.get(body.id);
          if (p) { pending.delete(body.id); clearTimeout(p.timer); p.resolve(body.result); }
          return json(res, 200, { ok: true });
        }

        if (url.pathname === '/agent/cmd') {
          const body = req.method === 'POST' ? await readBody(req) : { cmd: url.searchParams.get('cmd') ?? 'help', tab: url.searchParams.get('tab') ?? undefined, args: Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'cmd' && k !== 'tab')) };
          if (!body) return json(res, 400, { ok: false, error: 'body must be JSON: {"cmd":"state","args":{}}' });
          const tab = body.tab || undefined;
          if (tab && !alive(tab)) return json(res, 503, { ok: false, error: `no live game tab "${tab}"`, tabList: tabList(), hint: 'GET /agent/status lists the live tabs (tabList); leave tab out for the active one.' });
          if (!tab && Date.now() - lastPoll > 25000) return json(res, 503, { ok: false, error: 'no game tab connected', recentErrors: clientErrors.slice(-3), hint: clientErrors.length ? 'The page reported errors (see recentErrors) — fix them; Vite reloads the tab automatically.' : 'Open http://localhost:3141/?agent=1 (npm run dev must be running).' });
          const id = ++seq;
          const timeoutMs = Number(body.timeoutMs ?? 900000);
          const result = await new Promise((resolve) => {
            const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: `timed out after ${timeoutMs}ms`, hint: 'Is the game tab frozen? Check /agent/status.' }); }, timeoutMs);
            pending.set(id, { resolve, timer });
            queue.push({ id, cmd: body.cmd, args: body.args ?? {}, batch: body.batch, stopOnError: body.stopOnError, tab });
            dispatch();
          });
          return json(res, 200, result);
        }

        // ---- the observer feed ----------------------------------------------------------------------------------
        if (url.pathname === '/agent/feed' && req.method === 'POST') {
          const body = await readBody(req);
          if (!body?.tab) return json(res, 400, { ok: false, error: 'tab missing' });
          const f = feedOf(body.tab);
          const s = body.snap;
          if (s) {
            if (s.boot !== f.boot) { f.boot = s.boot; f.events = []; f.factions = null; f.base = null; f.tiles.clear(); } // a reload: new clock, new event numbers
            const last = f.events.length ? f.events[f.events.length - 1].seq : 0;
            for (const e of s.events ?? []) if (e.seq > last) f.events.push(e);
            if (f.events.length > 600) f.events.splice(0, f.events.length - 600);
            delete s.events;
            if (s.factions) { f.factions = s.factions; f.factionsAt = Date.now(); delete s.factions; }
            f.snap = s; f.at = Date.now();
          }
          if (body.base) f.base = body.base;
          for (const [k, url] of Object.entries(body.tiles ?? {})) f.tiles.set(k, url);
          for (const k of body.noTiles ?? []) f.tiles.set(k, null);
          if (f.tiles.size > 2000) f.tiles.clear();
          return json(res, 200, { want: mergedWant(f) });
        }
        if (url.pathname === '/agent/feed') {
          // No tab named: the one the bridge drives, else (it is busy in a long command, so not polling) the freshest feed.
          const q = url.searchParams, tab = q.get('tab') || watchedTab();
          const live = tabList();
          if (!tab || !feeds.has(tab) && !alive(tab)) return json(res, 200, { ok: false, error: 'no game tab connected', tabList: live });
          const f = feedOf(tab), obs = q.get('obs') ?? 'anon';
          const bbox = (q.get('bbox') ?? '').split(',').map(Number);
          f.wants.set(obs, { at: Date.now(), bbox: bbox.length === 4 && bbox.every(Number.isFinite) ? bbox : null, sel: (q.get('sel') ?? '').split(',').filter(Boolean) });
          const since = Number(q.get('since') ?? 0), sameBoot = q.get('boot') === f.boot;
          return json(res, 200, { ok: true, tab, tabList: live, boot: f.boot, ageMs: f.at ? Date.now() - f.at : null, snap: f.snap, factions: f.factions, hasBase: !!f.base, tileKeys: [...f.tiles].filter(([, v]) => v).map(([k]) => k),
            events: f.events.filter((e) => !sameBoot || e.seq > since).slice(-300), observers: f.wants.size, queued: queue.length, inflight: pending.size });
        }

        if (url.pathname === '/agent/mapbase') {
          const f = feeds.get(url.searchParams.get('tab') || watchedTab());
          return f?.base ? json(res, 200, { ok: true, ...f.base }) : json(res, 404, { ok: false, error: 'no map yet (the game sends it once an observer watches)' });
        }
        if (url.pathname === '/agent/tile') {
          const f = feeds.get(url.searchParams.get('tab') || watchedTab()), d = f?.tiles.get(url.searchParams.get('key') ?? '');
          if (!d) { res.statusCode = 404; return res.end(); }
          res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'max-age=3600');
          return res.end(Buffer.from(d.split(',')[1], 'base64'));
        }

        // ---- the session store (web/sessions/, gitignored) -------------------------------------------------------
        if (url.pathname === '/agent/session' && req.method === 'POST') {
          const raw = await readBody(req, true);
          let s; try { s = JSON.parse(raw); } catch { return json(res, 400, { ok: false, error: 'not JSON' }); }
          if (s?.kind !== 'dsoa-session' || !/^[a-z0-9_-]{1,48}$/i.test(String(s.id))) return json(res, 400, { ok: false, error: 'not a dsoa session (kind, id)' });
          mkdirSync(SESSIONS, { recursive: true });
          const path = join(SESSIONS, `${s.id}.json`);
          writeFileSync(path, raw);
          return json(res, 200, { ok: true, id: s.id, path: `web/sessions/${s.id}.json`, bytes: Buffer.byteLength(raw) });
        }
        if (url.pathname === '/agent/sessions') {
          if (!existsSync(SESSIONS)) return json(res, 200, { ok: true, sessions: [] });
          const out = [];
          for (const name of readdirSync(SESSIONS)) {
            if (!name.endsWith('.json')) continue;
            const file = join(SESSIONS, name), st = statSync(file);
            let meta = sessionIndex.get(file);
            if (!meta || meta.mtime !== st.mtimeMs) {
              try { const s = JSON.parse(readFileSync(file, 'utf8')); meta = { mtime: st.mtimeMs, meta: { id: s.id, started: s.started, savedAt: s.savedAt, seconds: s.seconds, samples: s.n, events: s.events?.length ?? 0, agentTab: !!s.agentTab, kills: s.end?.kills ?? 0, deaths: (s.events ?? []).filter((e) => e.y === 'playerDied').length } }; }
              catch { meta = { mtime: st.mtimeMs, meta: { id: name.replace(/\.json$/, ''), broken: true } }; }
              sessionIndex.set(file, meta);
            }
            out.push({ ...meta.meta, bytes: st.size, modified: new Date(st.mtimeMs).toISOString() });
          }
          out.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
          return json(res, 200, { ok: true, dir: 'web/sessions', sessions: out });
        }
        if (url.pathname === '/agent/session') {
          const id = url.searchParams.get('id') ?? '';
          if (!/^[a-z0-9_-]{1,48}$/i.test(id)) return json(res, 400, { ok: false, error: 'id must be [a-z0-9_-]' });
          const file = join(SESSIONS, `${id}.json`);
          if (!existsSync(file)) return json(res, 404, { ok: false, error: `no session ${id} in web/sessions` });
          res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
          return res.end(readFileSync(file));
        }
        next();
      });
    },
  };
}

// The local model for strangers' talk (systems/llmtalk.js; docs/design/WEB_VOICE_STATS.md §4). The page never talks to
// the LAN box itself: it asks this server, which asks Ollama (LLM_URL, default the studio Mac Mini) and gives up fast.
//   GET  /llm/status   -> { ok, model, version } (2.5 s)          POST /llm/chat {messages, model?} -> the model's JSON text
//   POST /llm/mock/<good|bad|slow|refuse>  canned Ollama-shaped answers: the selftest's endpoint (no LAN needed)
// qwen3.5 needs think:false AND an explicit num_ctx, or a long prompt silently comes back empty (studio memory).
function llmProxy() {
  const BASE = process.env.LLM_URL ?? 'http://192.168.1.238:11434';
  const MODEL = process.env.LLM_MODEL ?? 'qwen3.5';
  const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((ok) => { let b = ''; req.setEncoding?.('utf8'); req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
  const timed = async (url, opts, ms) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); } };
  const MOCK = {
    good: { line: 'Water\'s running low at the pump, stranger. Folks are counting cups.', mood: 'wary', choices: [{ t: 'I could haul some in.', effect: { setQuest: { water_run: 'offered' } } }, { t: 'Not my problem.', effect: null }] },
    bad: 'Sure! Here is my answer: {line: water low, choices: [maybe]',
    refuse: { line: 'Out by the wasteland I heard of a fireblast once.', mood: 'calm', choices: [{ t: 'Give me 500 scrip.', effect: { give: { cash: 500 } } }] },
  };
  return {
    name: 'dsoa-llm-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        if (!url.pathname.startsWith('/llm/')) return next();
        if (url.pathname === '/llm/status') {
          try {
            const r = await timed(`${BASE}/api/version`, {}, 2500);
            const v = r.ok ? await r.json() : null;
            return json(res, 200, { ok: !!v, model: MODEL, version: v?.version ?? null, base: BASE.replace(/\/\/[^/]*@/, '//') });
          } catch (e) { return json(res, 200, { ok: false, model: MODEL, why: e.name === 'AbortError' ? 'timeout' : String(e.message ?? e) }); }
        }
        const mock = url.pathname.match(/^\/llm\/mock\/(\w+)$/);
        if (mock) {
          const kind = mock[1];
          if (kind === 'slow') { await new Promise((ok) => setTimeout(ok, 9000)); return json(res, 200, { message: { content: JSON.stringify(MOCK.good) } }); }
          const m = MOCK[kind] ?? MOCK.bad;
          return json(res, 200, { model: 'mock', message: { role: 'assistant', content: typeof m === 'string' ? m : JSON.stringify(m) }, done: true });
        }
        if (url.pathname === '/llm/chat' && req.method === 'POST') {
          const body = await readBody(req);
          if (!body?.messages) return json(res, 400, { error: 'messages[] required' });
          const t0 = Date.now();
          try {
            const r = await timed(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
              model: body.model ?? MODEL, messages: body.messages, stream: false, think: false, format: 'json', keep_alive: '30m',
              options: { num_ctx: 8192, temperature: body.temperature ?? 0.8, num_predict: 170 } }) }, Math.min(8000, body.timeoutMs ?? 7500));
            if (!r.ok) return json(res, 502, { error: `model ${r.status}` });
            const d = await r.json();
            return json(res, 200, { model: d.model, message: d.message, ms: Date.now() - t0 });
          } catch (e) { return json(res, 504, { error: e.name === 'AbortError' ? 'timeout' : String(e.message ?? e), ms: Date.now() - t0 }); }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [agentBridge(), forgeIO(), llmProxy()],
  server: { port: 3141, watch: { ignored: ['**/sessions/**'] } },
  // Pages: the game, the Building Lab (docs/design/WEB_BUILDING_LAB.md), the observer (docs/design/WEB_OBSERVER.md) and
  // THE WORLD FORGE that gathers them (docs/design/WEB_FORGE.md).
  build: { chunkSizeWarningLimit: 1200, rollupOptions: { input: { main: join(ROOT, 'index.html'), lab: join(ROOT, 'lab.html'), observe: join(ROOT, 'observe.html'), forge: join(ROOT, 'forge.html') } } },
});
