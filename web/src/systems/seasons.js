import { CALENDAR, ZONES, ODDS, DEFAULT_ZONE, LAPSE, BIOME_C, RANGE, LEAF, SNOW, ROAD_GRIP, LIGHT, YIELDS, SNOW_YIELD, FAUNA_SEASON, PASSES, PRICES, SELL_BACK, WARM, COAT_HOT, FIRE, HEARTH, FORECAST, CROPS, FROST_C, GEO, TUNE, inRange } from '../data/seasons.js';
import { CLIMATE } from '../data/survival.js';
import { ITEMS } from '../data/items.js';
import { toUsmap, toWorld } from '../world/geo.js';
import { STREAM } from '../data/streaming.js';

// SEASONS (docs/design/WEB_SEASONS.md; rows in data/seasons.js). The calendar, the climate by place and season, the snow,
// the light, what the land yields, the passes, the prices and the forecast. ONE system with a small stable API the other
// lanes read:
//   calendar(g)            -> { day, year, month, monthName, dayOfMonth, season, seasonIndex, seasonT, yearDay, yearDays, f, words }
//   seasonAt(g, x, z)      -> { id, label, t, calendar, zone, zoneName }       (Florida: wet/dry; the Rockies: four)
//   climateShift(g, x, z)  -> { temp, range, odds, snowy, zone, ... }           temp: deg C against data/survival.js CLIMATE
//   plantingWindow(g, crop, x, z), growthFactor(g, x, z)                        the garden lane's two reads
//   g.seasons.onSeasonChange(fn)                                               and the 'seasonChange' / 'newMonth' game events
// The calendar day is society.day + sky.time (saved; moves only while a page simulates, so an empty shard does not age).
// Pure functions below take plain numbers so the selftest and the forge can ask without a game.

const TAU = Math.PI * 2, REF_MEAN = (CLIMATE.low + CLIMATE.high) / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a || 1), 0, 1); return t * t * (3 - 2 * t); };
const QUARTERS = CALENDAR.seasons;

export const latOf = (z) => { const y = toUsmap(0, z)[1]; return clamp(GEO.lat0 + (GEO.y0 - y) / GEO.mPerDeg, 20, 55); };
export const lonOf = (x) => GEO.lon0 + (toUsmap(x, 0)[0] - GEO.x0) / GEO.mPerDegLon;
export const fromLatLon = (lat, lon) => { const ux = GEO.x0 + (lon - GEO.lon0) * GEO.mPerDegLon, uy = GEO.y0 + (GEO.lat0 - lat) * GEO.mPerDeg; return [ux, uy]; };
const ZONE_OF = {};
for (const [id, z] of Object.entries(ZONES)) for (const s of z.states) ZONE_OF[s] = id;
export const zoneOfState = (s) => ZONE_OF[s] ?? DEFAULT_ZONE;

// ---- pure calendar ------------------------------------------------------------------------------------------------
// t: calendar days since day 0 (fractional); startF: the year fraction day 0 sits at.
export function calendarOf(t, seasonDays = CALENDAR.seasonDays, startF = CALENDAR.start.player) {
  const yearDays = seasonDays * 4, abs = t + startF * yearDays, year = Math.floor(abs / yearDays), yd = abs - year * yearDays, f = yd / yearDays;
  const q = Math.min(3, Math.floor(f * 4)), seasonT = f * 4 - q, monthF = f * 12, month = Math.min(11, Math.floor(monthF));
  const third = Math.min(2, Math.floor(seasonT * 3));
  return {
    day: Math.floor(t), year: year + 1, month, monthName: CALENDAR.months[month], dayOfMonth: 1 + Math.floor((monthF - month) * (yearDays / 12)),
    season: QUARTERS[q], seasonIndex: q, seasonT, yearDay: yd, yearDays, f, words: CALENDAR.seasonWords[QUARTERS[q]][third],
  };
}

// The local season (a zone's own row) at year fraction f, and the blended odds: near a boundary the two rows mix over
// `soft` of a season so the weather does not step.
function localAt(zone, f) { for (const s of zone.local) if (inRange(f, s.from, s.to) || inRange(f + 1, s.from, s.to)) return s; return zone.local[0]; }
const oddsRow = (s) => (typeof s.odds === 'string' ? ODDS[s.odds] : s.odds);
export function oddsAt(zone, f, out = {}) {
  const s = localAt(zone, f), soft = 0.04;
  const span = s.to - s.from, ff = inRange(f, s.from, s.to) ? f : f + 1, k = (ff - s.from) / span;
  const a = oddsRow(s);
  let other = null, w = 0;
  if (k < soft / span * 1) { other = localAt(zone, s.from - 0.001 < 0 ? s.from - 0.001 + 1 : s.from - 0.001); w = 0.5 * (1 - k / (soft / span)); }
  else if (k > 1 - soft / span) { other = localAt(zone, (s.to + 0.001) % 1); w = 0.5 * (1 - (1 - k) / (soft / span)); }
  const b = other && other !== s ? oddsRow(other) : null;
  for (const key of Object.keys(a)) out[key] = b ? lerp(a[key], b[key] ?? 0, w) : a[key];
  return out;
}

// The day's mean air (deg C) at a place and year fraction: the zone's mean at its latitude, higher ground colder, the seasonal swing.
export function meanAir(zone, f, lat, relief = 0, biome = '') {
  const z = zone, peak = z.warmest ?? CALENDAR.warmest;
  return z.mean + (lat - z.lat0) * LAPSE.perDegLat + Math.max(0, relief - z.relief0) * LAPSE.perRelief + (BIOME_C[biome] ?? 0) + z.amp * Math.cos(TAU * (f - peak));
}
// Daylight hours at a latitude and year fraction (the real thing: declination x latitude), clamped so night never vanishes.
export function dayLength(lat, f) {
  const dec = CALENDAR.tilt * Math.sin(TAU * (f - CALENDAR.equinox)) * Math.PI / 180, ph = lat * Math.PI / 180;
  const x = clamp(-Math.tan(ph) * Math.tan(dec), -1, 1);
  return clamp(24 / Math.PI * Math.acos(x), LIGHT.min, LIGHT.max);
}
// The seasonal pack: the standing snow of a cold month (0..1) for a day's mean air and a zone's snowiness.
export const packFor = (meanC, snowy) => snowy * sstep(SNOW.packNoneC, SNOW.packFullC, meanC);

const blend = (cal, table) => { // a per-calendar-season number, blended smoothly between season centres
  const x = cal.f * 4 - 0.5, i0 = ((Math.floor(x) % 4) + 4) % 4, i1 = (i0 + 1) % 4, t = x - Math.floor(x);
  return lerp(table[QUARTERS[i0]], table[QUARTERS[i1]], t * t * (3 - 2 * t));
};
export const leafCover = (leafKey, f) => blend({ f }, LEAF[leafKey].cover);
export const leafTurn = (leafKey, f) => blend({ f }, LEAF[leafKey].turn);

const _place = { x: 0, z: 0, zoneId: DEFAULT_ZONE, state: null, relief: 0, biome: '', lat: 33.4 };

export class Seasons {
  constructor(game) {
    this.g = game;
    const agent = typeof location !== 'undefined' && /[?&](agent|autostart)/.test(location.search);
    this.seasonDays = CALENDAR.seasonDays;
    this.startF = agent ? CALENDAR.start.agent : CALENDAR.start.player;
    this.shift = 0;                 // days added by `season advance` / `season set` (saved): the calendar's own adjustment
    this.clockSource = null;        // the world-clock lane may set a () => day (float) for the shard; until then society.day rules
    this.neutral = agent;           // the agent harness keeps the old desert air (airAt ignores the date) until a check turns it off
    this.live = true;               // false: the sky keeps its old random weather and the look holds still (selftests, the forge)
    this.listeners = [];
    this.last = null;
    this.fresh = 0; this.pack = 0; this.cover = 0; // snow: fresh on the pack, the pack, what the ground shows
    this.zoneId = DEFAULT_ZONE;
    this.pin = null;                // {x,z}: read the climate of THIS place instead of the player's (tests, the forge, `season action=pin`)
    this.here = this.read(0, 0);    // climateShift at the player, refreshed twice a second
    this.placeT = 0; this.placeX = 1e9; this.placeZ = 1e9;
    this.light = { rise: 6, len: 12 };
    this.grip = 1;                  // the road grip under the player (ROAD_GRIP): vehicles.js multiplies it in
    this.forecastNote = null;
  }

  air() { return this.neutral ? null : this.here; } // survival.airAt reads this

  // ---- the clock ----
  dayFloat() {
    if (this.clockSource) return this.clockSource() + this.shift;
    const g = this.g, S = g.society, T = g.sky?.time ?? 12;
    const pending = S && S.lastHour != null && T - S.lastHour < -12 ? 1 : 0; // the sky wrapped midnight and the society has not counted it yet
    return (S?.day ?? 0) + pending + T / 24 + this.shift;
  }
  calendar(t = this.dayFloat()) { return calendarOf(t, this.seasonDays, this.startF); }
  onSeasonChange(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; }

  // ---- the place ----
  readPlace(x, z) {
    const W = this.g.streamer?.W, P = _place;
    P.x = x; P.z = z; P.lat = latOf(z);
    P.state = W?.stateAt ? W.stateAt(x, z) : null;
    P.zoneId = zoneOfState(P.state);
    P.relief = W?.reliefAt ? W.reliefAt(x, z) : 0;
    P.biome = W?.biomeAt ? W.biomeAt(x, z) : '';
    return P;
  }
  zoneAt(x, z) { return ZONES[this.readPlace(x, z).zoneId]; }
  seasonAt(x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const P = this.readPlace(x, z), zone = ZONES[P.zoneId], cal = this.calendar(), s = localAt(zone, cal.f);
    const span = s.to - s.from, ff = inRange(cal.f, s.from, s.to) ? cal.f : cal.f + 1;
    return { id: s.id, label: s.label, t: clamp((ff - s.from) / span, 0, 1), calendar: cal.season, zone: P.zoneId, zoneName: zone.name, state: P.state };
  }
  // The climate at a place now. temp is the day's mean against the desert baseline of data/survival.js CLIMATE.
  read(x, z, t = this.dayFloat()) {
    const P = this.readPlace(x, z), zone = ZONES[P.zoneId], cal = this.calendar(t), f = cal.f;
    const mean = meanAir(zone, f, P.lat, P.relief, P.biome);
    const cold = (1 + Math.cos(TAU * (f - (zone.warmest ?? CALENDAR.warmest)))) / 2;      // 1 at the warmest day, 0 at the coldest
    const range = lerp(RANGE.winterMul, 1, cold) * (RANGE.zones[P.zoneId] ?? 1);
    const pack = packFor(mean, zone.snowy), s = localAt(zone, f);
    return {
      x, z, zone: P.zoneId, zoneName: zone.name, state: P.state, lat: +P.lat.toFixed(2), biome: P.biome, relief: +P.relief.toFixed(2),
      mean: +mean.toFixed(2), temp: mean - REF_MEAN, range, local: s.id, localLabel: s.label, snowy: zone.snowy, pack, odds: oddsAt(zone, f, {}),
      leaf: zone.leaf, cover: leafCover(zone.leaf, f), turn: leafTurn(zone.leaf, f), dayLen: dayLength(P.lat, f), frost: mean < FROST_C, season: cal.season,
    };
  }
  climateShift(x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) { return this.read(x, z); }
  zoneDefaults() { return ZONES[this.zoneId]; }

  // ---- the frame ----
  update(dt) {
    const g = this.g, sky = g.sky;
    if (!sky) return;
    const hours = dt * sky.timeScale * (sky.fast ? 40 : 1);
    const cal = this.calendar();
    // Events: a new season / month, fired once whichever way the clock jumped.
    const L = this.last;
    if (!L) this.last = { season: cal.season, month: cal.month, year: cal.year };
    else if (L.season !== cal.season || L.month !== cal.month || L.year !== cal.year) {
      const seasonChanged = L.season !== cal.season || L.year !== cal.year;
      const ev = { from: L.season, to: cal.season, month: cal.monthName, year: cal.year, calendar: cal };
      this.last = { season: cal.season, month: cal.month, year: cal.year };
      if (seasonChanged) { g.emit?.('seasonChange', ev); for (const fn of this.listeners.slice()) { try { fn(ev); } catch (e) { console.warn('seasons: listener', e); } } g.hud?.toast?.(`${cal.season.toUpperCase()} HAS COME`, 'job'); }
      else g.emit?.('newMonth', ev);
    }
    // The place under the player, read again when they have moved a cell or every few seconds.
    const p = this.pin ?? g.player;
    let needGrip = false;
    this.placeT -= dt;
    if (this.pin && this.placeX !== this.pin.x) this.placeT = 0;
    if (p && (this.placeT <= 0 || Math.hypot(p.x - this.placeX, p.z - this.placeZ) > TUNE.cellM)) {
      this.placeT = TUNE.placeEvery; this.placeX = p.x; this.placeZ = p.z;
      const zPrev = this.zoneId;
      this.here = this.read(p.x, p.z);
      needGrip = true;
      if (this.here.zone !== zPrev) { this.zoneId = this.here.zone; this.fresh *= TUNE.freshCarry; }
      if (!this.packAt || Math.hypot(p.x - this.packAt.x, p.z - this.packAt.z) > SNOW.snapM) { if (this.packAt) this.pack = this.here.pack; this.packAt = { x: p.x, z: p.z }; }
    } else if (!p) this.here = this.read(0, 0);
    this.tickSnow(hours);
    if (needGrip) this.grip = this.roadAt(p.x, p.z).grip; // after the cover has moved
    this.tickLight(dt);
  }

  // ---- snow ----
  // pack: follows the season's standing snow; fresh: what a snowfall left on top, melting with the air.
  tickSnow(hours) {
    const H = this.here, sky = this.g.sky, S = SNOW;
    const target = H.pack;
    if (hours > 0) {
      const k = 1 - Math.exp(-S.packRate * hours);
      this.pack += (target - this.pack) * k;
      const snowing = sky.cur?.snow ?? 0;
      const air = this.airNow();
      if (snowing > 0.05 && air <= S.fallC + 1) this.fresh = Math.min(S.freshMax, this.fresh + S.build * snowing * hours);
      else if (air > -0.5) {
        const sun = sky.night < 0.5 && (sky.cur?.clouds ?? 0) < 0.5 ? S.sunMelt : 1;
        this.fresh = Math.max(0, this.fresh - S.meltPerC * (air + 0.5) * sun * hours);
      }
    }
    this.cover = clamp(this.pack + this.fresh * (1 - this.pack), 0, 1);
  }
  // Added to the colour grade's temp (cool is negative): a snowed-under country reads blue-white, not cream.
  gradeTemp() { return this.live ? -1.8 * this.cover - (this.here.frost ? 0.2 : 0) + 0.035 * clamp(this.here.temp, -15, 12) : 0; } // and the season's own air: a warm cast in the desert summer, a cool one in its winter
  walkMul() { return 1 - (1 - SNOW.walk) * clamp((this.cover - 0.3) / (SNOW.deep - 0.3), 0, 1); } // a boot in deep snow
  trackHold() { return 1 + (SNOW.trackHold - 1) * this.cover; }
  airNow() { return this.g.needs?.air ?? (REF_MEAN + this.here.temp); }
  // The ground cover for a place now (the pack is the place's own; fresh only lies near the player).
  coverAt(x, z) {
    const p = this.pin ?? this.g.player;
    if (p && Math.hypot(x - p.x, z - p.z) < 900) return this.cover;
    const r = this.read(x, z); return r.pack;
  }

  // ---- light ----
  tickLight(dt) {
    const sky = this.g.sky, len = this.here.dayLen, k = 1 - Math.exp(-dt / LIGHT.ease);
    this.light.len += (len - this.light.len) * k;
    this.light.rise = 12 - this.light.len / 2;
    sky.dayLen = this.light.len; sky.sunRise = this.light.rise;
  }

  // ---- weather ----
  // The sky asks for the next weather. Wet kinds fall as snow in the cold; the result is a WEATHER key.
  pickWeather(rand = Math.random) {
    if (!this.live || this.g.survival?.prof?.climate === false) return null; // the battery's profile keeps the old random sky
    const odds = this.here.odds; let tot = 0;
    for (const k in odds) tot += odds[k];
    let r = rand() * tot, key = 'CLEAR';
    for (const k in odds) { r -= odds[k]; if (r <= 0) { key = k; break; } }
    return this.kindFor(key);
  }
  kindFor(key, air = this.airNow()) {
    if (key === 'RAIN' && air <= SNOW.fallC) return 'SNOW';
    if (key === 'STORM' && air <= SNOW.blizzardC) return 'BLIZZARD';
    if (key === 'STORM' && air <= SNOW.fallC) return 'SNOW';
    if ((key === 'DUST' || key === 'ASHFALL') && air <= SNOW.fallC) return 'OVERCAST';
    return key;
  }

  // ---- roads ----
  // The road condition at a place: clear | wet | slush | packed | ice | closed, and the grip it gives.
  roadAt(x, z) {
    const sky = this.g.sky, cov = this.coverAt(x, z), r = this.read(x, z), air = REF_MEAN + r.temp;
    const pass = this.passAt(x, z);
    if (pass?.closed) return { kind: 'closed', grip: ROAD_GRIP.closed, pass };
    let kind = 'clear';
    if (cov > SNOW.slick) kind = air < -3 ? 'ice' : 'packed';
    else if (cov > 0.2) kind = 'slush';
    else if (air < 0.5 && (sky.cur?.rain ?? 0) > 0.2) kind = 'ice';
    else if ((sky.cur?.rain ?? 0) > 0.3) kind = 'wet';
    return { kind, grip: ROAD_GRIP[kind], pass: pass ?? null };
  }
  passAt(x, z) {
    for (const p of PASSES) {
      const [px, pz] = this.passWorld(p);
      if (Math.hypot(x - px, z - pz) > p.r * STREAM.K) continue; // r is in usmap metres
      const pk = this.passPack(p), near = this.pin ?? this.g.player, cov = near && Math.hypot(px - near.x, pz - near.z) < p.r * STREAM.K ? Math.max(pk, this.cover) : pk;
      return { id: p.id, name: p.name, road: p.road, closed: cov >= p.at, cover: +cov.toFixed(2) };
    }
    return null;
  }
  passPack(p) { const [px, pz] = this.passWorld(p), r = this.read(px, pz); return packFor(r.mean - (p.cold ?? 5), 1); }
  passWorld(p) { return p._w ??= toWorld(fromLatLon(p.lat, p.lon)); }
  passes() { return PASSES.map((p) => { const [x, z] = this.passWorld(p), pk = this.passPack(p); return { id: p.id, name: p.name, road: p.road, x: Math.round(x), z: Math.round(z), pack: +pk.toFixed(2), closed: pk >= p.at, at: p.at }; }); }

  // ---- the body ----
  // Degrees C of warmth worn (felt in the cold; a cost in the heat) and from the fire beside you.
  wornWarmth(air) {
    const g = this.g, w = g.gear?.worn; if (!w) return 0;
    let s = 0;
    for (const slot in w) { const id = w[slot]; if (id) s += WARM[id] ?? 0; }
    return air > 28 ? -s * COAT_HOT * sstep(28, 38, air) : s * sstep(24, 8, air);
  }
  fireWarmth(x, z) {
    const F = this.g.throwables?.fires; if (!F?.length) return 0;
    let best = 0;
    for (const f of F) { if (f.t > f.dur) continue; const d = Math.hypot(f.x - x, f.z - z); if (d < FIRE.r) best = Math.max(best, FIRE.warm * (1 - d / FIRE.r) ** FIRE.falloff); }
    return best;
  }
  hearth() { return HEARTH; }

  // ---- what the land yields ----
  yield(kind, id, x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const tbl = YIELDS[kind]; if (!tbl) return 1;
    const row = tbl[id] ?? tbl['*']; if (!row) return 1;
    const cal = this.calendar();
    let m = blend(cal, row);
    if (kind === 'forage') { const zn = ZONES[this.readPlace(x, z).zoneId]; m *= 0.5 + 0.5 * (zn.growth[localAt(zn, cal.f).id] ?? 1); }
    const sy = SNOW_YIELD[id] ?? SNOW_YIELD[kind];
    if (sy) m *= 1 - this.coverAt(x, z) * sy;
    return m;
  }
  fauna(kind, x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const row = FAUNA_SEASON[kind] ?? FAUNA_SEASON['*'], cal = this.calendar();
    const r = this.read(x, z); // a southern zone's winter is mild: its sleepers sleep less
    const m = blend(cal, row), mild = clamp((r.mean - 4) / 14, 0, 1);
    return cal.season === 'winter' || cal.season === 'autumn' ? lerp(m, Math.max(m, 0.85), mild * 0.6) : m;
  }
  priceMul(itemId, x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const kind = ITEMS[itemId]?.kind, cal = this.calendar(), r = this.read(x, z), zone = ZONES[r.zone];
    let m = 1, hit = false;
    for (const row of PRICES) {
      if (!(row.items.includes(itemId) || (kind && row.kinds.includes(kind)))) continue;
      hit = true;
      let v = blend(cal, row.mul);
      if (row.cold) v += row.cold * zone.fuel * sstep(8, -6, r.mean);
      if (row.hot) v += row.hot * sstep(26, 36, r.mean);
      m *= v;
    }
    return hit ? m : 1;
  }
  sellMul(itemId, x, z) { return 1 + (this.priceMul(itemId, x, z) - 1) * SELL_BACK; }

  // ---- the farming lane's reads ----
  // growthFactor: 0..1.4 at a place now, from the day's air (a curve) and the zone's moisture for its local season.
  growthFactor(x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0, t = this.dayFloat()) {
    const r = this.read(x, z, t), zone = ZONES[r.zone], cal = this.calendar(t);
    const heat = sstep(2, 18, r.mean) * (1 - 0.6 * sstep(30, 38, r.mean)), wet = zone.growth[localAt(zone, cal.f).id] ?? 1;
    return +(heat * (0.4 + 0.6 * wet) * 1.2).toFixed(3);
  }
  // plantingWindow: is it time to put a crop in? Scans forward for the first hard frost and measures the room before it.
  plantingWindow(crop, x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const row = typeof crop === 'object' ? crop : CROPS[crop] ?? CROPS.default, t0 = this.dayFloat(), P = this.readPlace(x, z), zone = ZONES[P.zoneId];
    const meanAt = (t) => meanAir(zone, this.calendar(t).f, P.lat, P.relief, P.biome);
    const now = meanAt(t0), yearDays = this.seasonDays * 4;
    let untilFrost = Infinity;
    if (row.frostKill) for (let d = 0; d <= yearDays; d += 0.5) if (meanAt(t0 + d) < FROST_C) { untilFrost = d; break; }
    let opens = null, closes = null;
    for (let d = 0; d <= yearDays; d += 0.5) { const m = meanAt(t0 + d), ok = m >= row.sowC && m <= row.maxC; if (ok && opens === null) opens = d; if (opens !== null && !ok) { closes = d; break; } }
    const gf = Math.max(0.15, this.growthFactor(x, z)), need = row.days / gf;
    const open = now >= row.sowC && now <= row.maxC && untilFrost >= need;
    const why = open ? 'open' : now < row.sowC ? 'too cold to sprout' : now > row.maxC ? 'too hot' : 'frost would take it before harvest';
    return { open, why, mean: +now.toFixed(1), needDays: +need.toFixed(1), untilFrost: untilFrost === Infinity ? null : +untilFrost.toFixed(1), opensInDays: opens, closesInDays: closes, crop: typeof crop === 'string' ? crop : null };
  }

  // ---- the forecast (a knowledge channel: radio or a barkeep, with an age and a confidence) ----
  forecast(source = 'radio', x = this.g.player?.x ?? 0, z = this.g.player?.z ?? 0) {
    const F = FORECAST[source] ?? FORECAST.radio, r = this.read(x, z), cal = this.calendar();
    // The most likely wet or dry kind for the window: the odds row's mode, the temperature deciding rain from snow.
    let best = 'CLEAR', bw = -1;
    for (const k in r.odds) if (r.odds[k] > bw) { bw = r.odds[k]; best = k; }
    const air = REF_MEAN + r.temp, wet = r.odds.RAIN + r.odds.STORM;
    if (wet > 0.3 && best === 'CLEAR') best = 'RAIN';
    const kind = this.kindFor(best, air - 4 * (1 - F.conf));
    const lines = FORECAST.lines[kind] ?? FORECAST.lines.CLEAR;
    const word = lines[Math.floor((x * 7 + z * 13 + cal.day) % lines.length + lines.length) % lines.length];
    const trend = r.temp < -10 ? 'a hard cold' : r.temp > 14 ? 'killing heat' : null;
    return { source, hours: F.hours, conf: F.conf, kind, text: `${word} within ${F.hours} hours${trend ? `, and ${trend}` : ''}`, at: cal.day, zone: r.zoneName };
  }

  // The season in words for the HUD line, refreshed with the place (cheap: a string compare in the HUD).
  words() { const H = this.here, cal = this.calendar(); return H.local === cal.season || !H.localLabel ? cal.words : H.localLabel; }

  // A forecast heard on the air or at a bar: kept with its age and confidence (what the player was TOLD, law 6), and
  // returned as the line to say. `heard` is what a barkeep or the HUD may quote back.
  hear(source = 'radio') {
    const f = this.forecast(source), g = this.g;
    this.heard = { ...f, heardAt: this.dayFloat(), hour: g.sky?.time };
    const day = f.kind === 'SNOW' || f.kind === 'BLIZZARD' ? 'It will be cold enough for snow.' : '';
    return `Weather word: ${f.text}.${day ? ` ${day}` : ''} Season: ${this.words().toLowerCase()}.`;
  }
  heardAge() { return this.heard ? +((this.dayFloat() - this.heard.heardAt) * 24).toFixed(1) : null; }

  // ---- the diegetic date: no watch, no date (law 6) ----
  chip() {
    const cal = this.calendar(), g = this.g, watch = !!(g.inventory?.carried?.count?.('watch') || g.inventory?.carried?.count?.('wristwatch'));
    const ph = g.sky?.phase ?? 'DAY';
    const part = { DAWN: 'DAWN', DAY: 'DAY', DUSK: 'DUSK', NIGHT: 'NIGHT' }[ph];
    const loc = this.seasonAt();
    const lbl = loc.id === cal.season ? cal.words : `${loc.label}`;
    return watch ? `${cal.monthName.toUpperCase()} ${cal.dayOfMonth} · YEAR ${cal.year} · ${lbl}` : `${part} · ${lbl}`;
  }

  // ---- commands & views ----
  setSeason(season, t = 0.5) { // jumps the calendar to a season (and how far into it)
    const i = QUARTERS.indexOf(season); if (i < 0) return false;
    const want = (i + clamp(t, 0, 0.999)) / 4, cal = this.calendar(), cur = cal.f;
    let d = (want - cur) * this.seasonDays * 4; if (d < 0) d += this.seasonDays * 4; this.shift += d; this.update(0); return true;
  }
  advance(days) { this.shift += days; this.update(0); }
  view() {
    const cal = this.calendar(), H = this.here, loc = { id: H.local, label: H.localLabel, calendar: H.season, zone: H.zone, zoneName: H.zoneName, state: H.state };
    return { calendar: cal, here: { ...loc, mean: H.mean, tempShift: +H.temp.toFixed(2), range: +H.range.toFixed(2), dayLen: +H.dayLen.toFixed(2), snowy: H.snowy, leaf: H.leaf, cover: +H.cover.toFixed(2), frost: H.frost },
      snow: { cover: +this.cover.toFixed(3), pack: +this.pack.toFixed(3), fresh: +this.fresh.toFixed(3) }, light: { rise: +this.light.rise.toFixed(2), len: +this.light.len.toFixed(2) }, seasonDays: this.seasonDays, shift: this.shift, startF: this.startF, live: this.live, chip: this.chip() };
  }
  save() { return { shift: this.shift, seasonDays: this.seasonDays, startF: this.startF, fresh: +this.fresh.toFixed(3), pack: +this.pack.toFixed(3), live: this.live }; }
  load(s) {
    if (!s) return;
    this.shift = s.shift ?? 0; this.seasonDays = s.seasonDays ?? CALENDAR.seasonDays; this.startF = s.startF ?? this.startF;
    this.fresh = s.fresh ?? 0; this.pack = s.pack ?? 0; this.live = s.live ?? true;
    this.last = null; this.update(0);
  }
}

// The stable reads, as functions of the game (what the other lanes import).
export const calendar = (g) => g.seasons.calendar();
export const seasonAt = (g, x, z) => g.seasons.seasonAt(x, z);
export const climateShift = (g, x, z) => g.seasons.climateShift(x, z);
export const plantingWindow = (g, crop, x, z) => g.seasons.plantingWindow(crop, x, z);
export const growthFactor = (g, x, z) => g.seasons.growthFactor(x, z);
export { ZONES, CROPS, SNOW, ROAD_GRIP, REF_MEAN };
