// Browser side of the agent bridge. Long-polls the dev server for commands that
// shell agents POST to /agent/cmd, runs them through the AgentAPI, posts results back.
// Only active under `npm run dev` (the endpoints come from the Vite plugin).

export function startBridge(api) {
  const params = new URLSearchParams(location.search);
  if (params.has('agent') || params.has('autostart')) {
    // Skip the title screen for automated sessions.
    queueMicrotask(() => api.call('start'));
  }
  if (!import.meta.env?.DEV) return;
  // Stable tab id across reloads, so the bridge keeps talking to the same tab after a code edit.
  let tab = null;
  try { tab = sessionStorage.getItem('dl.tab'); } catch {}
  if (!tab) { tab = Math.random().toString(36).slice(2, 8); try { sessionStorage.setItem('dl.tab', tab); } catch {} }
  let failures = 0;
  const loop = async () => {
    try {
      const res = await fetch(`/agent/next?tab=${tab}`, { cache: 'no-store' });
      if (res.status === 200) {
        const job = await res.json();
        const t0 = performance.now();
        let result;
        if (Array.isArray(job.batch)) {
          result = { ok: true, results: [] };
          for (const j of job.batch) {
            const r = await api.call(j.cmd, j.args);
            result.results.push({ cmd: j.cmd, ...r });
            if (!r.ok && job.stopOnError !== false) { result.ok = false; break; }
          }
        } else result = await api.call(job.cmd, job.args);
        result.ms = Math.round(performance.now() - t0);
        await fetch('/agent/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, result }) });
      }
      failures = 0;
    } catch {
      failures++;
    }
    setTimeout(loop, failures ? Math.min(5000, 250 * failures) : 0);
  };
  loop();
}
