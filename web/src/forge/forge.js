// THE WORLD FORGE (web/forge.html, docs/design/WEB_FORGE.md): one gateway for every world tool, served by the game's own
// Vite server. Tabs in the order of docs/design/WEB_WORLD_EDITOR_PLAN.md §3.2; MAP, TERRAIN and BRUSH are editors on the
// shared row model (core.js), BUILDING and OBSERVE mount the tools that exist, TOWN, SITE, LIFE and VOICE are the cards
// of the systems being built. window.FORGE lets an agent (or the selftest) drive the page.
import { F, el, svg, $, startHealth, undo, redo, openPalette, addPalette, openDrawer, closeDrawer, pickGameTab, updateStatus, emit, on, push, toast } from './core.js';
import { mapTab } from './tab-map.js';
import { terrainTab } from './tab-terrain.js';
import { brushTab } from './tab-brush.js';
import { observeTab, buildingTab } from './tab-mount.js';
import { stubTab } from './tab-stub.js';
import { seasonsTab } from './tab-seasons.js';
import { HELP } from './help.js';

const FORGE = (window.FORGE = { ready: false, error: null });
async function boot() {
try {
  const tabs = [mapTab(), terrainTab(), brushTab(), stubTab('town'), buildingTab(), stubTab('site'), stubTab('life'), stubTab('voice'), seasonsTab(), observeTab()];
  const nav = $('#tabs'), deck = $('#deck');
  for (const t of tabs) {
    F.tabs.set(t.id, t); F.order.push(t.id);
    deck.append(t.pane);
    nav.append(el('button', { class: `tab${t.stub ? ' stub' : ''}`, role: 'tab', 'data-tab': t.id, title: t.stub ? `${t.label}: planned (what it will edit, and how to drive it now)` : t.label, html: `${svg(t.icon)}<span>${t.label.toUpperCase()}</span>`, onclick: () => show(t.id) }));
  }
  let inited = new Set();
  async function show(id) {
    if (!F.tabs.has(id)) return;
    const prev = F.tabs.get(F.tab);
    F.tab = id;
    for (const [k, t] of F.tabs) t.pane.classList.toggle('on', k === id);
    nav.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    prev?.onHide?.();
    const t = F.tabs.get(id);
    if (!inited.has(id)) { inited.add(id); await t.init?.(); }
    t.onShow?.();
    const u = new URL(location.href); u.hash = id; history.replaceState(null, '', u);
    if ($('#drawer').classList.contains('open')) help();
    updateStatus();
  }
  F.show = show;
  function help() { const t = F.tabs.get(F.tab); openDrawer(`HOW TO USE · ${t.label.toUpperCase()}`, HELP[t.stub ? 'stub' : t.id] ?? HELP.stub); }

  // The bar.
  $('#tabchip').onclick = pickGameTab;
  $('#btnPalette').onclick = openPalette;
  $('#btnHelp').onclick = () => ($('#drawer').classList.contains('open') ? closeDrawer() : help());
  $('#drawerClose').onclick = closeDrawer;
  const live = $('#livePush'); F.live = live.checked; live.onchange = () => { F.live = live.checked; toast(F.live ? 'Every write is pushed into the attached game' : 'Writes go to disk only; push by hand (palette: Push)', '', F.live ? 'LIVE ON' : 'LIVE OFF'); };

  // Keys: the shell's, then the tab's.
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select') && !e.target.closest('#palette');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (typing || document.querySelector('dialog[open]') || !$('#palette').classList.contains('hidden')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape' && $('#drawer').classList.contains('open')) { closeDrawer(); return; }
    if (e.key === '?' || e.key === 'F1') { e.preventDefault(); help(); return; }
    if (e.altKey && /^[1-9]$/.test(e.key)) { show(F.order[Number(e.key) - 1]); e.preventDefault(); return; }
    if (F.tabs.get(F.tab)?.onKey?.(e)) e.preventDefault();
  });

  // The palette's shell commands.
  addPalette(() => [
    ...F.order.map((id, i) => ({ label: `Go to ${F.tabs.get(id).label.toUpperCase()}`, hint: `Alt ${i + 1}`, tag: 'TAB', run: () => show(id) })),
    { label: 'Undo (this tab)', hint: 'Ctrl Z', tag: 'EDIT', run: () => undo() }, { label: 'Redo (this tab)', hint: 'Ctrl Y', tag: 'EDIT', run: () => redo() },
    { label: 'Push the map rows into the game', hint: 'forgePush file=usmap', tag: 'PUSH', run: () => push('usmap') },
    { label: 'Push the brush rows into the game', hint: 'forgePush file=brush', tag: 'PUSH', run: () => push('brush') },
    { label: 'Attach to a game tab', hint: 'the chip', tag: 'GAME', run: pickGameTab },
    { label: 'How to use this tab', hint: '?', tag: 'HELP', run: help },
  ]);

  startHealth();
  const first = F.tabs.has(location.hash.slice(1)) ? location.hash.slice(1) : 'map';
  await show(first);
  // Agents (and the selftest) drive the page through this.
  Object.assign(FORGE, {
    ready: true, F, show, tabs: () => [...F.order], tab: (id) => F.tabs.get(id),
    map: F.tabs.get('map'), brush: F.tabs.get('brush'), terrain: F.tabs.get('terrain'), undo, redo, push,
  });
  emit('ready', {});
} catch (e) {
  FORGE.error = String(e?.stack ?? e);
  console.error(e);
  document.body.append(el('pre', { style: { position: 'fixed', inset: '80px 20px auto', color: '#f08a6a', background: '#1a120a', padding: '12px', zIndex: 99, whiteSpace: 'pre-wrap' } }, FORGE.error));
}
}
boot();
