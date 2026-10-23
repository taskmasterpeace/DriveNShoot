// VoiceForge QC: measure a clip from its samples and flag what a listener would catch first (docs/design/WEB_VOICE.md §3.3).
import { spawnSync } from 'node:child_process';

export const estSec = (text) => 0.4 + text.split(/\s+/).length / 2.5; // ~150 words a minute
export function ff(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).slice(0, 400)}`);
  return r.stdout;
}
// Duration, peak, RMS, clipping and the silence at each end of a clip, from its samples (mono f32 at 24 kHz).
export function measure(file) {
  const raw = ff(['-i', file, '-ac', '1', '-ar', '24000', '-f', 'f32le', 'pipe:1']);
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const sr = 24000, db = (v) => (v > 0 ? 20 * Math.log10(v) : -120);
  let peak = 0, sum = 0, clipped = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; if (a >= 0.999) clipped++; }
  // Silence: 10 ms windows under -45 dBFS RMS.
  const win = 240, thr = 10 ** (-45 / 20), loud = (i) => { let s = 0; for (let k = i; k < Math.min(x.length, i + win); k++) s += x[k] * x[k]; return Math.sqrt(s / win) > thr; };
  let a = 0; while (a < x.length && !loud(a)) a += win;
  let b = x.length; while (b > a && !loud(Math.max(0, b - win))) b -= win;
  // The longest silence inside the line (a dropout, or a provider reading nothing for a while).
  let gap = 0, run = 0; for (let i = a; i < b; i += win) { if (loud(i)) run = 0; else { run += win; if (run > gap) gap = run; } }
  return { dur: +(x.length / sr).toFixed(2), peakDb: +db(peak).toFixed(1), rmsDb: +db(Math.sqrt(sum / Math.max(1, x.length))).toFixed(1), clipped, leadS: +(a / sr).toFixed(2), tailS: +((x.length - b) / sr).toFixed(2), gapS: +(gap / sr).toFixed(2) };
}
// The QC gate: what a listener would catch first, by numbers.
export function qc(m, text) {
  const words = text.split(/\s+/).length, want = estSec(text), issues = [];
  if (m.dur < Math.max(0.35, want * 0.35)) issues.push(`short ${m.dur}s for ${words} words`);
  if (m.dur > want * 2.6 + 1) issues.push(`long ${m.dur}s for ${words} words`);
  if (m.clipped > 0) issues.push(`${m.clipped} clipped samples`);
  if (m.peakDb > -0.3) issues.push(`peak ${m.peakDb} dBFS`);
  if (m.rmsDb < -38) issues.push(`quiet ${m.rmsDb} dBFS RMS`);
  if (m.leadS > 0.35) issues.push(`${m.leadS}s lead silence`);
  if (m.tailS > 0.6) issues.push(`${m.tailS}s tail silence`);
  if (m.gapS > 1.2) issues.push(`${m.gapS}s silence inside`);
  return issues;
}
