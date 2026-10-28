// COMBAT BARKS as rows (docs/design/WEB_VOICE_STATS.md §3). What a fighter shouts when the fight turns, per faction
// archetype (data/voices.js ARCHETYPE_OF): the wardens of Rust Haven, the Dustwolves, the Federal Remnant, drifters and
// Meridian's wall. systems/soundscape.js reads the fight (a fighter's state, a reload, a run, a friend going down) and
// asks voice.say(c, key); a line with a rendered clip is heard in that voice, one without is a subtitle over the
// faction's own wordless bark (data/audiosets.js bark.*). Our own words; tools/ip-lint.mjs scans every one.
//
// Keys: combat.alert (they've seen you) · combat.flank (three or more on you: go wide) · combat.reload · combat.man_down
// (a friend just dropped) · combat.retreat (armed, but running) · combat.taunt (they just hurt you) · combat.surrender
// (cornered and hurt, hands going up). The wordless half: BARK_SAMPLE maps each key to a sound kind.
export const COMBAT_KEYS = ['combat.alert', 'combat.flank', 'combat.reload', 'combat.man_down', 'combat.retreat', 'combat.taunt', 'combat.surrender'];
export const BARK_SAMPLE = {
  'combat.alert': 'bark.alert', 'combat.flank': 'bark.shout', 'combat.reload': 'bark.shout', 'combat.man_down': 'bark.shout',
  'combat.retreat': 'bark.retreat', 'combat.taunt': 'bark.shout', 'combat.surrender': 'bark.pain', under_fire: 'bark.shout', death: 'bark.death',
};
export const BARK_DIRECTION = {
  'combat.alert': 'Sharp shout to others, eyes on a threat, urgent.',
  'combat.flank': 'Commanding shout across open ground, loud and quick.',
  'combat.reload': 'Hurried, breathless call to cover, mid-fight.',
  'combat.man_down': 'Raw, angry grief shouted over gunfire.',
  'combat.retreat': 'Panicked shout, running, voice cracking.',
  'combat.taunt': 'Mocking, loud, enjoying it.',
  'combat.surrender': 'Breathless, frightened, giving up.',
};

const rows = (arch, set) => Object.entries(set).map(([k, lines]) => ({ id: `${k}.${arch}`, key: k, who: arch, lines, kind: 'bark' }));

export const BARK_LINES = [
  // RUST HAVEN: the wall's people. Calm until they aren't; they talk about the gate and the town.
  ...rows('warden', {
    'combat.alert': ['Movement! Out past the posts!', 'Eyes up, we have company.', 'Armed stranger, coming in!', 'There! By the wreck!'],
    'combat.flank': ['Take the left side, I hold here.', 'Go round the back of them!', 'Spread out. Don\'t bunch up.'],
    'combat.reload': ['Reloading! Cover me!', 'Changing out, give me a second!', 'I\'m dry, I\'m dry!'],
    'combat.man_down': ['Warden down! Warden down!', 'They got one of ours!', 'Get to him, I\'ll keep them busy!'],
    'combat.retreat': ['Fall back to the gate!', 'Back to the wall, now!', 'Pull back, pull back!'],
    'combat.taunt': ['Not in our town.', 'You picked the wrong gate.', 'That one\'s for the town.'],
    'combat.surrender': ['Enough! I\'m done!', 'I yield. Don\'t shoot.', 'Alright! It\'s over.'],
  }),
  // THE DUSTWOLVES: loud, hungry, a pack. They talk about the take and the howl.
  ...rows('raider', {
    'combat.alert': ['Fresh meat on the road!', 'Wolves, wake up! We got one!', 'Look at this, a stray with a full pack!', 'Over there! Run it down!'],
    'combat.flank': ['Circle it! Circle it!', 'Cut it off from the car!', 'Go wide, push it to me!'],
    'combat.reload': ['Mag! Somebody cover!', 'Out! Keep shooting!', 'Hold on, hold on, loading!'],
    'combat.man_down': ['They dropped Rook!', 'Wolf down! Make them pay!', 'Somebody\'s bleeding over here!'],
    'combat.retreat': ['Too hot! Back to the bikes!', 'Scatter! Scatter!', 'Not worth it, ride!'],
    'combat.taunt': ['Felt that, didn\'t you?', 'Bleed for me, stray!', 'Ha! Toll\'s gone up!'],
    'combat.surrender': ['Okay! Okay! I\'m out!', 'Don\'t! I\'ll go, I\'ll go!', 'Take the bike, just let me walk!'],
  }),
  // THE FEDERAL REMNANT: radio discipline that cracks under fire.
  ...rows('soldier', {
    'combat.alert': ['Contact front!', 'Hostile, two o\'clock!', 'Eyes on one armed individual!', 'Weapons free!'],
    'combat.flank': ['Second team, flank right!', 'Move up on the left, I\'ve got suppression!', 'Bound forward, bound forward!'],
    'combat.reload': ['Reloading!', 'Changing magazines!', 'Cover, I\'m changing!'],
    'combat.man_down': ['Man down! Man down!', 'Medic! Need a medic!', 'We\'ve got wounded!'],
    'combat.retreat': ['Break contact! Fall back!', 'Displace, displace!', 'Back to the vehicle!'],
    'combat.taunt': ['Target hit.', 'You should have kept walking.', 'Stay down.'],
    'combat.surrender': ['Weapon down! Weapon down!', 'I surrender! Hands are up!', 'Cease fire, I\'m out!'],
  }),
  // DRIFTERS: scared people with guns.
  ...rows('drifter', {
    'combat.alert': ['Somebody\'s out there!', 'Hey! Who\'s that?', 'We got trouble!', 'Gun! He\'s got a gun!'],
    'combat.flank': ['Get around the side of them!', 'Split up, they can\'t watch us both!', 'Go round, go round!'],
    'combat.reload': ['I\'m out! I\'m out!', 'Hold on, loading!', 'Give me a second!'],
    'combat.man_down': ['No! They got her!', 'Somebody\'s down!', 'Oh no, oh no, he\'s down!'],
    'combat.retreat': ['Run! Just run!', 'Get out of here!', 'Leave it! Leave it all!'],
    'combat.taunt': ['How do you like it?', 'Stay away from us!', 'Should have left us alone!'],
    'combat.surrender': ['Please! I give up!', 'Don\'t shoot! I\'m done!', 'Take it! Take everything!'],
  }),
  // MERIDIAN: a planned town's militia, proud of the wall and the clinic.
  ...rows('meridian', {
    'combat.alert': ['Intruder at the line!', 'Heads up, the canal side!', 'Someone\'s coming through the cane!', 'Armed, armed, armed!'],
    'combat.flank': ['Take the dock side!', 'Box them against the water!', 'Move along the wall, cut them off!'],
    'combat.reload': ['Loading, cover!', 'Empty! Covering fire!', 'Give me cover, I\'m loading!'],
    'combat.man_down': ['Get them to the clinic!', 'We\'re losing one here!', 'Down! She\'s down!'],
    'combat.retreat': ['Back inside the line!', 'Pull back to the wall!', 'Get behind the gate!'],
    'combat.taunt': ['Meridian holds.', 'Go back to the swamp.', 'That\'s for the clinic.'],
    'combat.surrender': ['Stop! I\'m done!', 'Hands up, hands up!', 'No more! Please!'],
  }),
];
