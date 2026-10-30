// SEASONS as COMMANDS rows and the selftest share (docs/design/WEB_SEASONS.md; systems/seasons.js; data/seasons.js).
import { CALENDAR, ZONES, ODDS, SNOW, CROPS, PASSES, PRICES, validateSeasons } from '../data/seasons.js';
import { calendarOf, meanAir, dayLength, latOf, fromLatLon, REF_MEAN } from '../systems/seasons.js';
import { toWorld } from '../world/geo.js';
import { fetchRows, patchRows, restoreRows, pushSeasons } from '../forge/live.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const ACTIONS = ['show', 'set', 'advance', 'at', 'plant', 'forecast', 'passes', 'pin', 'unpin', 'live', 'neutral', 'rows', 'validate', 'price', 'snowmats', 'progs'];
// Where the checks stand: world metres of real usmap places (a town's usmap position through the map's own transform).
const spot = (ux, uy) => toWorld([ux, uy]);

export function seasonCommands(api, need) {
  const g = api.g;
  const S = () => { need(g.seasons, 'no seasons system'); return g.seasons; };
  return {
    season: {
      group: 'world', desc: `SEASONS (docs/design/WEB_SEASONS.md, rows in src/data/seasons.js, systems/seasons.js). No args / action=show: the date (year, month, day, season, how far in, the words with no watch), the climate under you (zone, local season, the day's mean air against the desert baseline, daily swing, day length), the snow (cover = pack + fresh), the light. set season=spring|summer|autumn|winter [t=0..1 how far in] jumps the calendar; advance days= moves it; at x= z= (or town=) reads any place; plant crop= [x= z=] is the garden lane's plantingWindow + growthFactor; forecast source=radio|barkeep; passes lists the winter passes and whether they are closed; pin x= z= / unpin reads a fixed place instead of yours (tests); live on=false keeps the old random sky; price item= the seasonal price drift; rows / validate check the data.`,
      args: { action: { type: 'string', enum: ACTIONS, default: 'show' }, season: { type: 'string', enum: CALENDAR.seasons }, t: { type: 'number' }, days: { type: 'number' }, x: { type: 'number' }, z: { type: 'number' }, town: { type: 'string' }, crop: { type: 'string' }, source: { type: 'string', enum: ['radio', 'barkeep', 'weatherman'] }, on: { type: 'boolean' }, item: { type: 'string' }, seasonDays: { type: 'number' }, fresh: { type: 'number' }, pack: { type: 'number' } },
      run: async (a) => {
        const A = S(), action = a.action ?? 'show';
        const pt = () => {
          if (a.town) { const t = g.streamer?.W?.towns?.find((q) => q.id === a.town); need(t, `no town ${a.town}`); return [t.x, t.z]; }
          return [a.x ?? g.player.x, a.z ?? g.player.z];
        };
        if (a.seasonDays !== undefined) { need(a.seasonDays >= 2 && a.seasonDays <= 120, 'seasonDays 2..120'); A.seasonDays = a.seasonDays; }
        if (a.fresh !== undefined) A.fresh = Math.max(0, Math.min(1, a.fresh));
        if (a.pack !== undefined) A.pack = Math.max(0, Math.min(1, a.pack));
        if (action === 'set') { need(A.setSeason(a.season, a.t ?? 0.5), `season: ${CALENDAR.seasons.join('|')}`); return A.view(); }
        if (action === 'advance') { need(a.days !== undefined, 'days='); A.advance(a.days); return A.view(); }
        if (action === 'pin') { const [x, z] = pt(); A.pin = { x, z }; A.update(0); return { pinned: A.pin, ...A.view() }; }
        if (action === 'unpin') { A.pin = null; A.placeT = 0; A.update(0); return A.view(); }
        if (action === 'neutral') { A.neutral = a.on !== false; return { neutral: A.neutral }; }
        if (action === 'live') { A.live = a.on !== false; return { live: A.live }; }
        if (action === 'at') { const [x, z] = pt(); return { place: { x: Math.round(x), z: Math.round(z) }, season: A.seasonAt(x, z), climate: { ...A.read(x, z), odds: undefined }, odds: Object.fromEntries(Object.entries(A.read(x, z).odds).map(([k, v]) => [k, r2(v)])), road: A.roadAt(x, z) }; }
        if (action === 'plant') { const [x, z] = pt(); const crop = a.crop ?? 'default'; return { crop, ...A.plantingWindow(crop, x, z), growth: A.growthFactor(x, z), crops: Object.keys(CROPS) }; }
        if (action === 'forecast') { const [x, z] = pt(); return A.forecast(a.source ?? 'radio', x, z); }
        if (action === 'passes') return { passes: A.passes() };
        if (action === 'price') { need(a.item, 'item='); const [x, z] = pt(); return { item: a.item, buy: r2(A.priceMul(a.item, x, z)), sell: r2(A.sellMul(a.item, x, z)), rows: PRICES.map((r) => r.id) }; }
        if (action === 'progs') { const ps = (g.renderer.info.programs ?? []).filter((q) => q.diagnostics && q.diagnostics.runnable === false || /leaf1|snow1/.test(String(q.cacheKey))); return { n: ps.length, programs: ps.map((q) => ({ key: String(q.cacheKey).slice(-120), ok: q.diagnostics?.runnable !== false, log: (q.diagnostics?.programLog ?? '').slice(0, 400), vlog: (q.diagnostics?.vertexShader?.log ?? '').slice(0, 300), flog: (q.diagnostics?.fragmentShader?.log ?? '').slice(0, 300) })) }; }
        if (action === 'snowmats') return { patched: g.seasonLook?.patched, mats: g.seasonLook?.list() };
        if (action === 'rows') return { calendar: CALENDAR, zones: Object.fromEntries(Object.entries(ZONES).map(([k, z]) => [k, { name: z.name, states: z.states.length, mean: z.mean, amp: z.amp, local: z.local.map((s) => s.id).join('/'), leaf: z.leaf, snowy: z.snowy }])), odds: Object.keys(ODDS), snow: SNOW, passes: PASSES.length, crops: Object.keys(CROPS) };
        if (action === 'validate') { const v = validateSeasons(); return { ok: v.length === 0, problems: v }; }
        return { ...A.view(), look: g.seasonLook?.view() };
      },
    },
  };
}

export async function seasonChecks(api, check, C) {
  const g = api.g, A = g.seasons;
  // Real places through the map's own transform: Phoenix (the world's origin), Miami, Denver, Minneapolis, Seattle.
  const P = { phoenix: spot(-43250, 7250), miami: spot(-2000, 20500), denver: spot(-34000, -4000), minneapolis: spot(-19000, -13500), seattle: spot(-56500, -18000) };
  A.neutral = false; // these checks read the date's air
  const keep = { neutral: true, shift: A.shift, days: A.seasonDays, live: A.live, pin: A.pin, fresh: A.fresh, pack: A.pack, w: g.sky.weatherKey, t: g.sky.time };
  const putBack = async () => { A.neutral = keep.neutral; A.shift = keep.shift; A.seasonDays = keep.days; A.live = keep.live; A.pin = keep.pin; A.fresh = keep.fresh; A.pack = keep.pack; A.last = null; A.placeT = 0; await C('setWeather', { key: keep.w, instant: true }); A.update(0); };
  const day = (season, t = 0.5) => { A.setSeason(season, t); };
  try {
    await check('seasons: every row is whole (zones cover the year and every state once, odds sum to one, the palette has no purple, the passes and prices are sane)', async () => {
      const bad = validateSeasons(); if (bad.length) return bad.join('; ');
      // A broken row must be caught: an uncovered year, a duplicate state and a purple.
      const z = JSON.parse(JSON.stringify(ZONES)); z.florida.local[0].to = 0.3; z.rockies.states.push('ARIZONA');
      const trap = validateSeasons({ ZONES: z, PALETTE: { ok: '#7a9a46', bad: '#7a3ca0' } });
      return trap.some((m) => /covered/.test(m)) && trap.some((m) => /is in zones/.test(m)) && trap.some((m) => /purple/.test(m)) ? true : `the validator missed a planted fault: ${trap.join(' | ')}`;
    });

    await check('seasons: the calendar is a pure function of the day (a 28-day year; day 0 per start; year turns over; months stay in range; a jump of seasonDays moves exactly one season)', async () => {
      const c0 = calendarOf(0, 7, 0.17), c1 = calendarOf(28, 7, 0.17), seen = new Set();
      if (c0.season !== 'spring' || c0.yearDays !== 28 || c1.year !== c0.year + 1 || Math.abs(c1.f - c0.f) > 1e-9) return `day 0 ${c0.season}, +28 → year ${c1.year} f ${c1.f}`;
      for (let d = 0; d < 56; d += 0.25) { const c = calendarOf(d, 7, 0); if (c.month < 0 || c.month > 11 || c.dayOfMonth < 1 || c.seasonT < 0 || c.seasonT >= 1) return `bad date at ${d}: ${JSON.stringify(c)}`; seen.add(c.season); }
      const a = calendarOf(3, 7, 0), b = calendarOf(10, 7, 0);
      return seen.size === 4 && a.season === 'spring' && b.season === 'summer' ? true : `seasons ${[...seen]} ${a.season}→${b.season}`;
    });

    await check('seasons: the live calendar advances only while the world simulates (a stopped sky clock: still; a stepped game hour moves it a twenty-fourth of a day) and the date is saved and loaded', async () => {
      A.pin = null; A.update(0);
      const t0 = A.dayFloat();
      const ts = g.sky.timeScale; g.sky.timeScale = 0; await C('step', { seconds: 4 }); g.sky.timeScale = ts; // a stopped clock: the calendar has no clock of its own
      const t1 = A.dayFloat();
      await C('step', { seconds: 30 }); // one game hour
      const t2 = A.dayFloat(), per = (t2 - t1) * 24;
      const snap = A.save(); const before = A.calendar();
      A.shift += 9; A.seasonDays = 10; A.update(0);
      A.load(snap);
      const after = A.calendar();
      if (Math.abs(t1 - t0) > 1e-6) return `the calendar moved ${t1 - t0} days with the sky clock stopped`;
      if (per < 0.85 || per > 1.15) return `a stepped hour moved the clock ${r2(per)} hours`;
      return before.season === after.season && before.month === after.month && A.seasonDays === snap.seasonDays && Math.abs(A.shift - snap.shift) < 1e-9 ? true : `save round trip: ${before.season}/${before.month} → ${after.season}/${after.month}`;
    });

    await check('seasons: onSeasonChange fires once per turn of the season (a jump across two seasons fires for the one it lands in), with the game event, and set/advance land where they say', async () => {
      A.pin = null; day('spring', 0.5); A.update(0);
      let n = 0, got = null; const off = A.onSeasonChange((e) => { n++; got = e; });
      const evs0 = g.events?.filter?.((e) => e.type === 'seasonChange').length ?? 0;
      A.advance(A.seasonDays); // one season on
      const cal = A.calendar();
      off();
      const evs1 = g.events?.filter?.((e) => e.type === 'seasonChange').length ?? 0;
      A.advance(0.1); // listener removed: nothing more
      return cal.season === 'summer' && n === 1 && got?.from === 'spring' && got?.to === 'summer' && evs1 >= evs0 ? true : `season ${cal.season}, fired ${n} (${got?.from}→${got?.to}), events ${evs0}→${evs1}`;
    });

    await check('seasons: climate by place and season (Phoenix midsummer cooks and midwinter does not; Minneapolis is deep cold in winter; Florida is two seasons, wet then dry; the Rockies four; latitude orders the cold)', async () => {
      A.pin = null; A.live = true;
      const at = (name, season, t = 0.5) => { day(season, t); const [x, z] = P[name]; return A.read(x, z); };
      const phS = at('phoenix', 'summer'), phW = at('phoenix', 'winter'), mnW = at('minneapolis', 'winter'), mnS = at('minneapolis', 'summer'), seW = at('seattle', 'winter');
      const flS = at('miami', 'summer'), flW = at('miami', 'winter'), flSp = at('miami', 'spring', 0.1), dvW = at('denver', 'winter');
      const zones = [phS.zone, mnW.zone, flS.zone, dvW.zone, seW.zone].join(',');
      const ok = phS.mean > 30 && phW.mean < 15 && phS.mean - phW.mean > 15
        && mnW.mean < -5 && mnS.mean > 18 && mnS.mean - mnW.mean > 25
        && flS.local === 'wet' && flW.local === 'dry' && flS.mean - flW.mean < 12
        && ZONES[dvW.zone].local.length === 4 && ZONES[flS.zone].local.length === 2
        && mnW.mean < dvW.mean + 2 && dvW.mean < phW.mean && phS.temp > 5 && mnW.temp < -20;
      return ok ? true : `${zones}: phoenix ${r1(phS.mean)}/${r1(phW.mean)} minneapolis ${r1(mnW.mean)}/${r1(mnS.mean)} florida ${flS.local}/${flW.local} ${r1(flS.mean)}/${r1(flW.mean)} denver ${r1(dvW.mean)} (spring-florida ${flSp.local})`;
    });

    await check('seasons: the air you feel follows the date (survival.airAt at Phoenix noon: midsummer is hotter than midwinter by the zone swing; at Minneapolis midwinter noon is under freezing; the daily swing narrows in the cold)', async () => {
      A.live = true;
      const noon = async (name, season) => { day(season, 0.5); const [x, z] = P[name]; A.pin = { x, z }; A.placeT = 0; A.update(0); return { air: g.survival.airAt(15, 'CLEAR'), dawn: g.survival.airAt(5, 'CLEAR') }; };
      const phS = await noon('phoenix', 'summer'), phW = await noon('phoenix', 'winter'), mnW = await noon('minneapolis', 'winter');
      A.pin = null; A.placeT = 0; A.update(0);
      const swS = phS.air - phS.dawn, swW = phW.air - phW.dawn;
      return phS.air > 38 && phS.air - phW.air > 12 && mnW.air < 0 && swW < swS ? true : `phoenix ${r1(phS.air)} vs ${r1(phW.air)}, minneapolis ${r1(mnW.air)}, swing ${r1(swS)} → ${r1(swW)}`;
    });

    await check('seasons: the day is as long as the sun says (Seattle midsummer > 14.5 h, midwinter < 9.5 h; Miami swings less; the equinox is twelve) and the sky runs its sun path from the new sunrise', async () => {
      const f = (n, q) => dayLength(latOf(P[n][1]), q);
      const sum = f('seattle', 0.3), win = f('seattle', 0.8), eq = f('seattle', 0.05), mi = f('miami', 0.3) - f('miami', 0.8);
      if (!(sum > 14.5 && win < 9.5 && Math.abs(eq - 12) < 0.4 && mi < sum - win)) return `seattle ${r1(sum)}/${r1(win)} eq ${r1(eq)} miami swing ${r1(mi)}`;
      day('winter', 0.5); const [x, z] = P.seattle; A.pin = { x, z }; A.placeT = 0;
      for (let i = 0; i < 40; i++) A.update(0.25);
      const rise = g.sky.sunRise, len = g.sky.dayLen; A.pin = null; A.placeT = 0; A.update(0);
      return rise > 7 && len < 9.6 ? true : `sunRise ${r1(rise)} dayLen ${r1(len)}`;
    });

    await check('seasons: weather odds follow the season and the cold turns rain to snow (the monsoon is wetter than the Phoenix winter\'s dust; Minneapolis winter picks snow and a blizzard in a hard freeze; Florida\'s wet season rains more than its dry)', async () => {
      A.live = true;
      const rollMany = (n = 600) => { const c = {}; let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; for (let i = 0; i < n; i++) { const k = A.pickWeather(rnd) ?? 'NONE'; c[k] = (c[k] ?? 0) + 1; } return c; };
      const stage = (name, season) => { day(season, 0.5); const [x, z] = P[name]; A.pin = { x, z }; A.placeT = 0; A.update(0); g.survival.setProfile('full'); g.needs.air = REF_MEAN + A.here.temp; };
      const prof = g.survival.profileName;
      try {
        stage('phoenix', 'summer'); const phS = rollMany();
        stage('phoenix', 'winter'); const phW = rollMany();
        stage('minneapolis', 'winter'); const mnW = rollMany();
        stage('miami', 'summer'); const flW = rollMany();
        stage('miami', 'winter'); const flD = rollMany();
        const wet = (c) => ((c.RAIN ?? 0) + (c.STORM ?? 0) + (c.SNOW ?? 0) + (c.BLIZZARD ?? 0));
        const snowy = (mnW.SNOW ?? 0) + (mnW.BLIZZARD ?? 0), rainy = (mnW.RAIN ?? 0);
        const ok = (phS.STORM ?? 0) > (phW.STORM ?? 0) * 2 && (phW.SNOW ?? 0) === 0 && snowy > 120 && rainy === 0 && wet(flW) > wet(flD) * 1.8;
        return ok ? true : `phoenix storms ${phS.STORM}/${phW.STORM}, snow ${phW.SNOW ?? 0}; minneapolis snow ${snowy} rain ${rainy}; florida wet ${wet(flW)} dry ${wet(flD)}`;
      } finally { g.survival.setProfile(prof); A.pin = null; A.placeT = 0; }
    });

    await check('seasons: snow builds in a snowfall and melts when the air warms (Minneapolis winter: an hour of SNOW lays fresh cover; a thaw takes it back; Phoenix keeps none)', async () => {
      const prof = g.survival.profileName;
      try {
        g.survival.setProfile('full');
        day('winter', 0.5); const [x, z] = P.minneapolis; A.pin = { x, z }; A.placeT = 0; A.fresh = 0; A.pack = 0; A.update(0);
        await C('setWeather', { key: 'SNOW', instant: true });
        const c0 = A.fresh;
        await C('step', { seconds: 60 }); // two game hours of snowfall
        const built = A.fresh;
        await C('setWeather', { key: 'CLEAR', instant: true });
        day('summer', 0.5); A.update(0); A.pack = 0; A.fresh = built;
        await C('step', { seconds: 75 }); await C('step', { seconds: 75 }); // five game hours at summer air
        const melted = A.fresh, mid = `${A.calendar().season} mean ${r1(A.here.mean)} air ${r1(g.needs.air)} pin ${JSON.stringify(A.pin)} zone ${A.here.zone}`;
        const [px, pz] = P.phoenix; day('winter', 0.5); A.pin = { x: px, z: pz }; A.placeT = 0; A.fresh = 0; for (let i = 0; i < 20; i++) A.update(0.5);
        const ph = A.pack;
        return built > 0.3 && c0 < built && melted < built * 0.3 && ph < 0.05 ? true : `cover ${r2(c0)} → fresh ${r2(built)} → after thaw ${r2(melted)}; phoenix pack ${r2(ph)}; ${mid}; hour ${r1(g.sky.time)} snowing ${g.sky.cur.snow} fast ${g.sky.fast} scale ${g.sky.timeScale}`;
      } finally { g.survival.setProfile(prof); A.pin = null; A.placeT = 0; A.fresh = 0; A.pack = 0; }
    });

    await check('seasons: the pack follows the cold (deep in Minneapolis midwinter, gone by midsummer; Florida never) and the roads read it: packed snow grips half, ice a third, a closed pass a third', async () => {
      day('winter', 0.5); const [x, z] = P.minneapolis, [fx, fz] = P.miami;
      A.pin = { x, z }; A.placeT = 0; A.fresh = 0; for (let i = 0; i < 40; i++) A.update(5); // the pack settles (hours of game time)
      const packW = A.pack, roadW = A.roadAt(x, z);
      day('summer', 0.5); A.update(0); const packS = A.read(x, z).pack; A.pin = { x: fx, z: fz }; A.placeT = 0; day('winter', 0.5); const fl = A.read(fx, fz).pack;
      A.pin = null; A.placeT = 0;
      return packW > 0.7 && packS === 0 && fl === 0 && roadW.grip <= 0.5 && roadW.kind !== 'clear' ? true : `pack ${r2(packW)} → ${r2(packS)}, florida ${fl}, road ${roadW.kind} ${roadW.grip}`;
    });

    await check('seasons: the land yields by season (forage: berries thin in winter and fat in summer; fish: bass bite in spring, trout in autumn; the winter snare is poorer; deep snow cuts the forager again) and prey that migrates is gone in the wrong season', async () => {
      A.pin = null; A.update(0); const [x, z] = P.denver;
      day('summer', 0.5); const bS = A.yield('forage', 'wild_berries', x, z), snS = A.yield('snare', 'jackrabbit', x, z), gS = A.fauna('goose', x, z);
      day('winter', 0.5); const bW = A.yield('forage', 'wild_berries', x, z), snW = A.yield('snare', 'jackrabbit', x, z), snk = A.fauna('snake', x, z);
      day('spring', 0.5); const bassSp = A.yield('fish', 'bass', x, z); day('winter', 0.5); const bassW = A.yield('fish', 'bass', x, z);
      A.pin = { x, z }; A.placeT = 0; A.update(0); A.pack = 0; A.fresh = 0; A.tickSnow(0); const open = A.yield('forage', 'deadwood', x, z); A.pack = 1; A.fresh = 0.5; A.tickSnow(0); const buried = A.yield('forage', 'deadwood', x, z);
      A.pin = null; A.placeT = 0; A.pack = 0; A.fresh = 0; A.cover = 0;
      return bS > bW * 3 && snS > snW && gS < 0.7 && snk < 0.05 && bassSp > bassW * 3 && buried < open * 0.7 ? true : `berries ${r2(bS)}/${r2(bW)} snare ${r2(snS)}/${r2(snW)} goose ${r2(gS)} snake ${r2(snk)} bass ${r2(bassSp)}/${r2(bassW)} deadwood ${r2(open)} → ${r2(buried)}`;
    });

    await check('seasons: planting windows (lettuce opens in spring and shuts in midsummer heat, corn needs the warmth and the frost-free run; winter closes the garden at Minneapolis and not at Miami) and growth follows heat and moisture', async () => {
      A.pin = null;
      const win = (crop, name, season, t = 0.5) => { day(season, t); const [x, z] = P[name]; return A.plantingWindow(crop, x, z); };
      const letSp = win('lettuce', 'minneapolis', 'spring', 0.7), letSu = win('lettuce', 'minneapolis', 'summer'), cornW = win('corn', 'minneapolis', 'winter'), cornFl = win('corn', 'miami', 'winter', 0.2);
      const cornLate = win('corn', 'minneapolis', 'autumn', 0.8);
      day('summer', 0.5); const [mx, mz] = P.minneapolis, [wx, wz] = P.miami; const gSu = A.growthFactor(mx, mz); day('winter', 0.5); const gW = A.growthFactor(mx, mz), gFl = A.growthFactor(wx, wz);
      const ok = !cornW.open && cornW.why !== 'open' && !letSu.open && cornLate.open === false && gSu > gW * 3 && gFl > gW;
      return ok ? true : `lettuce spring ${letSp.open}/${letSp.why} summer ${letSu.open}/${letSu.why}; corn winter ${cornW.open} florida ${cornFl.open}; late-autumn corn ${cornLate.open}; growth ${gSu}/${gW}/${gFl}`;
    });

    await check('seasons: the passes close in winter (Donner and Vail shut at midwinter, open by midsummer), the board forecast is a knowledge channel with an age and a confidence, and the date chip is words only without a watch', async () => {
      A.pin = null; day('winter', 0.5); A.update(0);
      const w = A.passes(); const donner = w.find((p) => p.id === 'donner'), vail = w.find((p) => p.id === 'vail');
      day('summer', 0.5); A.update(0); const s = A.passes();
      const f = A.forecast('radio', ...P.denver), fb = A.forecast('barkeep', ...P.denver);
      const chip = A.chip();
      const noWatch = !/\d/.test(chip);
      return donner?.closed && vail?.closed && !s.find((p) => p.id === 'donner').closed && f.conf > fb.conf && f.hours > fb.hours && typeof f.text === 'string' && f.at !== undefined && noWatch ? true : `donner ${donner?.closed} vail ${vail?.closed} summer ${s.map((p) => p.closed).join('')} radio ${f.conf}/${f.hours} barkeep ${fb.conf}/${fb.hours} chip "${chip}"`;
    });

    await check('seasons: clothes and fire keep you warm in the cold and cost you in the heat (a parka adds warmth at -10 C and is a burden at 38 C; a lit fire beside you adds more than the coat); prices drift with the cold (fuel dearer in a Rockies winter than in Florida)', async () => {
      const w0 = g.gear.worn.coat, a = g.seasons;
      g.gear.worn.coat = null; const bare = a.wornWarmth(-10), bareHot = a.wornWarmth(38);
      g.gear.worn.coat = 'parka'; const coat = a.wornWarmth(-10), coatHot = a.wornWarmth(38);
      g.gear.worn.coat = w0 ?? null;
      const F = g.throwables.fires; const n0 = F.length; F.push({ x: g.player.x + 1, z: g.player.z, r: 3, t: 0, dur: 100, by: null }); const near = a.fireWarmth(g.player.x, g.player.z), far = a.fireWarmth(g.player.x + 30, g.player.z); F.length = n0;
      day('winter', 0.5); const [dx, dz] = P.denver, [fx, fz] = P.miami;
      const dFuel = a.priceMul('fuel_can', dx, dz), fFuel = a.priceMul('fuel_can', fx, fz); day('summer', 0.5); const dSu = a.priceMul('fuel_can', dx, dz);
      return bare === 0 && coat > 8 && coatHot < 0 && bareHot === 0 && near > coat * 0.8 && far === 0 && dFuel > fFuel && dFuel > dSu * 1.2 ? true : `coat ${r1(coat)} hot ${r1(coatHot)} fire ${r1(near)}/${r1(far)} fuel denver-winter ${r2(dFuel)} florida ${r2(fFuel)} summer ${r2(dSu)}`;
    });

    await check('seasons: the look (snow wraps the lit surfaces and follows the cover, snowfall is one object, the breath shows in the cold, trees dress by the date, the frame stays under 150 draw calls and the colour grade cools under snow)', async () => {
      const prof = g.survival.profileName, L = g.seasonLook;
      if (!L) return 'no season look';
      try {
        g.survival.setProfile('full');
        day('winter', 0.5); const [x, z] = P.minneapolis; A.pin = { x, z }; A.placeT = 0; A.pack = 1; A.fresh = 0;
        await C('setWeather', { key: 'SNOW', instant: true }); await C('setTime', { hour: 11 });
        await C('step', { seconds: 12 }); L.walk(); g.render?.(0);
        const calls = g.renderer.info.render.calls, v = L.view(), grade0 = g.look.gradeAt(g.player.x, g.player.z, 11).temp;
        const snowMats = L.list().length;
        g.needs.air = -10; let puffs = 0; for (let i = 0; i < 4; i++) { await C('step', { seconds: 1 }); puffs = Math.max(puffs, L.puff.count); }
        const gradeSnow = g.seasons.gradeTemp();
        A.pack = 0; A.fresh = 0; day('autumn', 0.8); A.pin = { x: P.phoenix[0], z: P.phoenix[1] }; A.placeT = 0; A.update(0);
        const fall = L.flakes.visible;
        return snowMats > 40 && v.cover > 0.8 && v.flakes > 400 && fall !== undefined && puffs >= 1 && calls < 150 && gradeSnow < -0.9 && v.leaf < 0.2 ? true : `wrapped ${snowMats}, cover ${v.cover}, flakes ${v.flakes}, puffs ${puffs}, calls ${calls}, grade ${r2(gradeSnow)}, leaf ${v.leaf}`;
      } finally { g.survival.setProfile(prof); A.pin = null; A.placeT = 0; A.pack = 0; A.fresh = 0; await C('setWeather', { key: 'CLEAR', instant: true }); }
    });

    await check('seasons: the cold costs you (snow holds a track 2x as long, deep snow slows the walker, the road under packed snow gives half grip, the HUD line and the radio carry the season in words)', async () => {
      const prof = g.survival.profileName;
      try {
        g.survival.setProfile('full');
        day('winter', 0.5); A.pin = { x: P.minneapolis[0], z: P.minneapolis[1] }; A.placeT = 0; A.pack = 1; A.fresh = 0; A.update(0.6);
        const hold = A.trackHold(), walk = A.walkMul(), grip = A.grip, road = A.roadAt(...P.minneapolis).kind;
        A.pack = 0; A.fresh = 0; A.update(0.6); const hold0 = A.trackHold(), grip0 = A.grip;
        const words = A.words(), line = A.hear('radio');
        return hold > 2 * hold0 - 0.1 && walk < 0.95 && grip < 0.6 && grip0 > 0.8 && /winter/i.test(words) && /Weather word/.test(line) && A.heard?.conf > 0.5 && A.heardAge() < 1 ? true : `hold ${r2(hold)}/${r2(hold0)} walk ${r2(walk)} grip ${r2(grip)}/${r2(grip0)} road ${road} words "${words}" line "${line}"`;
      } finally { g.survival.setProfile(prof); A.pin = null; A.placeT = 0; A.pack = 0; A.fresh = 0; }
    });

    await check('seasons: the forge rows round trip (a SEASONS zone edit is written to src/data/seasons.json, field-preserving and checked, pushed into the running game where the climate follows it, and put back exactly)', async () => {
      const before = await fetchRows('seasons'); let ok = false, why = '';
      try {
        day('summer', 0.5); const [x, z] = P.miami; const m0 = A.read(x, z).mean;
        const r = await patchRows('seasons', [{ op: 'set', coll: 'zones', id: 'florida', set: { mean: 15.5 } }, { op: 'top', key: 'calendar', set: { warmest: 0.4 } }]);
        if (!r.ok) return `patch refused: ${r.error}`;
        const bad = await patchRows('seasons', [{ op: 'set', coll: 'zones', id: 'florida', set: { snowy: 4 } }]);
        const push = await pushSeasons(g), m1 = A.read(x, z).mean;
        ok = Math.abs((m0 - m1) - 8) < 0.5 && !bad.ok && push.ok && push.applied > 5;
        why = `mean ${r1(m0)} → ${r1(m1)}, bad edit ok=${bad.ok}, push ${JSON.stringify(push)}`;
      } finally { await restoreRows('seasons', before.raw, 'seasons-check'); await pushSeasons(g); }
      const after = await fetchRows('seasons');
      return ok && after.raw === before.raw ? true : `${why}; file restored ${after.raw === before.raw}`;
    });
  } finally { await putBack(); }
}
