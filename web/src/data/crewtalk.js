// What the crew SAY, to you and to each other (docs/design/WEB_CREW.md §3.8): barks, camp talk, bonds between members,
// conflicts, interjections. Rows only: systems/crew.js picks a line, fills it, and hands it to the voice layer
// (g.voice.speak + the `crewSay` event: { rec, name, kind, line, to, ctx }), so the voice/LLM lane can replace any line
// with a generated one from the same context (crew.context(member): values, trust, memories, bonds).
// {you} is the player, {name} the speaker, {other} the member spoken to or about, {place} where it happened,
// {target} who it happened to.

// ---- barks: short lines on events, by kind; a card's style may have its own --------------------------------------------
export const BARKS = {
  down: { any: ["I'm hit... I'm hit bad.", 'Down! I am down!', 'Get to me... please.'], leader: ['Leg is gone. Keep shooting.'], eager: ['It is fine, it is fine, it is... not fine.'] },
  saved: { any: ['Thought that was it.', 'I owe you one.', 'Still breathing. Thanks to you.'], marksman: ['Clean work. I would have done the same.'] },
  kill: { any: ['Got one.', 'He is down.', 'One less.'], leader: ['Counted. Next.'], eager: ['Did you see that? Did you see?'], stalker: ['Quiet.'] },
  dry: { any: ['I am dry! Rounds!', 'Empty! Somebody throw me a mag!'] },
  ackOrder: { any: ['On it.', 'Moving.', 'Yes.'], leader: ['Done before you said it.'], erratic: ['Hm? Oh. Yes. Going.'] },
  refuse: { any: ['Not for you. Not today.', 'Find somebody else.'] },
  approve: { any: ['That was well done.', 'Good. That was right.'], marksman: ['That is why I ride with you.'] },
  disapprove: { any: ['I saw that. I will not forget it.', 'That was wrong and you know it.'], marksman: ['They had nothing in their hands.'] },
  lastStand: { any: ['Get behind me!', 'Stay down, I have got you.'] },
  callout: { any: ['{what}, {dir}, {d} metres!'] },
  pain: { any: ['Ah! That one stung.'] },
  winOutnumbered: { any: ['Outnumbered and they are the ones in the dirt.'], leader: ['That is how it is done.'] },
};

// ---- camp talk about what they saw (their memories of your deeds) ------------------------------------------------------
// by the deed kind and the sign of how they took it (+ / -)
export const CAMP_DEED = {
  killUnarmed: { '-': ['The one at {place}. {target} had nothing in their hands. I keep seeing it.', 'You put down an empty-handed man at {place}. Tell me why.'] },
  kill: { '-': ['Another body at {place}. Do you count them? I do.'], '+': ['{place}. They would have done it to us first.'] },
  rescue: { '+': ['The ones you cut loose at {place}. That is the best thing I have seen out here.'] },
  heal: { '+': ['You stopped for {target} at {place}. Most would not.'] },
  rob: { '-': ['What we took at {place}... they needed it more than we did.'], '+': ['Good haul at {place}. Nobody got hurt worth mentioning.'] },
  steal: { '-': ['Stealing. At {place}. Is that who we are now?'], '+': ['Light fingers at {place}. I liked it.'] },
  abandonCrew: { '-': ['We left {target} to bleed out. I will not forget that.'] },
  savedCrew: { '+': ['When {target} went down you came back. That is why I am still here.'] },
  winOutnumbered: { '+': ['How many were there? And we are still sitting here.'] },
  destroy: { '-': ['Burning things just to burn them. Not my road.'] },
  trade: { '+': ['Fair trade at {place}. People remember that.'] },
};

// ---- camp talk between two members, by how they feel about each other ---------------------------------------------------
export const CAMP_PAIR = {
  friends: [['{other}, you were good out there today.', 'Somebody has to cover you.'], ['Remember the road east? Same as then.', 'Same as then.']],
  rivals: [['{other}, you nearly got us killed.', 'I nearly got you killed? Look at yourself.'], ['Keep your mouth shut for once, {other}.', 'Make me.']],
  // a quarrel: the two of them, with you pulled in (a choice for the voice/dialogue lane; the bond moves either way)
  quarrel: [['{other} took the last of the water. Again.', 'I took my share. Count it yourself.', '{you}, tell {other} how it is.']],
};

// ---- small talk by flaw (when nothing better is on their mind) -----------------------------------------------------------
export const CAMP_FLAW = {
  hothead: ['If that trader looks at me like that again...'], choirsick: ['The static is quiet tonight. I do not trust quiet.'],
  hoarder: ['I counted the guns twice. One is bent. We keep it.'], townhater: ['Tomorrow, no towns. Please.'],
  healer: ['Show me that cut on your arm. No, show me.'], wanderer: ['The stars are in the wrong place. Or I am.'],
  brave: ['Next time let me go first.'], talker: ['So the trick with a jammed bolt, right, is you...'], none: ['Long day.'],
};

// ---- interjections: a member speaks up while you talk to someone ----------------------------------------------------------
// when: hurt (the person is hurt), captive, trader, warden. need: the member's value for that verb at least this.
export const INTERJECT = [
  { when: 'hurt', verb: 'heal', need: 3, lines: ['That one is bleeding. Let me look at them.', 'We are not leaving them like that.'] },
  { when: 'trader', verb: 'trade', need: 1, lines: ['Ask about rounds. We are low.', 'Do not let them cheat you.'] },
  { when: 'warden', verb: 'trespass', need: 1, lines: ['Easy. These ones shoot first.'] },
  { when: 'raider', verb: 'killRaider', need: 1, lines: ['Do not turn your back on that one.'] },
];

// ---- bonds between members (pairwise -100..100) --------------------------------------------------------------------------
// start: likeness of their values (sum over shared keys of va x vb x like, clamped), plus flaws that rub or fit.
// move: two who both saw a deed and took it the same way +agree; opposite ways -disagree; camp talk nudges toward its sign.
export const BOND_RULES = {
  like: 2, startClamp: 40, agree: 1.5, disagree: 3, campNudge: 2, friends: 50, rivals: -40, quarrelBelow: -60,
  campEvery: [35, 70],   // game-seconds between camp lines while camp is live at night or you sleep
  interjectGap: 30,      // s between interjections
  memory: 8,             // deeds each member remembers (for camp talk and the LLM context)
};
export const FLAW_CLASH = { 'talker|townhater': -20, 'brave|wanderer': -10, 'hothead|healer': -10, 'hoarder|talker': -8, 'healer|choirsick': 10, 'brave|hothead': 12 };
