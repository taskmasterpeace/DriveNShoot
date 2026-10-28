import { COMBAT_KEYS } from '../../src/data/barks.js';
// VoiceForge batches: named selections of dialogue rows x voices (tools/voiceforge/voiceforge.mjs --batch <name>).
// A selector is one of:
//   { voice, nodes: [...] }            a named person's dialogue-tree lines (data/npcs.js; a line written as a function
//                                      of the game is read out of the probe states in voiceforge.mjs)
//   { voice, key, take?, inserts? }    the rows of one situation key a voice may say (data/dialogue.js); take = at most
//                                      that many variations; inserts = the values to render a {token} with
//   { voice, text }                    one exact line
// Keep a batch small: every line here is a file Robert listens to.
export const BATCHES = {
  // The proof batch (2026-10-23): ~38 lines. The two Rust Haven leads, a raider's robbery demand, a surrender plea,
  // a stranger's road warning and a death cry.
  proof: [
    { voice: 'okonkwo', nodes: ['hi', 'work', 'accepted', 'pay', 'lore', 'sworn'] },
    { voice: 'reyes', nodes: ['hi', 'shift', 'shiftOn', 'shiftPaid', 'wounds'] },
    { voice: 'raider.m0.US', key: 'gunpoint.rob', take: 7 },
    { voice: 'drifter.f0.MX', key: 'gunpoint.surrender', take: 6 },
    { voice: 'drifter.m1.US', key: 'road.warning', take: 6, inserts: { dir: ['north', 'east'] } },
    { voice: 'drifter.m0.US', key: 'death', take: 6 },
  ],
  // COMBAT BARKS (2026-10-27; data/barks.js, docs/design/WEB_VOICE_STATS.md §3): every faction archetype in two or three
  // template voices, every combat key. US-flag takes: a bark borrows its voice's US take whatever flag the speaker wears
  // (systems/voice.js clipFor). ~330 short lines; render with: --batch barks --provider breeze --max 400 --yes
  barks: [].concat(...[
    ['warden.m0.US', 'warden.f0.US', 'warden.m1.US'], ['raider.m0.US', 'raider.f0.US', 'raider.m1.US'], ['soldier.m0.US', 'soldier.f0.US'],
    ['drifter.m0.US', 'drifter.f0.US', 'drifter.m1.US'], ['meridian.m0.US', 'meridian.f0.US'],
  ].flat().map((voice) => COMBAT_KEYS.map((key) => ({ voice, key })))),
};
