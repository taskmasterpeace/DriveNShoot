# WEB_MELEE: hand to hand (2026-10-29)

**Code:** `web/src/systems/melee.js` (one resolver for the player and every NPC), rows in `web/src/data/melee.js`
(+ `validateMelee`), commands and checks in `web/src/agent/melee-api.js`. Branch `feat/web-melee`.

## 1. Overview

Melee is fast, readable and lethal, and everyone fights by the same rows (law 1: nobody cheats).
- **Fists up** is the holstered stance, or having no gun. It has three buttons:
  - **PUNCH**: combo jabs; held and let go, a heavy.
  - **BLOCK**: hold. Raised right as the blow lands, it is a **PARRY**.
  - **GRAB**: from behind and unseen, the **neck**; from the front, a **clinch**.
- What is in your hand is whatever melee weapon you actually carry: brass knuckles, a knife, a machete, a baseball bat, a crowbar, a lead pipe or a sledgehammer.
- Each weapon is a row: reach, a wind-up you can **see**, recovery, damage by body part, knockdown, bone, bleed, sever and durability.
- A blocked bat still hurts your arm, and it can break your forearm. A blade blocked bare cuts you. A parried swing leaves the swinger open.
- A neck hold is a hostage: a human shield their friends won't fire through (the reckless will). You can walk them, have them open a locked door, choke them out, or let them go.
- A grab is a **struggle**: a bar that power moves. Power is strength, stamina, injuries and how hard you mash.
- Hits push bodies (a decaying slide that trips them over what they hit). Downed bodies get **finished**. Heavy blades take limbs.
- NPCs use all of it: bruisers with bats, guards that read wind-ups, parries, sneaking up for the neck, hostage-taking, running when beaten.
- The gun-in-hand verbs (`RMB/R3` strike, held kick, sprint shove; WEB_CONTROLLER §3.6) are unchanged and go through the same resolver.

## 2. Player fantasy

The feel is studied from top-down arcade brawlers of the late-2000s/2010s (public knowledge only: no code, art or names).
- Everything is fast. A hit kills or floors you. You can read a wind-up before it lands.
- Being caught with your guard down against a bat is a different outcome from catching it on your forearms, and both hurt.
- You slip behind a sentry, take him by the neck and walk him in front of you toward his friends. They lower their guns. One doesn't.
- A downed man gets stomped. A bat on a forearm cracks. A machete takes the hand. Big hits freeze the frame for a beat.

## 3. Detailed rules

### 3.1 Buttons (control rows, `data/controls.js`; F2 rebinds them)
| Verb | Keyboard | Pad (foot) | When |
|---|---|---|---|
| PUNCH / swing | LMB (hold ≥ 0.3 s and let go: a heavy; sprinting: a shove) | RT | fists up |
| BLOCK (parry) | RMB hold | LT | fists up (on the pad LT is the throw only with a gun out) |
| GRAB | G (tap: let go; hold: choke) | X | fists up (X is the reload only with a gun out) |
| What is in your hand | 0 | RB tap | fists up (RB tap cycles guns otherwise) |
| Kick | (heavy with bare hands) | R3 | fists up |
| Struggle | mash PUNCH / GRAB / BLOCK / E / Space | mash any face button | while held, or in a clinch |

The HUD row `melee` (`data/hudlayout.js`, bottom centre) shows what is in your hand and how worn it is: GUARD, STAGGERED, ARM HURT or ARM BROKEN. In a hold it shows the struggle bar, with gold for winning and red for losing.

### 3.2 A blow
1. **Press:** the blow costs stamina. Spent, it is weak (×0.5 damage, ×1.4 slower). You step 0.35 m into it.
2. **Wind-up** (`windup`, ×`heavy.wind` for a heavy): the pose draws the weapon back over the dominant shoulder, and the hips turn into it. NPCs that can see it decide whether to guard, after their reaction time.
3. **Contact:** the nearest target in reach and arc, with a line of sight. With the fists, every third jab inside 0.75 s is a combo: ×1.6 damage and always a knockdown. Then:
   - **Parry:** the target's guard came up ≤ 0.2 s before contact and faces the blow. No damage; the swinger is staggered for 1.05 s and open (×1.5 from the next hit).
   - **Block:** the guard is up and facing. The hit lands on the arms, cut by the soak (see §4). The arm fills its hp. Blunt on bare arms can break the forearm; a blade on bare arms cuts. Each block costs stamina; empty, the guard breaks.
   - **Clean:** a body part is rolled from the row's `aim` (the finisher always takes the head), ×`parts[part]`. Then come the knockdown roll, the bone roll (blunt on arms/legs), the sever roll (a heavy blade on a limb), the bleed, the push, blood and the feel.
4. **Recovery** (`recover`): nothing else can be done until it ends.

### 3.3 The grab
- In reach (1.25 m). **Behind** means the angle from their facing to you is over 110°. **Unseen** means they aren't fighting you and you aren't loud or in front of them in sight.
- Behind and unseen gives a **neck hold** that starts at +0.35 on the bar. Anything else is a **clinch** that starts at 0 and resolves at 3 s: the winner throws the loser down for 1.6 s.
- **The neck:**
  - The held stands 0.48 m in front of the holder, facing the same way, and walks with you at ×0.55.
  - **Hold G** to choke. It only closes while you are winning; it takes 6 s at full pace and leaves them out cold for 40 s.
  - **Tap G** to let go (a shove).
  - **PUNCH** strikes them: a knee to the gut, or the knife across the throat (120 damage).
  - **E** at a locked door: they open it.
- **The struggle:** the bar is −1 (they break free) to +1. Breaking free is an elbow (8 damage), a bite (6 damage and a bleed) or a shove, and the holder is staggered for 0.7 s.
- **Hostage / shield:** if anybody armed nearby is hostile to the holder (or the player's gun is up nearby), the hold is a shield. `ai.js clearShot` refuses a shot with a held person in the line, unless the shooter is reckless (`MELEE_AI.reckless`, stable per person). Rounds that do fly hit the first body in the line, the hostage.

### 3.4 Bodies
- **Push:** a hit gives velocity push / 0.22 s along the line of the blow, decaying with τ ≈ 0.1 s, resolved against the statics every frame.
- **Trip:** hitting something solid at ≥ 2.2 m/s knocks the body down for 1.2 s ("over the table").
- **Down:** `knockT` (the pose solver lays them out). A downed body in reach turns PUNCH into the **finisher**.
- **Limbs:** a severed arm or leg sets `c.lost.{larm,rarm,lleg,rleg}`. The pose solver stops drawing the forearm and hand, or the shin and boot. A lost leg puts them down. A head comes off only a body that is done (`headless` + the neck spray already in ai.js).
- The ragdoll and the stairs belong to the death library (deaths lane). It reads `limbOff`, `knockdown` and `boneBreak` events and `c.lost`.

### 3.5 The AI (same rules)
- **Bruisers:** 20% of the world's ambient raiders carry a real bat, pipe, machete, crowbar or knuckles and no gun. The weapon lies on their body when they die.
- An NPC with `meleeW` and no loaded gun runs `melee.think`:
  - It finds a hostile it can see within 16 m.
  - Most often it closes and swings (30% heavy, always heavy on an open target, the finisher on a downed one).
  - With probability `grab` it plans to sneak in behind an unaware target at 1.5 m/s and take the neck.
  - It flees below `flee` × max hp.
- **Guarding:** any engaged NPC that can see a wind-up aimed at it may guard. It must be fighting, wronged by or hostile to the swinger; a bystander's first punch lands. It does so after `react` s, with `block` chance, and `parry` of those guards are timed into the window. A wind-up faster than its reaction can't be read.
- **Holding the player:** an NPC holding you just holds on and chokes. You mash to break free.
- **Holding someone else:** an NPC holding a hostage faces the threat and backs away, barking. It lets go after 12 s.

## 4. Formulas (with an example)

```
str     = 1 + 0.05 x Strength level   (player: skills; raiders and soldiers 3, others 1)
dmg     = W.dmg x (heavy ? W.heavy.mul : 1) x (weak ? 0.5 : 1) x (combo ? 1.6 : 1) x str x meleeMul x (armBroken ? 0.55 : 1) x (target open ? 1.5 : 1)
clean   = dmg x W.parts[part]
block   soak = B.block.soak x (blade on bare arms ? 0.55 : 1) x (arm >= 50% ? 0.8 : 1) x (arm broken ? 0.35 : 1)
        through = dmg x (1 - soak);   arm += through x B.block.arm + (bare ? dmg x soak x 0.25 : 0)
knock   chance = W.knock[0] x (head ? 2 : 1) + (heavy ? W.heavy.knockAdd : 0)  (combo: 1);  secs = W.knock[1] x (heavy ? 1.3 : 1)
bone    chance (blunt, arm/leg) = W.bone x (heavy ? 1.5 : 1);  a blocked blunt hit on bare arms = W.bone x 0.5 (x1.5 heavy), or arm >= 60
sever   chance (blade, heavy or >= 40 dmg, arm/leg) = W.sever x (heavy ? 1.5 : 1)
power   = (1 + 0.08 x lvl) x strength x (0.35 + 0.65 x stamina) x (0.4 + 0.6 x hp/max) x (armBroken ? 0.6 : 1) x effort
effort  NPC 0.55..0.9 (re-rolled every 0.4 s); player min(1, presses/s / 6) x 1.8 (holding a neck: at least 0.6)
bar    += (holder power - held power) x 0.7 x dt
choke  += dt / 6 x (0.3 + 0.7 x bar)   while choking and bar > 0
```

**Example.** A Dustwolf (str 1.15) swings a bat heavy at you.
- Unblocked: 28 × 1.6 × 1.15 = 51.5. A head roll makes it 51.5 × 1.8 = **92.7**, with a knockdown chance of 0.4 × 2 + 0.35 = 1.15, so certain, for 2.3 s.
- Blocked on bare arms (fresh): soak 0.6, through = 51.5 × 0.4 = **20.6**. The arm takes 20.6 + 51.5 × 0.6 × 0.25 = 28.3 of its 60. The bone roll is 0.35 × 0.5 × 1.5 = 26%.
- Parried: **0**, and he stands open for 1.45 s.

## 5. Edge cases

- **God mode or the clinic's grace:** no damage (combat.js), and no knockdown, bone or limb on the player either.
- **The legacy verbs with a gun in hand:**
  - They run through the resolver with the old numbers (`data/arms.js MELEE`), with no part roll.
  - The old check still passes. Its dummy is `noGuard`, and blocking is the melee checks' job.
- **Light jabs never hit-stop.** A chain must stay crisp, and look-feel's "a 12-damage hit doesn't stop" rule holds. Heavies stop 70 ms, parries 90 ms and bone breaks 80 ms.
- **G conflicts:**
  - G is also hang-on-a-car / board-the-train and the burial key (rites.js deletes the press).
  - A grab only happens when the G press wasn't already spent, and hanging on a car makes `can()` false.
- **Hostage edge cases:**
  - Held, the hostage is out of the AI crowd separation (ai.js), or the shove would tear them out of the arm.
  - The holder knocked down, either side in a car, or a death ends the hold.
- **NPC holding NPC:** works (the struggle check uses it). An NPC holder's threat is the player only when the player isn't the one held.
- **Water:** swimming makes `can()` false (no grabs in the water).
- **Breakage:** a weapon's durability (`m.dur`, in the save for the player) runs out → it breaks: the item leaves your pack, and the hands are back.

## 6. Dependencies (both ways)

**Uses:**
- `combat.damage(c, dmg, by, dx, dz, cause, part)` with causes `bash` and `blade`.
- `look.stop` and `look.kick` (look-feel), `hud.shake`, `controls.rumble`.
- `blood.splash` and `fx.decal` / `bloodSpray` / `sparks`; `audio.burst`, `thud` and `throwWhoosh`.
- `survival.wound('fracture' | 'laceration')` for the player.
- `ai.hostile`, `ai.move`, `g.sees`, `statics.resolveBody`, `interiors.unlock`, `inventory`.

**Used by (shared-file hooks):**
- **`ai.js`:**
  - `melee.busy` when held, staggered, mid-blow or holding;
  - `melee.think` for `meleeW` fighters;
  - `clearShot` hostage plus `reckless()`;
  - crowd separation skips the held.
- **`arms.js`:**
  - holstered + pull = punch, not a draw;
  - `moveMul` (guard ×0.55, hostage ×0.55);
  - the grip key is off with fists up;
  - RB tap cycles what is in your hand.
- **`engine/controls.js`:** with fists up, the pad's LT/X are not the throw/reload.
- **`characters.js`:**
  - 7 packed prop variants `mw_<id>`;
  - the poses `guard`, `hold`, `held`, the weapon swing and the stomp;
  - the swing's hip twist;
  - lost limbs drawn as nothing.
- **`main.js`:** bruisers in the ambient raider spawns; the weapon onto the body box.
- **`data/items.js`:** 4 new items (bat, knuckles, pipe, sledge).
- **`data/hudlayout.js`:** row `melee`.
- **`data/controls.js`:** rows punch, block, grab, meleeNext.
- **`agent/api.js`:** import, commands, checks, save/load.
- **`agent/controller-api.js`:** the old dummy is `noGuard`.

**For the death library (when it lands):** read `c.lost`, events `limbOff`, `boneBreak`, `knockdown` and `tripped`, and `c.chokedOut`. Put the downed body on the ragdoll on a trip or a knockdown. Stairs and furniture are its job.

## 7. Tuning knobs (data/melee.js; safe ranges)

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `parry.window` | 0.2 s | 0.12–0.3 | how hard parries are |
| `parry.stagger` | 1.05 s | 0.6–1.6 | how open a parried swing leaves you |
| `block.boneBare` | 0.5 | 0.2–0.8 | how often a bare block on a bat breaks the arm |
| `block.vsBladeBare` | 0.55 | 0.3–0.9 | how badly blades go through bare arms |
| `arm.hp` | 60 | 40–100 | blocks before the arm gives |
| `grab.behindDeg` | 110° | 90–140 | how far behind a neck grab needs |
| `grab.choke.secs` | 6 s | 4–12 | choke time |
| `struggle.rate` | 0.7 | 0.4–1.2 | how fast a struggle resolves |
| `struggle.mashMax` | 1.8 | 1.3–2.2 | how strong a mashing player is |
| `struggle.neckStart` | 0.35 | 0.1–0.6 | the neck holder's head start |
| `body.tripSpeed` | 2.2 m/s | 1.5–3.5 | how easily bodies go over things |
| `feel.stop*` | 0 / 70 / 90 / 80 ms | 0–120 | hit-stop |
| `MELEE_AI.<f>.react/block/parry/grab/reckless/flee` | rows | 0–1 (react 0.15–0.6) | per-faction temperament |
| `MELEE_AI.world.bruiserShare` | 0.2 | 0–0.4 | raiders with a melee weapon and no gun |
| weapon rows | the table | `validateMelee` ranges | everything else |

### The weapon table
| Weapon | Kind | Hands | Dmg | Wind-up | Recover | Reach | Knock (chance, s) | Bone | Sever | Bleed | Dur | Finisher |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fists | blunt | 1 | 9 | 0.10 | 0.24 | 1.15 | 0.04, 0.9 | 0.02 | – | – | – | 34 (stomp) |
| Brass knuckles | blunt | 1 | 17 | 0.10 | 0.24 | 1.15 | 0.12, 1.1 | 0.08 | – | 0.05 | 400 | 40 |
| Knife | blade | 1 | 24 | 0.09 | 0.28 | 1.20 | – | – | – | 0.35 | 160 | 70 |
| Machete | blade | 1 | 30 | 0.20 | 0.36 | 1.55 | 0.05, 1.0 | 0.05 | 0.35 | 0.45 | 140 | 90 |
| Baseball bat | blunt | 2 | 28 | 0.32 | 0.42 | 1.75 | 0.40, 1.8 | 0.35 | – | 0.05 | 120 | 95 |
| Crowbar | blunt | 1 | 24 | 0.24 | 0.38 | 1.50 | 0.25, 1.4 | 0.30 | – | 0.15 | 600 | 85 |
| Lead pipe | blunt | 1 | 21 | 0.22 | 0.38 | 1.45 | 0.25, 1.4 | 0.28 | – | 0.05 | 300 | 80 |
| Sledgehammer | blunt | 2 | 48 | 0.62 | 0.70 | 1.80 | 0.75, 2.4 | 0.60 | – | 0.10 | 260 | 140 |

## 8. Acceptance criteria (selftest `only=melee`, 11 checks; all green)

1. **melee rows:** every row validates. A purple prop and a bad kind are both refused. PUNCH, BLOCK and GRAB are rows with keys and pad buttons.
2. **melee block:** a bat blocked on bare arms (RMB through the real mouse) averages under half of unblocked hits. Every block lands on the arms and fills the arm.
3. **melee parry:** RMB 0.1 s before contact means zero damage, the swinger staggered (> 0.3 s) and open, and the next punch lands at ×1.5.
4. **melee grab:**
   - G behind an unaware man gives the neck, and he stays in front as you walk.
   - Tap G lets go.
   - G face to face gives a clinch.
5. **melee hostage:**
   - A friend with a gun on you holds fire on the man you hold (the shot refused, the hostage untouched).
   - Made reckless, he fires and the hostage takes it.
6. **melee struggle:** over 10 clinches (the strong one as holder and as the held), the stronger man (1.5 vs 0.8) wins ≥ 70%.
7. **melee finish:** a bat knocks a man down, and PUNCH on the downed man is the finisher and kills him.
8. **melee knuckles:** six jabs in brass knuckles out-damage six bare-fisted jabs by more than 1.3×.
9. **melee machete:**
   - Heavy machete blows take a limb off (and the pose drops it) and bleed the man.
   - A raider's machete on your bare guard cuts you.
10. **melee ai:**
    - A raider with a pipe closes and swings (its own mind, the same rows).
    - One that creeps up behind you takes your neck, and mashing breaks free.
11. **The old controller check** (strike at contact, kick, shove, the combo knockdown, a shambler with no rounds spent) still passes.

Renders, from the game camera at close zoom (`docs/renders/web/melee/`):
- 01: a bat swing at your guard;
- 01b: the block at contact;
- 02: a machete hit, a limb off and the blood;
- 03: a neck grab from behind;
- 04: a hostage standoff, the friend's pistol up and holding;
- 05: a sledge knockdown.

## Not done / follow-ups
- The near people's faceted LSW bodies don't hide a severed limb yet; the classic rig does. The retarget lives in lswbodies.js.
- No ragdoll on knockdown, no falls down stairs. Those are the death library's, and the events and `c.lost` are ready for it.
- An NPC-taken hostage of a *third* person (a raider grabbing a townsman when you draw on him) uses the same hold, but there is no scripted trigger for it yet. Today NPCs take the neck of whoever they fight.
- Door-slam stuns already exist (interiors: shove a door into someone). A door shoved by a fist isn't separated out.
- Melee items in loot tables were left out on purpose: the golden loot hashes would move. Today they reach the world through bruisers' bodies only.
- The guard and hold poses read weakly from straight above at the default zoom. They'd want a bigger tell, such as a ring or a tint on the guard.
