// Browser side of the agent bridge. Long-polls the dev server for commands that
// shell agents POST to /agent/cmd, runs them through the AgentAPI, posts results back.
// Only active under `npm run dev` (the endpoints come from the Vite plugin).
// Beside it: the observer feed (pushes a snapshot only while observe.html watches this tab) and the recorder's
// autosave (a person's tab writes its session to web/sessions/ every couple of minutes). Neither runs per frame.

import { feedSnapshot, mapBase, mapTiles } from './observe.js';
import { REC } from './recorder.js';

export function startBridge(api) {
  const params = new URLSearchParams(location.search);
  if (params.has('agent') || params.has('autostart')) {
    // Skip the title screen for automated sessions.
    queueMicrotask(() => api.call('start'));
  }
  if (!import.meta.env?.DEV) return;
  // Stable tab id across reloads, so the bridge keeps talking to the same tab after a code edit.
  let tab = null;
  try { tab = sessionStorage.getItem('dl.tab'); } catch {}
  if (!tab) { tab = Math.random().toString(36).slice(2, 8); try { sessionStorage.setItem('dl.tab', tab); } catch {} }
  api.tabId = tab;
  const kind = params.has('agent') ? 'agent' : 'human';
  let failures = 0;
  const loop = async () => {
    try {
      const res = await fetch(`/agent/next?tab=${tab}&kind=${kind}`, { cache: 'no-store' });
      if (res.status === 200) {
        const job = await res.json();
        const t0 = performance.now();
        let result;
        if (Array.isArray(job.batch)) {
          result = { ok: true, results: [] };
          for (const j of job.batch) {
            const r = await api.call(j.cmd, j.args);
            result.results.push({ cmd: j.cmd, ...r });
            if (!r.ok && job.stopOnError !== false) { result.ok = false; break; }
          }
        } else result = await api.call(job.cmd, job.args);
        result.ms = Math.round(performance.now() - t0);
        await fetch('/agent/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, result }) });
      }
      failures = 0;
    } catch {
      failures++;
    }
    setTimeout(loop, failures ? Math.min(5000, 250 * failures) : 0);
  };
  loop();
  startFeed(api, tab);
  if (kind === 'human') api.autosaveS ??= REC.autosaveS;
  startAutosave(api);
}

// THE OBSERVER's feed. Idle (nobody watching): one tiny POST every 1.5 s asking whether anyone is. Watched: a snapshot
// every 200 ms with the events since the last one, the doors in the observer's view and the selected person's card.
// It runs on timers, not frames, and keeps running while a long command (step, selftest) yields.
function startFeed(api, tab) {
  let want = null, lastSeq = api.g.eventSeq, failures = 0;
  const tick = async () => {
    let delay = 1500;
    try {
      const body = { tab };
      if (want) {
        const since = Math.max(lastSeq, api.g.eventSeq - 200);
        body.snap = feedSnapshot(api, { since, bbox: want.bbox, sel: want.sel, factions: want.factions });
        lastSeq = body.snap.seq;
        if (want.base) body.base = mapBase(api.g);
        if (want.tiles?.length) { body.tiles = mapTiles(api.g, want.tiles); body.noTiles = want.tiles.filter((k) => !body.tiles[k]); }
      } // idle: the cursor stays put, so the first frame after someone starts watching carries what led up to it (<= 200)
      const r = await fetch('/agent/feed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      want = (await r.json()).want ?? null;
      if (want) delay = want.interval ?? 200;
      failures = 0;
    } catch { failures++; delay = Math.min(10000, 1500 * failures); }
    setTimeout(tick, delay);
  };
  setTimeout(tick, 500);
}

// A person's tab (not ?agent=1) keeps its session on disk: every api.autosaveS seconds once it holds a minute of play,
// the same file (its id) rewritten. `record autosave=0` turns it off, `record autosave=<s>` on (agents too).
function startAutosave(api) {
  let lastTotal = 0;
  const tick = async () => {
    const R = api.g.recorder, every = api.autosaveS;
    if (R && every > 0 && R.on && R.total !== lastTotal && R.n / R.rate >= REC.minAutosave) {
      try {
        const s = R.session();
        const r = await fetch('/agent/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }).then((x) => x.json());
        if (r.ok) { R.saved = { at: new Date().toISOString(), id: s.id, path: r.path, bytes: r.bytes, seconds: s.seconds, auto: true }; lastTotal = R.total; }
      } catch { /* the dev server is down: try again next time */ }
    }
    setTimeout(tick, Math.max(10, every || 30) * 1000);
  };
  setTimeout(tick, 10000);
}
