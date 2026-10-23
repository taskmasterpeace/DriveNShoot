// The shard's rows in the agent COMMANDS table (registered at boot by net/shard.js attachShard; docs/COMMANDS.md lists
// them under "shard"). Everything a person does on the login screen, an agent can do here, and read back.
export function shardCommands(g, s) {
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const inWorld = () => need(s.state === 'inworld', `not in a shard's world (state: ${s.state}) - shardLogin, then shardEnter`);
  return {
    shard: {
      group: 'shard', desc: 'The shard connection (docs/design/WEB_SHARD.md): state (offline | connecting | open | authed | inworld | reconnecting), the shard url and name, the account, the character you play, who else is online as this page draws them, other players\' parked cars, your car, claims, the named dead, when you were last saved, message counts and the clock offset to the shard.',
      run: async () => s.status(),
    },
    shardConnect: {
      group: 'shard', desc: 'Connect to a shard (default ws://<this host>:3280/shard, or ?shard= in the page url). Returns its name and how many are in its world.',
      args: { url: { type: 'string' } },
      run: async ({ url }) => { const h = await s.connect(url ?? s.url); return { url: s.url, shard: h.shard, online: h.online }; },
    },
    shardLogin: {
      group: 'shard', desc: 'Log in to the shard as user with pass (create=true makes the account first). Returns the account\'s characters. The password is never echoed back or kept by the page; only the session token is (localStorage, for CONTINUE). Tools: node tools/shard.mjs login reads the dev logins from web/server/.dev-accounts.json.',
      args: { user: { type: 'string', required: true }, pass: { type: 'string', required: true }, create: { type: 'boolean', default: false }, url: { type: 'string' } },
      run: async ({ user, pass, create, url }) => { if (url) await s.connect(url); return await s.login(user, pass, create); },
    },
    shardChars: {
      group: 'shard', desc: 'The logged-in account\'s characters (up to 3): id, name, flag, last seen, where they stand, their house.',
      run: async () => { need(s.user, 'log in first (shardLogin)'); return { user: s.user, chars: await s.listChars() }; },
    },
    shardNewChar: {
      group: 'shard', desc: 'Make a character on the logged-in account: name (2-16 letters, unique on the shard) and flag (a country code the page can draw: US MX CA CU JM IE NG IT DE CO HT GH JP VN PH KR BR PR).',
      args: { name: { type: 'string', required: true }, flag: { type: 'string', default: 'US' } },
      run: async ({ name, flag }) => { need(s.user, 'log in first (shardLogin)'); const r = await s.newChar(name, String(flag).toUpperCase()); return { made: r.made, chars: r.chars }; },
    },
    shardEnter: {
      group: 'shard', desc: 'Walk into the shard\'s world as a character (id or name): the shard\'s copy of them becomes your player (where they stood, the pack, needs, money, standing, roles, their car), the world\'s changes are applied (locks, windows, the named dead, the town cars taken), and everyone else online appears. A brand-new character starts as the game starts.',
      args: { char: { type: 'string', required: true } },
      run: async ({ char }) => { need(s.user, 'log in first (shardLogin)'); return await s.enter(char); },
    },
    shardWho: {
      group: 'shard', desc: 'Everyone else on the shard as this page sees them: shown (where their body is drawn right now, facing, gun, alive, vehicle), interpolated (where they are ~120 ms behind their page), latest (the newest sample and its age). In the world: a name plate with their flag over each one, and the roster plate at the bottom.',
      run: async () => { inWorld(); return { players: s.who(), you: { name: s.char.name, x: +g.player.x.toFixed(2), z: +g.player.z.toFixed(2) } }; },
    },
    shardSave: {
      group: 'shard', desc: 'Save your character to the shard now (it also saves every 10 s, on logout and when the page closes). Returns when the shard has it.',
      run: async () => { inWorld(); return await s.save(); },
    },
    shardLogout: {
      group: 'shard', desc: 'Save and leave the world (back to the account; the game keeps running offline on this page). signout=true also ends the session (the token is forgotten on both sides). In the game: LOG OUT on the roster plate.',
      args: { signout: { type: 'boolean', default: false } },
      run: async ({ signout }) => { const r = await s.leave(); return signout ? { ...r, ...(await s.signout()) } : r; },
    },
    shardClaim: {
      group: 'shard', desc: 'Claim the building you stand in as your house (one per character; not a trader\'s place; not one somebody else claims). Everyone on the shard sees it: walking into it says whose place it is.',
      run: async () => { inWorld(); return await s.claim(); },
    },
    shardUnclaim: {
      group: 'shard', desc: 'Give up your house claim.',
      run: async () => { inWorld(); return await s.unclaim(); },
    },
    shardWorld: {
      group: 'shard', desc: 'The shared world as this page has it from the shard: claims, the named dead, the town cars taken, the last deeds on the shard\'s chronicle, and how many doors and windows this page holds as changed (interiors save).',
      run: async () => { const I = g.interiors.save(); return { claims: s.claims, deadNpcs: s.deadNpcs, takenVehicles: s.taken, chronicle: s.chronicle.slice(-15), interiors: { doors: Object.keys(I.d).length, windows: Object.keys(I.w).length } }; },
    },
    shardLoginUi: {
      group: 'shard', desc: 'Open the login modal as a person sees it (step=login | chars), e.g. for a screenshot; close=true closes it.',
      args: { step: { type: 'string', default: 'login', enum: ['login', 'chars'] }, close: { type: 'boolean', default: false } },
      run: async ({ step, close }) => { if (close) { s.ui.close(); return { open: false }; } s.ui.open(step); return { open: true, step }; },
    },
  };
}
