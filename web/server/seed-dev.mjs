#!/usr/bin/env node
// Make (or keep) the two dev accounts, robert and claude, with strong random passwords.
//   node server/seed-dev.mjs            (run it with the shard stopped: it writes the shard's own files)
//   node server/seed-dev.mjs --data <dir>
// The passwords go ONLY into web/server/.dev-accounts.json (gitignored). This script never prints them.
// Run it again and it keeps what is there: an account whose password is on file is left alone; one that exists without
// one on file gets a fresh password (the dev seed owns these two accounts).
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Store } from './store.mjs';
import { hashPassword, checkPassword } from './auth.mjs';
import { SHARD_PORT, SHARD_PATH } from '../src/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const DATA = arg('data') ?? process.env.SHARD_DATA ?? join(HERE, 'data');
const PORT = Number(arg('port') ?? process.env.SHARD_PORT ?? SHARD_PORT);
const FILE = join(HERE, '.dev-accounts.json');
const USERS = ['robert', 'claude'];

const up = await fetch(`http://localhost:${PORT}/health`).then((r) => r.ok, () => false);
if (up) { console.error(`[seed] a shard is running on :${PORT} - stop it first (it would write over these accounts), then run this again`); process.exit(1); }

const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { accounts: [] };
const store = new Store(DATA);
const accounts = [];
for (const user of USERS) {
  const had = old.accounts?.find((a) => a.user === user);
  const u = store.user(user);
  if (u && had && await checkPassword(had.pass, u.pw)) { accounts.push(had); console.log(`[seed] ${user}: kept`); continue; }
  const pass = randomBytes(18).toString('base64url'); // 24 characters, 144 bits
  if (u) u.pw = await hashPassword(pass);
  else store.accounts.users[user] = { pw: await hashPassword(pass), created: new Date().toISOString(), chars: [] };
  accounts.push({ user, pass });
  console.log(`[seed] ${user}: ${u ? 'password reset' : 'created'}`);
}
store.mark('accounts.json');
store.flush();
writeFileSync(FILE, JSON.stringify({
  note: 'Dev logins for the local shard. Never commit, paste or print this file (it is gitignored).',
  shard: `ws://localhost:${PORT}${SHARD_PATH}`, game: 'http://localhost:3270 (npm run dev -- --port 3270), then LOG IN on the title screen',
  accounts,
}, null, 2));
try { chmodSync(FILE, 0o600); } catch {}
console.log(`[seed] wrote ${accounts.length} accounts to ${FILE} (the passwords are in that file only)`);
