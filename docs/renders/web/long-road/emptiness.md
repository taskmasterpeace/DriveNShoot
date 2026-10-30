# THE LONG ROAD: emptiness report (I-10)

**Status 2026-10-29 23:52: NOT MEASURED YET.** The tool is built, but the first numbers have not been run. My harness
on :3518 never got a headless browser to connect: the machine was crowded, and `tools/agent.mjs` gave up after 30 s
("browser did not connect to the bridge"). No route was driven and no screenshots were taken.

How to fill this in (one harness, your own port):

```
cd web && DL_URL=http://localhost:3518 npm run agent
DL_URL=http://localhost:3518 node tools/dl.mjs longRoad action=audit beats=false   # BEFORE: the road as it was
DL_URL=http://localhost:3518 node tools/dl.mjs longRoad action=audit                # AFTER: with the wayside beats
DL_URL=http://localhost:3518 node tools/dl.mjs longRoad action=beats
DL_URL=http://localhost:3518 node tools/dl.mjs selftest only=long-road
```

The audit walks the built I-10 centreline at a 200 m step. Per game mile it lists what can be seen or met within 140 m
of the road: signs, exits, towns (within 2.5 km), THE ROADSIDE's sites, billboards and hazards, holdouts, and the
wayside beats. A DEAD stretch is longer than 150 s of driving at 30 m/s with none of them. Paste the before and after
`gaps`, `deadMin`, `worstS` and `perMile` here.

Not counted yet: moving things such as traffic, semis, convoys and fauna, plus radio lines. The static audit cannot
see them; they need a driven route log (see WEB_LONG_ROAD.md §8).
