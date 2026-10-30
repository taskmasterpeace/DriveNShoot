# The photo tour

A named screenshot of every screen and system in DSOA, from the real game camera, re-run after each landing.

```bash
cd web
npm run agent &                          # or any dev server: DL_URL=http://localhost:<port>
DL_URL=http://localhost:3508 node tools/tour.mjs                  # the whole tour (about 15 minutes)
DL_URL=http://localhost:3508 node tools/tour.mjs --only screens   # one or more sections: front hud screens vehicles combat infected gadgets world land
node tools/tour.mjs --list                                         # sections and step counts
node tools/tour-status.mjs                                         # feed the shots into the lead's status pane
```

- `docs/tour/<date>/` holds the run (`<section>-<name>.png`, `INDEX.json`, `INDEX.md`); `docs/tour/latest/` is the newest run, overwritten each time.
- `INDEX.json` has one row per shot: `section`, `name`, `caption`, `file`, `status` (`ok`, `skipped`, `failed`) and a `reason` for anything it could not reach. `INDEX.md` shows them all with the reasons.
- The tour never edits game code. It opens a private headless Chrome (its own throwaway profile, stopped by PID), reloads a fresh page per section, turns god mode on for staging, and only stages through the existing agent commands and the panels' own open calls. After every step it restores the section's baseline save so one shot never leaks into the next.
- The shots are real DOM screenshots (the HUD and every panel are in them, unlike `dl screenshot`).
- To add a shot, add a step to `web/tools/tour-sections.mjs` (screens) or `web/tools/tour-sections2.mjs` (in play): `{ name, caption, run(t) }`. Throw `new Skip('why')` for a thing that cannot be reached yet and the reason lands in `INDEX.md`.
