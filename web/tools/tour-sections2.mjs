// The photo tour's in-play sections (tools/tour.mjs): vehicles, a fight, the infected, kit, places, terrain.
// Same shape as tour-sections.mjs: { id, title, blurb, steps: [{ name, caption, run(t) }] }.
export default ({ Skip, zoom }) => {
  const SECTIONS = [];
  // Stand somewhere, set the camera zoom and let the streamer lay the chunks out.
  const at = async (t, x, z, level = 'STREET') => { await t.need('teleport', { x, z }); await zoom(t, level); await t.step(2); };
  const town = async (t, name, level = 'STREET') => { await t.need('teleport', { town: name }); await zoom(t, level); await t.step(2.5); };
  const mile = async (t, m, road = 'I-10', dir, level = 'WIDE') => { await t.need('teleport', { mile: m, road, ...(dir ? { dir } : {}) }); await zoom(t, level); await t.step(3); };
  // A generated town (its alleys, drains and bars are built when you stand in it): stamped in open ground and stood in.
  const anyTown = async (t, level = 'STREET', archetype = 'sonoran_sprawl') => {
    const r = await t.call('citygen', { action: 'stamp', archetype, at: '2600,-2600', seed: 7, teleport: true });
    if (r?.ok === false) throw new Skip(`citygen stamp ${archetype}: ${r.error ?? 'refused'}`);
    await zoom(t, level); await t.step(8); return r;
  };
  // The game camera tipped up off straight-down so relief reads (the same camera, a lower pitch and a longer arm).
  const oblique = async (t, d = 90, theta = 0.95) => { await t.call('camera', { d, theta, cut: true, settle: true }); await t.step(1.5); };
  const home = (t, level = 'STREET') => at(t, 0, -40, level); // Rust Haven, Central Ave (where a new game stands)
  const car = (t, type, x = 6, z = -40, opts = {}) => t.need('spawnVehicle', { type, x, z, ...opts });
  const drive = async (t, type, secs = 2.2, throttle = 1) => { const v = await car(t, type); await t.need('enterVehicle', { id: v.id, force: true }); await zoom(t, 'STREET'); await t.call('drive', { throttle, seconds: secs }); return v; };
  const foes = (t, kind, n, x = 14, z = -40, extra = {}) => t.need('spawn', { kind, count: n, x, z, ...extra });
  const breed = (t, kind, n = 3, x = 4, z = -40) => Promise.all(Array.from({ length: n }, (_, i) => t.need('infected', { kind, x: x + i * 2.2, z })));
  const night = (t, hour = 23.5) => t.call('setTime', { hour });

  // ======================================================================================== VEHICLES
  SECTIONS.push({
    id: 'vehicles', title: 'Vehicles', blurb: 'Driving a car, a boat on waves, riders on a pickup bed, bikes, the big rigs and the trundle.',
    steps: [
      { name: 'car-driving', caption: 'DRIVING a LAWMAN interceptor flat out down Central Ave, the driving camera pulled out.', run: async (t) => { await drive(t, 'interceptor', 2.4); } },
      { name: 'car-night', caption: 'DRIVING at night: headlight cones, the dark world, the night HUD.', run: async (t) => { await night(t); await drive(t, 'interceptor', 2.4); } },
      { name: 'car-storm', caption: 'DRIVING in a STORM: rain, spray, low grip.', run: async (t) => { await t.call('setWeather', { key: 'STORM', instant: true }); await drive(t, 'interceptor', 2.4); await t.step(1); } },
      { name: 'boat-waves', caption: 'A BOAT on waves: the airboat running the lake east of Rust Haven, chop and wake.', run: async (t) => {
        await t.need('teleport', { x: 360, z: 382 }); const v = await car(t, 'airboat', 380, 398); await t.need('enterVehicle', { id: v.id, force: true });
        await zoom(t, 'STREET'); await t.call('drive', { throttle: 1, steer: 0.3, seconds: 3 }); } },
      { name: 'boat-gunboat', caption: 'The RAIDER GUNBOAT on the same water: a bigger hull and a deck you can stand on.', run: async (t) => {
        await t.need('teleport', { x: 360, z: 382 }); await zoom(t, 'STREET'); const v = await car(t, 'gunboat', 392, 400); await t.need('enterVehicle', { id: v.id, force: true }); await t.step(2); } },
      { name: 'pickup-bed-rider', caption: 'A PICKUP-BED RIDER: standing on the pickup\'s walkable bed deck (the floor rides with the truck).', run: async (t) => {
        const v = await car(t, 'pickup'); await t.need('deck', { id: v.id, mount: 'player', force: true }); await zoom(t, 'CLOSE'); await t.step(1); } },
      { name: 'pickup-bed-moving', caption: 'The same pickup with a driver at speed and the rider crouched in the bed.', run: async (t) => {
        const v = await car(t, 'pickup', 6, -40, { withDriver: true, ai: 'traffic' }); await t.need('deck', { id: v.id, mount: 'player', force: true }); await t.call('crouch', { on: true }); await zoom(t, 'CLOSE'); await t.step(2.5); } },
      { name: 'van-roof', caption: 'A VAN\'s roof deck (ladder at the back) over the cargo box.', run: async (t) => { const v = await car(t, 'van'); await t.need('deck', { id: v.id, mount: 'player', force: true, roof: true }); await zoom(t, 'CLOSE'); await t.step(1); } },
      { name: 'rv-coach', caption: 'The RV: a coach you can walk through, with a camp kit inside.', run: async (t) => { const v = await car(t, 'rv'); await t.need('deck', { id: v.id, mount: 'player', force: true }); await zoom(t, 'CLOSE'); await t.step(1); } },
      { name: 'trundle-bus', caption: 'THE TRUNDLE (SUN LINE bus): its aisle.', run: async (t) => { const v = await car(t, 'bus'); await t.need('deck', { id: v.id, mount: 'player', force: true }); await zoom(t, 'CLOSE'); await t.step(1); } },
      { name: 'motorcycle', caption: 'A MOTORCYCLE at speed: the rider in the saddle.', run: async (t) => { await drive(t, 'bike', 2.2); } },
      { name: 'atv', caption: 'An ATV.', run: async (t) => { await drive(t, 'atv', 2.2); } },
      { name: 'dune-buggy', caption: 'A DUNE BUGGY in the open desert.', run: async (t) => { await mile(t, 20, 'I-10', 'east', 'STREET'); await drive(t, 'buggy', 2.2); } },
      { name: 'whaler', caption: 'THE WHALER: the harpoon turret and the big hull.', run: async (t) => { await drive(t, 'rig', 2.0, 0.6); } },
      { name: 'apc', caption: 'The ARMORED CARRIER.', run: async (t) => { await drive(t, 'apc', 2.0, 0.6); } },
      { name: 'rat-rod', caption: 'A RAT ROD.', run: async (t) => { await drive(t, 'rat_rod', 2.2); } },
      { name: 'semi-with-car', caption: 'A SEMI with a car riding on its trailer.', run: async (t) => {
        const r = await t.call('spawnVehicle', { type: 'semi', x: 6, z: -40 });
        if (r?.ok === false) throw new Skip('no `semi` vehicle on main yet: the semis lane (branch feat/web-semis) is not merged');
        await car(t, 'sedan', 6, -46); await zoom(t, 'STREET'); await t.step(2); } },
    ],
  });

  // ======================================================================================== COMBAT
  SECTIONS.push({
    id: 'combat', stage: [250, 250], freshEach: true, title: 'On foot and in a fight', blurb: 'Postures, a firefight with tracers, melee, thrown weapons and the explosion that follows.',
    steps: [
      { name: 'crouch', caption: 'CROUCHED: slower, quieter, harder to spot.', run: async (t) => { await zoom(t, 'CLOSE'); await t.need('crouch', { on: true }); await t.step(1); } },
      { name: 'prone', caption: 'PRONE: flat on the road behind the gun.', run: async (t) => { await zoom(t, 'CLOSE'); await t.need('prone', { on: true }); await t.step(1.5); } },
      { name: 'firefight-tracers', caption: 'A FIREFIGHT with tracers: the SMG against four armed Dustwolf raiders, rounds in the air.', run: async (t) => {
        await t.call('equip', { weapon: 'smg' }); await zoom(t, 'STREET'); await foes(t, 'raider', 4, 2, -66, { angry: true });
        await t.step(1.2); await t.call('fire', { id: 'hostile', shots: 4 }); await t.step(0.04); } },
      { name: 'firefight-aftermath', caption: 'After the shooting: blood, gibs and the dead in the road.', run: async (t) => {
        await t.call('equip', { weapon: 'smg' }); await zoom(t, 'CLOSE'); await foes(t, 'raider', 3, 10, -50, { angry: true });
        await t.call('engage', { seconds: 6 }); await t.step(1); } },
      { name: 'melee', caption: 'HAND TO HAND: a punch landing on a raider.', run: async (t) => {
        await zoom(t, 'CLOSE'); await foes(t, 'raider', 1, 1.6, -40, { angry: true }); await t.call('melee', { kind: 'strike' }); await t.step(0.2); } },
      { name: 'molotov', caption: 'A MOLOTOV thrown into a crowd: fire spreading on the road.', run: async (t) => {
        await zoom(t, 'STREET'); await foes(t, 'raider', 4, 10, -52, { angry: true }); await t.call('give', { molotov: 3 }); await t.need('throw', { type: 'molotov', x: 10, z: -52 }); await t.step(1.6); } },
      { name: 'explosion', caption: 'A CAR EXPLODING: the fireball and the debris.', run: async (t) => {
        await zoom(t, 'STREET'); const v = await car(t, 'sedan', 8, -46); await t.need('explode', { id: v.id }); await t.step(0.5); } },
      { name: 'wanted', caption: 'WANTED: stars on the HUD after a witnessed killing.', run: async (t) => { await t.call('deed', { verb: 'kill', target: 'rusthaven', mag: 3, witness: true }); await t.step(2); } },
    ],
  });

  // ======================================================================================== THE INFECTED
  SECTIONS.push({
    id: 'infected', stage: [250, 250], freshEach: true, title: 'The infected', blurb: 'Every breed with its vein colour, crawlers, the Choir-Touched, a horde, and the same at night.',
    steps: [
      { name: 'shamblers', caption: 'SHAMBLERS: slow, red veins. Three in the street.', run: async (t) => { await zoom(t, 'CLOSE'); await breed(t, 'shambler', 3); await t.step(1); } },
      { name: 'sprinters', caption: 'SPRINTERS: black veins; they walk like shamblers until something living runs near.', run: async (t) => { await zoom(t, 'CLOSE'); await breed(t, 'sprinter', 3); await t.step(1); } },
      { name: 'echoes', caption: 'ECHOES: neon green veins; frozen while you watch them.', run: async (t) => { await zoom(t, 'CLOSE'); await breed(t, 'echo', 3); await t.step(1); } },
      { name: 'choir', caption: 'THE CHOIR-TOUCHED: an aura that speeds and steers the herd.', run: async (t) => { await zoom(t, 'CLOSE'); await t.need('infected', { kind: 'choir', x: 6, z: -40 }); await breed(t, 'shambler', 3, 10, -44); await t.step(1); } },
      { name: 'breeds-lineup', caption: 'ALL THREE BREEDS side by side, vein colours compared (red, black, neon green).', run: async (t) => {
        await zoom(t, 'CLOSE'); await t.need('infected', { kind: 'shambler', x: 3, z: -40 }); await t.need('infected', { kind: 'sprinter', x: 6, z: -40 }); await t.need('infected', { kind: 'echo', x: 9, z: -40 }); await t.step(1); } },
      { name: 'breeds-night', caption: 'THE VEINS AT NIGHT: the glow carries in the dark.', run: async (t) => {
        await night(t); await zoom(t, 'CLOSE'); await t.need('infected', { kind: 'shambler', x: 3, z: -40 }); await t.need('infected', { kind: 'sprinter', x: 6, z: -40 }); await t.need('infected', { kind: 'echo', x: 9, z: -40 }); await t.step(1.5); } },
      { name: 'crawler', caption: 'A CRAWLER: legs taken by a shot.', run: async (t) => {
        await zoom(t, 'CLOSE'); const r = await t.need('infected', { kind: 'shambler', x: 4, z: -40 }); await t.call('zombies', { crawl: r.id }); await t.step(1); } },
      { name: 'horde', caption: 'A HORDE: forty of the infected, a fifth of them sprinters, coming down the street.', run: async (t) => {
        await zoom(t, 'WIDE'); await t.need('horde', { count: 40, runners: 0.2, radius: 16, x: 0, z: -66 }); await t.step(2.5); } },
      { name: 'horde-close', caption: 'The HORDE up close at the barricade line.', run: async (t) => { await zoom(t, 'STREET'); await t.need('horde', { count: 30, runners: 0.2, radius: 9, x: 0, z: -56 }); await t.step(2.5); } },
      { name: 'siege', caption: 'A SIEGE: a migrating horde bearing down on a settlement at dusk.', run: async (t) => {
        await home(t, 'FAR'); await t.call('setTime', { hour: 19 }); await t.need('horde', { size: 30, force: true }); await t.step(4); } },
    ],
  });

  // ======================================================================================== GADGETS
  SECTIONS.push({
    id: 'gadgets', stage: [250, 250], title: 'Kit and gadgets', blurb: 'The things you look through and wear: night vision, the heat scope, flashlight, binoculars, gas mask, scanner, the dog\'s gear, car gadgets and the drone.',
    steps: [
      { name: 'night-vision', caption: 'NIGHT VISION (goggles, one battery cell): the green picture of a dark street with infected in it.', run: async (t) => {
        await t.call('setTime', { hour: 1 }); await t.call('kit', { give: 'nvg' }); await t.call('kit', { give: 'battery_cell', n: 2 }); await t.need('kit', { on: 'nvg' });
        await breed(t, 'shambler', 2, 6, -48); await t.step(2); } },
      { name: 'thermal', caption: 'THERMAL (heat scope): warm bodies bright, the infected cold.', run: async (t) => {
        await t.call('setTime', { hour: 1 }); await t.call('kit', { give: 'thermal_scope' }); await t.call('kit', { give: 'battery_cell', n: 2 }); await t.need('kit', { on: 'thermal_scope' });
        await foes(t, 'raider', 2, 6, -52); await breed(t, 'shambler', 2, 12, -52); await t.step(2); } },
      { name: 'flashlight', caption: 'The FLASHLIGHT: a cone in a black street.', run: async (t) => { await t.call('setTime', { hour: 0 }); await t.call('kit', { give: 'flashlight' }); await t.need('kit', { on: 'flashlight' }); await t.step(1.5); } },
      { name: 'binoculars', caption: 'BINOCULARS: the long look down the road.', run: async (t) => { await t.call('kit', { give: 'binoculars' }); await t.need('kit', { on: 'binoculars' }); await t.step(1.5); } },
      { name: 'gas-mask', caption: 'THE GAS MASK on: the filter and the choke tick.', run: async (t) => { await t.call('kit', { give: 'gas_mask' }); await t.call('kit', { give: 'mask_filter', n: 2 }); await t.need('kit', { on: 'gas_mask' }); await t.step(1.5); } },
      { name: 'radio-scanner', caption: 'THE RADIO SCANNER: ears on the road.', run: async (t) => { await t.call('kit', { give: 'radio_scanner' }); await t.call('kit', { give: 'battery_cell', n: 2 }); await t.need('kit', { on: 'radio_scanner' }); await t.step(1.5); } },
      { name: 'car-gadgets', caption: 'CAR GADGETS: a road chain, a spike strip and a car mine laid on the road.', run: async (t) => {
        await zoom(t, 'STREET'); for (const [k, x] of [['road_chain', 4], ['spike_strip', 8], ['car_mine', 12]]) await t.call('gadget', { place: k, x, z: -48 }); await t.step(1); } },
      { name: 'scout-drone', caption: 'THE SCOUT DRONE in flight.', run: async (t) => { await t.need('drone', { action: 'launch', kind: 'scout', give: true }); await t.step(2); } },
    ],
  });

  // ======================================================================================== THE WORLD
  SECTIONS.push({
    id: 'world', title: 'Places and time of day', blurb: 'Town streets at day and night, back alleys, the cemetery and a funeral, a bar, a hitchhiker, a storm drain, the military base, bounty boards.',
    steps: [
      { name: 'town-day', caption: 'A TOWN STREET by day: Rust Haven\'s Central Ave with its shopfronts.', run: async (t) => { await home(t); } },
      { name: 'town-night', caption: 'A TOWN STREET at night.', run: async (t) => { await t.call('setTime', { hour: 22.5 }); await home(t); } },
      { name: 'town-dawn', caption: 'The same street at dawn.', run: async (t) => { await t.call('setTime', { hour: 5.8 }); await home(t); } },
      { name: 'town-overview', caption: 'A TOWN from the high camera: blocks, landmarks, the wall.', run: async (t) => { await home(t, 'HIGH'); } },
      { name: 'ring-city', caption: 'THE PHOENIX RING: the dead metro, block after block.', run: async (t) => { await at(t, 0, 1100, 'WIDE'); } },
      { name: 'back-alley', caption: 'A BACK ALLEY: dumpsters, poles, back gates, fenced yards behind the shops.', run: async (t) => {
        await anyTown(t); const r = await t.need('backlots', {}); const a = r.near?.alley; if (a?.x == null) throw new Skip('backlots: no alley near the generated town centre'); await at(t, a.x, a.z, 'STREET'); await t.step(4); } },
      { name: 'cemetery', caption: 'A CEMETERY: BOOT HILL at Rust Haven, 292 graves in rows.', run: async (t) => { const c = await t.need('rites', { action: 'cemetery', near: true }); await at(t, c.x, c.z, 'WIDE'); } },
      { name: 'grave-dig', caption: 'A GRAVE being dug for a body.', run: async (t) => {
        const c = await t.need('rites', { action: 'cemetery', near: true }); await at(t, c.x, c.z, 'CLOSE'); const d = await foes(t, 'drifter', 1, c.x + 3, c.z);
        await t.need('kill', { id: d.ids?.[0] ?? d.id ?? d.spawned?.[0] }); await t.call('rites', { action: 'dig' }); await t.step(3); } },
      { name: 'funeral', caption: 'A FUNERAL: mourners gathered at a graveside.', run: async (t) => {
        const f = await t.need('rites', { action: 'funeral' }); const live = (f.funerals ?? []).find((x) => x.x != null); if (!live) throw new Skip('rites: no funeral is scheduled or under way to stage (needs a reported death and a game-day wait)'); await at(t, live.x, live.z, 'CLOSE'); } },
      { name: 'bar', caption: 'A BAR: the barkeep, the board and the talk (PULLS: bars are where you hear).', run: async (t) => {
        await anyTown(t, 'STREET', 'plains_grain_town'); const b = await t.need('pulls', { action: 'bars' }); const bar = (b.bars ?? [])[0]; if (!bar?.x) throw new Skip('pulls: no bar is live near here (bars exist once a town is promoted)'); await at(t, bar.x, bar.z, 'CLOSE'); } },
      { name: 'hitchhiker', caption: 'A HITCHHIKER on the road, thumb out: a pull you can take.', run: async (t) => {
        await zoom(t, 'CLOSE'); await t.need('pulls', { action: 'spawn', kind: 'hitchhiker' }); await t.step(1);
        const l = await t.call('pulls', { action: 'list' }); const p = (l.pulls ?? l.list ?? []).find((x) => /hitch/i.test(x.kind ?? '')); if (p?.x != null) await at(t, p.x - 3, p.z, 'CLOSE'); } },
      { name: 'stranded-caravan', caption: 'A STRANDED CARAVAN: a road birth with people and cars.', run: async (t) => { await zoom(t, 'STREET'); await t.need('pulls', { action: 'spawn', kind: 'caravan' }); await t.step(1); const l = await t.call('pulls', { action: 'list' }); const p = (l.pulls ?? []).find((x) => /caravan/i.test(x.kind ?? '')); if (p?.x != null) await at(t, p.x - 4, p.z, 'STREET'); } },
      { name: 'storm-drain-street', caption: 'A STORM DRAIN from the street: a manhole and a grate.', run: async (t) => {
        await anyTown(t); const r = await t.need('understreet', { action: 'nearest', kind: 'manhole' }); const w = (r.ways ?? r.nearest ?? [])[0]; if (!w?.top) throw new Skip('understreet: no manhole found near the town'); await at(t, w.top.x ?? w.top[0], w.top.z ?? w.top[1], 'CLOSE'); } },
      { name: 'storm-drain-below', caption: 'BELOW the street: the drain trunk, the channel and what lives in it.', run: async (t) => {
        await anyTown(t); const r = await t.need('understreet', { action: 'nearest' }); const w = (r.ways ?? r.nearest ?? [])[0]; if (!w) throw new Skip('understreet: no way down found'); await t.need('understreet', { action: 'enter', id: r.id ?? w.site, way: w.id, level: 1 }); await t.call('kit', { give: 'flashlight' }); await t.call('kit', { on: 'flashlight' }); await zoom(t, 'CLOSE'); await t.step(2.5); } },
      { name: 'military-gate', caption: 'A MILITARY BASE GATE: OUTPOST NINE\'s chain-link, towers and the sentry at the gate.', run: async (t) => { const b = await t.need('base', {}); const x = b.gate?.x ?? b.x, z = b.gate?.z ?? b.z; if (x == null) throw new Skip('base: no coordinates in the status'); await at(t, x, z + 14, 'WIDE'); } },
      { name: 'military-state-base', caption: 'A STATE BASE (one per state, at a real installation): the double fence and the checkpoint on the approach.', run: async (t) => { const l = await t.need('milbase', { action: 'list' }); const row = l.rows.find((r) => r.drive != null) ?? l.rows.find((r) => !r.beyond); if (!row) throw new Skip('milbase: every state base is beyond the drivable world on this build'); await t.need('milbase', { action: 'goto', id: row.id }); await zoom(t, 'WIDE'); await t.step(3); } },
      { name: 'bounty-board', caption: 'A SITE-STORY BOUNTY BOARD: the Tally\'s board in a settlement, postings pinned.', run: async (t) => { await anyTown(t, 'CLOSE'); await t.need('bounty', { action: 'board' }); await t.step(1); } },
      { name: 'site-story', caption: 'A SITE STORY playing out: a place with a problem (a dry well) and a trader on the road to it.', run: async (t) => {
        await t.need('site', { action: 'trouble', id: 'rust_haven', problem: 'dry_well' }); await t.call('site', { action: 'send', kind: 'trader', from: 'rust_haven', to: 'dust_bowl' }); await t.step(2); } },
      { name: 'site-stamped', caption: 'A SITE ROW stamped into the world: a real place built small.', run: async (t) => { const l = await t.need('site', {}); const row = (l.rows ?? l.sites ?? [])[0]; if (!row) throw new Skip('site: no rows'); await t.need('site', { id: row.id, at: '60,-120', teleport: true }); await zoom(t, 'WIDE'); await t.step(3); } },
    ],
  });

  // ======================================================================================== TERRAIN & ROADSIDES
  SECTIONS.push({
    id: 'land', title: 'Terrain and roadsides', blurb: 'Real elevation (canyon, river, forest hills), Florida swamp, and what stands beside the road in each region.',
    steps: [
      { name: 'canyon', caption: 'REAL TERRAIN: the deep country of the lower Colorado, I-10 mile 8 (ground at -220 m against the datum).', run: async (t) => { await mile(t, 8, 'I-10', 'east', 'FAR'); } },
      { name: 'canyon-oblique', caption: 'The same deep country with the camera tipped up so the relief reads.', run: async (t) => { await mile(t, 8, 'I-10', 'east', 'FAR'); await oblique(t, 120, 0.8); } },
      { name: 'colorado-bridge', caption: 'THE COLORADO RIVER and its bridge at mile 16: the carved channel and the deck over it.', run: async (t) => { await mile(t, 16.4, 'I-10', 'east', 'FAR'); } },
      { name: 'colorado-oblique', caption: 'THE COLORADO from a tipped camera: the carved channel and the deck spanning it.', run: async (t) => { await mile(t, 16.4, 'I-10', 'east', 'FAR'); await oblique(t, 100, 0.8); } },
      { name: 'desert-high', caption: 'DESERT RELIEF from the highest camera: the road and the ground it climbs.', run: async (t) => { await mile(t, 32, 'I-10', 'east', 'HIGH'); } },
      { name: 'forest-hills', caption: 'FOREST HILLS in the east: conifers, ground 880 m up.', run: async (t) => { await mile(t, 38, 'I-10', 'east', 'WIDE'); } },
      { name: 'forest-hills-oblique', caption: 'FOREST HILLS from a tipped camera.', run: async (t) => { await mile(t, 38, 'I-10', 'east', 'WIDE'); await oblique(t, 90, 0.8); } },
      { name: 'florida-swamp', caption: 'FLORIDA SWAMP: cypress, black water and the narrow causeway (I-75).', run: async (t) => { await mile(t, 30, 'I-75', 'north', 'WIDE'); } },
      { name: 'florida-coast', caption: 'FLORIDA I-95 near Miami: flatwoods and the coast road.', run: async (t) => { await mile(t, 9, 'I-95', 'north', 'WIDE'); } },
      { name: 'meridian', caption: 'MERIDIAN, the Florida start: the wall, the gates, the clinic.', run: async (t) => { await town(t, 'meridian', 'WIDE'); } },
      { name: 'gators', caption: 'ALLIGATORS in the shallows beside the road.', run: async (t) => { await town(t, 'meridian', 'CLOSE'); await t.need('region', { action: 'spawn', kind: 'gator', x: 8, z: -40 }); await t.step(1); } },
      { name: 'roadside-ca-desert', caption: 'ROADSIDE, California desert: I-10 mile 2.', run: async (t) => { await mile(t, 2, 'I-10', 'east', 'STREET'); } },
      { name: 'roadside-az', caption: 'ROADSIDE, Arizona scrub: mile 20, power lines and billboards naming the next exit.', run: async (t) => { await mile(t, 20, 'I-10', 'east', 'STREET'); } },
      { name: 'roadside-nm', caption: 'ROADSIDE, New Mexico: mile 44.', run: async (t) => { await mile(t, 44, 'I-10', 'east', 'STREET'); } },
      { name: 'roadside-fl', caption: 'ROADSIDE, Florida flatwoods: I-95 mile 9.', run: async (t) => { await mile(t, 9, 'I-95', 'north', 'STREET'); } },
      { name: 'power-lines', caption: 'THE ROADSIDE: a pylon down across the westbound lanes at mile 11.', run: async (t) => { await mile(t, 11, 'I-10', 'west', 'STREET'); } },
      { name: 'gas-station', caption: 'A ROADSIDE GAS STATION and its pumps.', run: async (t) => { const r = await t.need('roadside', { action: 'list' }); const g = (r.sites ?? []).find((x) => x.kind === 'station'); if (!g) throw new Skip('roadside: no station row'); await at(t, g.x, g.z, 'STREET'); } },
      { name: 'dam', caption: 'PALO VERDE DAM: a driveable crest over the spillway.', run: async (t) => { const r = await t.need('roadside', { action: 'site', id: 'palo_verde' }); const c = r.crest ?? r; if (c.x == null) throw new Skip('roadside: dam coordinates not returned'); await at(t, c.x, c.z, 'WIDE'); } },
    ],
  });

  return SECTIONS;
};
