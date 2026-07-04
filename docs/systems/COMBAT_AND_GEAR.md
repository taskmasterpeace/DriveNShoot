# DRIVN — Combat & Gear (melee, ranged, throwables, car weapons, loadout)

**Status:** DESIGN · **Created:** 2026-07-04 · **Primary stages:** 4 (Combat), 3 (Gear), M3 (car mounts)
**Tone:** gritty, permadeath, **ammo is scarce** (Deathlands: wealth ≈ bullets owned). You avoid
as often as you fight; every shot costs a resource you had to scavenge.

---

## 1. One Weapon System (foot AND car) — the multi-use core
A weapon is a **`DataWeapon` resource**: `{ name, icon, fire_behavior, damage, fire_rate, mag,
reload, spread, caliber, projectile_speed, recoil, mount_type: handheld|vehicle, arc }`. Ports the
2D `weapon_system.gd`/`projectile.gd` (already team-aware). **Three fire behaviors** cover almost
everything: `HITSCAN` (pistols/rifles), `PROJECTILE` (rockets/grenade-launchers), `BEAM/CONE`
(flamethrower). The SAME system fires whether the gun is in your hands or bolted to a car — that's
why car-guns and foot-guns aren't two systems. **Ammo = caliber items** in the inventory (shared
pools); reload pulls from reserve; empty = dry click.

## 2. On-foot ranged — aim is intent, accuracy is a cone
Full model in `INTERFACE_AND_BODY.md §6` (researched): mouse marks intent; the shot lands in a
**bloom cone** set by **Marksmanship** + stance + movement; **first shot from rest is near-perfect**;
**visible projectiles fly the rolled vector** (misses are legible); reticle blooms/tightens.
Classes: pistol, SMG, rifle, pump shotgun (pellets = wide fixed cone), pipe-rocket (projectile,
explodes — reuses the car explosion), flamethrower (beam/cone, later).

## 3. Melee (NEW) — the ammo-independent backbone
Because ammo is scarce, **melee is your fallback and your quiet tool.**
- **Attacks:** **light** (fast, low stamina) / **heavy** (slow, knockback, high stamina, hits the
  whole arc). Stamina-gated (ties to the sprint/stamina system — swinging gassed is slow/weak).
- **Reach + arc:** big weapons sweep multiple enemies; knives are fast/single-target.
- **Weapon types:** **blunt** (bat, pipe, **wrench = also the repair tool → multi-use**), **bladed**
  (machete/knife → causes the *bleeding* injury from the body system), **improvised** (breaks —
  durability). 
- **Stealth:** a **backstab on an unaware enemy** (perception cone) = massive/instant damage; melee
  is **quiet** (guns raise heat, melee doesn't) — the stealth-vs-loud choice.
- **Dodge = the dive** (already built); shove/push to create space. No fussy parry (keep it gritty,
  not a fighting game).
- **Vs. vehicles:** melee a stopped car to smash a window = the loud **forced-entry** path (Getting-In).

## 4. Throwables (quick-slot)
Grenade (arc preview + cook timer), **Molotov** (fire zone — *reuses the car-fire `burn`* on the
DamageableComponent), smoke (breaks the vision cone — perception system), noise-maker (lures enemies
— heat/stealth). All are inventory items with a quick-slot.

## 5. Car Weapons (NEW) — the Autoduel meat
Built on the **chassis + modules** system (LOOP2/M3): the chassis exposes **mount points**
(front / roof / left / right / rear), each accepts a weapon module. Data-driven — a technical is
"pickup chassis + roof turret + side spikes" as a data list.

| Mount kind | Behavior | Who fires | Notes |
|---|---|---|---|
| **Fixed-forward** | fires where the car points (MG, autocannon) | **driver** | simplest; recoil nudges handling |
| **Turret** | aims independently via mouse, 360°/arc | **passenger gunner** or **turret-AI bot** | the co-op fantasy — driver drives, gunner shoots |
| **Dropped / rear** | mines, oil slick, caltrops, smoke | driver | deploy behind you in a chase |
| **Melee-vehicle** | ram plate, side blades, spikes (Mad Max mods) | contact | blades shred tires — *including yours on contact* |

- **Firing arcs:** each mount has an arc (front ~60°, side ~90°, turret 360°); your own car body
  blocks shots. **Recoil + weapon weight shift the center of mass** → heavy weapons make a light car
  unstable (ties to weight-emergent handling). **Firing raises heat** → the director answers.
- **Ammo:** light mounts share foot calibers; heavy mounts (rockets/shells) use separate heavy ammo.
- **Load/Class tradeoff:** weapons add mass → you can't max armor + guns + cargo. Forces
  **Scout / Raider / Tank / Mule** builds (LOOP2/M3 load system).
- **⭐ Multiplayer gunner seats:** passengers control turret mounts — **driver + gunner co-op is a
  core MP fantasy**; solo players fit a **turret-AI bot** (robotics tier) to man it.

## 6. Inventory, Loadout & Ammo (deepens `INTERFACE_AND_BODY.md §3`)
- **Containers** (one system): backpack + **car trunk** + world crates + corpses/husks. **Grid +
  weight hybrid** (EFT); **Pacific-Drive cargo insecurity** — rough driving flings loose trunk loot
  (wired to speed/collision/heat).
- **Equip slots:** head / body / hands + **holster (primary + secondary)** + back (pack).
  **Quick-slots 1–4** for throwables/consumables/meds. Weapons are items → stow, equip to holster,
  **quick-swap (1/2)**. Ammo = caliber items; reload pulls reserve.
- **Drop / place** ("put stuff down"): drop as a physical item; place-mode for deployables
  (mines, campfire, drone, later fort pieces).
- **Permadeath stakes:** on death your loadout drops to your corpse/husk — recoverable if you get
  back to it, **lootable by others in MP.** Extraction-survival tension.

## 7. Multi-use ledger (why this is cheap to build)
`weapon_system` = foot + car · **wrench** = repair tool + melee · **Container** = trunk + pack +
loot · **caliber ammo** = shared across many guns · **DamageableComponent** = body + car + walls ·
**Molotov fire** = reuses car-fire burn · **turret-AI** = robotics tier reused as a passenger.

*Cross-refs: `INTERFACE_AND_BODY.md` (aim cone, inventory UI, stamina), `loops/LOOP2_LIVING_CAR.md`
(arsenal + car damage), `PROGRESSION.md` (Marksmanship/Heavy Weapons/Mechanics), `STAGES.md`.*
