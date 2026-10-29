// THE HUD LAYOUT for agents (docs/design/WEB_UI_EDITOR.md; rows data/hudlayout.js, live layout + editor ui/hudedit.js): the
// `hud` command (list, set, preset, reset, export, import, situation, edit) and the selftest's named checks for the lane
// (each returns true or a JSON diagnostic, and puts the player's own layout back).
import { PANELS, PANEL_IDS, PANEL_PRESET_IDS, validatePanels, validatePanelLayout } from '../data/panellayout.js';
import { textOverlaps, rectsCross } from '../ui/panellayout.js';
import { bodyDollChecks } from './bodydoll-api.js';
import { HUD_LAYOUT, HUD_PRESETS, PRESET_IDS, SITUATIONS, SITUATION_IDS, ANCHORS, placeRect, resolveLayout, validateHudLayout, layoutScale, fitScale } from '../data/hudlayout.js';

export function hudCommands(api, need) {
  const g = api.g, L = () => g.hud.layout, E = () => g.hud.editor;
  const out = (extra = {}) => ({ ok: true, preset: L().preset, situation: L().sit, forced: L().forced, editing: !!E()?.open, layoutScale: +L().L.toFixed(3), ...extra });
  return {
    hudLayout: {
      group: 'meta',
      desc: 'The HUD layout (data/hudlayout.js, docs/design/WEB_UI_EDITOR.md): every HUD element as a named row anchored to a corner or edge. action=list (rows + where each sits on screen) | set id=<row> [x= y= anchor=tl|tc|tr|ml|mc|mr|bl|bc|br scale= visible= situations=a,b] | preset name=default|compact|streamer|controller | reset [id=] | export | import json=<layout JSON> | situation name=<on_foot|driving|passenger|deck|prone|menu|night|dead|auto> (preview what that situation shows) | edit on=true|false [panel=false hides the editor panel, names stay]. A player\'s layout is saved on this machine.',
      args: { action: { type: 'string' }, id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, anchor: { type: 'string' }, scale: { type: 'number' }, visible: { type: 'boolean' }, situations: { type: 'string' }, name: { type: 'string' }, json: { type: 'string' }, on: { type: 'boolean' }, panel: { type: 'boolean' } },
      run: async ({ action = 'list', id, x, y, anchor, scale, visible, situations, name, json, on, panel } = {}) => {
        const lay = L();
        need(lay, 'the HUD layout is not up (no HUD on this page)');
        const fail = (bad) => ({ ok: false, error: bad[0], problems: bad, hint: 'hudLayout action=list shows the rows; anchors tl tc tr ml mc mr bl bc br; scale 0.4..2.5' });
        switch (action) {
          case 'list':
            return out({ rows: lay.list(), presets: Object.fromEntries(PRESET_IDS.map((p) => [p, { name: HUD_PRESETS[p].name, scale: HUD_PRESETS[p].scale, blurb: HUD_PRESETS[p].blurb }])), situations: SITUATIONS, anchors: Object.keys(ANCHORS), bad: validateHudLayout(lay.rows) });
          case 'set': {
            need(id, 'set needs id=<row> (hudLayout action=list)');
            const f = {};
            if (x !== undefined) f.x = Number(x);
            if (y !== undefined) f.y = Number(y);
            if (anchor !== undefined) f.anchor = anchor;
            if (scale !== undefined) f.scale = Number(scale);
            if (visible !== undefined) f.visible = visible === true || visible === 'true';
            if (situations !== undefined) f.situations = String(situations).split(',').map((s) => s.trim()).filter(Boolean);
            const bad = lay.edit(id, f);
            return bad.length ? fail(bad) : out({ row: lay.list().find((r) => r.id === id) });
          }
          case 'preset': { const bad = lay.setPreset(name ?? id); E()?.open && E().render(); return bad.length ? fail(bad) : out(); }
          case 'reset': { const bad = lay.reset(id ?? null); E()?.open && E().render(); return bad.length ? fail(bad) : out(); }
          case 'export': return out({ layout: lay.exportLayout(), json: JSON.stringify(lay.exportLayout()) });
          case 'import': { need(json, 'import needs json=<a layout from hudLayout action=export>'); const bad = lay.importLayout(json); return bad.length ? fail(bad) : out(); }
          case 'situation': {
            const s = name ?? id ?? 'auto';
            need(s === 'auto' || s in SITUATIONS, `no situation '${s}' (${SITUATION_IDS.join(' ')} auto)`);
            if (E()?.open) E().situation(s); else lay.force(s === 'auto' ? null : s);
            return out({ shown: lay.list().filter((r) => r.shown).map((r) => r.id) });
          }
          case 'edit': {
            const want = on === undefined ? !E().open : on === true || on === 'true';
            E().toggle(want);
            const np = panel === false || panel === 'false';
            g.hud.root.classList.toggle('nopanel', np); E().el.root.classList.toggle('nopanel', np);
            return out();
          }
          default: return { ok: false, error: `unknown action '${action}'`, hint: 'list | set | preset | reset | export | import | situation | edit' };
        }
      },
    },
    panelLayout: {
      group: 'meta',
      desc: 'The full screens as named regions (data/panellayout.js, docs/design/WEB_UI_EDITOR.md §3.8): workshop, pack, sheet, crew, dialogue, travel, creator, pause. action=list [panel=] (regions, live or not, where each sits) | open panel= | close panel= | set panel= [region=] [visible= scale= text= dx= dy= anchor=flow|tl|tc|tr|bl|bc|br cols= density=] (no region: scale= scales the whole panel) | preset name=default|compact|large | reset [panel=] [region=] | export | import json= | audit panel= (text runs that cross each other, at this size) | edit panel= (the HUD editor on that panel).',
      args: { action: { type: 'string' }, panel: { type: 'string' }, region: { type: 'string' }, visible: { type: 'boolean' }, scale: { type: 'number' }, text: { type: 'number' }, dx: { type: 'number' }, dy: { type: 'number' }, anchor: { type: 'string' }, cols: { type: 'number' }, density: { type: 'number' }, name: { type: 'string' }, json: { type: 'string' }, tab: { type: 'number' } },
      run: async ({ action = 'list', panel, region, name, json, tab, ...f } = {}) => {
        const P = g.hud.panels;
        need(P, 'no panel layout on this page');
        const fail = (bad) => ({ ok: false, error: bad[0], problems: bad, hint: 'panelLayout action=list shows panels and regions' });
        const ok = (x = {}) => ({ ok: true, preset: P.preset, ...x });
        const needPanel = () => need(PANELS[panel], `panel=${panel} is not one of ${PANEL_IDS.join(' ')}`);
        switch (action) {
          case 'list':
            if (panel) { needPanel(); return ok({ panel, open: P.isOpen(panel), scale: P.resolved(panel).scale, regions: P.list(panel) }); }
            return ok({ panels: Object.fromEntries(PANEL_IDS.map((id) => [id, { name: PANELS[id].name, open: P.isOpen(id), regions: PANELS[id].regions.map((r) => r.id) }])), presets: PANEL_PRESET_IDS, bad: validatePanels() });
          case 'open': { needPanel(); const r = P.open(panel, { tab }); return r.ok ? ok({ panel, regions: P.list(panel) }) : { ok: false, error: r.why ?? 'would not open' }; }
          case 'close': needPanel(); P.close(panel); return ok({ panel });
          case 'set': {
            needPanel();
            const fields = {};
            for (const k of ['visible', 'scale', 'text', 'dx', 'dy', 'anchor', 'cols', 'density']) if (f[k] !== undefined) fields[k] = k === 'visible' ? f[k] === true || f[k] === 'true' : k === 'anchor' ? f[k] : Number(f[k]);
            const bad = P.edit(panel, region ?? null, fields);
            return bad.length ? fail(bad) : ok({ panel, edit: P.resolved(panel) });
          }
          case 'preset': { const bad = P.setPreset(name ?? 'default'); return bad.length ? fail(bad) : ok(); }
          case 'reset': P.reset(panel ?? null, region ?? null); return ok();
          case 'export': return ok({ layout: P.exportLayout(), json: JSON.stringify(P.exportLayout()) });
          case 'import': { need(json, 'import needs json=<a layout from panelLayout action=export>'); const bad = P.importLayout(json); return bad.length ? fail(bad) : ok(); }
          case 'audit': { needPanel(); const was = P.isOpen(panel); if (!was) P.open(panel, { tab }); await new Promise((r) => setTimeout(r, 120)); const hits = textOverlaps(P.rootEl(panel)); if (!was) P.close(panel); return ok({ panel, size: `${innerWidth}x${innerHeight}`, crossing: hits }); }
          case 'edit': { needPanel(); E().show(); return E().screen(panel) ? ok({ panel }) : { ok: false, error: `${panel} would not open for editing` }; }
          default: return { ok: false, error: `unknown action '${action}'`, hint: 'list | open | close | set | preset | reset | export | import | audit | edit' };
        }
      },
    },
  };
}

// The selftest's checks. Each puts back the player's own layout (state, forced situation, editor) when done.
export async function hudChecks({ api, g, check }) {
  const lay = g.hud.layout, ed = g.hud.editor;
  const saved = lay.snapshot(), wasEditing = ed.open;
  const restore = () => { if (ed.open && !wasEditing) ed.hide(); lay.setState(JSON.parse(saved)); lay.force(null); };
  lay.tick(); // late elements (compass, weapon bar, telltale rail) bind

  await check('hud layout: the rows validate, a broken row is named, and every preset names only real rows', async () => {
    const bad = validateHudLayout(HUD_LAYOUT);
    const broken = validateHudLayout([{ ...HUD_LAYOUT[0], anchor: 'nw', scale: 9 }, { ...HUD_LAYOUT[0] }]);
    const ok = !bad.length && broken.some((b) => b.includes('anchor')) && broken.some((b) => b.includes('scale')) && broken.some((b) => b.includes('duplicate'));
    return ok ? true : JSON.stringify({ bad, broken });
  });

  await check('hud layout: every row maps to a live element in its own anchored wrapper (named, not orphaned)', async () => {
    lay.bind();
    const miss = [];
    for (const b of lay.boxes) {
      const el = document.querySelector(b.row.sel);
      if (!el || el !== b.el || !el.isConnected) { miss.push(`${b.id}: ${b.row.sel} ${el ? 'not bound' : 'not found'}`); continue; }
      if (b.row.anchor !== 'mouse' && (!b.wrap || b.wrap.dataset.hud !== b.id || el.parentNode !== b.wrap || b.wrap.querySelector('.hl-name')?.textContent !== b.row.name)) miss.push(`${b.id}: wrapper`);
    }
    const want = ['minimap', 'sign', 'clock', 'cash', 'status', 'speedo', 'needs', 'respect', 'roles', 'objective', 'killfeed', 'reticle', 'prompt', 'subtitle', 'breath', 'weaponbar', 'compass', 'footing', 'weapon', 'telltales', 'ailments', 'feed', 'flag'];
    const absent = want.filter((id) => !lay.byId[id]);
    return !miss.length && !absent.length ? true : JSON.stringify({ miss, absent });
  });

  await check('hud layout: set, export and import round-trip (and a bad import is refused, changing nothing)', async () => {
    lay.setState({ preset: 'default', edits: {} });
    const a = lay.edit('cash', { x: 40, y: 300, scale: 1.2 }), b = lay.edit('respect', { visible: false }), c = lay.edit('prompt', { anchor: 'tc', situations: ['on_foot', 'deck'] });
    const exp = JSON.stringify(lay.exportLayout()), rowsBefore = JSON.stringify(lay.rows);
    lay.reset();
    const cleared = JSON.stringify(lay.rows) !== rowsBefore;
    const imp = lay.importLayout(exp), same = JSON.stringify(lay.rows) === rowsBefore;
    // rows-only import (the shape Robert pastes into data/hudlayout.js) lands on the same rows
    lay.reset(); const imp2 = lay.importLayout(JSON.stringify({ rows: JSON.parse(exp).rows })), same2 = JSON.stringify(lay.rows) === rowsBefore;
    const refused = lay.importLayout('{"rows":[{"id":"cash","anchor":"zz"}]}'), still = JSON.stringify(lay.rows) === rowsBefore;
    const ok = !a.length && !b.length && !c.length && cleared && !imp.length && same && !imp2.length && same2 && refused.length && still && lay.byId.cash.row.scale === 1.2;
    restore();
    return ok ? true : JSON.stringify({ a, b, c, cleared, imp, same, imp2, same2, refused, still });
  });

  await check('hud layout: Default is smaller than the old HUD (75% at 1600x900; every element on screen draws below the old scale)', async () => {
    lay.setState({ preset: 'default', edits: {} });
    const pure = layoutScale(1600, 900, 1, HUD_PRESETS.default.scale);
    const hudSize = Number(g.qol?.settings?.hudScale) || 1, old = fitScale(innerWidth, innerHeight) * hudSize;
    const big = lay.boxes.filter((b) => b.wrap && b.k >= old * 0.8).map((b) => `${b.id}:${b.k.toFixed(2)}`);
    const wp = lay.byId.weapon, wpW = wp.sw;
    restore();
    return pure === 0.75 && !big.length && wpW < 307 * old * 0.8 ? true : JSON.stringify({ pure, old, big, wpW });
  });

  await check('hud layout: every preset survives 1280x720 and 2560x1440: every element on screen, none over the minimap', async () => {
    const bad = [];
    const size = Object.fromEntries(lay.boxes.map((b) => [b.id, { w: Math.max(b.w, b.row.w ?? 0), h: Math.max(b.h, b.row.h ?? 0) }]));
    const R = {};
    for (const p of PRESET_IDS) for (const [W, H] of [[1280, 720], [2560, 1440], [1600, 900]]) {
      const rows = resolveLayout(p), Ls = layoutScale(W, H, 1, HUD_PRESETS[p].scale);
      const mmRow = rows.find((r) => r.id === 'minimap'), mm = placeRect(mmRow, W, H, size.minimap.w, size.minimap.h, Ls, {});
      for (const r of rows) {
        if (r.anchor === 'mouse' || !r.visible) continue;
        // where it would land with no clamp: the clamp is a safety net, the layout itself must fit
        const raw = placeRect({ ...r }, 1e6, 1e6, size[r.id].w, size[r.id].h, Ls, R);
        const a = ANCHORS[r.anchor], ex = a.ax * (W - raw.w) + (a.ax === 1 ? -1 : 1) * r.x * Ls, ey = a.ay * (H - raw.h) + (a.ay === 1 ? -1 : 1) * r.y * Ls;
        if (ex < -0.5 || ey < -0.5 || ex + raw.w > W + 0.5 || ey + raw.h > H + 0.5) bad.push(`${p} ${W}x${H} ${r.id} off screen (${Math.round(ex)},${Math.round(ey)} ${Math.round(raw.w)}x${Math.round(raw.h)})`);
        if (r.id === 'minimap' || !r.situations.some((s) => mmRow.situations.includes(s))) continue;
        if (ex < mm.x + mm.w - 0.5 && ex + raw.w > mm.x + 0.5 && ey < mm.y + mm.h - 0.5 && ey + raw.h > mm.y + 0.5) bad.push(`${p} ${W}x${H} ${r.id} over the minimap`);
      }
    }
    return bad.length ? JSON.stringify(bad.slice(0, 8)) : true;
  });

  await check('hud layout: each situation shows its elements and hides the rest', async () => {
    lay.setState({ preset: 'default', edits: {} });
    const bad = [];
    for (const s of SITUATION_IDS) {
      lay.force(s);
      for (const b of lay.boxes) {
        const node = b.wrap ?? b.el;
        if (!node) continue;
        const want = b.row.visible && b.row.situations.includes(s), off = node.classList.contains('hl-off') || getComputedStyle(node).display === 'none';
        if (want === off && !(b.id === 'reticle' && want)) bad.push(`${s}: ${b.id} ${want ? 'hidden' : 'shown'}`);
      }
    }
    // the live read: on foot by day, at the wheel
    lay.force(null); lay.refresh();
    const live = lay.sit;
    restore();
    return !bad.length && live ? true : JSON.stringify({ bad: bad.slice(0, 10), live });
  });

  await check('hud editor: opens paused with every element named, a drag moves one (snapped), undo puts it back, Esc closes', async () => {
    lay.setState({ preset: 'default', edits: {} });
    const wasPaused = g.paused;
    ed.show();
    const named = [...document.querySelectorAll('#ui.hud-edit .hl .hl-name')].filter((n) => getComputedStyle(n).display !== 'none').length;
    const b = lay.byId.cash, x0 = b.x, y0 = b.y, w = b.wrap;
    const ev = (type, x, y, extra = {}) => w.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7, ...extra }));
    ev('pointerdown', x0 + 10, y0 + 10); ev('pointermove', x0 - 60, y0 + 50, { shiftKey: true }); ev('pointerup', x0 - 60, y0 + 50);
    const moved = Math.abs(b.x - (x0 - 70)) < 1.5 && Math.abs(b.y - (y0 + 40)) < 1.5, edited = !!lay.state.edits.cash;
    const undone = ed.undo() && Math.abs(b.x - x0) < 1 && !lay.state.edits.cash;
    // wheel sizes it
    w.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    const grew = lay.byId.cash.row.scale > 1;
    ed.undo();
    const paused = g.paused;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    const closed = !ed.open && !document.getElementById('ui').classList.contains('hud-edit') && g.paused === wasPaused;
    restore();
    const ok = named >= 15 && moved && edited && undone && grew && paused && closed;
    return ok ? true : JSON.stringify({ named, moved, edited, undone, grew, paused, closed, x0, x: b.x, y0, y: b.y });
  });

  await check('hud editor: changing the anchor keeps the element where it is on screen', async () => {
    lay.setState({ preset: 'default', edits: {} });
    ed.show(); ed.select('sign');
    const b = lay.byId.sign, x0 = b.x, y0 = b.y;
    ed.setAnchor('sign', 'tr');
    const ok = b.row.anchor === 'tr' && Math.abs(b.x - x0) < 1 && Math.abs(b.y - y0) < 1;
    const r = { anchor: b.row.anchor, x0, x: b.x, y0, y: b.y };
    restore();
    return ok ? true : JSON.stringify(r);
  });

  await check('hud: the command lists, sets, presets, previews a situation and resets', async () => {
    const C = (a) => api.call('hudLayout', a);
    const l = await C({ action: 'list' }), s = await C({ action: 'set', id: 'clock', scale: 0.8 }), p = await C({ action: 'preset', name: 'streamer' });
    const sit = await C({ action: 'situation', name: 'driving' }), bad = await C({ action: 'set', id: 'nope', x: 1 });
    const back = await C({ action: 'situation', name: 'auto' });
    const ok = l.ok && l.rows.length === HUD_LAYOUT.length && !l.bad.length && s.ok && s.row.scale === 0.8 && p.ok && p.preset === 'streamer' && sit.ok && sit.shown.includes('speedo') && !sit.shown.includes('weapon') && !bad.ok && back.forced === null;
    restore();
    return ok ? true : JSON.stringify({ l: l.ok, s: s.row, p: p.preset, shown: sit.shown, bad: bad.ok, back: back.forced });
  });
  restore();
  await panelChecks({ api, g, check });
  await bodyDollChecks({ api, g, check });
}

// THE PANELS (data/panellayout.js, ui/panellayout.js, ui/paneledit.js): each check opens what it needs and shuts it again,
// and the player's own panel layout is put back at the end.
async function panelChecks({ g, check }) {
  const P = g.hud.panels, ed = g.hud.editor, saved = P.snapshot(), lay = g.hud.layout;
  const frames = (n = 3) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const shut = () => { for (const id of PANEL_IDS) if (P.isOpen(id)) P.close(id); };
  const restore = () => { if (ed.open) ed.hide(); shut(); P.setState(JSON.parse(saved)); lay.force(null); };

  await check('panels: the region rows validate, every preset is legal, and a bad panel edit is named', async () => {
    const bad = validatePanels(), wrong = validatePanelLayout({ workshop: { regions: { parts: { cols: 9 }, keys: { density: 1.2 }, nope: {} } }, ghost: {} });
    const ok = !bad.length && wrong.some((w) => w.includes('cols')) && wrong.some((w) => w.includes('only applies to a list')) && wrong.some((w) => w.includes("unknown region 'nope'")) && wrong.some((w) => w.includes("unknown panel 'ghost'"));
    return ok ? true : JSON.stringify({ bad, wrong });
  });

  await check('panels: every region of every panel maps to a live element when the panel opens', async () => {
    const miss = [];
    for (const id of PANEL_IDS) {
      const r = P.open(id, { tab: 1 });
      if (!r.ok) { miss.push(`${id}: would not open (${r.why})`); continue; }
      await frames(2);
      for (const reg of P.regionEls(id)) if (!reg.el || (!reg.tab && !reg.el.getClientRects().length)) miss.push(`${id}.${reg.id} (${reg.sel})`);
      P.close(id);
    }
    restore();
    return miss.length ? JSON.stringify(miss) : true;
  });

  await check('panels: no text run crosses another in any panel (this size; tools/panel-sheet.mjs audits 1280x720 and 2560x1440)', async () => {
    const out = {};
    for (const id of PANEL_IDS) {
      if (!P.open(id, { tab: 1 }).ok) { out[id] = 'would not open'; continue; }
      await frames(3);
      const hits = textOverlaps(P.rootEl(id));
      if (hits.length) out[id] = hits.slice(0, 3);
      P.close(id);
    }
    restore();
    return Object.keys(out).length ? JSON.stringify(out) : true;
  });

  await check("panels: the workshop's unavailable rows stay readable: dimmed, a padlock, the reason in its own column, nothing across the text", async () => {
    if (!P.open('workshop', { tab: 1 }).ok) { restore(); return 'workshop would not open'; }
    await frames(3);
    const rack = P.rootEl('workshop').querySelector('.ws-rack'), no = [...rack.querySelectorAll('li.no')], bad = [];
    for (const li of no) {
      const nm = li.querySelector('.nm').getBoundingClientRect(), why = li.querySelector('.why'), lock = why?.querySelector('svg.lock'), words = why?.textContent.trim() ?? '';
      if (!lock || words.length < 4) bad.push(`${li.textContent.trim().slice(0, 14)}: no padlock or no reason`);
      if (why && rectsCross(why.getBoundingClientRect(), nm)) bad.push(`${li.textContent.trim().slice(0, 14)}: the reason crosses the name`);
    }
    for (const st of rack.querySelectorAll('.stamp')) if (getComputedStyle(st).transform !== 'none') bad.push('a rarity stamp is still slanted');
    const hits = textOverlaps(rack);
    restore();
    return no.length && !bad.length && !hits.length ? true : JSON.stringify({ rows: no.length, bad: bad.slice(0, 5), hits });
  });

  await check('panels: a panel layout round-trips export/import and reaches the stylesheet (hidden region, columns, text size)', async () => {
    P.setState({ preset: 'default', edits: {} });
    const a = P.edit('workshop', 'parts', { cols: 3, density: 0.8 }), b = P.edit('workshop', 'keys', { visible: false }), c = P.edit('workshop', 'detail', { text: 1.3 }), d = P.edit('pack', null, { scale: 0.9 });
    const exp = JSON.stringify(P.exportLayout()), before = P.snapshot();
    P.reset();
    const cleared = P.snapshot() !== before, imp = P.importLayout(exp), same = P.snapshot() === before;
    const refused = P.importLayout('{"edits":{"workshop":{"regions":{"parts":{"cols":12}}}}}'), still = P.snapshot() === before;
    P.open('workshop', { tab: 1 }); await frames(3);
    const root = P.rootEl('workshop'), cols = getComputedStyle(root.querySelector('.ws-rack')).gridTemplateColumns.split(' ').length;
    const keysGone = getComputedStyle(root.querySelector('.ws-keys')).display === 'none', zoom = Number(getComputedStyle(root.querySelector('.ws-dname')).zoom);
    restore();
    const ok = ![a, b, c, d].some((x) => x.length) && cleared && !imp.length && same && refused.length && still && cols === 3 && keysGone && Math.abs(zoom - 1.3) < 0.01;
    return ok ? true : JSON.stringify({ a, b, c, d, cleared, imp, same, refused, still, cols, keysGone, zoom });
  });

  await check("panels: the HUD steps out of a panel's way (the panel situation shows no HUD element) and comes back when it shuts", async () => {
    P.open('workshop', { tab: 1 }); lay.refresh();
    const sit = lay.sit, shown = lay.boxes.filter((b) => b.wrap && !b.wrap.classList.contains('hl-off')).map((b) => b.id);
    P.close('workshop'); lay.refresh();
    const back = lay.sit, mm = !lay.byId.minimap.wrap.classList.contains('hl-off') || back === 'dead';
    restore();
    return sit === 'panel' && !shown.length && back !== 'panel' && mm ? true : JSON.stringify({ sit, shown, back, mm });
  });

  await check("panel editor: the workshop's regions are outlined and named over it; a click picks one, the wheel sizes it, undo puts it back", async () => {
    P.setState({ preset: 'default', edits: {} });
    ed.show();
    const opened = ed.screen('workshop');
    await frames(3); ed.pe.place();
    const boxes = [...document.querySelectorAll('.hle-regs .hle-rbox')].filter((b) => b.style.display !== 'none' && b.querySelector('b')?.textContent);
    const parts = P.rootEl('workshop')?.querySelector('.ws-rack')?.getBoundingClientRect();
    let picked = null, grew = false, undone = false;
    if (parts) {
      const x = parts.x + 6, y = parts.y + parts.height - 6, L = ed.pe.layer;
      L.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 9 }));
      L.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 9 }));
      picked = ed.pe.sel;
      L.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: -100 }));
      grew = (P.resolved('workshop').regions.parts.scale ?? 1) > 1;
      undone = ed.undo() && (P.resolved('workshop').regions.parts.scale ?? 1) === 1;
    }
    ed.hide();
    const closed = !P.isOpen('workshop');
    restore();
    const ok = opened && boxes.length === PANELS.workshop.regions.length && picked === 'parts' && grew && undone && closed;
    return ok ? true : JSON.stringify({ opened, boxes: boxes.length, picked, grew, undone, closed });
  });
  restore();
}
