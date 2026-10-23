// What Meridian's people say (docs/design/WEB_FLORIDA.md §3.4). Dialogue trees in the data/npcs.js shape: { start, nodes:
// { id: { text, choices: [{ t, next | end, req(g), do(g), deed }] } } }. Our words: no line, name or coined word from the
// books the game is fan service for (docs/design/WEB_FAN_SERVICE_BIBLE.md; tools/ip-lint.mjs checks every string here).
// The jobs are quests on g.quests; the gator count comes from systems/regions.js (g.stats.gators).

const money = (n) => `$${n}`;
// The mechanic's repairs, as Rust Haven's garage does them: your last ride has to be parked close by.
const nearCar = (g) => { const v = g.lastVehicle; return v && !v.dead && Math.hypot(v.x - g.player.x, v.z - g.player.z) < 40 ? v : null; };
const worn = (v) => !!v && !v.dead && (v.hp < v.maxHp || (!!v.dmg && (v.dmg.engine < 1 || v.dmg.radiator < 1 || v.dmg.tank < 1 || Object.values(v.dmg.tyres).some((t) => t < 1))));
const gators = (g) => (g.stats.gators ?? 0) - (g.quests.canalStart ?? 0);

export const MERIDIAN_TALK = {
  mer_sheriff: {
    roleLines: { deputy: 'Deputy. Meridian sleeps better with you on the wall.', butcher: 'One wrong move and you hang off the water tower.', medic: 'Doc says you patch people up. We need more of that.' },
    start: 'hi',
    nodes: {
      hi: { text: (g) => g.quests.canal === 'done' ? 'The west canal has been quiet since you went down there. Meridian pays its debts and remembers its friends.'
        : g.quests.canal === 'active' ? (gators(g) >= 2 ? 'Two of them? Word came up from the canal before you did. Come get your money.' : `Gators down: ${gators(g)} of 2. The canal runs along the interstate, west side.`)
        : 'You walked in the west gate, so you walked in under my rules. Nobody shoots inside the wall, nobody takes what is not theirs. Welcome to Meridian.',
        choices: [
          { t: 'Got any work?', next: 'work', req: (g) => !g.quests.canal },
          { t: 'Two gators are dead. Pay up.', next: 'paid', deed: { v: 'deliver', m: 8 }, req: (g) => g.quests.canal === 'active' && gators(g) >= 2, do: (g) => { g.quests.canal = 'done'; g.give({ cash: 120 }); g.emit('questComplete', { quest: 'canal', reward: 120 }); } },
          { t: 'What is this place?', next: 'lore' },
          { t: 'Where do I start?', next: 'start' },
          { t: '[Leave]', end: true },
        ] },
      work: { text: 'The drainage canal along I-95 is where our water crew pumps from, and the gators have moved in. Two of them in the reeds by the pumps. Put them down and there is a hundred and twenty in it. Do not swim to them. Shoot them from the bank.',
        choices: [
          { t: 'I can do that.', next: 'took', do: (g) => { g.quests.canal = 'active'; g.quests.canalStart = g.stats.gators ?? 0; g.hud.toast('NEW JOB: Clear the Canal (0/2)', 'job'); } },
          { t: 'Not today.', end: true },
        ] },
      took: { text: 'Out the west gate, down the road to the interstate. The canal is the dark water on the far side. They lie still until you are close. Then they are fast.', choices: [{ t: '[Leave]', end: true }] },
      paid: { text: 'Counted. A hundred and twenty. The pump crew says thank you, in their way, which is not at all.', choices: [{ t: '[Leave]', end: true }] },
      lore: { text: 'Meridian was a county seat with a courthouse and a lot of strip malls. Four days after the lights went out we pulled the malls down for the wall. The swamp came back up to the gates. We kept the clinic running and the well clean, and people came.',
        choices: [{ t: 'Who runs it?', next: 'runs' }, { t: '[Leave]', end: true }] },
      runs: { text: 'Mayor Clarke runs the talking. I run the wall. Doc Asante runs whether you live. Between us it holds.', choices: [{ t: 'Back.', next: 'hi' }, { t: '[Leave]', end: true }] },
      start: { text: 'Hoa at the general store sells what you need and buys what you find. Lucien at the garage keeps cars alive. The clinic is the white building on the civic row. If you die out there, you wake up in it. Do not make a habit of it.',
        choices: [{ t: 'Back.', next: 'hi' }, { t: '[Leave]', end: true }] },
    },
  },
  mer_doc: {
    roleLines: { medic: 'There is my medic. Wash your hands, then come help.' },
    start: 'hi',
    nodes: {
      hi: { text: (g) => (g.player.hp < g.player.maxHp * 0.7 ? 'You are bleeding on my floor. Sit down.' : 'The clinic is open. The clone bay behind it is too, as long as the generator holds.'),
        choices: [
          { t: `Patch me up (${money(25)})`, deed: { v: 'trade' }, req: (g) => g.player.hp < g.player.maxHp, next: 'patched', do: (g) => { if (g.spend(25)) { g.player.hp = g.player.maxHp; g.player.bleed = 0; } } },
          { t: 'What is the clone bay?', next: 'clone' },
          { t: '[Leave]', end: true },
        ] },
      patched: { text: 'Stitched and clean. Drink water. Stay out of the swamp after dark.', choices: [{ t: '[Leave]', end: true }] },
      clone: { text: 'Old hospital equipment we hauled up from the coast. It keeps a copy of you, and if you die out there, the copy wakes up here in a vat. You come back with nothing you were carrying, and you still have to go and get your things from wherever you fell.',
        choices: [{ t: 'And if the generator fails?', next: 'gen' }, { t: '[Leave]', end: true }] },
      gen: { text: 'Then you had better be careful. Fuel keeps it running. Fuel and luck.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_mech: {
    start: 'hi',
    nodes: {
      hi: { text: 'Salt air eats everything. Brakes, wiring, the frame. Bring it here before it eats the car out from under you.',
        choices: [
          { t: `Repair my last ride (${money(60)})`, deed: { v: 'trade' }, req: (g) => worn(nearCar(g)), next: 'fixed', do: (g) => { if (g.spend(60)) g.vehDamage.repair(g.lastVehicle); } },
          { t: 'Is there a car I can use?', next: 'car' },
          { t: '[Leave]', end: true },
        ] },
      fixed: { text: 'Done. I put a new hose on and an old prayer.', choices: [{ t: '[Leave]', end: true }] },
      car: { text: 'The pickup in the yard runs if you are gentle with it. Take it. Bring it back with gas in it. The airboat at the landing is for the lagoon, not for the road.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_store: {
    start: 'hi',
    nodes: {
      hi: { text: 'Everything on the shelves is for sale. Pay at the counter. I buy food, water, tools and anything that shines.',
        choices: [{ t: 'How is business?', next: 'biz' }, { t: '[Leave]', end: true }] },
      biz: { text: 'The trucks stopped coming up from Miami. Now it is whatever people carry in on foot. Bring me a road atlas and I will pay well. People want to know what is out there.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_guns: {
    start: 'hi',
    nodes: {
      hi: { text: 'Rounds are scarce and I do not give credit. Guns on the rack, ammunition in the crates. Bring me a broken one and I will see.',
        choices: [{ t: 'What do you recommend for gators?', next: 'gator' }, { t: '[Leave]', end: true }] },
      gator: { text: 'A shotgun at close range, and do not be at close range. Their heads are hard. Shoot behind the eye.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_water: {
    start: 'hi',
    nodes: {
      hi: { text: 'All of it boiled, all of it from the town well, not the canal. Never drink from the canal.', choices: [{ t: 'Why not?', next: 'why' }, { t: '[Leave]', end: true }] },
      why: { text: 'Things live in it. Things die in it. Things that were people walk into it at night and stand there.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_cantina: {
    start: 'hi',
    nodes: {
      hi: { text: 'Sit, drink, keep your hands where I can see them. Fights go outside, to the pit.',
        choices: [{ t: 'What is the pit?', next: 'pit' }, { t: 'Heard any news?', next: 'news' }, { t: '[Leave]', end: true }] },
      pit: { text: 'Bare hands on Friday nights behind the boneyard. People bet scrip and lose teeth. It keeps the arguments off the street.', choices: [{ t: '[Leave]', end: true }] },
      news: { text: 'Somebody saw lights up at the old launch sites past Titusville. Somebody always sees lights.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_radio: {
    start: 'hi',
    nodes: {
      hi: { text: 'This is the voice of Meridian, twelve-ten on the dial, when the transmitter does not melt. I read the news, the weather and the names of the dead.',
        choices: [{ t: 'What is the weather?', next: 'weather' }, { t: '[Leave]', end: true }] },
      weather: { text: 'Hot, wet, and a squall line to the south that never moves. Do not drive into it. Nobody who drove into it has come back to complain.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
  mer_mayor: {
    start: 'hi',
    nodes: {
      hi: { text: 'Welcome to Meridian. We have a wall, a well, a clinic and a rule: whoever comes in peace stays in peace. Whoever does not, the sheriff walks back out.',
        choices: [{ t: 'How many live here?', next: 'many' }, { t: '[Leave]', end: true }] },
      many: { text: 'A few hundred on a good season. Fewer after the storms. We take in anyone who works.', choices: [{ t: '[Leave]', end: true }] },
    },
  },
};
