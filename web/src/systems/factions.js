import { FACTIONS, TIERS, tierOf } from '../data/society.js';
import { TOWN } from '../world/city.js';

// Factions and where the player stands with each (docs/design/WEB_WORLD_MEMORY.md §3.4). Up to 16 rows, indexed
// append-only so a character's `fi` never goes stale. Hot data lives in typed arrays: the AI reads one byte to know
// whether a faction shoots the player on sight.
export const MAX_FACTIONS = 16;
const HOUR_TAU = 24; // game hours per memory day

export class Factions {
  constructor(game) {
    this.g = game;
    this.ids = [];                 // index → id
    this.index = {};               // id → index
    this.rows = [];                // index → resolved row
    this.standing = new Float32Array(MAX_FACTIONS);
    this.lifetime = new Float32Array(MAX_FACTIONS); // every delta ever applied: big deeds partly stick
    this.rel = new Int8Array(MAX_FACTIONS * MAX_FACTIONS);
    this.playerHostile = new Uint8Array(MAX_FACTIONS);
    // Roles (systems/roles.js) colour how a faction reads you: a bias added to the standing it acts on, and an override
    // (+1 shoot on sight anyway, -1 hold fire anyway). The raw standing is untouched: deeds, decay and saves see it alone.
    this.bias = new Float32Array(MAX_FACTIONS);
    this.roleHostile = new Int8Array(MAX_FACTIONS);
    this.tiers = [];
    for (const [id, def] of Object.entries(FACTIONS)) this.register(id, def);
  }

  // Add or update a faction row. Returns { id, warnings }.
  register(id, def) {
    const warnings = [];
    const base = this.rows[this.index[id]] ?? FACTIONS[id] ?? {};
    const row = { id, name: id, archetype: 'loose', color: '#9a8a6a', start: 0, stars: false, forgivesSelfDefense: false, cohesion: 0.5, memoryDays: 14, rumorDelay: [20, 45], hub: null, leaders: [], ...base, ...def };
    // Own copies: a pack or a relation change must never write into the built-in rows.
    row.relations = { ...(base.relations ?? {}), ...(def.relations ?? {}) };
    row.values = { ...(base.values ?? {}), ...(def.values ?? {}) };
    if (purple(row.color)) { warnings.push(`colour ${row.color} is purple (hue 270-320) - the art law forbids it; using ${base.color ?? '#9a8a6a'}`); row.color = base.color ?? '#9a8a6a'; }
    let i = this.index[id];
    if (i === undefined) {
      if (this.ids.length >= MAX_FACTIONS) return { id, warnings: [...warnings, `faction budget full (${MAX_FACTIONS})`], error: true };
      i = this.ids.length; this.ids.push(id); this.index[id] = i;
      this.standing[i] = row.start;
    }
    this.rows[i] = row;
    this.relate();
    this.retier(i, false);
    return { id, index: i, warnings };
  }

  // Relations as a flat signed-byte matrix; a row's '*' is its default, itself always +100.
  relate() {
    const n = this.ids.length;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const ra = this.rows[a].relations ?? {};
      const v = a === b ? 100 : ra[this.ids[b]] ?? this.rows[b].relations?.[this.ids[a]] ?? ra['*'] ?? 0;
      this.rel[a * MAX_FACTIONS + b] = Math.max(-100, Math.min(100, v));
    }
  }

  relation(a, b) { const ia = this.index[a], ib = this.index[b]; return ia === undefined || ib === undefined ? 0 : this.rel[ia * MAX_FACTIONS + ib]; }

  // Relations are mutual: setting a→b sets b→a. (Wars and alliances, phase 4, go through here.)
  setRelation(a, b, v) {
    const ra = this.row(a), rb = this.row(b);
    if (!ra || !rb || a === b) return null;
    ra.relations[b] = rb.relations[a] = Math.max(-100, Math.min(100, Math.round(v)));
    this.relate();
    return this.relation(a, b);
  }

  // The standing a faction acts on: what you did, as your roles colour it (clamped to -100..100).
  reading(i) { return Math.max(-100, Math.min(100, this.standing[i] + this.bias[i])); }

  // The roles' bias and override per faction (systems/roles.js apply()). quiet: no tier toasts (a load, a reset).
  setRoleReading(bias, host, quiet = false) {
    for (let i = 0; i < this.ids.length; i++) {
      const b = bias[i] ?? 0, h = host[i] ?? 0;
      if (b === this.bias[i] && h === this.roleHostile[i]) continue;
      this.bias[i] = b; this.roleHostile[i] = h;
      this.retier(i, !quiet);
    }
  }

  retier(i, announce = true) {
    const row = this.rows[i], before = this.tiers[i];
    const t = row.memory === 'none' ? 'hunted' : tierOf(this.reading(i), row.tiers ?? TIERS);
    this.tiers[i] = t;
    const o = row.memory === 'none' ? 0 : this.roleHostile[i];
    this.playerHostile[i] = o > 0 ? 1 : o < 0 ? 0 : t === 'hostile' || t === 'hunted' ? 1 : 0;
    if (announce && before && before !== t) {
      this.g.emit?.('standing', { faction: row.id, name: row.name, standing: Math.round(this.standing[i]), tierFrom: before, tierTo: t });
      const worse = ['hunted', 'hostile', 'wary', 'neutral', 'friendly', 'allied'];
      const down = worse.indexOf(t) < worse.indexOf(before);
      this.g.hud?.toast?.(`${row.name.toUpperCase()}: ${t.toUpperCase()}`, down ? 'hot' : 'job');
    }
    return t;
  }

  // Which faction a character belongs to, from its archetype and where it lives.
  fidFor(c) {
    if (c.fid) return c.fid;
    switch (c.faction) {
      case 'warden': return 'rusthaven';
      case 'raider': return 'dustwolves';
      case 'soldier': return 'remnant';
      case 'zombie': return 'infected';
      case 'player': return null;
      default: return Math.max(Math.abs(c.home?.x ?? c.x), Math.abs(c.home?.z ?? c.z)) < TOWN ? 'rusthaven' : 'drifters';
    }
  }

  assign(c) {
    c.fid = this.fidFor(c);
    c.fi = c.fid && this.index[c.fid] !== undefined ? this.index[c.fid] : -1;
    return c.fi;
  }

  hostileToPlayer(c) { return c.fi >= 0 && this.playerHostile[c.fi] === 1; }
  row(fid) { return this.rows[this.index[fid]]; }

  // How much one unit of `verb` against a member of targetFid moves faction fid's standing.
  value(fid, verb, targetFid) {
    const i = this.index[fid], v = this.rows[i]?.values;
    if (!v) return 0;
    if (targetFid === fid && v[`${verb}:self`] !== undefined) return v[`${verb}:self`];
    if (v[`${verb}:${targetFid}`] !== undefined) return v[`${verb}:${targetFid}`];
    const r = targetFid && this.index[targetFid] !== undefined ? this.rel[i * MAX_FACTIONS + this.index[targetFid]] : 0;
    if (r <= -50 && v[`${verb}:enemy`] !== undefined) return v[`${verb}:enemy`];
    if (r >= 50 && v[`${verb}:friend`] !== undefined) return v[`${verb}:friend`];
    return v[`${verb}:any`] ?? 0;
  }

  // A faction hears about a deed. learn: 1 direct counterparty, cohesion for a rumor, 0.5 for a broadcast.
  learn(fid, verb, targetFid, m, learn = 1, selfDefense = false) {
    const i = this.index[fid], row = this.rows[i];
    if (i === undefined || row.memory === 'none') return 0;
    if (selfDefense && row.forgivesSelfDefense && (verb === 'kill' || verb === 'hurt')) return 0;
    const d = Math.max(-60, Math.min(60, this.value(fid, verb, targetFid) * m * learn));
    if (!d) return 0;
    return this.add(fid, d);
  }

  add(fid, d) {
    const i = this.index[fid];
    if (i === undefined) return 0;
    this.standing[i] = Math.max(-100, Math.min(100, this.standing[i] + d));
    this.lifetime[i] += d;
    this.retier(i);
    return d;
  }

  set(fid, s) { const i = this.index[fid]; if (i === undefined) return; this.lifetime[i] += s - this.standing[i]; this.standing[i] = Math.max(-100, Math.min(100, s)); this.retier(i); }

  // Standing drifts toward rest = start + a quarter of everything you ever did (capped ±40), τ = memoryDays.
  tickHours(h) {
    for (let i = 0; i < this.ids.length; i++) {
      const row = this.rows[i];
      if (row.memory === 'none') continue;
      const rest = row.start + Math.max(-40, Math.min(40, 0.25 * this.lifetime[i]));
      const k = 1 - Math.exp(-h / (HOUR_TAU * Math.max(0.5, row.memoryDays)));
      this.standing[i] += (rest - this.standing[i]) * k;
      this.retier(i);
    }
  }

  view(id) {
    const one = (i) => {
      const r = this.rows[i];
      const rel = {};
      for (let b = 0; b < this.ids.length; b++) if (b !== i) rel[this.ids[b]] = this.rel[i * MAX_FACTIONS + b];
      return { id: r.id, name: r.name, archetype: r.archetype, color: r.color, standing: +this.standing[i].toFixed(1), tier: this.tiers[i], hostileToPlayer: !!this.playerHostile[i],
        reading: +this.reading(i).toFixed(1), roleBias: +this.bias[i].toFixed(1), roleOverride: this.roleHostile[i] > 0 ? 'shoot on sight' : this.roleHostile[i] < 0 ? 'hold fire' : null,
        rest: +(r.start + Math.max(-40, Math.min(40, 0.25 * this.lifetime[i]))).toFixed(1), stars: !!r.stars, leaders: r.leaders, relations: rel,
        wars: Object.keys(rel).filter((k) => rel[k] <= -50), alliances: Object.keys(rel).filter((k) => rel[k] >= 50) };
    };
    if (id) { const i = this.index[id]; return i === undefined ? null : one(i); }
    return this.ids.map((_, i) => one(i));
  }

  save() { return { ids: this.ids, standing: Array.from(this.standing.slice(0, this.ids.length)), lifetime: Array.from(this.lifetime.slice(0, this.ids.length)), rows: this.ids.map((id, i) => (FACTIONS[id] ? null : this.rows[i])) }; }

  load(s) {
    if (!s) return;
    s.ids.forEach((id, k) => {
      if (this.index[id] === undefined && s.rows?.[k]) this.register(id, s.rows[k]); // a pack faction saved with the game
      const i = this.index[id];
      if (i === undefined) return;
      this.standing[i] = s.standing[k]; this.lifetime[i] = s.lifetime?.[k] ?? 0;
      this.retier(i, false);
    });
  }
}

// Hue 270-320 is purple: the art law bans it in any UI or asset.
export function purple(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return false; // grey enough to have no hue
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 270 && h <= 320;
}
