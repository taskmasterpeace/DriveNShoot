# UI DESIGN LANGUAGE

**Written:** 2026-07-07. **Owner ask:** "the car UI must fit the same design language as the TV and everything else we plan."
**Scope:** every 2D screen-space surface in DRIVN — HUD readouts, panels, toasts, prompts, badges, moodles. NOT the 3D world (lights, sound, wobble — those are diegetic effects, not UI, and this doc's #1 rule is that they come FIRST).
**Grounded in:** `hud_3d.gd` (dashboard/moodles/toasts, LIVE code), `media_panel.gd` (the TV bezel/badge/static, LIVE-in-flight), `controls_panel.gd` (F11 rebind rows), `container_panel.gd` (trunk/pack/shop), `menu.gd` (the DRIVN title), `tools/motion_stage.gd` (treadmill legend style — reference only, NOT bound by this doc, see Dependencies).

## Overview

DRIVN has one visual grammar, not eleven. Every panel — the TV, the trunk, the rebind screen, the future garage and shop screens — is built from the same six parts: an amber/bone/ink palette with zero purple, a dark bezel frame with a hairline accent border, a badge chip for the one piece of state worth calling out, a fading center toast for transient confirmations, a bottom-center prompt chip for the current verb, and a mandatory close affordance in the same three places every time. This document names those parts, gives their exact values (pulled from shipped code, not invented), and states the one law that keeps new UI from drifting into "generic app" territory: **diegetic first, widget second.**

## Player Fantasy

The player should feel like they're inside a scavenged, jury-rigged machine that someone kept alive with duct tape and pride — not inside a settings menu. Every panel should read as a physical object bolted into the world (a TV set, a glovebox, a CB radio faceplate), never as a floating rectangle summoned from nowhere. The FEELING across every surface: *I always know how to get in and how to get out, so I never fight the interface — I fight the wasteland.* Consistency itself is the fantasy payoff: once a player learns "amber text is important, bone text is flavor, ✕ top-right always closes," that knowledge transfers to a panel they've never opened before. That's competence (SDT) earned once and spent everywhere.

## Detailed Rules

### 1. Palette — THE LAW: no purple, ever

| Token | Value (Color constructor) | Hex (approx) | Use |
|---|---|---|---|
| **AMBER** | `Color(0.96, 0.72, 0.2)` | `#F5B833` | Primary accent — titles, borders, active state, important numbers, prompts |
| **BONE** | `Color(0.92, 0.89, 0.82)` | `#EBE3D1` | Body text, default label color |
| **INK / bezel bg** | `Color(0.08-0.10, 0.07-0.09, 0.05-0.07, 0.94-0.98)` | `~#16140F` | Panel background fill |
| **DIM** | `Color(0.55, 0.52, 0.46)` | `#8C8575` | Secondary/hint text, disabled rows |
| **True black border** | `Color(0.03, 0.03, 0.03)` | `#080808` | Outer bezel edge (TV cabinet only — see Frame) |

Tier colors (condition/severity — used on dashboard bars and any future meter):

| Tier | Color | Meaning |
|---|---|---|
| GOOD | `Color(0.92, 0.89, 0.82, 0.55)` — dimmed BONE | Quiet, nothing to report |
| WORN | `Color(0.96, 0.85, 0.25, 1.0)` | Yellow — pay attention |
| CRITICAL | `Color(0.98, 0.55, 0.15, 1.0)` | Orange — act soon |
| BROKEN | `Color(0.95, 0.2, 0.12, 1.0)` | Red — it's failing now |

**The rule:** no hue between red-violet and blue-violet (OKLCH hue ~270-320, or "if you have to ask if it's purple, it's purple") appears anywhere — not a border, not a tier color, not a hover state, not a future faction color. When a new state needs a color and amber/red/orange/BONE-dim don't fit, go warm (gold, rust) or go toward a desaturated teal/green (the jump-flash uses `Color(0.45, 0.85, 0.72)` as its ONE sanctioned cool exception, reserved for "otherworldly/wrong," never for normal UI chrome).

### 2. Typography — the scale

One font family covers everything but three distinct sizes carry three distinct jobs. Font: `ProtoHUD.mixed_font()` (Segoe UI / Segoe UI Emoji / Noto Color Emoji SystemFont — draws Latin text AND emoji glyphs from the same label, which is why house style mixes emoji into copy freely). `ProtoHUD.emoji_font()` (pure emoji font stack) is reserved for the moodle column only, where a label is 100% emoji and needs maximum glyph fidelity.

| Size | Job | Where it's used today |
|---|---|---|
| **44px** | The one number you're driving by | Speedometer (`_speed_label`) |
| **20-22px** | Panel titles, section headers, badges | Mode label, TV title, controls-panel title, container-panel title, channel badge |
| **15px** | Everything else — body text, status lines, hints, prompts' smaller cousins | Help line, dash status, station hints |

Anything landing outside this three-step scale (e.g. the sheet/briefing body at 18px, the toast at 26px, the prompt chip at 24px) is a deliberate exception for readability at distance/urgency, not a fourth rung — new panels should reach for 44/20/15 first and only deviate with a stated reason.

### 3. The Frame — every panel is a bezel, not a rectangle

The TV (`media_panel.gd`) is the reference bezel; every panel construction below descends from it or its lighter sibling.

**Heavy bezel** (the TV — reserve for the single most "diegetic object" surface, i.e. things that already look like a physical appliance):
- `bg_color`: `Color(0.08, 0.075, 0.06, 0.98)`
- `border_color`: `Color(0.03, 0.03, 0.03)` (near-black cabinet plastic, NOT amber)
- `border_width`: 16px all sides
- `corner_radius`: 10px
- `content_margin`: 16px

**Standard panel** (controls, container/trunk, sheet, briefing — everything else with a border):
- `bg_color`: `Color(0.09-0.10, 0.08-0.09, 0.06-0.07, 0.94-0.97)`
- `border_color`: **AMBER**
- `border_width`: 2px all sides
- `corner_radius`: 6px

**The law:** exactly two frame weights exist. A 16px near-black bezel means "this is a physical device you're looking at the screen of." A 2px amber border means "this is an overlay panel." A new panel picks one, never invents a third weight or a border color outside {near-black, AMBER}.

### 4. Badges — the CH-3 pattern

A badge is a small filled+bordered chip that names ONE piece of state at a glance, distinct from the panel's title. Exact spec from the channel badge:
- `bg_color`: `Color(0.15, 0.13, 0.08)` (warm dark, lighter than the panel bg)
- `border_color`: AMBER, 2px
- `corner_radius`: 4px
- `content_margin`: 8px all sides
- Text: AMBER, 20px, mixed_font
- Format: `"CH %d — %s"` (a number, an em-dash, a name) — the pattern generalizes to any short "which one of these am I on" fact: `"CH 3 — CHICAGO"`, and by extension a future `"BAY 2 — SCAVENGER"` in the garage or `"STOP 4 — GAS 'N' GO"` on a shop screen.

A badge is NOT a button (it has no press state) and is NOT a status bar (it doesn't scroll or update every frame) — it answers exactly one question and sits in the header row.

### 5. Toasts — the confirmation-not-information channel

- Position: screen center, `PRESET_CENTER`, roughly 720px wide, sits ~80-120px above true center
- Font: mixed_font, 26px (HUD-level toast) — the motion-stage tool uses a smaller 20px variant for its own dev-only overlay (see Dependencies — that tool is NOT bound by this doc)
- Color: BONE text, dark outline (`Color(0.08, 0.06, 0.03)`, 10px outline)
- Lifecycle: appears at full alpha instantly, holds, then fades. `ProtoHUD.toast()`'s tween is `tween_interval(1.4)` then `tween_property(modulate:a, 0.0, 0.8)` — total visible life ≈2.2s, of which 1.4s is full-alpha hold and 0.8s is the fade-out.
- Content convention: one emoji prefix + short caps-friendly phrase. `"📻 OFF"`, `"🎮 Bound %s"`, `"⟳ MOTIONS RELOADED"`. A toast confirms an action just taken — it is never the first place a player learns new information (that's the world/dashboard's job — see the diegetic-first test, §9).
- **Rule:** a new toast MUST re-trigger the tween (kill any in-flight tween first) so two toasts fired in quick succession never race — `hud_3d.gd`'s `toast()` already does this (`if _toast_tween and _toast_tween.is_valid(): _toast_tween.kill()`); any new toast implementation must copy this guard.

### 6. Prompts — the E-verb chip

- Position: bottom-center, above the dashboard, `PRESET_CENTER_BOTTOM`
- Font: mixed_font, 24px, AMBER with dark outline
- Phrasing convention: `"<KEY> — <verb phrase>"` where the verb phrase is an imperative, present-tense action from the player's POV: `"E — Open trunk"`, `"E — Open trailer (%d kg tank)"`. Never a noun alone ("Trunk"), never past tense, never third person.
- Exactly one prompt shown at a time — the current single most relevant interactable. A new interactable type does NOT get its own prompt widget; it feeds text through the same `show_prompt(text)` call.

### 7. Close affordance — THE non-negotiable rule

**Every panel that can be opened must be closeable exactly three ways, always:**
1. A visible **✕** button, top-right of the header row, red-tinted (`Color(0.9, 0.4, 0.3)` — the one place a warm red-not-amber accent is sanctioned, because "this button destroys/exits" reads better in danger-red than amber)
2. **Esc** (raw key, checked in `_input` before gameplay ever sees it, `get_viewport().set_input_as_handled()` called)
3. **Pad B** (`JOY_BUTTON_B`, same `_input` guard, same immediate handling)

Additionally, the game's shared `interact` action (E key / pad Y) closes any panel it's mapped to check for (today: container_panel and media_panel both close on `interact`) — this is a bonus fourth door for panels the main input-priority chain already knows about, NOT a substitute for the three above.

`media_panel.gd` and `controls_panel.gd` currently implement 1+2+3 correctly (media_panel's `_input` handles Esc and pad B explicitly; controls_panel closes via its own visible button plus is gated into the main `_unhandled_input` priority chain). **`container_panel.gd` does NOT yet have a ✕ button or a raw Esc/pad-B handler — it only closes via the shared `interact` action or `TAB`.** This is a known gap this doc surfaces (see Edge Cases and Acceptance Criteria) — bringing it to parity is a build task, not a design question.

### 8. Bar widgets — ▮▮▱▱ everywhere a meter is needed

- Glyphs: `▮` (filled) and `▱` (empty), always 4 segments
- Formula: `_bar(r)` where `r` is a 0.0-1.0 ratio → `segs = clamp(ceil(r * 4.0 - 0.001), 0, 4)` filled segments, `4 - segs` empty
- This is the ONE meter widget in the game. A new gauge (charge %, a future skill-XP-to-next-level bar, a shop stock level) reuses this exact function and glyph pair — never a `ProgressBar` control, never a custom fill-rect, never a different segment count. Color the bar via the tier-color table (§1) when severity matters; leave it BONE/dimmed when it's neutral flavor.

### 9. Moodles — the emoji-IS-the-meter convention

- One `Label` per feeling, `emoji_font()` (pure emoji stack), 42px, black outline (`Color(0.06, 0.05, 0.03)`, 8px outline) so the glyph reads over any background
- Tiers 0-3 per feeling; tier 0 = hidden, higher = worse; each feeling's dict of tier→glyph is a data row (`MOODLES` in `hud_3d.gd`) — adding a feeling means adding a row, not a new widget class
- Pop-in: a hidden→shown transition scales from 1.6x back to 1.0 over 0.35s with `TRANS_BACK` easing — a feeling announces itself, it doesn't silently appear
- Worst tier (3) pulses alpha 0.75-1.0 on a slow sine — motion is reserved for the single worst-currently-active feeling, not applied wholesale
- Column position: top-right, under the key ring, vertical stack, right-aligned

### 10. Pad-glyph conventions

- Xbox-first naming with PS parity always shown together: **A/✕**, **B/◯**, **X/▢**, **Y/△** — never Xbox letters alone, never PS symbols alone, in any tooltip, hint line, or panel copy
- Trigger/bumper names spelled `RT`/`LT`/`RB`/`LB` (no PS-specific R2/L2/R1/L1 dual-naming needed — house convention treats these as understood pairs, unlike the four face buttons which get explicit dual-naming because their letters/symbols don't visually imply each other)
- Format for a hint line: `"Close (E / Esc / B)"` — key, then Esc if applicable, then pad button, slash-separated, shortest form that's still unambiguous

### 11. Layout anchors — where panels live on screen

| Anchor | What lives there |
|---|---|
| Bottom-left | Speed (44px), help line, HP, ammo — the "what am I doing right now" stack |
| Top-left | Location/mode label, GPS glyph (when active), THE CIRCUIT pips, first-run objective line |
| Top-right | Key ring, moodle column (below the ring) |
| Bottom-right | The car dashboard (status line + parts bars + fuel/charge) — ONLY while driving |
| Center | Toasts, binoculars vignette/label, jump-flash, reticle (follows mouse, not fixed) |
| Center (large, modal) | Sheet (K), briefing (return-home), the TV, controls panel, container panel — all full-attention panels use `PRESET_CENTER` with a fixed pixel half-extent (`offset_left/right/top/bottom`), NEVER a size that grows to content (the sheet's own comment: a content-sized panel grew off-screen once — always fix the rect, put a `ScrollContainer` inside if content varies) |
| Bottom-center | The interact prompt chip |

### 12. Sound hooks

- `ProtoAudio.play_ui(id, volume_db, pitch)` is the one UI-sound entry point; two stock sounds exist today: `"click"` (a short 1400Hz decaying tone) and `"blip"` (a softer 880Hz decaying tone)
- Convention observed in `container_panel.gd`: `"blip"` at `-12dB` for a successful item move/take, `"click"` at `-6dB` for a shop transaction (a slightly louder, higher-stakes confirmation for money changing hands)
- **Rule for new panels:** open/close should each play one of these two (or a new row added to the same `streams` dict in `audio.gd` — never a bespoke `AudioStreamPlayer` bolted onto a panel script directly). Recommend: open = `"blip"`, close = `"click"` at a quiet `-10 to -14dB`, unless a panel has a specific reason to differ (documented in that panel's own spec).

## Formulas

**Bar segment count** (§8):
`segs = clamp(ceil(r * 4.0 − 0.001), 0, 4)`
- `r` (float, 0.0-1.0): the filled ratio (health/charge/fuel/etc. as a fraction)
- The `−0.001` epsilon prevents an exact `r = 0.75` from ceiling-rounding up to 4 due to float imprecision; a true `r=1.0` still yields 4, a true `r=0.0` yields 0.
- Example: `r=0.20` → `ceil(0.799) = 1` segment filled → `▮▱▱▱`. `r=0.51` → `ceil(2.039) = 3` → `▮▮▮▱`. `r=1.0` → `ceil(3.999) = 4` → `▮▮▮▮`.

**Toast total visible lifetime** (§5):
`life_s = hold_s + fade_s` where shipped values are `hold_s = 1.4`, `fade_s = 0.8` → `life_s = 2.2s`.
- Range for new panels reusing the toast: `hold_s` 1.0-2.0s (see Tuning Knobs). Do not touch `fade_s` without a stated reason — 0.8s is tuned to feel like a settle, not a blink.

**Badge text format** (§4):
`"%s %d — %s" % [prefix?, index, name]` collapses to `"CH %d — %s"` today; a non-channel badge keeps the `INDEX — NAME` shape (e.g. a future `"BAY 2 — INTERCEPTOR"`) even if the leading word changes.

**Moodle tier from a continuous stat** (pattern, from `set_vitals`):
`tier = 3 if stat >= T3 else (2 if stat >= T2 else (1 if stat >= T1 else 0))`
- Example (stress): `T1=30, T2=55, T3=80` → stress 40 → tier 1 (😟); stress 60 → tier 2 (😰); stress 85 → tier 3 (😱).
- Any new moodle sets its own three thresholds; there is no universal T1/T2/T3 — each feeling picks values matched to its own stat's natural range (documented as that feeling's own tuning knob).

## Edge Cases

- **Two panels requested open at once (e.g. player presses E to open the trunk while the TV is on):** the existing priority chain in `proto3d.gd`'s `_unhandled_input` is strict and explicit, not "whichever grabbed focus last." Order today, highest to lowest: (1) the return briefing (owns all input while shown, dismiss on any key/click), (2) `menu_open` (title screen swallows everything), (3) `controls_panel` (owns hardware while open, exits only via its own toggle or its close paths), (4) the shared `interact` action closes `panel` (container) first, THEN `media_panel` if container wasn't open — i.e. **container_panel wins the close-race over media_panel when both are somehow open**, and neither panel auto-opens over the other (the game state that leads to opening one, e.g. driving to a trunk vs. sitting at the TV, is itself mutually exclusive in practice). **Rule for new panels:** insert into this same explicit if/elif chain in priority order; never rely on `visible`/z-order alone to decide who "wins" a shared key.
- **Controller-only navigation (no mouse/keyboard at all):** every button-driven panel (menu, controls) must keep its buttons focus-navigable — `menu.gd`'s `first.grab_focus.call_deferred()` on the title is the pattern: the FIRST actionable control in a new panel should grab focus the moment the panel opens, so D-pad/stick navigation and pad-A/✕ activate work from frame one without a mouse ever touching the screen. Any panel with clickable rows (container_panel's item buttons, controls_panel's rebind buttons) must be checked against pad-only play — a control that only responds to `pressed` from a mouse click but never receives focus is a soft-lock for a controller-only player.
- **Tiny-screen / Steam-Deck-class viewport:** panels are specified in fixed pixel half-extents off `PRESET_CENTER` (e.g. the TV's 1520x840, the sheet's `min(540, vp.x-80)` clamp). Any NEW panel must clamp its size the same way the sheet does — `w = min(<design_width>, vp.x - 80)`, `h = min(<design_height>, vp.y - 80)` — so it never exceeds the viewport on a 1280x800-class deck screen. A panel that hardcodes an absolute pixel size with no viewport clamp is non-compliant.
- **Colorblind note on tier colors:** the WORN/CRITICAL/BROKEN progression (yellow → orange → red) is a hue ramp that deuteranopia/protanopia readers can struggle to separate at a glance, especially orange-vs-red. The bar's SEGMENT COUNT (§8) is the primary signal precisely because it doesn't depend on color discrimination — a 1-segment bar reads as "bad" regardless of what color it renders in. Any new tier-colored readout must keep a non-color signal (segment count, an icon change, or explicit text like `"BLOWN"`/`"CRITICAL"`) as the thing that actually carries the information; color is confirmation on top, never the sole channel (this generalizes the existing P0-1 diegetic-first rule in `CAR_UI_REQUIREMENTS.md` to colorblind accessibility specifically).
- **A panel is open when the player's car catches fire / takes lethal damage:** panels do not auto-close on external game events today (confirmed: no panel script watches for damage/death and force-closes itself). This is an accepted gap, not a designed behavior — flagging it here so a future pass doesn't assume it's covered. Recommendation for whoever builds it: death (`show_death`) already sets its own full-screen shade at a HIGHER effective priority than any panel close logic would need to fight, so this may already resolve itself visually even without an explicit panel-close call; verify, don't assume.
- **`container_panel.gd` has no ✕/Esc/pad-B today**, contrary to the house rule in §7. Until fixed, a controller-only player or a player who doesn't know the shared `interact`/`TAB` bindings has no discoverable way to close it. This is the single clearest non-compliance this document found; see Acceptance Criteria for the exact checklist to bring it to parity.

## Dependencies

| This doc's element | Consumed by / must conform | Direction |
|---|---|---|
| Palette (§1), Frame (§3) | `hud_3d.gd`, `media_panel.gd`, `controls_panel.gd`, `container_panel.gd`, `menu.gd` — every existing screen-space script | These files are the SOURCE of the values this doc codifies; this doc in turn constrains any future edit to them (a future palette change must update this doc's tables, and vice versa) |
| Frame (§3), Badge (§4), Close affordance (§7) | **The TV rebuild** (`media_panel.gd`, in-flight per the read at the top of this doc) | Bidirectional: this doc's Frame/Badge spec is EXTRACTED from the TV's current bezel/badge; the TV's future changes (e.g. a new EBS card style) must stay inside the two-frame-weight law (§3) rather than inventing a third |
| Bar widget (§8), Layout anchors (§11) | **The car dashboard** (`hud_3d.gd`'s `set_dashboard`, and the EV/GPS/occupant-roster extensions specced in `docs/design/CAR_UI_REQUIREMENTS.md`) | Bidirectional: the dashboard already follows the bar-widget law; any new dashboard readout (EV charge, GPS glyph, occupant count) must reuse `_bar()` and the bottom-right anchor rather than adding a new widget class — `CAR_UI_REQUIREMENTS.md` P1-4's "same bar widget, reused — no new widget class" line is this doc's law being independently arrived at from the other side |
| Diegetic-first principle (§Player Fantasy, §9-below) | `docs/design/CAR_UI_REQUIREMENTS.md`'s opening principle | This doc imports that principle rather than re-deriving it; `CAR_UI_REQUIREMENTS.md` should link back here for the visual-grammar specifics (palette/frame/badge values) it doesn't itself specify |
| Toast (§5), Sound hooks (§12) | `radio.gd` (station-change toasts, P0-2), any future shop/garage confirmation | Forward-only today (those systems don't exist yet) — when built, they must call `ProtoHUD.toast()` and `ProtoAudio.play_ui()`, never invent parallel mechanisms |
| Pad-glyph conventions (§10) | `input_bindings.json` / `ProtoInputMap.pretty()` | Bidirectional: this doc's A/✕ notation must match whatever string `ProtoInputMap.pretty()` actually renders — if that function's format ever changes, this doc's §10 table needs a matching edit |
| **NOT bound by this doc:** `tools/motion_stage.gd`'s CanvasLayer legend | — | Explicitly out of scope. It is a developer tool overlay (treadmill legend/readout/toast), not a player-facing surface, and intentionally uses its own lighter styling (plain `Label`s, no bezel, a green toast color) — do not "fix" it to match this doc; do not use it as a precedent when building player-facing panels. Referenced in this doc's grounding list only as a style CONTRAST, not a source. |

## Tuning Knobs

| Knob | Category | Safe range | What it affects |
|---|---|---|---|
| Toast hold duration | feel | 1.0-2.0s | How long a toast sits at full alpha before fading; shipped value 1.4s. Shorter reads as snappier/less naggy; longer risks feeling like the game is talking over itself during fast play. |
| Toast fade duration | feel | 0.5-1.0s | The fade-out tween length; shipped value 0.8s. Keep this narrower than the hold-duration range — a fade longer than its hold starts to feel like the toast never really leaves. |
| Frame thickness (heavy bezel) | feel | 12-20px | The TV-class cabinet border; shipped value 16px. Thinner starts to look like a standard panel (loses "physical object" read); thicker eats into screen content on smaller viewports. |
| Frame thickness (standard panel) | feel | 2-3px | The amber overlay-panel border; shipped value 2px. This is a HAIRLINE by design — do not thicken it to match the heavy bezel, that would collapse the two-weight distinction (§3) that lets players tell "device" from "overlay" at a glance. |
| Badge corner radius | feel | 3-6px | Shipped value 4px. Keep noticeably tighter than the panel's own corner radius (6px) so the badge reads as a distinct chip nested inside the panel, not a match to it. |
| Badge content margin | feel | 6-10px | Shipped value 8px. Too tight and the text touches the border; too loose and small badges (a future 2-3 character one) look empty. |
| Moodle pop-in scale | feel | 1.3x-1.8x | Shipped value 1.6x. Lower undersells "a feeling announcing itself"; higher risks the glyph briefly overlapping the panel edge on a crowded moodle stack. |
| Moodle pulse alpha range | feel | 0.6-0.9 low / 1.0 high | Shipped value 0.75-1.0. Widening the low end (going darker) risks the worst-tier glyph looking "off" rather than "pulsing" at a glance. |
| Tier color thresholds (any new gauge) | gate | designer's choice per-stat, no universal default | Every tier-colored meter defines its OWN GOOD/WORN/CRITICAL/BROKEN cut points against its own stat's natural range (see Formulas' moodle-tier example) — this is a per-feature knob, not a global constant, by design. |
| Panel max-size viewport clamp margin | gate | 60-100px | Shipped pattern: `min(design_size, viewport_size - 80)`. The 80px margin is the safety gutter against a Steam-Deck-class 1280x800 viewport; going below ~60px risks a panel touching screen edges on the smallest supported resolution. |

## Acceptance Criteria

A reviewer (or a headless sim, per house testing convention — no eyeballing screenshots) can verify per-panel compliance with this checklist. A panel is COMPLIANT only if every applicable line is true.

1. **Close ×3 exists:** the panel has a visible ✕ button top-right of its header, closes on raw Esc (`_input`, handled before gameplay), and closes on raw pad B (`JOY_BUTTON_B`, same `_input`). *(Sim: simulate each of the three inputs independently against an open panel; assert `is_open == false` after each.)* — **Known current fail: `container_panel.gd` has none of the three; this is the concrete build item this doc generates.**
2. **Palette compliance:** every color literal in the panel's script is either AMBER, BONE, DIM, a documented tier color, or a stated one-off exception with a comment explaining why (e.g. the ✕ button's warm red, the EBS card's alarm red). *(Reviewer: grep the script's `Color(` literals, check each against §1's table.)* No literal falls in OKLCH hue ~270-320 (purple/violet/indigo/magenta) under any circumstance.
3. **Frame present and correctly weighted:** the panel's root has a `StyleBoxFlat` with either the heavy-bezel spec (16px border, near-black) or the standard-panel spec (2px border, AMBER) from §3 — never a borderless `Control`, never a third weight.
4. **Badge/title present:** the panel's header row contains a title (BONE or AMBER, 20-22px) and, if the panel has a "which one of these" concept (a channel, a bay, a shop stall), a badge chip per §4's exact spec.
5. **Fixed rect, viewport-clamped:** the panel's size is set via `offset_left/right/top/bottom` off a `PRESET_CENTER`-family anchor with NO size that grows to content, and the design width/height are each clamped against `viewport_size - margin` (margin in the 60-100px tuning range). *(Sim: instantiate the panel at a 1280x800 viewport, assert its rendered rect never exceeds the viewport bounds.)*
6. **Bar widgets, if any, use `_bar()`:** any meter in the panel renders via the shared 4-segment `▮/▱` function, never a `ProgressBar` or a bespoke fill-rect. *(Reviewer: check for `ProgressBar` usage — its presence is an automatic fail.)*
7. **Toast/sound hooks, if the panel confirms an action:** the confirmation routes through `ProtoHUD.toast()` (not a bespoke fading label) and `ProtoAudio.play_ui()` (not a bespoke `AudioStreamPlayer`).
8. **Controller-focus on open:** the panel's first actionable control calls `grab_focus()` (deferred) the moment the panel becomes visible, so pad-only navigation works without a prior mouse click. *(Sim: open the panel headless, assert `get_viewport().gui_get_focus_owner()` is a child of the panel.)*
9. **Diegetic-first test passed:** for any NEW information the panel surfaces (not a re-display of something already shown elsewhere), the panel's own spec doc states what physical/world effect teaches the SAME information first, OR explicitly states why no physical effect can carry it (the `CAR_UI_REQUIREMENTS.md` fuel-percentage precedent: "you cannot feel 12% fuel remaining from engine sound alone"). A panel with no stated diegetic precedent for its new information fails this line — not because the widget is wrong, but because nobody checked whether it needed to exist at all.
10. **Pad-glyph phrasing:** any hint/tooltip text mentioning a controller button uses the dual-notation from §10 (`A/✕`, `B/◯`, etc.) — never a bare Xbox letter or bare PS symbol alone.
