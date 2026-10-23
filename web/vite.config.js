import { defineConfig } from 'vite';

// Agent bridge: lets any shell agent drive the running game over HTTP.
//   POST /agent/cmd   {cmd, args} | {batch:[{cmd,args}...]}  -> waits for the browser's result
//   GET  /agent/status                                       -> is a game tab connected?
//   GET  /agent/next   (browser long-poll)   POST /agent/result (browser reply)
function agentBridge() {
  const queue = [];
  const pending = new Map();
  const waiters = [];
  let lastPoll = 0;
  let seq = 0;
  const clientErrors = [];
  const tabs = new Map(); // tab id -> { first, last }
  // Commands go to ONE tab. Sticky: the current tab keeps the job until it stops polling;
  // then the most recently opened live tab takes over.
  let current = null;
  const activeTab = () => {
    if (current && tabs.has(current) && Date.now() - tabs.get(current).last < 25000) return current;
    let best = null;
    for (const [id, t] of tabs) if (Date.now() - t.last < 25000 && (!best || t.first > tabs.get(best).first)) best = id;
    return (current = best);
  };

  const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok(null); } }); });
  const dispatch = () => { while (queue.length && waiters.length) waiters.shift()(queue.shift()); };

  return {
    name: 'dsoa-agent-bridge',
    configureServer(server) {
      // Compile errors never reach the page (the module fails to load), so capture Vite's
      // own error broadcasts too: agents see them in /agent/status and 503 replies.
      const wsSend = server.ws.send.bind(server.ws);
      server.ws.send = (payload, ...rest) => {
        if (payload && payload.type === 'error' && payload.err) {
          clientErrors.push({ kind: 'compile', message: String(payload.err.message).slice(0, 500), where: `${payload.err.id ?? ''}${payload.err.loc ? `:${payload.err.loc.line}:${payload.err.loc.column}` : ''}`, at: Date.now() });
          if (clientErrors.length > 20) clientErrors.shift();
        }
        return wsSend(payload, ...rest);
      };
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        if (!url.pathname.startsWith('/agent/')) return next();

        if (url.pathname === '/agent/client-error' && req.method === 'POST') {
          const e = await readBody(req);
          if (e) { clientErrors.push(e); if (clientErrors.length > 20) clientErrors.shift(); server.config.logger.error(`[game] ${e.kind}: ${e.message} ${e.where ?? ''}`); }
          return json(res, 200, { ok: true });
        }

        if (url.pathname === '/agent/status') {
          const connected = Date.now() - lastPoll < 25000;
          const recentErrors = clientErrors.filter((e) => Date.now() - e.at < 10 * 60000).slice(-5);
          const alive = [...tabs].filter(([, t]) => Date.now() - t.last < 25000).map(([id]) => id);
          return json(res, 200, { connected, tabs: alive.length, activeTab: activeTab(), lastPollMsAgo: lastPoll ? Date.now() - lastPoll : null, queued: queue.length, inflight: pending.size, recentErrors: recentErrors.length ? recentErrors : undefined,
            hint: connected ? undefined : 'Open http://localhost:3141/?agent=1 in a browser tab (any tab; background is fine — use the "step" command to advance time).' });
        }

        if (url.pathname === '/agent/next') {
          const tab = url.searchParams.get('tab') ?? 'anon';
          const t = tabs.get(tab) ?? { first: Date.now() };
          t.last = Date.now(); tabs.set(tab, t);
          if (activeTab() !== tab) { setTimeout(() => { res.statusCode = 204; res.end(); }, 5000); return; } // standby tab
          lastPoll = Date.now();
          let done = false;
          const timer = setTimeout(() => { if (done) return; done = true; const i = waiters.indexOf(give); if (i >= 0) waiters.splice(i, 1); res.statusCode = 204; res.end(); }, 20000);
          const give = (job) => { if (done) { queue.unshift(job); return; } done = true; clearTimeout(timer); lastPoll = Date.now(); json(res, 200, job); };
          req.on('close', () => { if (!done) { done = true; clearTimeout(timer); const i = waiters.indexOf(give); if (i >= 0) waiters.splice(i, 1); } });
          waiters.push(give);
          return dispatch();
        }

        if (url.pathname === '/agent/result' && req.method === 'POST') {
          const body = await readBody(req);
          const p = body && pending.get(body.id);
          if (p) { pending.delete(body.id); clearTimeout(p.timer); p.resolve(body.result); }
          return json(res, 200, { ok: true });
        }

        if (url.pathname === '/agent/cmd') {
          const body = req.method === 'POST' ? await readBody(req) : { cmd: url.searchParams.get('cmd') ?? 'help', args: Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'cmd')) };
          if (!body) return json(res, 400, { ok: false, error: 'body must be JSON: {"cmd":"state","args":{}}' });
          if (Date.now() - lastPoll > 25000) return json(res, 503, { ok: false, error: 'no game tab connected', recentErrors: clientErrors.slice(-3), hint: clientErrors.length ? 'The page reported errors (see recentErrors) — fix them; Vite reloads the tab automatically.' : 'Open http://localhost:3141/?agent=1 (npm run dev must be running).' });
          const id = ++seq;
          const timeoutMs = Number(body.timeoutMs ?? 900000);
          const result = await new Promise((resolve) => {
            const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: `timed out after ${timeoutMs}ms`, hint: 'Is the game tab frozen? Check /agent/status.' }); }, timeoutMs);
            pending.set(id, { resolve, timer });
            queue.push({ id, cmd: body.cmd, args: body.args ?? {}, batch: body.batch, stopOnError: body.stopOnError });
            dispatch();
          });
          return json(res, 200, result);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [agentBridge()],
  server: { port: 3141 },
  // Two pages: the game, and the Building Lab (docs/design/WEB_BUILDING_LAB.md) on the game's own generators.
  build: { chunkSizeWarningLimit: 1200, rollupOptions: { input: { main: 'index.html', lab: 'lab.html' } } },
});
