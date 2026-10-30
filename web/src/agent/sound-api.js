// THE SOUND PASS (docs/design/WEB_SOUND.md): the commands and the selftest checks for the mix, the footsteps, the
// calibre reports, the rate cap and the volume row. Every file the game plays is a Sonniss GDC or Kenney CC0 recording
// (tools/audio-pick.mjs BANNED: never BBC, never Gamemaster); these prove each id resolves to a shipped file.
import { resolve, FACTIONS, FACTION_KINDS, CREATURES, CREATURE_KINDS, ENGINES, ENGINE_KINDS, BEDS, AUDIO_MANIFEST, AUDIO_BASE,
  STEPS, STEP_SURFACES, GAIT, STEP_RULES, CALIBER_SOUND, COMMON_IDS, mixGain, rateCap, setFor } from '../data/audiosets.js';
import { FAR } from '../data/worldvoice.js';
import { BARK_SAMPLE } from '../data/barks.js';

const BANNED_LIC = new Set(['pse', 'gamemaster', 'ef']);
const BANNED_SRC = /BBC|gamemaster|_PSE_|_EF[_.]/i;

// Every [set, kind] the game can ask for: faction guns/barks/steps, creatures, engines, beds, footsteps, calibres,
// the common foley by name, the far-off layer and the bark map. Pure (the command and the check share it).
export function soundIds() {
  const ids = [];
  for (const f of FACTIONS) for (const k of FACTION_KINDS) ids.push([f, k]);
  for (const f of FACTIONS) for (const k of new Set(Object.values(BARK_SAMPLE))) ids.push([f, k]);
  for (const c of CREATURES) for (const k of CREATURE_KINDS) ids.push([c, k]);
  for (const [, [set]] of Object.entries(ENGINES)) for (const k of ENGINE_KINDS) ids.push([set, k]);
  for (const set of Object.values(BEDS)) for (const k of ['day', 'night']) ids.push([set, k]);
  ids.push(['bed.weather', 'rain'], ['bed.weather', 'wind']);
  for (const s of STEP_SURFACES) ids.push(['common', STEPS[s].kind]);
  for (const [k, o] of Object.values(CALIBER_SOUND)) for (const f of o.set ? [o.set] : FACTIONS) ids.push([f, k]);
  for (const k of COMMON_IDS) ids.push(['common', k]);
  for (const r of Object.values(FAR.kinds ?? {})) if (r?.set) ids.push(r.set);
  const seen = new Set();
  return ids.filter(([s, k]) => { const key = `${s}/${k}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

// The shipped manifest's licence audit: no BBC, no Gamemaster, no Energetic Forms, every file named with its source.
export function licenseAudit() {
  const bad = [], by = {};
  for (const [set, kinds] of Object.entries(AUDIO_MANIFEST.sets ?? {})) for (const [kind, k] of Object.entries(kinds)) for (const x of k.files) {
    by[x.lic] = (by[x.lic] ?? 0) + 1;
    if (BANNED_LIC.has(x.lic) || BANNED_SRC.test(x.src ?? '')) bad.push(`${set}/${kind}: ${x.f} (${x.lic}: ${x.src})`);
    if (!x.src || !x.lic) bad.push(`${set}/${kind}: ${x.f} has no source or licence`);
  }
  return { byLicense: by, banned: bad };
}

export function soundCommands(api, need) {
  const g = api.g;
  const stopAll = () => { for (const v of g.audio.voices) { try { v.src.stop(); } catch { /* done */ } v.done = true; } g.audio.voices.length = 0; };
  const warm = async (set, kind) => { await Promise.race([Promise.all(g.audio.preload(set, kind).filter((b) => b && typeof b.then === 'function')), new Promise((ok) => setTimeout(ok, 4000))]); };
  return {
    sound: {
      group: 'world', desc: 'THE SOUND PASS (docs/design/WEB_SOUND.md): what the game plays and where it comes from. No args: the licence audit of every shipped file (Sonniss GDC / Kenney CC0 only; banned = BBC, Gamemaster, Energetic Forms), every sound id the game asks for and whether it resolves, the footstep table by surface, the mix gains, the rate caps (plays a second) and their peaks, the volume row and the last footstep. action=ids: the full id list with files and via. action=volume master= music= sfx= (0..1): set the volume row (the HUD settings sliders drive the same call).',
      args: { action: { type: 'string', default: 'status' }, master: { type: 'number' }, music: { type: 'number' }, sfx: { type: 'number' } },
      run: async ({ action, master, music, sfx }) => {
        if (action === 'volume') { if (!g.audio.ctx) g.audio.start(); return { volumes: g.audio.setVolumes({ master, music, sfx }) }; }
        const ids = soundIds().map(([s, k]) => { const r = resolve(s, k); return { id: `${s}/${k}`, files: r?.files.length ?? 0, via: r?.via ?? null }; });
        if (action === 'ids') return { ids };
        need(action === 'status', 'action: status | ids | volume');
        const missing = ids.filter((x) => !x.files).map((x) => x.id);
        const peaks = [...g.audio.rate.entries()].map(([k, e]) => ({ id: k, peak: e.peak, cap: rateCap(k.split('/')[1]) })).sort((a, b) => b.peak - a.peak).slice(0, 8);
        return {
          license: licenseAudit(), ids: ids.length, missing,
          steps: Object.fromEntries(STEP_SURFACES.map((s) => { const r = resolve('common', STEPS[s].kind); return [s, { kind: STEPS[s].kind, takes: r?.files.length ?? 0, vol: STEPS[s].vol, mix: mixGain(STEPS[s].kind) }]; })),
          gait: GAIT, stepRules: STEP_RULES, volumes: g.audio.vols, rate: { ...g.audio.rateStats, peaks }, stepStats: g.audio.stepStats, lastStep: g.audio.lastStep,
        };
      },
    },
    stepTest: {
      group: 'world', desc: 'Play footsteps the way the stride does (systems/audio.js step; data/audiosets.js STEPS, GAIT): surface=<dirt|gravel|road|floor|metal|grass|water|snow|carpet|sand|mud> gait=<walk|run|crouch|prone> n= (default 8). Each step is a new second for the rate cap (as on a real stride). Returns every step\'s take, pitch and gain, how many distinct takes, whether one repeated back to back, and what the live footSurface under you reads now.',
      args: { surface: { type: 'string', default: 'dirt' }, gait: { type: 'string', default: 'walk' }, n: { type: 'number', default: 8 } },
      run: async ({ surface, gait, n }) => {
        need(STEPS[surface], `surface: ${Object.keys(STEPS).join(', ')}`);
        need(GAIT[gait], `gait: ${Object.keys(GAIT).join(', ')}`);
        if (!g.audio.ctx) g.audio.start();
        await warm('common', STEPS[surface].kind);
        const L = g.audio.listener; L.x = g.player.x; L.z = g.player.z;
        const steps = [];
        for (let i = 0; i < Math.min(32, n); i++) { g.audio.rate.delete(`common/${STEPS[surface].kind}`); const s = g.audio.step(surface, 0, gait); steps.push({ played: s.played, file: s.file, pitch: s.pitch, gain: s.gain, why: s.why }); }
        stopAll();
        const files = steps.map((s) => s.file).filter(Boolean);
        return { surface, gait, steps, distinct: new Set(files).size, repeatedBackToBack: files.some((f, i) => i && f === files[i - 1]), here: g.soundscape.footSurface(g.player, g.water?.stateAt?.(g.player.x, g.player.z, g.player.gy) ?? 'dry') };
      },
    },
  };
}

// ---- the named selftest checks ----------------------------------------------------------------------------------------
export async function soundChecks(api, check) {
  const g = api.g;
  const stopAll = () => { for (const v of g.audio.voices) { try { v.src.stop(); } catch { /* done */ } v.done = true; } g.audio.voices.length = 0; };
  const warm = async (set, kind) => { await Promise.race([Promise.all(g.audio.preload(set, kind).filter((b) => b && typeof b.then === 'function')), new Promise((ok) => setTimeout(ok, 5000))]); };
  const base = g.audio.base ?? '/';

  await check('sound pass: every sound id the game asks for resolves to a real file, and no file is BBC, Gamemaster or unlicensed', async () => {
    const bad = [], files = new Set();
    for (const [s, k] of soundIds()) { const r = resolve(s, k); if (!r?.files.length) bad.push(`${s}/${k} resolves to nothing`); else for (const x of r.files) files.add(x.f); }
    const lic = licenseAudit();
    if (lic.banned.length) bad.push(`${lic.banned.length} banned/unsourced files: ${lic.banned.slice(0, 3).join(' | ')}`);
    // Every referenced file is really served (HEAD, 24 at a time).
    const list = [...files], gone = [];
    for (let i = 0; i < list.length; i += 24) {
      const rs = await Promise.all(list.slice(i, i + 24).map((f) => fetch(`${base}${AUDIO_BASE}${f}`, { method: 'HEAD' }).then((r) => (r.ok ? null : f)).catch(() => f)));
      for (const f of rs) if (f) gone.push(f);
    }
    if (gone.length) bad.push(`${gone.length} files not served: ${gone.slice(0, 4).join(', ')}`);
    if (list.length < 100) bad.push(`only ${list.length} files referenced`);
    return bad.length ? bad.join('; ') : true;
  });

  await check('sound pass: footsteps vary per surface (4+ takes each, their own files), never the same take twice running, pitch within +-4%; crouch is softer, a prone crawl silent but on gravel', async () => {
    g.audio.start();
    const L = g.audio.listener; L.x = g.player.x; L.z = g.player.z; L.indoor = false;
    const bad = [], owner = new Map();
    for (const s of STEP_SURFACES) {
      const kind = STEPS[s].kind;
      await warm('common', kind);
      const seq = [];
      for (let i = 0; i < 14; i++) { g.audio.rate.delete(`common/${kind}`); const r = g.audio.step(s, 0, 'walk'); if (r.played) seq.push(r); }
      stopAll();
      if (seq.length < 12) { bad.push(`${s}: only ${seq.length}/14 played (${g.audio.lastStep?.why})`); continue; }
      const fs = seq.map((r) => r.file);
      if (new Set(fs).size < 4) bad.push(`${s}: ${new Set(fs).size} takes`);
      if (fs.some((f, i) => i && f === fs[i - 1])) bad.push(`${s}: a take twice running`);
      const p0 = (STEPS[s].rate ?? 1) * GAIT.walk.rate;
      if (seq.some((r) => r.pitch < p0 * (1 - STEP_RULES.jitter) - 0.002 || r.pitch > p0 * (1 + STEP_RULES.jitter) + 0.002)) bad.push(`${s}: pitch outside +-${STEP_RULES.jitter * 100}%`);
      for (const f of new Set(fs)) { if (owner.has(f) && owner.get(f) !== s) bad.push(`${s} shares ${f} with ${owner.get(f)}`); owner.set(f, s); }
    }
    g.audio.rate.clear();
    const walk = g.audio.step('road', 0, 'walk').gain; g.audio.rate.clear();
    const crouch = g.audio.step('road', 0, 'crouch').gain; g.audio.rate.clear();
    const prone = g.audio.step('dirt', 0, 'prone'), proneGravel = g.audio.step('gravel', 0, 'prone');
    stopAll(); g.audio.rate.clear();
    if (!(crouch < walk * 0.6)) bad.push(`crouch ${crouch} not softer than walk ${walk}`);
    if (prone.played) bad.push('a prone crawl on dirt made a sound');
    if (!proneGravel.played) bad.push(`a prone crawl on gravel was silent (${proneGravel.why})`);
    // The live surface reader: a deck is metal, wading is water.
    const p = g.player, deck0 = p.onDeck; p.onDeck = { v: null }; const onDeck = g.soundscape.footSurface(p, 'dry'); p.onDeck = deck0;
    if (onDeck !== 'metal') bad.push(`a deck read ${onDeck}`);
    if (g.soundscape.footSurface(p, 'wade') !== 'water') bad.push('wading did not read water');
    return bad.length ? bad.join('; ') : true;
  });

  await check('sound pass: no sound plays more than its cap a second (an MG flood, a footstep flood, a clink flood)', async () => {
    g.audio.start(); g.audio.rate.clear();
    const L = g.audio.listener; L.x = g.player.x; L.z = g.player.z;
    await warm('remnant', 'shot.mg'); await warm('common', 'step.dirt'); await warm('common', 'shell');
    const flood = (set, kind, n) => { let k = 0; for (let i = 0; i < n; i++) if (g.audio.sample(set, kind, { dist: 6, range: 200 })) k++; return k; };
    const mg = flood('remnant', 'shot.mg', 60), st = flood('common', 'step.dirt', 40), cl = flood('common', 'shell', 40);
    stopAll();
    const bad = [];
    if (mg > rateCap('shot.mg')) bad.push(`MG ${mg} > ${rateCap('shot.mg')}`);
    if (st > rateCap('step.dirt')) bad.push(`steps ${st} > ${rateCap('step.dirt')}`);
    if (cl > rateCap('shell')) bad.push(`clinks ${cl} > ${rateCap('shell')}`);
    if (!mg || !st || !cl) bad.push(`a flood played nothing (mg ${mg}, steps ${st}, clinks ${cl}: ${g.audio.lastSample?.why})`);
    for (const [k, e] of g.audio.rate) if (e.peak > rateCap(k.split('/')[1])) bad.push(`${k} peaked ${e.peak}`);
    g.audio.rate.clear();
    return bad.length ? bad.join('; ') : true;
  });

  await check('sound pass: the calibre picks the report (a .357 is Rust Haven\'s revolver, a .22 pops higher and softer) and an automatic chokes its last tail', async () => {
    g.audio.start(); g.audio.rate.clear();
    await warm('rusthaven', 'shot.pistol'); await warm('drifter', 'shot.pistol');
    const shooter = { faction: 'drifter', x: g.player.x + 8, z: g.player.z, indoor: false };
    g.audio.gun('pistol', 8, 0, shooter, '357mag'); const mag = g.audio.lastSample;
    g.audio.gun('pistol', 8, 0, shooter, '22lr'); const lr = g.audio.lastSample;
    const first = shooter._gunVoice;
    g.audio.gun('pistol', 8, 0, shooter, '22lr');
    const choked = first && shooter._gunVoice !== first;
    stopAll(); g.audio.rate.clear();
    const bad = [];
    if (!mag?.played || !String(mag.via).startsWith('rusthaven')) bad.push(`.357 played ${mag?.via} (${mag?.why})`);
    if (!lr?.played || String(lr.via).startsWith('rusthaven')) bad.push(`.22 played ${lr?.via} (${lr?.why})`);
    if (lr?.played && mag?.played && !(lr.pitch > mag.pitch * 1.1 && lr.gain < mag.gain)) bad.push(`.22 not higher+softer (pitch ${lr.pitch} vs ${mag.pitch}, gain ${lr.gain} vs ${mag.gain})`);
    if (!choked) bad.push('the second round did not take over the gun\'s voice');
    if (setFor(shooter) !== 'drifter') bad.push('drifter set');
    return bad.length ? bad.join('; ') : true;
  });

  await check('sound pass: the volume row drives the buses (master, music, sfx) and the settings menu has its three sliders', async () => {
    g.audio.start();
    const v0 = { ...g.audio.vols };
    g.audio.setVolumes({ master: 0.4, music: 0.3, sfx: 0.7 });
    await new Promise((ok) => setTimeout(ok, 250));
    const got = { m: +g.audio.master.gain.value.toFixed(2), mu: +g.audio.music.gain.value.toFixed(2), s: +g.audio.sfx.gain.value.toFixed(2) };
    g.audio.setVolumes(v0);
    const bad = [];
    if (Math.abs(got.m - 0.4) > 0.03 || Math.abs(got.mu - 0.3) > 0.03 || Math.abs(got.s - 0.7) > 0.03) bad.push(`buses ${JSON.stringify(got)}`);
    const menu = g.qol?.el?.menu;
    for (const k of ['volume', 'musicVol', 'sfxVol']) if (menu && !menu.querySelector(`[data-s="${k}"]`)) bad.push(`no ${k} slider`);
    if (g.radio?.els && g.radio.els.gain.numberOfOutputs && !g.audio.music) bad.push('no music bus');
    return bad.length ? bad.join('; ') : true;
  });
}
