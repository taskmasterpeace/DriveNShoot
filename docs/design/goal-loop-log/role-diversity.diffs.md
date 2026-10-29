
### round 1 (2026-10-29 01:52): 0.9634 -> 0.9661
```diff
src/data/occupations.js @1
- // OCCUPATIONS (docs/design/WEB_OCCUPATIONS.md): the work people do in the settlements of the country. A row is a JOB:
- // where it is done (building kinds from data/citygen.js KINDS, a site's hero structures by name, or an open-air spot),
- // its shift on the game clock, what the worker carries, what the work makes (law 2: goods come from real work and only
- // from it; world/occupations.js counts the work hours, systems/workforce.js pays them out), what the job fits (the
- // settlement tags below) and how the worker talks.
- //
- // A settlement's MIX is a pure function of these rows and its plan record (world/occupations.js mixOf): its TAGS come
- // from its archetype, its biome, its site row's kind, what its site row makes, its hero structures and who holds it
- // (FACTION_CLASS); every job scores base + the sum of its fit over those tags, times its faction factor, times its
- // wealth fit, times a per-settlement jitter (MIX.jitter: two towns of a kind never hire alike); the workforce is shared
- // out by those scores, never more than a job's cap of it (row `max`, else MIX.cap), never a job with no workplace.
- //
- // Row fields:
- //   name     what people call the job.                 at     building kinds it is worked in (any of)
- //   hero     a regex over a site's hero structure names (a pier, a headframe) that also counts as its workplace
- //   out      an open-air spot instead: street | edge | gate (walls or a hold) | dock (water) | field (land worked)
- //   shift    [from, to] game hours (to < from runs past midnight)
- //   carry    ITEMS ids the worker has on them        makes  [item, work hours per unit, most a workplace keeps, label]
- //   deals    what they trade (data/trade.js deal kinds), for a worker who sells rather than makes
- //   fit      { tag: weight } added to base when the settlement has the tag
- //   needs    the settlement must have at least one of these tags        bans   none of these tags
- //   fac      { class: factor } (0 = never; missing = 1)    wealth [lo, hi]: outside it the score is x MIX.offWealth
- //   minN     the smallest workforce that has one of these (a judge needs a town)   one: at most one worker
```

### round 2 (2026-10-29 01:52): 0.9661 -> 0.9702
```diff
src/data/occupations.js @114
- scavenger: J({ name: 'scavenger', out: 'edge', shift: DAY, carry: ['crowbar', 'satchel'], makes: ['scrap', 3, 20, 'salvage off the dead streets'], base: 0.5, fit: { ruin: 1.4, salvage: 1.2, suburb: 1, metro: 0.6, hot: 0.
+ scavenger: J({ name: 'scavenger', out: 'edge', shift: DAY, carry: ['crowbar', 'satchel'], makes: ['scrap', 3, 20, 'salvage off the dead streets'], base: 0.5, fit: { ruin: 1.4, salvage: 1.2, suburb: 1, metro: 0.6, hot: 0.
```

### round 4 (2026-10-29 01:52): 0.9702 -> 0.9783
```diff
src/data/occupations.js @31
- jitter: 0.35,    // per settlement and job: score x exp(jitter x u), u in [-1, 1] from the seed
+ jitter: 0.5,     // per settlement and job: score x exp(jitter x u), u in [-1, 1] from the seed
```

### round 5 (2026-10-29 01:53): 0.9783 -> 0.9797
```diff
src/data/occupations.js @202
- sentry: J({ name: 'sentry', at: ['guardhouse'], out: 'gate', shift: DAY, needs: ['military'], carry: ['gun_rifle', 'ammo_rifle', 'combat_helmet'], base: 0.6, fit: { military: 1.6 }, fac: { garrison: 1.6 },
+ sentry: J({ name: 'sentry', at: ['guardhouse'], out: 'gate', shift: DAY, needs: ['military'], carry: ['gun_rifle', 'ammo_rifle', 'combat_helmet'], base: 0.6, fit: { military: 1.6 }, fac: { garrison: 1.6 }, max: 0.22,
```

### round 9 (2026-10-29 01:53): 0.9797 -> 0.9824
```diff
src/data/occupations.js @164
+ harvest_crew: J({ name: 'harvest crew hand', out: 'field', shift: [5, 17], needs: ['farm'], minN: 45, carry: ['work_gloves', 'machete'], base: 1, fit: { farm: 2, plains: 0.4 }, max: 0.12,
+ talk: ['Wheat does not wait. When it is ripe the whole farm goes into the field.', 'Bring the whole crew or lose the crop, that is the arithmetic.', 'The big farms hire hands by the season. Small ones just pray for rain.
```

### round 11 (2026-10-29 01:54): 0.9824 -> 0.9851
```diff
src/data/occupations.js @108
- storekeeper: J({ name: 'storekeeper', at: ['shop'], hero: 'store|trading_post|general', shift: DAY, carry: ['road_atlas'], deals: ['food', 'tool', 'pack'], base: 0.9, fit: { market: 0.8, trade: 0.6, civic: 0.3 }, max: 0.
+ storekeeper: J({ name: 'storekeeper', at: ['shop'], hero: 'store|trading_post|general', shift: DAY, carry: ['road_atlas'], deals: ['food', 'tool', 'pack'], base: 0.9, fit: { market: 0.8, trade: 0.6, civic: 0.3 }, max: 0.
```

### round 12 (2026-10-29 01:54): 0.9851 -> 0.9864
```diff
src/data/occupations.js @238
- porter: J({ name: 'porter', out: 'street', shift: DAY, carry: ['backpack'], base: 0.25, fit: { market: 0.6, trade: 0.6, rail: 0.6, casino: 0.4 }, wealth: [0, 0.7],
+ porter: J({ name: 'porter', out: 'street', shift: DAY, carry: ['backpack'], base: 0.25, fit: { market: 0.6, trade: 0.6, rail: 0.6, casino: 0.4 }, wealth: [0, 0.7], minN: 10,
```

### round 14 (2026-10-29 01:56): 0.9864 -> 0.9892
```diff
src/data/occupations.js @132
- tanner: J({ name: 'tanner', at: ['barn', 'warehouse'], shift: DAY, carry: ['knife', 'work_gloves'], makes: ['leather_cap', 8, 6, 'cured leather'], base: 0.3, fit: { ranch: 1.2, hunting: 1.2, swamp: 0.4 },
+ tanner: J({ name: 'tanner', at: ['barn', 'warehouse'], shift: DAY, carry: ['knife', 'work_gloves'], makes: ['leather_cap', 8, 6, 'cured leather'], minN: 45, base: 0.3, fit: { ranch: 1.2, hunting: 1.2, swamp: 0.4 },
```

### round 15 (2026-10-29 01:56): 0.9892 -> 0.9905
```diff
src/data/occupations.js @224
- trapper: J({ name: 'trapper', at: ['cabin'], out: 'edge', shift: DAWN, needs: ['cold', 'forest', 'hunting'], carry: ['knife', 'leather_vest'], makes: ['leather_vest', 12, 4, 'furs and a stitched vest'], base: 0.2, fit: {
+ trapper: J({ name: 'trapper', at: ['cabin'], out: 'edge', shift: DAWN, needs: ['cold', 'forest', 'hunting'], carry: ['knife', 'leather_vest'], makes: ['leather_vest', 12, 4, 'furs and a stitched vest'], base: 0.2, fit: {
```
