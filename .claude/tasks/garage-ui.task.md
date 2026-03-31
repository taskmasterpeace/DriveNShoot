# Autonomous Task Definition

## Task: Create Garage Vehicle Customization UI

**STATUS: IN_PROGRESS**

**MAX_ITERATIONS: 25**

---

## Objective

Build a functional garage scene where players can view, upgrade, and customize their vehicles between runs. This is the main progression hub.

## Success Criteria

When ALL of these are true, set STATUS: COMPLETE

- [ ] Garage scene created at `scenes/ui/garage.tscn`
- [ ] Vehicle display shows current vehicle sprite
- [ ] Stats panel shows vehicle attributes (speed, armor, handling)
- [ ] Upgrade buttons for each stat (if player has currency)
- [ ] Currency display shows player's scrap/money
- [ ] Vehicle selector allows switching between owned vehicles
- [ ] "Start Run" button launches the game
- [ ] Scene accessible from main menu or after run completion
- [ ] Upgrades persist via DataManager save system
- [ ] Code compiles/runs without errors
- [ ] Changes committed to git

## Scope

### Files to Create
- `scenes/ui/garage.tscn` - Main garage scene
- `scenes/ui/garage.gd` - Garage logic
- `scenes/ui/vehicle_stats_panel.tscn` - Stats display component
- `scenes/ui/upgrade_button.tscn` - Reusable upgrade button

### Files to Modify
- `scripts/autoloads/DataManager.gd` - Add vehicle upgrade persistence
- `scripts/autoloads/SceneManager.gd` - Add garage transition
- `scenes/menus/` - Add garage access from main menu

### Do NOT Touch
- Core save/load system (only add upgrade data)
- Vehicle physics code

## Implementation Notes

UI Layout (Reference game/scenes/ui/ for existing patterns):
```
Garage Scene
├── Background (ColorRect or Sprite)
├── VehicleDisplay (Sprite2D - shows selected vehicle)
├── StatsPanel (VBoxContainer)
│   ├── SpeedStat + UpgradeButton
│   ├── ArmorStat + UpgradeButton
│   └── HandlingStat + UpgradeButton
├── CurrencyDisplay (Label)
├── VehicleSelector (HBoxContainer of vehicle buttons)
└── StartRunButton (Button)
```

Upgrade Costs (scale exponentially):
- Level 1→2: 100 scrap
- Level 2→3: 250 scrap
- Level 3→4: 500 scrap
- Max level: 5

Vehicle Stats (per level):
- Speed: +5% per level
- Armor: +10 HP per level
- Handling: +5% per level

## Progress Log

---

*Phase 7 - Town System / Garage*
