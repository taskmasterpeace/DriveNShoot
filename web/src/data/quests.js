// QUESTS as rows (docs/design/WEB_VOICE_STATS.md §6; G5 of docs/design/WEB_DEATHLANDS_GAP.md). The game's quest state
// stays where it always was, the flat g.quests object the dialogue trees write ('active', 'done'...). A row reads it
// into something a JOURNAL can show: stages with objectives (and live counts), a map pin, the reward, and the ways it
// fails. A key in g.quests with no row (a favour a stranger asked for in their own words, systems/llmtalk.js) is
// still listed, as a loose end.
//   state(g)     'offered' | 'active' | 'done' | 'failed' | null (not started)
//   stage(g)     the objective line for where you are (live numbers in it)
//   pin          { x, z } where it points (the giver, the ground), or null
export const QUESTS = {
  bounty: {
    title: 'The Dustwolf Bounty', giver: 'Sheriff Okonkwo, Rust Haven', reward: '$250 and Rust Haven\'s thanks',
    pin: { x: 0, z: -84, what: 'the north gate' },
    state: (g) => g.quests.bounty === 'done' ? 'done' : g.quests.bounty === 'active' ? 'active' : null,
    stages: [
      { at: 'active', text: (g) => { const n = Math.max(0, (g.stats?.raiderKills ?? 0) - (g.quests.bountyStart ?? 0)); return n >= 6 ? 'Six Dustwolves are down. Go back to the sheriff and get paid.' : `Put six Dustwolves in the dirt out on the Glass Flats (${n}/6). Their camps burn fires at night.`; } },
      { at: 'done', text: () => 'Paid. The Dustwolves ride a little quieter.' },
    ],
    fails: ['The sheriff dies before you collect'],
  },
  canal: {
    title: 'Clear the Canal', giver: 'Meridian', reward: 'scrip and Meridian\'s standing',
    pin: null,
    state: (g) => g.quests.canal === 'done' ? 'done' : g.quests.canal === 'active' ? 'active' : null,
    stages: [
      { at: 'active', text: (g) => { const n = Math.max(0, (g.stats?.gators ?? 0) - (g.quests.canalStart ?? 0)); return `Kill the gators fouling the canal (${Math.min(n, 2)}/2).`; } },
      { at: 'done', text: () => 'The canal runs clear.' },
    ],
    fails: [],
  },
  cache: {
    title: 'The Buried Cache', giver: 'a voice on the radio', reward: 'whatever is in the hole',
    pin: null,
    state: (g) => g.quests.cache === 'done' ? 'done' : g.quests.cache === 'active' ? 'active' : g.quests.cache === 'failed' ? 'failed' : null,
    stages: [{ at: 'active', text: () => 'Find the cache the broadcast talked about. Dig where the ground is soft.' }, { at: 'done', text: () => 'Dug up.' }],
    fails: ['Somebody else digs it up first'],
  },
};
// Generic states a loose-end key can hold, read by the journal.
export const LOOSE = { offered: 'offered', active: 'active', accepted: 'active', done: 'done', failed: 'failed', refused: 'failed' };
// Quest-ish keys that are counters, not quests (never listed).
export const NOT_QUESTS = new Set(['bountyStart', 'canalStart']);
