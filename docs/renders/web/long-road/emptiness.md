# THE LONG ROAD: emptiness report (I-10, Los Angeles to El Paso through Phoenix)

**Measured 2026-10-30** on the harness at :3518 (merged with `origin/integrate/deathlands` efa32b9a), with
`longRoad action=audit beats=false` (before) and `longRoad action=audit` (after). `selftest only=long-road`: **7/7**.

The audit walks the built I-10 centreline. Per game mile it counts what a driver can see or meet within 140 m of the
road: signs, exits, towns (within 2.5 km), THE ROADSIDE's sites, billboards and hazards, holdouts, and the wayside
beats. A DEAD stretch is more than 150 s of driving at 30 m/s (about 67 mph) with none of them.

| | before | after |
|---|---|---|
| I-10 built length | 54.5 game mi (49 min at 30 m/s) | same |
| things seen from the road | 50 | 59 |
| dead stretches (> 150 s with nothing) | **6** | **0** |
| minutes of dead driving | **20 of 49** | **0** |
| worst stretch | 257 s | 0 s |

**Dead stretches before** (game miles along I-10 from the west end):

- mile 0.9 to 5.7: 256 s with nothing
- mile 7.4 to 11: 192 s with nothing
- mile 19.6 to 22.4: 150 s with nothing
- mile 22.4 to 25.7: 177 s with nothing
- mile 36.2 to 41: 257 s with nothing
- mile 41.1 to 44.4: 174 s with nothing

**What fills them** (one beat per gap stretch, every ~70 s of driving):

| beat | mile | kind | travellers (flag) | from, to |
|---|---|---|---|---|
| lr-0 | 2.7 | A BURNED-OUT CHECKPOINT | - | - |
| lr-1 | 4.2 | AN AMBUSH SET UP | PILAR ACOSTA (ar), BONE KEANE (au) | PHOENIX to LOS ANGELES |
| lr-2 | 9.7 | A HITCHHIKER | JUNE PARRISH (us) | PHOENIX to LOS ANGELES |
| lr-3 | 20.9 | A BURNED-OUT CHECKPOINT | - | - |
| lr-4 | 24.6 | A ROADSIDE STALL | MARISOL VEGA (mx) | LOS ANGELES to PHOENIX |
| lr-5 | 37.6 | AN AMBUSH SET UP | CUTTER (us), DRY HOLLIS (us) | EL PASO to PHOENIX |
| lr-6 | 39.1 | A ROADSIDE STALL | ABE KOWALCZYK (pl) | PHOENIX to EL PASO |
| lr-7 | 42.6 | A FAMILY BROKEN DOWN | DANIEL ORTIZ (us), ROSA ORTIZ (mx), MATEO ORTIZ (us) | PHOENIX to EL PASO |
| lr-8 | 43.7 | A ROADSIDE STALL | NNAMDI OKAFOR (ng) | PHOENIX to EL PASO |

**Per mile, things seen** (one digit per game mile, mile 0 at the west end; + = ten or more):

```
before 2000021100101015310100100120011521101000110010333011100
after  2010121101101015310110101120011521101101111110333011100
```

## What the numbers do not count (yet)

- **Moving things:** traffic, semis, convoys, migrating hordes, fauna. The audit is static; they need a driven route
  log that samples `look` along the way (not run tonight).
- **The roadscape and chunk wrecks:** tree walls, fences, crop rows and the dead cars chunkgen strews on every
  shoulder. They are scenery, not something to stop for. So the before count is honest about having nothing to DO,
  not about having nothing to SEE.
- **THE ROADSIDE's stations, junkyards and farms:** none falls within 140 m of the I-10 centreline (they sit off the
  exits), so only their billboards and the downed line count.
- **Radio lines** and pulls-board jobs pointing down the road.
- **Back roads and Florida's corridors:** this audit walks I-10 only.

## Screenshots (game camera, zoom WIDE, 16:00, clear)

| | |
|---|---|
| `01-family-mile43.jpg` | the Ortiz family's van on the westbound shoulder, Phoenix to El Paso |
| `02-stall-mile25.jpg` | Marisol Vega's stall off a stripped pickup bed, Los Angeles to Phoenix |
| `03-ambush-mile4.jpg` | a sedan pulled onto the shoulder, two Dustwolves firing from behind it |
| `04-hitch-mile10.jpg` | June Parrish on the shoulder, trying for Los Angeles |
| `05-checkpoint-mile21.jpg` | two burned cars across the shoulder at mile 21 |

Staging: the player stands 260 m short of a beat for 2 s (the beat is made real out of view), then on the beat. The
staging teleports the player, never the world.
