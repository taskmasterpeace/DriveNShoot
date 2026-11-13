// The six-frame set (WEB_DEATHLANDS_GAP master prompt §2): same spots, hours and zooms every time.
// Run through the Playwright MCP (browser_run_code_unsafe, filename = this file) on a page already open at
// http://localhost:<port>/?agent=0, 1920x1080. OUT is the folder the frames land in.
async (page) => {
  const OUT = (globalThis.__SIXFRAME_OUT || 'D:/git/DriveNShoot/.worktrees/integrate/docs/renders/web/deathlands-baseline');
  const C = (name, args = {}) => page.evaluate(([n, a]) => window.DL.call(n, a), [name, args]);
  const wait = (ms) => page.waitForTimeout(ms);
  const log = [];
  const shot = async (name) => { await wait(900); await page.screenshot({ path: `${OUT}/${name}.png` }) /* converted to .jpg q88 afterwards */; log.push(name); };
  const clear = async (hour) => { await C('setWeather', { key: 'CLEAR', instant: true }); await C('setTime', { hour }); };

  // F3 Rust Haven market, 08:30, on foot, default foot zoom (crew of 4 when recruits are near)
  await C('teleport', { x: -16, z: -16 }); await clear(8.5);
  await C('camera', { view: 'TOPDOWN', mode: 'foot', d: 22, theta: -1, settle: true });
  await shot('F3_rusthaven_market_foot');
  // the same spot at the close angled view (the dream frame's pitch)
  await C('camera', { view: 'ANGLED', mode: 'foot', d: 14, theta: 50, settle: true });
  await shot('F3b_rusthaven_market_angled');

  // F4 Rust Haven from outside the north gate, 08:30, widest zoom
  await C('teleport', { x: 0, z: -130 }); await clear(8.5);
  await C('camera', { view: 'TOPDOWN', theta: -1 }); await C('zoom', { level: 'HIGH' }); await C('camera', { settle: true });
  await shot('F4_rusthaven_gate_wide');
  await C('camera', { view: 'ANGLED', d: 90, theta: 50, settle: true });
  await shot('F4b_rusthaven_gate_angled');

  // F1 Central Ave, 09:00 clear, at the wheel of the patrol car heading north, default drive zoom
  await C('camera', { view: 'TOPDOWN', theta: -1 });
  const sp = await C('spawnVehicle', { type: 'interceptor', x: 0, z: 40, heading: 0, ai: 'none' });
  const vid = sp.id || sp.vehicle?.id;
  await C('teleport', { x: 2, z: 40 }); await clear(9);
  const ent = await C('enterVehicle', { id: vid, force: true });
  await C('camera', { view: 'TOPDOWN', mode: 'drive', d: 70, theta: -1, settle: true });
  await C('drive', { throttle: 0.35, seconds: 2.5 });
  await shot('F1_central_ave_drive_day');
  await C('camera', { view: 'ANGLED', mode: 'drive', d: 60, theta: 45, settle: true });
  await shot('F1b_central_ave_drive_angled');

  // F2 same street, 19:40, headlights on
  await C('camera', { view: 'TOPDOWN', mode: 'drive', d: 70, theta: -1, settle: true });
  await C('setTime', { hour: 19.67 });
  await page.evaluate(() => { const v = window.game.player.inVehicle || window.game.playerVehicle; if (v && 'lights' in v) v.lights = true; });
  await C('drive', { throttle: 0.35, seconds: 1.5 });
  await shot('F2_central_ave_drive_dusk');
  await C('camera', { view: 'ANGLED', mode: 'drive', d: 60, theta: 45, settle: true });
  await shot('F2b_central_ave_drive_dusk_angled');

  // F6 Meridian, Florida, 08:00, on foot (the new-game opening frame)
  await C('camera', { view: 'TOPDOWN', mode: 'drive', d: 70, theta: -1 });
  await C('exitVehicle', {}).catch(() => {});
  await C('teleport', { town: 'Meridian' }); await wait(4000); await clear(8);
  await C('camera', { view: 'TOPDOWN', mode: 'foot', d: 22, theta: -1, settle: true });
  await shot('F6_meridian_foot');
  return JSON.stringify({ log, vid, ent: ent && ent.ok, cam: await C('camera', {}) }).slice(0, 600);
}
