// The photo tour's sections (tools/tour.mjs). Each step stages one thing through the existing agent commands and the
// panels' own open calls, then the tour takes the shot. Nothing here edits game code.
//   step: { name, caption, run(t) }   t = { call, need, ev, step, sleep, D, Skip, ... }
import extra from './tour-sections2.mjs';
import { GEAR } from '../src/data/gear.js';
import { HUD_PRESETS, PRESET_IDS, SITUATION_IDS } from '../src/data/hudlayout.js';

export default ({ Skip }) => {
  const zoom = (t, level) => t.call('zoom', { level });
  const panel = async (t, pid, tab) => {
    const r = await t.call('panelLayout', { action: 'open', panel: pid, ...(tab !== undefined ? { tab } : {}) });
    if (r?.ok === false) throw new Skip(`panel ${pid}: ${r.error ?? r.why ?? 'would not open'}`);
    await t.sleep(600);
  };
  const people = (t, n = 4) => t.call('spawn', { kind: 'drifter', count: n, x: 6, z: -34 });

  const SECTIONS = [];

  // ======================================================================================== FRONT DOOR
  SECTIONS.push({
    id: 'front', title: 'Front door', title_screen: true,
    blurb: 'What a player meets first: the title screen and the character creator, step by step.',
    steps: [
      { name: 'title', caption: 'The title screen: MAKE A SURVIVOR / QUICK START, before anything has started.', run: async (t) => { await t.until('document.querySelector(".title")'); } },
      ...[['origin', 1, 0.45], ['background', 4, 0.62], ['attributes', 0, 0.3], ['traits', 1, 0.55], ['look', 6, 0.38], ['kit', 0, 0.5]].map(([s, focus, spin], i) => ({
        name: `creator-${i + 1}-${s}`, caption: `THE CREATOR, step ${i + 1} of 6 (${s}): a worked example survivor (Haitian-born mechanic out of Florida).`,
        run: async (t) => {
          await t.ev(`const C = game.creator, U = game.creatorUI;
            if (!document.querySelector('.cr:not(.hidden)')) { U.open({ fromTitle: true });
              C.set({ name: 'Mara Quill', flag: 'HT', state: 'FL', background: 'mechanic', look: { build: 'broad', skin: 4, hairStyle: 'mohawk', hair: 7, hat: 0, face: 'goggles', scar: 'cheek', scarStory: 2, shirt: 8, pants: 5, boots: 1, sleeves: 'short' } });
              C.setRank('strength', 4); C.setRank('endurance', 3); C.setRank('wits', 3); C.setTrait('tinker', true); C.setTrait('bad_back', true); }
            U.goStep(${i}); U.focus = ${focus}; U.refresh(); if (U.preview) { U.preview.spin = ${spin}; U.preview.drag = 0; } return true;`);
        },
      })),
      { name: 'begin', caption: 'BEGIN: the made survivor drops into the world with their flag and name on the HUD.', run: async (t) => {
        await t.ev(`const U = game.creatorUI; if (U.preview) U.preview.drag = null; U.begin(); return true;`);
        await t.until('!document.querySelector(".title") && !game.paused'); await t.call('god', { on: true }); await t.step(2);
      } },
    ],
  });

  // ======================================================================================== HUD
  SECTIONS.push({
    id: 'hud', title: 'The HUD', blurb: 'The default HUD on foot, at the wheel, at night, and each preset and situation as the F6 editor shows it (names on).',
    steps: [
      { name: 'default-onfoot', caption: 'The default HUD on foot, mid-morning in Rust Haven: health, cash, weapon plate, minimap, objective.', run: async (t) => { await people(t, 2); await t.step(1); } },
      { name: 'default-driving', caption: 'The HUD at the wheel: speedometer and dash replace the gun plate.', run: async (t) => {
        const v = await t.need('spawnVehicle', { type: 'interceptor', x: 6, z: -40 }); await t.need('enterVehicle', { id: v.id, force: true }); await t.step(1); } },
      { name: 'default-night', caption: 'The HUD at night: the night situation, headlights, dark world.', run: async (t) => {
        const v = await t.need('spawnVehicle', { type: 'interceptor', x: 6, z: -40 }); await t.need('enterVehicle', { id: v.id, force: true });
        await t.call('setTime', { hour: 23 }); await t.step(1.5); } },
      ...PRESET_IDS.map((p) => ({ name: `preset-${p}`, caption: `HUD PRESET ${HUD_PRESETS[p].name.toUpperCase()}: ${HUD_PRESETS[p].blurb}. Edit mode, element names on.`, run: async (t) => {
        await t.need('hudLayout', { action: 'preset', name: p }); await t.need('hudLayout', { action: 'edit', on: true, panel: false }); await t.need('hudLayout', { action: 'situation', name: 'on_foot' });
      } })),
      ...SITUATION_IDS.filter((s) => s !== 'on_foot').map((s) => ({ name: `situation-${s}`, caption: `HUD SITUATION ${s.toUpperCase()}: what the layout shows in that state (Default preset, edit mode, names on).`, run: async (t) => {
        await t.need('hudLayout', { action: 'preset', name: 'default' }); await t.need('hudLayout', { action: 'edit', on: true, panel: false }); await t.need('hudLayout', { action: 'situation', name: s });
      } })),
      { name: 'f6-editor', caption: 'THE F6 EDITOR: the HUD layout editor with its panel open and the cash plate selected.', run: async (t) => {
        await t.need('hudLayout', { action: 'preset', name: 'default' }); await t.need('hudLayout', { action: 'edit', on: true, panel: true });
        await t.ev(`game.hud.editor.select('cash'); return true;`); } },
    ],
  });

  // ======================================================================================== SCREENS
  SECTIONS.push({
    id: 'screens', title: 'Screens and panels', blurb: 'Every full screen a player can open: pack, the paperdoll, the character sheet, crew, dialogue, travel, workshop, pulls, map, pause and settings.',
    steps: [
      { name: 'pack', caption: 'THE PACK (I / Tab): carried items, weight, the weapon slots.', run: async (t) => {
        for (const it of ['bandage', 'canned_food', 'water_bottle', 'lockpick']) await t.call('item', { give: it, n: 2 }).catch(() => {});
        await t.need('pack', { on: true }); await t.sleep(500); } },
      { name: 'doll-bare', caption: 'THE DOLL, bare: the 19-slot paperdoll before anything is worn.', run: async (t) => { await t.need('pack', { on: true }); await t.sleep(500); } },
      { name: 'doll-kitted', caption: 'THE DOLL, kitted out: one piece worn in every slot that has gear (armor, clothing, accessories), with the soak numbers it adds.', run: async (t) => {
        const bySlot = {};
        for (const [id, row] of Object.entries(GEAR)) (bySlot[row.slot] ??= []).push(id);
        let worn = 0;
        for (const ids of Object.values(bySlot)) { await t.call('gear', { give: ids[0] }); const r = await t.call('gear', { wear: ids[0] }); if (r?.ok !== false) worn++; }
        if (!worn) throw new Skip('gear: nothing could be worn');
        await t.need('pack', { on: true }); await t.sleep(600); } },
      { name: 'sheet-attributes', caption: 'CHARACTER SHEET (`): attributes.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'attributes' }); } },
      { name: 'sheet-skills', caption: 'CHARACTER SHEET: skills level by doing.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'skills' }); } },
      { name: 'sheet-perks', caption: 'CHARACTER SHEET: perks.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'perks' }); } },
      { name: 'sheet-traits', caption: 'CHARACTER SHEET: traits.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'traits' }); } },
      { name: 'sheet-body', caption: 'CHARACTER SHEET: the body, wounds and what they tax.', run: async (t) => { await t.call('wound', { add: 'laceration' }); await t.need('charsheet', { open: true, tab: 'body' }); } },
      { name: 'sheet-standing', caption: 'CHARACTER SHEET: standing with every faction, and the roles the world calls you.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'standing' }); } },
      { name: 'sheet-journal', caption: 'CHARACTER SHEET: the journal.', run: async (t) => { await t.need('charsheet', { open: true, tab: 'journal' }); } },
      { name: 'crew', caption: 'THE CREW panel (U): crew cards, formation, orders.', run: async (t) => {
        for (const row of ['wheelboss', 'quartermaster']) await t.call('crewJoin', { spawn: row }).catch(() => null);
        await t.step(1); await panel(t, 'crew'); } },
      { name: 'dialogue', caption: 'DIALOGUE: a named character with portrait, line and choices.', run: async (t) => {
        await t.call('teleport', { town: 'rust haven' }).catch(() => {}); await t.step(1);
        const r = await t.call('talk', { id: 'okonkwo', force: true });
        if (r?.ok === false) { await panel(t, 'dialogue'); } await t.sleep(600); } },
      { name: 'travel-board', caption: 'THE TRAVEL BOARD (sample departures: the trundle / SUN LINE).', run: async (t) => { await panel(t, 'travel'); } },
      { name: 'travel-real', caption: 'THE TRAVEL PANEL at a real pole: the line, the next trundle, the fare.', run: async (t) => { await t.call('teleport', { town: 'haven' }); await t.need('travel', { action: 'panel', node: 'haven' }); await t.sleep(600); } },
      ...['armor', 'weapons', 'utility', 'ammo', 'repair', 'paint'].map((tab, i) => ({ name: `workshop-${tab}`, caption: `THE WORKSHOP, ${tab.toUpperCase()} tab: the car's six faces, mounts with arcs, the rack and the bill.`, run: async (t) => {
        await panel(t, 'workshop', i); } })),
      { name: 'pulls-board', caption: 'THE PULLS BOARD: why go out today, as the bar board shows it.', run: async (t) => {
        const sp = await t.need('pulls', { action: 'spawn', kind: 'hitchhiker' }); await t.call('pulls', { action: 'hear', channel: 'rider' }); const id = sp.id;
        await t.need('pulls', { action: 'view', id }); await t.sleep(600); } },
      { name: 'map', caption: 'THE MAP (M): the big map of I-10 and the island.', run: async (t) => { await t.ev(`game.qol.toggleMap(true); return true;`); } },
      { name: 'pause-game', caption: 'PAUSE (Esc): the GAME tab.', run: async (t) => { await t.ev(`game.qol.toggleMenu(true); game.qol.showTab('game'); return true;`); } },
      { name: 'pause-you', caption: 'PAUSE: the YOU tab (this run).', run: async (t) => { await t.ev(`game.qol.toggleMenu(true); game.qol.showTab('you'); return true;`); } },
      { name: 'pause-log', caption: 'PAUSE: the LOG tab.', run: async (t) => { await t.ev(`game.qol.toggleMenu(true); game.qol.showTab('log'); return true;`); } },
      { name: 'settings', caption: 'PAUSE: SETTINGS.', run: async (t) => { await t.ev(`game.qol.toggleMenu(true); game.qol.showTab('settings'); return true;`); } },
      { name: 'controls', caption: 'PAUSE: CONTROLS (F11), every bind a rebindable row, key and pad.', run: async (t) => { await t.ev(`game.qol.toggleMenu(true); game.qol.showTab('controls'); return true;`); } },
    ],
  });

  return [...SECTIONS, ...extra({ Skip, zoom })];
};
