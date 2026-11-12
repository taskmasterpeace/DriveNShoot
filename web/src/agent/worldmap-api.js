// THE WORLD MAP (docs/design/WEB_WORLD_MAP.md): the `atlas` command and the selftest checks for the big map's COUNTRY
// view (ui/atlas.js, ui/qol.js). Each check puts back what it changed: the view, the fog, the waypoint, the map's state.
import { ATLAS, Atlas, rulerOf } from '../ui/atlas.js';
import { RULERS } from '../data/atlas.js';
import USMAP from '../data/usmap.json';

const r1 = (v) => Math.round(v * 10) / 10;

export function worldmapCommands(api, need) {
  const g = api.g;
  return {
    atlas: {
      group: 'observe',
      desc: 'THE WORLD MAP (docs/design/WEB_WORLD_MAP.md): the big map\'s COUNTRY view. Reports the state you stand in and its ruler, how much of the country you have seen (1 km cells, saved with the game), what the sheet shows (states, cities, holdouts/exits/bases where you have been) and the paint time. open=true|false opens or closes the big map; view=area|country picks the view; zoom=<1-8> with x,z (world metres) centres the country view there; uncover=<metres> lifts the fog in a disc round you (a tool for scenarios: it is what driving there does).',
      args: { open: { type: 'boolean' }, view: { type: 'string' }, zoom: { type: 'number' }, x: { type: 'number' }, z: { type: 'number' }, uncover: { type: 'number' } },
      run: async ({ open, view, zoom, x, z, uncover }) => {
        const Q = g.qol, A = Q.atlas, p = g.player, px = p.inVehicle?.x ?? p.x, pz = p.inVehicle?.z ?? p.z;
        if (view !== undefined) { need(view === 'area' || view === 'country', 'view is area or country'); Q.setMapView(view); }
        if (zoom !== undefined || x !== undefined || z !== undefined) { need(zoom === undefined || (zoom >= ATLAS.minZoom && zoom <= ATLAS.maxZoom), `zoom ${ATLAS.minZoom}..${ATLAS.maxZoom}`); A.centreOn(x ?? px, z ?? pz, zoom); }
        if (uncover !== undefined) { need(uncover > 0 && uncover <= 20000, 'uncover is 1..20000 metres'); A.uncover(px, pz, uncover); }
        if (open !== undefined) Q.toggleMap(open);
        else if (Q.mapOpen) Q.drawBigMap();
        const M = A.marks(), st = A.stateAt(px, pz);
        return {
          open: Q.mapOpen, view: Q.mapView, zoom: r1(A.view?.z ?? 1),
          here: { state: st, ruler: st ? rulerOf(st) : null, x: r1(px), z: r1(pz), seen: A.isSeen(px, pz) },
          seen: { km2: A.nSeen, of: A.seen.length, share: +(A.share() * 100).toFixed(3) },
          sheet: {
            states: M.states.length, withRuler: M.states.filter((s) => s.ruler).length, interstates: M.roads.length, rivers: M.rivers.length,
            cities: M.towns.filter((t) => t.kind === 'city').length,
            holdoutsShown: M.towns.filter((t) => t.kind !== 'city' && t.shown).length, holdouts: M.towns.filter((t) => t.kind !== 'city').length,
            exitsShown: M.exits.filter((e) => e.shown).length, exits: M.exits.length,
            basesShown: M.bases.filter((b) => b.shown).length, bases: M.bases.length,
          },
          labels: A.labels ?? null, paintMs: A.paintMs === null ? null : r1(A.paintMs),
        };
      },
    },
  };
}

// The colour of a pixel as a hue: the no-purple law is hue 270-320 with real saturation.
const purple = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 40 || d / mx < 0.25) return false;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 270 && h <= 320;
};

export async function worldmapChecks(api, check, C) {
  const g = api.g, Q = g.qol, A = Q.atlas, P = () => g.player;
  const wasView = Q.mapView, wasAtlasView = A.view ? { ...A.view } : null, wasSeen = A.seen.slice(), wasN = A.nSeen, wasWp = Q.waypoint;
  const putBack = () => { A.seen.set(wasSeen); A.nSeen = wasN; A.fogDirty = true; A.view = wasAtlasView ? { ...wasAtlasView } : null; if (Q.mapOpen) Q.toggleMap(false); Q.setMapView(wasView); Q.waypoint = wasWp; Q.routeKey = ''; };

  try {
    await check('worldmap: the atlas paints the whole country once (48 states, 59 towns, 10 interstates, 6 rivers) in under 250 ms', async () => {
      const fresh = new Atlas(g), a = fresh.paint(), b = fresh.paint();
      const M = fresh.marks();
      const ok = a === b && fresh.paintMs < 250 && a.width === USMAP.w * ATLAS.P && M.states.length === 48 && M.towns.length === 59 && M.roads.length === 10 && M.rivers.length === 6;
      return ok ? true : JSON.stringify({ same: a === b, ms: fresh.paintMs, w: a.width, states: M.states.length, towns: M.towns.length, roads: M.roads.length, rivers: M.rivers.length });
    });

    await check('worldmap: every state on the sheet has its ruler (docs/DIVIDED_STATES.md), and the map title names yours', async () => {
      const A2 = new Atlas(g); A2.paint();
      const missing = A2.states.filter((s) => !s.ruler || !RULERS[s.code]).map((s) => s.name);
      Q.toggleMap(true); Q.setMapView('area'); Q.drawBigMap();
      const st = A.stateAt(P().x, P().z), title = Q.el.mapTitle.textContent;
      Q.toggleMap(false);
      const ok = !missing.length && st && title.startsWith(st) && title.includes(rulerOf(st).toUpperCase());
      return ok ? true : JSON.stringify({ missing, st, title });
    });

    await check('worldmap: COUNTRY prints states, rulers, cities and every interstate nickname with no label over another', async () => {
      A.view = null; Q.toggleMap(true); Q.setMapView('country'); Q.drawBigMap();
      const L = { ...A.labels }, boxes = A.texts.slice();
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) overlaps++; }
      const wide = Q.el.mapCanvas.width === ATLAS.cw && Q.el.mapCanvas.height === ATLAS.ch, key = A.keyDrawn, named = USMAP.interstates.filter((r) => r.nickname).length;
      Q.toggleMap(false);
      // At the whole-country zoom every nickname is in the key (it is drawn when zoom < 1.35); every city and nearly every
      // state prints; the rulers of the smallest states wait for a zoom.
      const ok = wide && key && named === 8 && L.states >= 40 && L.rulers >= 20 && L.towns >= 32 && overlaps === 0;
      return ok ? true : JSON.stringify({ L, overlaps, wide, key, named });
    });

    await check('worldmap: the fog lifts where you go, only there, and comes back from a save', async () => {
      A.seen.fill(0); A.nSeen = 0; A.last = null; A.t = 0; A.fogDirty = true;
      const p = P(), x0 = p.x, z0 = p.z;
      await C('step', { seconds: 0.6 });
      const here = A.nSeen, seenHere = A.isSeen(p.x, p.z);
      const far = !A.isSeen(x0 + 30000, z0); // 30 km east: never been
      const s = A.save(), B = new Atlas(g), loaded = B.load(JSON.parse(JSON.stringify(s)));
      const same = loaded && B.nSeen === A.nSeen && B.seen.every((v, i) => v === A.seen[i]);
      const bad = !B.load({ ...s, w: 1 }); // a save from another grid is refused, not misread
      const snap = (await import('./api.js')).snapshot(g);
      const ok = here > 5 && here < 30 && seenHere && far && same && bad && snap.atlas?.runs?.length >= 2;
      return ok ? true : JSON.stringify({ here, seenHere, far, same, bad, runs: snap.atlas?.runs?.length });
    });

    await check('worldmap: holdouts, exits and bases show only where you have been (law 6); cities always', async () => {
      A.seen.fill(0); A.nSeen = 0; A.fogDirty = true;
      const M0 = A.marks(), cities0 = M0.towns.filter((t) => t.kind === 'city' && t.shown).length, local0 = M0.towns.filter((t) => t.kind !== 'city' && t.shown).length + M0.exits.filter((e) => e.shown).length + M0.bases.filter((b) => b.shown).length;
      const ex = M0.exits[0], ho = M0.towns.find((t) => t.kind !== 'city'), ba = M0.bases[0];
      A.uncover(ex.x, ex.z, 800); A.uncover(ho.x, ho.z, 800); A.uncover(ba.x, ba.z, 800);
      const M1 = A.marks(), ok = cities0 === 33 && local0 === 0 && M1.exits.find((e) => e.id === ex.id).shown && M1.towns.find((t) => t.id === ho.id).shown && M1.bases.find((b) => b.id === ba.id).shown;
      return ok ? true : JSON.stringify({ cities0, local0, ex: ex.id, ho: ho.id, ba: ba.id });
    });

    await check('worldmap: Tab and the AREA/COUNTRY tabs switch the view; the wheel zooms about the cursor; a drag pans', async () => {
      Q.toggleMap(true); Q.setMapView('area');
      const I = g.input, tab = () => { Q.input({ hit: (k) => k === 'Tab' }); };
      tab(); const v1 = Q.mapView; tab(); const v2 = Q.mapView;
      Q.el.mapTabs.querySelector('[data-view="country"]').click(); const v3 = Q.mapView;
      A.view = null; A.frame();
      const cv = Q.el.mapCanvas, r = cv.getBoundingClientRect(), cx = r.left + r.width * 0.25, cy = r.top + r.height * 0.5;
      const before = A.pick(0.25, 0.5);
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      const after = A.pick(0.25, 0.5), z1 = A.view.z;
      const anchored = Math.hypot(after.ux - before.ux, after.uy - before.uy) < 60; // the point under the cursor stays put
      const c0 = A.view.cx;
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true }));
      cv.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + 80, clientY: cy, bubbles: true }));
      dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: cx + 80, clientY: cy, bubbles: true }));
      const panned = A.view.cx < c0, noWp = Q.waypoint === wasWp; // a drag is not a click
      Q.toggleMap(false);
      const ok = v1 === 'country' && v2 === 'area' && v3 === 'country' && z1 > 1.5 && anchored && panned && noWp && !!I;
      return ok ? true : JSON.stringify({ v1, v2, v3, z1, anchored, panned, noWp });
    });

    await check('worldmap: a click on the country sets the waypoint there (El Paso within a cell); right-click clears it', async () => {
      Q.toggleMap(true); Q.setMapView('country'); A.view = null; Q.drawBigMap();
      const ep = USMAP.towns.find((t) => t.id === 'elpaso'), W = A.marks().towns.find((t) => t.id === 'elpaso');
      const { u, v } = A.toCanvas(W.x, W.z), cv = Q.el.mapCanvas, r = cv.getBoundingClientRect(), cx = r.left + u * r.width, cy = r.top + v * r.height;
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: cx, clientY: cy, bubbles: true }));
      dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: cx, clientY: cy, bubbles: true }));
      const wp = Q.waypoint ? { ...Q.waypoint } : null, err = wp ? Math.hypot(wp.x - W.x, wp.z - W.z) : null;
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: cx, clientY: cy, bubbles: true }));
      const cleared = !Q.waypoint;
      Q.toggleMap(false);
      // One canvas pixel at zoom 1 is 75,000 / 1216 usmap metres = 321 m of world; a click lands within a 1 km fog cell.
      const ok = !!ep && wp && err < 1000 && cleared;
      return ok ? true : JSON.stringify({ wp, err, cleared });
    });

    await check('worldmap: no purple anywhere on the country sheet (hue 270-320)', async () => {
      Q.toggleMap(true); Q.setMapView('country'); A.view = null; A.seen.fill(1); A.fogDirty = true; Q.drawBigMap();
      const cv = Q.el.mapCanvas, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let bad = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (purple(d[i], d[i + 1], d[i + 2])) bad++;
      A.centreOn(0, 0, 5); Q.drawBigMap(); // zoomed in: exits, holdouts, bases, their labels, the travel layer
      const d2 = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d2.length; i += 4 * 3) if (purple(d2[i], d2[i + 1], d2[i + 2])) bad++;
      Q.toggleMap(false);
      return bad === 0 ? true : `${bad} purple samples`;
    });

    await check('worldmap: the fog costs nothing standing still (10,000 updates under 5 ms); open on COUNTRY, frames redraw nothing until something changes', async () => {
      A.last = { x: P().x, z: P().z }; A.t = 0;
      const t0 = performance.now(); for (let i = 0; i < 10000; i++) A.update(0.016); const ms = performance.now() - t0;
      // The map's own frame path (QOL.update while paused under it): closed, and open on COUNTRY with nothing changing.
      const d0 = A.draws ?? 0; for (let i = 0; i < 60; i++) Q.update(0.016); const closed = (A.draws ?? 0) - d0;
      Q.toggleMap(true); Q.setMapView('country'); Q.drawBigMap(); A.fogDirty = false;
      const title = Q.el.mapTitle.firstChild, d1 = A.draws; for (let i = 0; i < 60; i++) Q.update(0.016); const idle = A.draws - d1, sameNode = Q.el.mapTitle.firstChild === title;
      A.seen.fill(0); A.nSeen = 0; A.uncover(P().x + 9000, P().z, 1200); Q.update(0.016); /* an earlier check lifted all of it */ const onFog = A.draws - d1 - idle;
      Q.toggleMap(false);
      const ok = ms < 5 && closed === 0 && idle === 0 && sameNode && onFog === 1;
      return ok ? true : JSON.stringify({ ms: +ms.toFixed(2), closed, idle, sameNode, onFog });
    });

    await check('worldmap: the atlas command reports the sheet, the state you are in and what you have seen', async () => {
      const r = await C('atlas', {});
      const ok = r.sheet?.states === 48 && r.sheet.withRuler === 48 && r.sheet.interstates === 10 && r.sheet.cities === 33 && r.here?.state && typeof r.seen?.km2 === 'number';
      return ok ? true : JSON.stringify(r);
    });
  } finally { putBack(); }
}
