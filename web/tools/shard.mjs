#!/usr/bin/env node
// The shard from a shell (docs/design/WEB_SHARD.md).
//   node tools/shard.mjs start [--data <dir>]          run the shard in this terminal (= npm run shard); Ctrl+C saves and stops
//   node tools/shard.mjs who                            who is online (name, flag, where, gun, car) - GET /who
//   node tools/shard.mjs world                          the shared world: claims, the named dead, doors, windows, deeds
//   node tools/shard.mjs login [user=claude] [char=Claude] [flag=US]
//                                                       the game page at DL_URL logs in with that dev login (read from
//                                                       web/server/.dev-accounts.json; never printed), makes the character
//                                                       if the account has none, and walks into the world
//   node tools/shard.mjs logout                         that page saves and leaves the world
//   node tools/shard.mjs status                         the page's shard state (shard command)
// Env: DL_URL (the game page, default http://localhost:3141), SHARD_PORT (default 3280).
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, devAccount, pageCall, shardGet } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(process.env.SHARD_PORT ?? 3280);
const [verb = 'status', ...rest] = process.argv.slice(2);
const kv = Object.fromEntries(rest.filter((s) => s.includes('=')).map((s) => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]));
const print = (o) => console.log(JSON.stringify(o, null, 2));

async function main() {
  if (verb === 'start') {
    const child = spawn(process.execPath, [join(ROOT, 'server', 'shard.mjs'), ...rest], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (c) => process.exit(c ?? 0));
    process.on('SIGINT', () => {}); // the shard gets Ctrl+C too, saves, and exits; we follow it
    return;
  }
  if (verb === 'who') return print(await shardGet('/who', PORT));
  if (verb === 'world') return print(await shardGet('/world', PORT));
  if (verb === 'status') return print(await pageCall(BASE, 'shard'));
  if (verb === 'logout') return print(await pageCall(BASE, 'shardLogout'));
  if (verb === 'login') {
    const user = kv.user ?? 'claude';
    const { pass } = devAccount(user);
    const url = kv.url ?? `ws://localhost:${PORT}/shard`;
    const r = await pageCall(BASE, 'shardLogin', { user, pass, url });
    if (!r.ok) return print({ ok: false, step: 'login', error: r.error });
    let chars = r.chars;
    const want = kv.char ?? user.charAt(0).toUpperCase() + user.slice(1);
    let c = chars.find((x) => x.name.toLowerCase() === want.toLowerCase());
    if (!c) {
      const m = await pageCall(BASE, 'shardNewChar', { name: want, flag: kv.flag ?? 'US' });
      if (!m.ok) return print({ ok: false, step: 'newChar', error: m.error });
      c = m.chars.find((x) => x.name.toLowerCase() === want.toLowerCase());
    }
    const e = await pageCall(BASE, 'shardEnter', { char: c.id });
    return print({ ok: e.ok, user, ...e });
  }
  print({ ok: false, error: `unknown: ${verb}`, hint: 'start | who | world | login | logout | status' });
  process.exitCode = 1;
}
main().catch((e) => { print({ ok: false, error: String(e.message ?? e) }); process.exitCode = 2; });
