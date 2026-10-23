// Dialogue as data (docs/design/WEB_VOICE.md §3.1). Every spoken line is a ROW:
//   { id, key, who, when?, kind?, direction?, lines: [variation, ...] }
//   key        the situation (greet, refuse, under_fire, gunpoint.surrender, gunpoint.rob, trade.hello, rumour,
//              road.warning, death, ...; ported talk is talk.news.saw.kill, talk.road.herd, memory.shotMe, radio.*).
//   who        who may say it: '*', an archetype (drifter | warden | raider | soldier), a named npc id (okonkwo), or
//              'radio' (STATIC 1660 AM). The most specific match wins: named > archetype > '*'.
//   when       conditions on the speaker, all optional: mood ('calm' | 'scared' | 'hurt' | 'angry'), tier (how their
//              people read you: hunted | hostile | wary | neutral | friendly | allied), night (true/false).
//              A row whose conditions all hold beats a row with none.
//   lines      3-8 variations, so nobody repeats themselves (systems/voice.js deals them like a shuffled deck per
//              speaker and key). {who} {place} {dir} {n} {you} {me} {about} {item} fill from the live world.
//   direction  how it is performed (the Breeze/Gemini instruction): emotion + intensity + pace + intent.
//   kind       bark | talk | radio | gunpoint (priority: who may cut whom, systems/voice.js PRIO).
// The ported rows at the bottom are BUILT from the tables the game already speaks from (data/talk.js, npcs.js,
// society.js MEMORY_KINDS, events.js) so their words are unchanged and single-sourced; new situations live here.
// Our words only: every row passes `node tools/ip-lint.mjs` (docs/design/WEB_FAN_SERVICE_BIBLE.md).
import { NEWS, ROAD, YOU } from './talk.js';
import { BARKS, NPCS } from './npcs.js';
import { MEMORY_KINDS } from './society.js';
import { EVENTS } from './events.js';

// The situations the game (and the controller's gunpoint state) asks for: voice.say(c, key, vars).
export const SITUATIONS = {
  greet: 'a stranger opens their mouth',
  refuse: 'they will not talk to you',
  under_fire: 'a bark when rounds are flying near them',
  'gunpoint.aimed': 'you have just pointed a gun at them',
  'gunpoint.surrender': 'they give up at gunpoint',
  'gunpoint.plead': 'held at gunpoint too long, or hurt: they beg',
  'gunpoint.handover': 'they hand over what you demanded',
  'gunpoint.defiant': 'they will not give in at gunpoint',
  'gunpoint.rob': 'a robbery demand: they hold YOU up',
  'gunpoint.rob_warn': 'the robber\'s second warning',
  'gunpoint.rob_paid': 'the robber, once you have paid',
  'standoff.open': 'both of you armed and aimed: the first words',
  'standoff.hold': 'the standoff drags on',
  'standoff.back_down': 'they lower their gun',
  'standoff.break': 'they are about to shoot',
  'trade.hello': 'a trader at the counter',
  'trade.deal': 'a deal struck',
  'trade.broke': 'you cannot pay',
  rumour: 'a rumour worth passing on',
  'road.warning': 'a warning about the road',
  death: 'the last thing they say',
  thanks: 'thanks for a kindness',
};

// How each situation is performed when nobody says otherwise, and who may cut whom (systems/voice.js).
export const DIRECTION = {
  under_fire: { kind: 'bark', direction: 'Shouting in sudden panic, breathless, fast, ducking for cover.' },
  'gunpoint.aimed': { kind: 'gunpoint', direction: 'Startled and afraid, hands rising, talking fast and low to calm a gunman.' },
  'gunpoint.surrender': { kind: 'gunpoint', direction: 'Terrified, voice shaking, pleading, words tumbling out.' },
  'gunpoint.plead': { kind: 'gunpoint', direction: 'Close to tears, voice breaking, begging quietly.' },
  'gunpoint.handover': { kind: 'gunpoint', direction: 'Defeated and bitter, flat, handing it over.' },
  'gunpoint.defiant': { kind: 'gunpoint', direction: 'Cold, steady defiance, low and slow, daring them.' },
  'gunpoint.rob': { kind: 'gunpoint', direction: 'Menacing and calm, a practiced robber, amused by the fear, unhurried.' },
  'gunpoint.rob_warn': { kind: 'gunpoint', direction: 'Losing patience, hard and loud, one breath from shooting.' },
  'gunpoint.rob_paid': { kind: 'gunpoint', direction: 'Smug, relaxed, mocking, backing away.' },
  'standoff.open': { kind: 'gunpoint', direction: 'Tense, quiet, deliberate, every word measured, eyes locked.' },
  'standoff.hold': { kind: 'gunpoint', direction: 'Strained whisper, holding very still, sweat in the voice.' },
  'standoff.back_down': { kind: 'gunpoint', direction: 'Slow, careful, de-escalating, breathing out.' },
  'standoff.break': { kind: 'gunpoint', direction: 'Snapping, sudden shout of rage.' },
  death: { kind: 'death', direction: 'Dying, gasping, fading, barely audible, the last breath.' },
  greet: { kind: 'talk' }, refuse: { kind: 'talk', direction: 'Cold, clipped, final.' },
  'trade.hello': { kind: 'talk' }, 'trade.deal': { kind: 'talk' }, 'trade.broke': { kind: 'talk' },
  rumour: { kind: 'talk', direction: 'Low and confiding, leaning in, half believing it.' },
  'road.warning': { kind: 'talk', direction: 'Serious and protective, a quiet warning between strangers.' },
  thanks: { kind: 'talk', direction: 'Shaky relief, grateful.' },
};

const CIV = ['drifter', 'warden'];

// ---- New situations (2026-10-23) -------------------------------------------------------------------------------
const AUTHORED = [
  // Barks under fire.
  { id: 'fire.civ', key: 'under_fire', who: CIV, lines: ['Get down! Get down!', 'Who is shooting? Who is shooting?', 'Not me! I am not in this!', 'Find a wall! Find a wall!', 'Stay low! Stay low!', 'They are shooting at us!'] },
  { id: 'fire.civ.hurt', key: 'under_fire', who: CIV, when: { mood: 'hurt' }, lines: ['I\'m hit. I\'m hit.', 'It\'s in my leg! Somebody!', 'I can\'t feel my hand.', 'Help me! I\'m bleeding!'] },
  { id: 'fire.raider', key: 'under_fire', who: 'raider', lines: ['They\'re shooting back!', 'Go wide! Flank them!', 'Pin them down!', 'Reloading! Cover me!', 'You\'ll bleed for that!'] },
  { id: 'fire.warden', key: 'under_fire', who: 'warden', lines: ['Shots fired! On the wall!', 'Contact! Close the gate!', 'Hold the line!', 'Take cover and return fire!'] },
  { id: 'fire.soldier', key: 'under_fire', who: 'soldier', lines: ['Contact! Contact!', 'Taking fire, east side!', 'Suppress that position!', 'Get down and stay down!'] },

  // At gunpoint: the gun is on them.
  { id: 'gp.aimed.civ', key: 'gunpoint.aimed', who: '*', lines: ['Whoa. Whoa. Easy with that.', 'Hey. Point that somewhere else.', 'I\'m not armed. Look, I\'m not armed.', 'Okay. Okay. What do you want?', 'Don\'t. Please don\'t.', 'You don\'t want to do this, friend.'] },
  { id: 'gp.aimed.friend', key: 'gunpoint.aimed', who: '*', when: { tier: ['friendly', 'allied'] }, lines: ['It\'s me. We\'re friends, remember?', 'Come on. After everything?', 'Put it down. You know me.'] },
  { id: 'gp.aimed.raider', key: 'gunpoint.aimed', who: 'raider', lines: ['You think that scares me?', 'Go on. Pull it.', 'Big mistake, {you}.', 'My crew will find you.'] },
  { id: 'gp.surrender.civ', key: 'gunpoint.surrender', who: '*', lines: ['Hands up. My hands are up. See?', 'I give! I give! Don\'t shoot!', 'Take whatever you want. Just don\'t shoot.', 'I\'m down. I\'m on the ground. Okay?', 'You win. I\'m done. I\'m done.', 'Look, I\'ve got nothing worth dying over.'] },
  { id: 'gp.surrender.raider', key: 'gunpoint.surrender', who: 'raider', lines: ['Fine! Fine. I\'m out.', 'Don\'t. I\'ve got people waiting on me.', 'Alright, you got me. Now what?'] },
  { id: 'gp.plead', key: 'gunpoint.plead', who: '*', lines: ['Please. I have a kid back in {place}.', 'Please. I won\'t tell anybody. I swear it.', 'I didn\'t see your face. I didn\'t see anything.', 'Whatever they\'re paying you, I\'ll match it.', 'Please. Not like this.', 'I just want to go home.'] },
  { id: 'gp.handover', key: 'gunpoint.handover', who: '*', lines: ['Here. Take it. Take all of it.', 'That\'s everything. That\'s all I\'ve got.', 'Here\'s my water. It\'s all I have.', 'Take it. I hope it\'s worth it to you.', 'Fine. Go on. Get out of here.'] },
  { id: 'gp.defiant', key: 'gunpoint.defiant', who: '*', lines: ['I\'d rather die than give you a thing.', 'Go ahead. Everybody\'s watching.', 'Not today. Not from you.', 'Pull it or put it away.'] },
  { id: 'gp.defiant.warden', key: 'gunpoint.defiant', who: 'warden', lines: ['You shoot me and the whole wall comes down on you.', 'Lower it. Now. I won\'t say it again.', 'You are under the sheriff\'s law in here. Drop it.'] },

  // At gunpoint: the gun is on YOU (a robbery).
  { id: 'gp.rob', key: 'gunpoint.rob', who: ['raider', 'drifter'], lines: ['Easy now. Water, rounds and the keys. On the ground.', 'Toll road, {you}. Empty your pockets.', 'Hands where I can see them. Pack on the dirt.', 'Nobody has to bleed. Put the bag down and walk.', 'You know how this goes. Everything you\'re carrying.', 'This stretch of road belongs to us. So does your pack.', 'Slow. Real slow. Drop it and back away.'] },
  { id: 'gp.rob.warn', key: 'gunpoint.rob_warn', who: ['raider', 'drifter'], lines: ['I\'m not asking twice.', 'Last chance. Drop it.', 'You think I\'m joking? One.', 'Don\'t make me ruin a good pack.'] },
  { id: 'gp.rob.paid', key: 'gunpoint.rob_paid', who: ['raider', 'drifter'], lines: ['Smart. Now walk.', 'See? Nobody had to bleed.', 'Pleasure doing business. Don\'t look back.', 'Good. Tell your friends about the toll.'] },

  // The standoff: both guns up.
  { id: 'so.open', key: 'standoff.open', who: '*', lines: ['Nobody move. Nobody has to.', 'Easy. We both lower them on three.', 'I see yours, you see mine. Now what?', 'Your hand\'s shaking, {you}.', 'Think hard about the next second.'] },
  { id: 'so.hold', key: 'standoff.hold', who: '*', lines: ['Steady. Steady.', 'I can stand here all day.', 'Don\'t you blink.', 'Breathe. Just breathe.', 'Whoever moves first goes down first.'] },
  { id: 'so.back', key: 'standoff.back_down', who: '*', lines: ['Alright. I\'m lowering it. Slow.', 'Not worth it. Not today.', 'We walk away. Both of us.', 'Fine. Fine. It\'s down.'] },
  { id: 'so.break', key: 'standoff.break', who: '*', lines: ['That\'s it. That\'s it!', 'You had your chance!', 'Now!', 'Should have walked away!'] },

  // Trade, rumour, the road.
  { id: 'trade.hello', key: 'trade.hello', who: '*', lines: ['You buying or just looking?', 'Cash, water or rounds. I take all three.', 'Prices are fair. Fairer than the road.', 'Don\'t touch what you can\'t pay for.'] },
  { id: 'trade.deal', key: 'trade.deal', who: '*', lines: ['Done. Pleasure.', 'Good trade. Come back.', 'That\'s a fair deal and you know it.', 'Sold. Mind how you carry it.'] },
  { id: 'trade.broke', key: 'trade.broke', who: '*', lines: ['Come back when your pockets aren\'t empty.', 'No money, no deal.', 'I don\'t do credit. Not anymore.', 'You\'re short. Try again.'] },
  { id: 'rumour', key: 'rumour', who: '*', lines: ['They say there\'s still canned food in the towers downtown. Nobody who went to check came back to say.', 'Somebody\'s been leaving water at the crossroads {dir} of here. Nobody knows who.', 'Folks out by {place} say the dead gather at night. Just standing. Waiting.', 'I heard the soldiers have a radio that still talks to somebody back east.', 'A trucker swore he saw lights on the old highway {dir} of here. No engines. Just lights.', 'There\'s a man who trades bullets for stories. Pays more for the true ones.'] },
  { id: 'road.warning', key: 'road.warning', who: '*', lines: ['Watch the road {dir} of here. Somebody strung wire across it.', 'Don\'t stop for anyone on the highway. Not even kids. Especially not kids.', 'Keep your tank full and your mouth shut out there.', 'Raiders work the stretch {dir} of here after sundown.', 'If you see a car parked across both lanes, turn around. Don\'t ask.', 'Drive with the windows up past the dunes. The dust gets into everything.'] },
  { id: 'road.warning.night', key: 'road.warning', who: '*', when: { night: true }, lines: ['Nobody drives at night. Nobody who wants to see morning.', 'Kill your lights past the ridge. They see headlights for miles.', 'Night like this, the dead come out to the road to stand in it.'] },

  // The last thing they say.
  { id: 'death.civ', key: 'death', who: '*', lines: ['No... no...', 'Not... like this...', 'Mama...', 'I can\'t... see...', 'Tell them... tell them I...', 'Oh God.', 'Wait...'] },
  { id: 'death.raider', key: 'death', who: 'raider', lines: ['Damn you...', 'Should have... stayed home...', 'Ride on... without me...', 'Not... yet...'] },

  // Refusing you; a stranger's opening when their people want you gone.
  { id: 'refuse', key: 'refuse', who: '*', lines: ['I have nothing to say to you.', 'We\'re done talking.', 'Walk away, {you}.', 'Not one word. Go.', 'Find somebody else to bother.'] },
  { id: 'greet.raider.more', key: 'greet', who: 'raider', lines: ['Wrong road, {you}.', 'Look what crawled in.', 'Keep walking while you still can.'] },
  { id: 'greet.cold', key: 'greet', who: CIV, when: { tier: ['hostile', 'hunted'] }, lines: ['You. Keep your hands where I can see them.', 'Folks around here know your face.', 'Say what you want and go.'] },
];

// ---- Ported (2026-10-23): what the game already says, as rows, words untouched ---------------------------------
function ported() {
  const rows = [];
  const add = (id, key, who, lines, extra = {}) => { lines = (Array.isArray(lines) ? lines : [lines]).filter((t) => typeof t === 'string' && t.trim()); if (lines.length) rows.push({ id, key, who, lines, ported: true, ...extra }); };
  // data/talk.js: a stranger's three topics.
  for (const tier of ['saw', 'heard', 'world']) for (const [v, t] of Object.entries(NEWS[tier])) add(`talk.news.${tier}.${v}`, `talk.news.${tier}.${v}`, '*', t, { kind: 'talk' });
  add('talk.news.none', 'talk.news.none', '*', NEWS.none, { kind: 'talk' });
  for (const [k, t] of Object.entries(ROAD)) if (typeof t === 'string') add(`talk.road.${k}`, `talk.road.${k}`, '*', t, { kind: 'talk' });
  for (const [w, t] of Object.entries(ROAD.weather)) add(`talk.road.weather.${w}`, `talk.road.weather.${w}`, '*', t, { kind: 'talk' });
  for (const [tier, t] of Object.entries(YOU)) add(`talk.you.${tier}`, `talk.you.${tier}`, '*', t, { kind: 'talk' });
  // data/npcs.js BARKS: a stranger's own small talk, by faction.
  for (const [f, lines] of Object.entries(BARKS)) add(`greet.${f}`, 'greet', f === 'raider' ? 'raider' : f, lines, { kind: 'talk' });
  // data/society.js MEMORY_KINDS: what a named person says about what you did to them or theirs.
  for (const [k, d] of Object.entries(MEMORY_KINDS)) add(`memory.${k}`, `memory.${k}`, '*', d.say, { kind: 'bark' });
  // data/events.js: STATIC 1660 AM and the director's people.
  const R = EVENTS.radio_news.lines;
  for (const e of ['hunters', 'dead_draw_dead', 'raid']) add(`radio.${e}`, `radio.${e}`, 'radio', EVENTS[e].radio, { kind: 'radio' });
  for (const tier of ['witnessed', 'unwitnessed', 'world']) for (const [v, t] of Object.entries(R[tier])) add(`radio.news.${tier}.${v}`, `radio.news.${tier}.${v}`, 'radio', t, { kind: 'radio' });
  add('radio.news.tier', 'radio.news.tier', 'radio', R.tier, { kind: 'radio' });
  add('radio.digest.open', 'radio.digest.open', 'radio', EVENTS.radio_news.digest.open, { kind: 'radio' });
  add('radio.digest.close', 'radio.digest.close', 'radio', EVENTS.radio_news.digest.close, { kind: 'radio' });
  add('thanks.role_call', 'thanks', '*', EVENTS.role_call.thanks, { kind: 'talk' });
  // The named cast: what each says about your best-known role, and their trees' fixed lines (a line written as a
  // function of the game is voiced when the forge can read it out of a probe state; see tools/voiceforge).
  for (const n of NPCS) {
    for (const [role, t] of Object.entries(n.roleLines ?? {})) add(`${n.id}.role.${role}`, `role.${role}`, n.id, t, { kind: 'talk' });
    for (const [role, t] of Object.entries(n.refuseRole ?? {})) add(`${n.id}.refuse.${role}`, `refuse.role.${role}`, n.id, t, { kind: 'talk' });
    for (const [node, d] of Object.entries(n.nodes ?? {})) if (typeof d.text === 'string') add(`${n.id}.node.${node}`, `npc.${node}`, n.id, d.text, { kind: 'talk' });
  }
  return rows;
}

export const LINES = [...AUTHORED, ...ported()];

// Fill the {tokens} of a line. vars: a plain object of strings or numbers; anything missing is left for the caller.
export const fillLine = (t, vars = {}) => t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
export const tokensOf = (t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
