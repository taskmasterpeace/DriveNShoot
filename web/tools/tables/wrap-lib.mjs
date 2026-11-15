// Migration helper: swap `export const NAME = <literal>;` for a wrapper line, keeping line endings. One-off, like wrap-vehicles.mjs.
import { readFileSync, writeFileSync } from 'node:fs';

export function span(src, name) {
  const start = src.search(new RegExp(`^export const ${name} =`, 'm'));
  if (start < 0) throw new Error('no export ' + name);
  let i = src.indexOf('=', start) + 1, depth = 0;
  const BS = String.fromCharCode(92);
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; for (i++; src[i] !== q; i++) if (src[i] === BS) i++; continue; }
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return [start, i + 1];
  }
  throw new Error('unterminated ' + name);
}

// edit(src) -> src: runs on LF text; the file's CRLF/LF mix is normalised to its dominant style on write.
export function rewrite(file, replacements, edit = (s) => s) {
  let s = readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  for (const [name, code] of Object.entries(replacements)) { const [a, b] = span(s, name); s = s.slice(0, a) + code + s.slice(b); }
  s = edit(s);
  if (crlf) s = s.replace(/\n/g, '\r\n');
  writeFileSync(file, s);
}
