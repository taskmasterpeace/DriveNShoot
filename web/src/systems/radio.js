import { STATIONS, RADIO, MUSIC_MANIFEST, MUSIC_BASE } from '../data/radio.js';
import { EVENTS } from '../data/events.js';
import { hash32 } from '../data/voices.js';

// THE RADIO (data/radio.js; docs/design/WEB_VOICE_STATS.md §3.6). In any vehicle, or anywhere with a portable radio in
// your pack. Period / Comma tune up and down the dial (data/controls.js rows). Stations keep their own clock, so you
// tune in mid-song like any real station: playlist position = (wall clock + the station's seed) mod its length.
//   music       two <audio> elements, crossfaded between songs, through a band filter (AM narrow, FM a little top cut)
//               into the game's master bus; between songs a station ID (a stinger, the line on the subtitle)
//   news        STATIC 1660 AM: hiss, and a headline every half minute read off the chronicle (data/events.js lines)
//   emergency   an alert tone and a shelter at a real place; on a trap day the shelter is a lure and raiders wait there
// Nothing per frame allocates; a station change rebuilds its nodes once.
export class Radio {
  constructor(game) {
    this.g = game;
    this.i = 0;                 // the station index (0 = off)
    let vol = RADIO.volume; try { const v = parseFloat(localStorage.getItem('dsoa.radio.vol')); if (Number.isFinite(v)) vol = v; } catch { /* fine */ }
    this.volume = vol;
    this.els = null;            // { a, b, cur, gain, filter }
    this.idT = 10; this.newsT = 6; this.toneT = 0;
    this.lastLine = null; this.track = null;
    this.shelter = null;        // { day, x, z, name, trap, sprung }
    this.stats = { tuned: 0, songs: 0, ids: 0, news: 0, alerts: 0, traps: 0 };
    this.lastTuned = null;
    if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
      if (e.repeat || /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
      if (e.code === 'Period') this.step(1); else if (e.code === 'Comma') this.step(-1);
    });
  }

  get station() { return STATIONS[this.i]; }
  canHear() { const p = this.g.player; return !!p?.alive && (!!p.inVehicle || this.hasPortable()); }
  hasPortable() { const s = this.g.inventory?.carried?.slots; return !!s?.some((x) => x?.id === RADIO.item); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem('dsoa.radio.vol', String(this.volume)); } catch { /* fine */ } if (this.els) this.els.gain.gain.value = this.volume; }

  step(d) {
    if (!this.canHear()) { this.g.hud?.toast?.('No radio here (get in a car, or carry a portable radio)', 'warn'); return; }
    this.tune((this.i + d + STATIONS.length) % STATIONS.length);
  }
  tune(i) {
    this.i = i; const S = this.station;
    this.stopAudio();
    this.idT = 1.2; this.newsT = 4; this.toneT = 0;
    this.stats.tuned++; this.lastTuned = S.id;
    this.g.hud?.toast?.(S.id === 'off' ? 'RADIO OFF' : `${S.freq} · ${S.name}`, 'job');
    this.g.audio?.sample?.('common', 'radio.static', { dist: 1, vol: 0.35 });
    if (S.playlist) this.startMusic(S);
    this.g.emit('radioTuned', { station: S.id, freq: S.freq ?? null });
    return S;
  }

  // ---- music ----------------------------------------------------------------------------------------------------------
  playlist(S) { return MUSIC_MANIFEST.stations?.[S.playlist]?.tracks ?? []; }
  // Where the station is right now (deterministic from the wall clock): { index, offset }.
  position(S, now = Date.now() / 1000) {
    const T = this.playlist(S); if (!T.length) return null;
    const total = T.reduce((n, t) => n + t.dur, 0);
    let x = (now + (hash32(S.id) % 997)) % total, i = 0;
    while (x > T[i].dur) { x -= T[i].dur; i = (i + 1) % T.length; }
    return { index: i, offset: x, track: T[i] };
  }
  nodes() {
    const A = this.g.audio; if (!A?.ctx) return null;
    if (this.els) return this.els;
    const ctx = A.ctx, mk = () => { const e = new window.Audio(); e.crossOrigin = 'anonymous'; e.preload = 'auto'; const src = ctx.createMediaElementSource(e); const g = ctx.createGain(); g.gain.value = 0; src.connect(g); return { e, g }; };
    const a = mk(), b = mk(), filter = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), gain = ctx.createGain();
    hp.type = 'highpass'; filter.type = 'lowpass';
    a.g.connect(hp); b.g.connect(hp); hp.connect(filter).connect(gain).connect(A.master);
    gain.gain.value = this.volume;
    return (this.els = { a, b, cur: a, filter, hp, gain });
  }
  shape(S) {
    const E = this.els; if (!E) return;
    if (S.filter === 'am') { E.hp.frequency.value = RADIO.am.lo; E.filter.frequency.value = RADIO.am.hi; } else { E.hp.frequency.value = 40; E.filter.frequency.value = RADIO.fm.hi; }
  }
  startMusic(S, pos = this.position(S)) {
    const E = this.nodes(); if (!E || !pos) return false;
    this.shape(S);
    const ch = E.cur, base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    ch.e.src = `${base}${MUSIC_BASE}${pos.track.f}`;
    const go = () => { try { ch.e.currentTime = Math.min(pos.offset, Math.max(0, pos.track.dur - 1)); } catch { /* not seekable yet */ } ch.e.play?.().catch(() => {}); };
    if (ch.e.readyState >= 1) go(); else ch.e.addEventListener('loadedmetadata', go, { once: true });
    ch.g.gain.setTargetAtTime(1, this.g.audio.ctx.currentTime, 0.4);
    this.track = { station: S.id, index: pos.index, file: pos.track.f, dur: pos.track.dur, startedAt: Date.now() / 1000 - pos.offset };
    this.stats.songs++;
    return true;
  }
  // The next song, crossfaded in over the last seconds of this one.
  nextSong(S) {
    const E = this.els; if (!E) return;
    const T = this.playlist(S), i = ((this.track?.index ?? -1) + 1) % T.length, old = E.cur, nu = E.cur === E.a ? E.b : E.a, t = this.g.audio.ctx.currentTime;
    old.g.gain.setTargetAtTime(0, t, RADIO.crossfade / 3);
    E.cur = nu;
    this.startMusic(S, { index: i, offset: 0, track: T[i] });
    setTimeout(() => { try { old.e.pause(); } catch { /* gone */ } }, RADIO.crossfade * 1500);
  }
  stopAudio() {
    const E = this.els; if (!E) return;
    for (const ch of [E.a, E.b]) { ch.g.gain.value = 0; try { ch.e.pause(); } catch { /* fine */ } }
    this.track = null;
  }

  // ---- talk on the air ---------------------------------------------------------------------------------------------
  say(S, text) {
    this.lastLine = { station: S.id, text, at: +this.g.time.toFixed(1) };
    this.g.hud?.subtitle?.(`${S.freq} ${S.name}: ${text}`, RADIO.idSecs);
    this.g.voice?.radio?.(text); // heard in the station voice once the forge renders it; the subtitle meanwhile
    const E = this.els, A = this.g.audio;
    if (E && A?.ctx) { E.cur.g.gain.setTargetAtTime(RADIO.duck, A.ctx.currentTime, 0.2); setTimeout(() => E.cur.g.gain.setTargetAtTime(1, A.ctx.currentTime, 0.6), RADIO.idSecs * 1000); }
    A?.sample?.('common', 'radio.stinger', { dist: 1, vol: 0.4 });
    this.g.emit('radioLine', { station: S.id, text });
  }
  stationId(S) {
    const n = S.ids.length, k = (hash32(`${S.id}|${Math.floor(this.g.time / 30)}`) + this.stats.ids) % n;
    let line = S.ids[k];
    if (S.kind === 'emergency') line = line.replaceAll('{place}', this.shelterNow().name);
    this.stats.ids++;
    return line;
  }
  // A headline off the chronicle: the newest thing worth saying (your deeds first), in the station's own lines.
  headline() {
    const S = this.g.society, R = EVENTS.radio_news?.lines;
    if (!S || !R) return null;
    for (const r of S.chronicle.query({ limit: 40 })) {
      if (r.src === 'rumor') continue;
      const vars = { who: r.on || 'somebody', place: S.places[r.p]?.name ?? 'the flats', faction: S.factions?.rows?.[S.factions.index?.[r.of]]?.name ?? 'their people' };
      const fill = (t) => t.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
      if (r.a === 'player') { const t = (r.ws ? R.witnessed : R.unwitnessed)?.[r.v]; if (t) return fill(t); }
      else if (r.v === 'kill' && r.on) return fill(R.world.kill);
    }
    return null;
  }
  // Today's shelter: honest (a town) or a lure (open ground, raiders waiting). Seeded by the game day.
  shelterNow() {
    const g = this.g, day = Math.floor((g.sky?.totalHours?.() ?? g.time / 60) / 24), p = g.player;
    if (this.shelter?.day === day) return this.shelter;
    const S = STATIONS.find((s) => s.kind === 'emergency'), trap = (hash32(`shelter|${day}`) % 1000) / 1000 < S.trap;
    const a = (hash32(`dir|${day}`) % 360) * Math.PI / 180, d = RADIO.shelterR[0] + (hash32(`d|${day}`) % 1000) / 1000 * (RADIO.shelterR[1] - RADIO.shelterR[0]);
    const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const x = p.x + Math.sin(a) * d, z = p.z - Math.cos(a) * d, dir = DIRS[Math.round(a / (Math.PI / 4)) % 8];
    const town = g.society?.places?.rust_haven;
    this.shelter = trap || !town ? { day, x, z, name: `the old filling station ${dir} of the highway`, trap, sprung: false } : { day, x: 0, z: -84, name: town.name, trap: false, sprung: false };
    return this.shelter;
  }
  // The lure sprung: raiders wait at the false shelter.
  spring() {
    const s = this.shelter, g = this.g;
    if (!s || !s.trap || s.sprung) return 0;
    s.sprung = true;
    let n = 0;
    for (let k = 0; k < RADIO.trapCount; k++) { const a = (k / RADIO.trapCount) * Math.PI * 2; const c = g.spawnRaider?.(s.x + Math.cos(a) * 14, s.z + Math.sin(a) * 14); if (c) { c.target = g.player; c.state = 'fight'; n++; } }
    this.stats.traps++;
    g.hud?.toast?.('IT WAS A TRAP', 'warn');
    g.emit('radioTrap', { x: Math.round(s.x), z: Math.round(s.z), raiders: n });
    return n;
  }

  update(dt) {
    const S = this.station, g = this.g;
    // The lure waits whether or not you are listening.
    const sh = this.shelter, p = g.player;
    if (sh?.trap && !sh.sprung && p && Math.hypot(p.x - sh.x, p.z - sh.z) < RADIO.trapRange) this.spring();
    if (S.id === 'off') return;
    if (!this.canHear()) { if (this.track) this.stopAudio(); return; }
    if (S.playlist && !this.track && g.audio?.ctx) this.startMusic(S);
    if (this.track && this.els) { const e = this.els.cur.e; if (e.duration && e.currentTime > e.duration - RADIO.crossfade) this.nextSong(S); }
    if ((this.idT -= dt) <= 0) { this.idT = S.idEvery[0] + Math.random() * (S.idEvery[1] - S.idEvery[0]); this.say(S, this.stationId(S)); }
    if (S.kind === 'news' && (this.newsT -= dt) <= 0) {
      this.newsT = 30;
      if ((this.hissT = (this.hissT ?? 0) - 30) <= 0) { this.hissT = 0; g.audio?.sample?.('common', 'radio.static', { dist: 1, vol: 0.25 }); }
      // Every third bulletin is the weather: a forecast is a knowledge channel with an age and a confidence (seasons.hear)
      const fc = (this.fcN = (this.fcN ?? 0) + 1) % 3 === 0 ? g.seasons?.hear('radio') : null;
      const h = fc ?? this.headline(); if (h) { this.stats.news++; this.say(S, h); }
    }
    if (S.kind === 'emergency' && (this.toneT -= dt) <= 0) { this.toneT = 8; this.stats.alerts++; g.audio?.tone?.(720, 0.9, 0.06 * this.volume, 'sine'); g.audio?.tone?.(960, 0.9, 0.06 * this.volume, 'sine'); }
  }

  view() {
    const S = this.station, e = this.els?.cur?.e;
    return { station: S.id, name: S.name, freq: S.freq ?? null, kind: S.kind ?? null, canHear: this.canHear(), portable: this.hasPortable(), volume: this.volume,
      track: this.track ? { ...this.track, at: e ? +e.currentTime.toFixed(1) : null, playing: e ? !e.paused : false } : null,
      lastLine: this.lastLine, shelter: this.shelter ? { name: this.shelter.name, x: Math.round(this.shelter.x), z: Math.round(this.shelter.z), trap: this.shelter.trap, sprung: this.shelter.sprung } : null,
      stations: STATIONS.map((s) => ({ id: s.id, freq: s.freq ?? null, name: s.name, tracks: s.playlist ? this.playlist(s).length : 0 })), stats: this.stats };
  }
  save() { return { i: this.i, shelter: this.shelter }; }
  load(s) { if (!s) return; this.shelter = s.shelter ?? null; if (s.i) this.i = s.i; }
}
