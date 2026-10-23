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
};
