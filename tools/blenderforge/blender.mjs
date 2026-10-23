#!/usr/bin/env node
// Run a Blenderforge script in headless Blender (never the live editor: the Blender MCP drives Robert's open Blender).
//   node tools/blenderforge/blender.mjs gen_flora.py [-- script args...]
// Finds Blender 5.x: $BLENDERFORGE_BLENDER, then the usual 5.x install folders (D: first, where 5.1 lives on this
// machine), then $BLENDER (on this machine that one is 4.5, kept only as a last resort).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.BLENDERFORGE_BLENDER,
  'D:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
  'D:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/bin/blender',
  process.env.BLENDER,
].filter(Boolean);
const exe = candidates.find((p) => existsSync(p));
if (!exe) { console.error('[blenderforge] Blender 5.x not found; set BLENDER=<path to blender.exe>'); process.exit(2); }

const [script, ...rest] = process.argv.slice(2);
if (!script) { console.error('usage: node tools/blenderforge/blender.mjs <script.py> [-- args]'); process.exit(2); }
const path = isAbsolute(script) ? script : join(here, script);
const extra = rest[0] === '--' ? rest.slice(1) : rest;
const r = spawnSync(exe, ['--background', '--factory-startup', '--python', path, '--', ...extra], { stdio: 'inherit' });
process.exit(r.status ?? 1);
