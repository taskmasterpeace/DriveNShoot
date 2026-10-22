// Director event templates (docs/design/WEB_WORLD_MEMORY.md §3.6, phase 3). Numbers and words live here; director.js
// knows how to check, bind and spawn each kind. Cooldowns and timeouts are in seconds of sim time.
//   pace 'threat' - fires only when nobody is already shooting at you and the character budget has room;
//   pace 'calm'   - fires only when no threat event is running.
export const EVENTS = {
  // A faction you have made an enemy of sends a squad after you, from out of sight.
  hunters: {
    pace: 'threat', weight: 1,
    angerBelowStart: 25, angerAtMost: -40,        // standing must be this far below where it started, and this low
    squad: { base: 2, perTierBelowHostile: 1, night: 1, max: 5 }, ring: [90, 125], leash: 260,
    cooldown: { self: 900, perFaction: 2400, global: 120 }, timeout: 480,
    toast: '{faction} HUNTERS ARE ON YOUR TRAIL',
    radio: 'Static here. {faction} put a price on a stranger tonight. If that is you, keep moving.',
    onPlayerDeath: { standing: 20 },             // they got what they came for
  },
  // A bloody night at one spot draws the infected to it.
  dead_draw_dead: {
    pace: 'threat', weight: 1, killsToday: 8, nightAtLeast: 0.6,
    herd: { count: [6, 10], runners: 0.15, radius: 9 }, distance: 70,
    cooldown: { self: 1500, global: 120 }, timeout: 300,
    toast: 'THE DEAD ARE MOVING TOWARD THE NOISE',
    radio: 'Folks out near {place}: something is moving toward all that shooting. Lock your doors.',
  },
  // A strong band rides on the town it raids (faction sim row `raids`), when you're close enough to answer.
  raid: {
    pace: 'threat', weight: 1.2, strengthAtLeast: 55, resourcesAtLeast: 25, nightAtLeast: 0.4, playerWithin: 320,
    squad: [4, 6], ring: [130, 165], leash: 220,
    cooldown: { self: 1800, global: 120 }, timeout: 360,
    toast: '{raider} ARE HITTING {target}',
    radio: 'Static here. {raider} are riding on {target}. Anyone with a gun and a conscience, now is the time.',
    beaten: { raiderStrength: -6, raiderResources: -10, targetResources: 5 },
    took: { targetResources: -12 },
  },
  // STATIC 1660 AM reads the news: the newest notable thing in the chronicle nobody has broadcast yet.
  radio_news: {
    pace: 'calm', weight: 2,
    cooldown: { self: 240, global: 30 },
    station: 'STATIC 1660 AM',
    // {who} the person it happened to, {place} where, {faction} their people.
    lines: {
      witnessed: {
        kill: 'Word from {place}: a stranger put {who} in the dirt. {faction} are not taking it well.',
        silence: 'Word from {place}: {who} saw something and now {who} is dead. Draw your own conclusions.',
        hurt: 'Shots fired at {place}. {who} is walking around with somebody else\'s lead in them.',
        carjack: 'Somebody yanked {who} out of their own car at {place}. Lock it or lose it.',
        rescue: 'Good news for once: a stranger pulled {who} out of a bad fight at {place}.',
        stunt: 'Word from the old thrill show off Route 66: a stranger flew a car clean over {who}. Somebody saw it, so now everybody knows.',
      },
      unwitnessed: {
        kill: 'Somebody put {who} in the dirt out at {place}. Nobody saw a thing. Nobody ever does.',
        silence: '{who} turned up dead at {place}. Nobody saw a thing.',
      },
      world: {
        kill: '{who} is dead at {place}. The flats take another one.',
      },
      tier: '{faction} are calling a certain stranger {tier} now. Strange days.',
    },
    // The morning digest: at dawn the station reads yesterday back from the chronicle's day totals. Clauses join
    // with commas into one sentence between the open and the close; any clause with nothing to say is left out.
    digest: {
      at: 6.5, // game hour
      open: 'Static here with the morning news. Yesterday on the flats:',
      dead: ['nobody died that I heard about', 'one dead', 'two dead', 'three dead', 'four dead', '{n} dead'],
      worst: 'the worst of it at {place}',
      took: '{a} took {place} off {b}',
      skirmish: '{a} and {b} traded lead',
      stunt: 'and some fool flew {who} at the old thrill show',
      quiet: 'quiet, for once',
      close: ['That is the news. Keep your water close.', 'That is the news. Check your mirrors.', 'That is the news. Do not trust a stranger with a full tank.'],
    },
  },
};
