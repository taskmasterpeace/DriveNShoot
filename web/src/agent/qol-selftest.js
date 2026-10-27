// Selftest checks for the 2026-10-27 polish pass (ui/qol.js, ui/feedback.js, ui/hud.js): the 20 small quality-of-life
// items. Each check puts back what it changed; the player's real settings are restored at the end and never saved over.

export async function qolChecks(api, check, C) {
  const g = api.g, Q = g.qol, F = g.feedback, P = () => g.player;
  const saved = { ...Q.settings }, cashWas = g.cash;
  const set = (k, v) => { Q.settings[k] = v; Q.apply(); };
  const frame = (n = 2) => C('step', { seconds: n / 60 });

  await check('qol: the new settings exist with defaults and Reset puts every one back', async () => {
    const keys = ['autosaveMin', 'pauseOnBlur', 'muteOnBlur', 'hudScale', 'nameTags', 'killFeed', 'dmgNumbers'];
    const missing = keys.filter((k) => !(k in Q.settings));
    Q.settings.hudScale = 1.25; Q.settings.nameTags = 'off';
    Q.el.menu.querySelector('[data-a="reset"]').click();
    const ok = !missing.length && Q.settings.hudScale === 1 && Q.settings.nameTags === 'aim' && Q.el.menu.querySelector('[data-s="nameTags"]').value === 'aim';
    return ok ? true : JSON.stringify({ missing, hud: Q.settings.hudScale, tags: Q.settings.nameTags });
  });

  await check('qol: HUD size multiplies the screen-fit scale (--s) and returns', async () => {
    set('hudScale', 1); const a = Number(g.hud.root.style.getPropertyValue('--s'));
    set('hudScale', 1.25); const b = Number(g.hud.root.style.getPropertyValue('--s'));
    set('hudScale', 1);
    return Math.abs(b / a - 1.25) < 0.02 || b === 1.35 * 1.25 ? true : `a=${a} b=${b}`;
  });

  await check('qol: F1 hides the HUD and brings it back', async () => {
    Q.toggleHud(true); const on = g.hud.root.closest('#ui').classList.contains('hud-hidden');
    Q.toggleHud(false); const off = !document.getElementById('ui').classList.contains('hud-hidden');
    return on && off ? true : `on=${on} off=${off}`;
  });

  await check('qol: damage numbers float off a hit target (gold on the head) and stay off when the setting is off', async () => {
    const r = await C('spawn', { kind: 'drifter', x: P().x + 6, z: P().z });
    const c = api.findChar(r.id ?? r.ids?.[0] ?? r.chars?.[0]?.id) ?? g.chars[g.chars.length - 1];
    set('dmgNumbers', true); const n0 = F.floats.length;
    F.damage(c, 12.4, 'head'); const head = F.floats[F.floats.length - 1]?.el;
    set('dmgNumbers', false); F.damage(c, 9, 'torso'); const n2 = F.floats.length;
    set('dmgNumbers', true);
    const ok = n2 === n0 + 1 && head?.textContent === '12' && head.className.includes('head');
    c.alive = false; c.hidden = true;
    return ok ? true : JSON.stringify({ n0, n2, txt: head?.textContent, cls: head?.className });
  });

  await check('qol: name tags follow the setting (off shows none but a running witness)', async () => {
    set('nameTags', 'off'); F.updateTags(); const off = F.lastTags.filter((t) => !t.runner).length;
    set('nameTags', 'aim'); F.updateTags();
    return off === 0 ? true : `off=${off}`;
  });

  await check('qol: the kill feed setting hides the feed and skips new rows', async () => {
    set('killFeed', false); const n = F.el.kills.children.length;
    F.killRow({ by: P().id, victim: P().id, cause: 'bullet' });
    const hidden = document.getElementById('ui').classList.contains('no-killfeed'), same = F.el.kills.children.length === n;
    set('killFeed', true);
    return hidden && same ? true : `hidden=${hidden} same=${same}`;
  });

  await check('qol: every toast lands in the RECENT log with the game clock, newest first, capped', async () => {
    g.hud.toast('qol-check one'); g.hud.toast('qol-check two');
    const ok = Q.log[0].text === 'qol-check two' && Q.log[1].text === 'qol-check one' && /\d\d:\d\d/.test(Q.log[0].at) && Q.log.length <= 14;
    for (let i = 0; i < 20; i++) g.hud.toast(`qol flood ${i}`);
    // Regression: the menu card is a flex column and once squeezed the log box to 0 px (flex-shrink).
    Q.toggleMenu(true); const h = Q.el.log.getBoundingClientRect().height; Q.toggleMenu(false);
    return ok && Q.log.length === 14 && h > 20 ? true : JSON.stringify({ top: Q.log.slice(0, 2), h });
  });

  await check('qol: the ORDERS line carries an ETA, and reaching a waypoint says ARRIVED', async () => {
    Q.setWaypoint({ x: P().x + 120, z: P().z }); Q.routeT = 0; Q.objFig = null; await frame(3);
    const txt = Q.el.objDist.textContent;
    Q.setWaypoint({ x: P().x + 1, z: P().z }); Q.routeT = 0; await frame(3);
    const arrived = Q.log.some((m) => m.text === 'ARRIVED') && !Q.waypoint;
    return /~\d+:\d\d/.test(txt) && arrived ? true : JSON.stringify({ txt, arrived, wp: Q.waypoint });
  });

  await check('qol: THIS RUN counts distance on foot, money earned and spent, and ignores teleports', async () => {
    const R = Q.run, f0 = R.foot, e0 = R.earned, s0 = R.spent;
    R.px = P().x; R.pz = P().z;
    P().x += 3; Q.trackRun(0.1); P().x += 500; Q.trackRun(0.1); P().x -= 503;
    R.cash = g.cash; g.cash += 40; Q.trackRun(0.1); g.cash -= 15; Q.trackRun(0.1);
    const pops = g.hud.el.cash.parentElement.querySelectorAll('.cash-delta').length;
    g.cash = cashWas; R.cash = g.cash; R.px = P().x; R.pz = P().z;
    const ok = Math.abs(R.foot - f0 - 3) < 0.01 && R.earned - e0 === 40 && R.spent - s0 === 15 && pops >= 1;
    Q.renderRun();
    return ok && Q.el.run.textContent.includes('Earned') ? true : JSON.stringify({ foot: R.foot - f0, earned: R.earned - e0, spent: R.spent - s0, pops });
  });

  await check('qol: the compass marks your parked car (CAR) while you are on foot and away from it', async () => {
    if (P().inVehicle) g.exitVehicle(true);
    const r = await C('spawnVehicle', { type: 'pickup', x: P().x + 40, z: P().z });
    const v = api.findVeh(r.id), was = g.lastVehicle; g.lastVehicle = v;
    F.updateCompass(); const marks = F.view().compass.markers.map((m) => m.label);
    g.lastVehicle = was; g.vehiclesSys.remove(v);
    return marks.includes('CAR') ? true : JSON.stringify(marks);
  });

  await check('qol: under 30% health the edge pulses red; an empty gun with auto-reload off shows R RELOAD', async () => {
    const hp = P().hp, ar = Q.settings.autoReload, w = g.inv.current, m = g.inv.mag?.[w];
    P().hp = P().maxHp * 0.2; set('autoReload', false); if (g.inv.mag) g.inv.mag[w] = 0;
    F.update(0.016); const vig = F.el.vig.classList.contains('on'), dry = !F.el.reload.classList.contains('hidden');
    P().hp = hp; set('autoReload', ar); if (g.inv.mag) g.inv.mag[w] = m;
    F.update(0.016); const back = !F.el.vig.classList.contains('on') && F.el.reload.classList.contains('hidden');
    return vig && dry && back ? true : JSON.stringify({ vig, dry, back });
  });

  await check('qol: saves are stamped and the pause menu says how long ago; autosave Off never autosaves', async () => {
    Q.stampSave('quick'); Q.renderAgo();
    const ago = Q.el.menu.querySelector('.pm-ago[data-k="quick"]').textContent;
    set('autosaveMin', 0); const t0 = Q.saveTimes().auto ?? 0; Q.autoT = 1e6; Q.update(0.016);
    const t1 = Q.saveTimes().auto ?? 0;
    return /just now/.test(ago) && t1 === t0 ? true : JSON.stringify({ ago, t0, t1 });
  });

  await check('qol: the big map draws its legend and the waypoint distance; the ORDERS tag opens the map', async () => {
    Q.setWaypoint({ x: P().x + 60, z: P().z + 60 });
    Q.el.obj.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const open = Q.mapOpen; Q.drawBigMap();
    Q.el.obj.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    const cleared = !Q.waypoint; Q.toggleMap(false);
    return open && cleared && /waypoint/.test(Q.el.mapHead.textContent) ? true : JSON.stringify({ open, cleared });
  });

  await check('qol: an agent tab is never paused by losing focus', async () => {
    const was = Q.menuOpen; dispatchEvent(new Event('blur'));
    const still = Q.menuOpen === was; if (Q.menuOpen && !was) Q.toggleMenu(false);
    dispatchEvent(new Event('focus'));
    return still ? true : 'blur paused an agent tab';
  });

  Q.settings = saved; Q.saveSettings(); Q.syncInputs(); Q.apply(); g.cash = cashWas;
}
