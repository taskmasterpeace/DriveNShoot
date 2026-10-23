// OBSERVE and BUILDING (docs/design/WEB_FORGE.md §3.6): the tools that already exist, mounted, never rewritten. The
// observer (observe.html, docs/design/WEB_OBSERVER.md) watches and drives the attached game tab; the Building Lab
// (lab.html, docs/design/WEB_BUILDING_LAB.md) makes floor plans on the game's own generators and stands them in the ring.
import { F, el, svg, on, showDoc, addPalette } from './core.js';

function mount({ id, label, icon, title, sub, src, doc, notes }) {
  const pane = el('section', { class: 'pane pane-mount', id: `pane-${id}` });
  const box = el('div', { class: 'mount', id: `mount-${id}` }, el('div', { class: 'loading' }, `MOUNTING ${title}…`));
  let frame = null;
  const url = () => (typeof src === 'function' ? src() : src);
  const open = () => window.open(url(), '_blank');
  const reload = () => { if (frame) frame.src = url(); };
  pane.append(el('div', { class: 'mountbar plate' }, el('h2', {}, title), el('span', { class: 'sub' }, sub), el('span', { class: 'grow' }),
    notes ? el('span', { class: 'sub', html: notes }) : null,
    el('button', { class: 'btn mini', html: `${svg('doc')}<span>${doc.split('/').pop().replace('.md', '')}</span>`, onclick: () => showDoc(doc) }),
    el('button', { class: 'btn mini', title: 'Load it again', html: `${svg('redo')}<span>RELOAD</span>`, onclick: reload }),
    el('button', { class: 'btn mini', title: 'Open it in its own window (the observer runs best beside the game, never in a hidden tab)', html: `${svg('fit')}<span>OWN WINDOW</span>`, onclick: open })), box);
  addPalette(() => [{ label: `${title}: open in its own window`, hint: url(), tag: id.toUpperCase(), run: open }]);
  return {
    id, label, icon, pane, frame: () => frame,
    async init() {},
    onShow() {
      if (frame) return;
      frame = el('iframe', { src: url(), title, allow: 'fullscreen' });
      frame.addEventListener('load', () => box.querySelector('.loading')?.remove());
      box.append(frame);
    },
    reload,
  };
}

export function observeTab() {
  const t = mount({
    id: 'observe', label: 'Observe', icon: 'observe', title: 'OBSERVE', sub: 'the observer · the live game: map, wire, people, record and replay, controls',
    src: () => `/observe.html${F.game.pin ? `?tab=${encodeURIComponent(F.game.pin)}` : ''}`, doc: 'docs/design/WEB_OBSERVER.md',
    notes: 'every button in it is a COMMANDS row',
  });
  let pinned = F.game.pin;
  on('game', () => { if (F.game.pin !== pinned) { pinned = F.game.pin; t.reload(); } });
  return t;
}
export function buildingTab() {
  return mount({
    id: 'building', label: 'Building', icon: 'building', title: 'BUILDING', sub: 'the Building Lab · floor plans, storeys and stairs on the game\'s own generators',
    src: '/lab.html', doc: 'docs/design/WEB_BUILDING_LAB.md',
    notes: 'stand an export in the game: <code>author row= x= z=</code>',
  });
}
