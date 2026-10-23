#!/usr/bin/env node
// DSOA MCP server (stdio, zero dependencies). Exposes every agent command as an MCP tool
// named `dl_<command>`, with JSON Schemas generated from the live COMMANDS table, plus:
//   dl_launch  - start dev server + headless browser (if not already connected)
//   dl_call    - generic {cmd, args} escape hatch
// `dl_screenshot` returns an MCP image block so the model can SEE the frame.
// Register: .mcp.json in this repo (Claude Code picks it up automatically).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { request } from 'node:http';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const TAB = process.env.DL_TAB || null; // address one game tab (status lists them); default: the one the bridge drives
// POST JSON and wait as long as the game takes. Not fetch(): Node's fetch gives up after 300 s with no response headers,
// and a scenario may run 15 minutes (its budget) - bounty-run used to come back "fetch failed" while it was still going.
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request(url, { method: 'POST', autoSelectFamily: true, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
let launcher = null;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function http(path, body) {
  if (body) return postJson(`${BASE}${path}`, body); // commands: as long as they take
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}
async function status() { try { return await http('/agent/status'); } catch { return { connected: false, serverDown: true }; } }

async function launch() {
  const s = await status();
  if (s.connected) return { ok: true, note: 'already connected' };
  if (!launcher) {
    launcher = spawn(process.execPath, [join(ROOT, 'tools/agent.mjs')], { cwd: ROOT, stdio: 'ignore', detached: false });
    process.on('exit', () => launcher?.kill());
  }
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if ((await status()).connected) return { ok: true, note: 'dev server + headless browser ready' };
  }
  return { ok: false, error: 'game did not connect within 60s', hint: `run "npm run agent" in ${ROOT} manually and check output` };
}

function toJsonSchema(spec = {}) {
  const properties = {}, required = [];
  for (const [k, s] of Object.entries(spec)) {
    const t = s.type === 'object' ? 'object' : s.type === 'number' ? 'number' : s.type === 'boolean' ? 'boolean' : 'string';
    properties[k] = { type: t, ...(s.enum ? { enum: s.enum } : {}), ...(s.default !== undefined ? { default: s.default } : {}) };
    if (s.required) required.push(k);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

let cachedTools = null;
async function tools() {
  const base = [
    { name: 'dl_launch', description: 'Start the DSOA dev server and a headless browser running the game (no-op if already connected). Call this first.', inputSchema: { type: 'object', properties: {} } },
    { name: 'dl_call', description: 'Run any DSOA agent command: {cmd, args}. Use dl_help to list commands.', inputSchema: { type: 'object', properties: { cmd: { type: 'string' }, args: { type: 'object' } }, required: ['cmd'] } },
    { name: 'dl_batch', description: 'Run several commands in one round trip: {batch:[{cmd,args},...]}. Stops at first failure.', inputSchema: { type: 'object', properties: { batch: { type: 'array', items: { type: 'object' } } }, required: ['batch'] } },
  ];
  if (cachedTools) return [...base, ...cachedTools];
  const s = await status();
  if (!s.connected) return base; // per-command tools appear once the game is connected
  const h = await http('/agent/cmd', { cmd: 'help' });
  if (!h.ok) return base;
  cachedTools = h.commands.map((c) => ({ name: `dl_${c.cmd}`, description: `[${c.group}] ${c.desc}`, inputSchema: toJsonSchema(c.schema) }));
  return [...base, ...cachedTools];
}

async function callTool(name, args = {}) {
  if (name === 'dl_launch') {
    const r = await launch();
    if (r.ok) { cachedTools = null; send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); }
    return text(r);
  }
  if (!(await status()).connected) {
    const r = await launch();
    if (!r.ok) return text(r, true);
  }
  let body;
  if (name === 'dl_call') body = { cmd: args.cmd, args: args.args ?? {} };
  else if (name === 'dl_batch') body = { batch: args.batch };
  else body = { cmd: name.replace(/^dl_/, ''), args };
  if (TAB) body.tab = TAB;
  const r = await http('/agent/cmd', body);
  if (r.image?.startsWith('data:image')) {
    const data = r.image.split(',')[1];
    delete r.image;
    return { content: [{ type: 'image', data, mimeType: 'image/jpeg' }, { type: 'text', text: JSON.stringify(r) }] };
  }
  return text(r, r.ok === false);
}
const text = (o, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 1) }], isError });

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((e) => msg.id !== undefined && fail(msg.id, -32603, String(e.message ?? e)));
  }
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'dsoa', version: '0.1.0' },
      instructions: 'DSOA game engine. Call dl_launch first, then dl_selftest / dl_state. Advance time with dl_step; see a frame and what is in it with dl_look (screenshot + who/what/where); wait for events with dl_watch; compare moments with dl_snap + dl_diff. A person can watch live at /observe.html. Read AGENTS.md in the repo for conventions.',
    });
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: await tools() });
  if (method === 'tools/call') return ok(id, await callTool(params.name, params.arguments ?? {}));
  if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
}
