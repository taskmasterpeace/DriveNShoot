// THE HUD LAYOUT for agents (docs/design/WEB_UI_EDITOR.md; rows data/hudlayout.js, live layout + editor ui/hudedit.js): the
// `hud` command (list, set, preset, reset, export, import, situation, edit) and the selftest's named checks for the lane
// (each returns true or a JSON diagnostic, and puts the player's own layout back).
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
            g.hud.root.classList.toggle('nopanel', panel === false || panel === 'false');
            return out();
          }
          default: return { ok: false, error: `unknown action '${action}'`, hint: 'list | set | preset | reset | export | import | situation | edit' };
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
}
