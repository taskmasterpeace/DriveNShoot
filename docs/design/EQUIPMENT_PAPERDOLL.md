# DeathWheels Online — Complete Wearable Equipment Inventory (Paperdoll System)
**Document Type:** Game Design Specification — Item Database  
**System:** Character Paperdoll (19 Wearable Slots)  
**Design Influences:** Ultima Online Paperdoll · Project Zomboid Layered Clothing · Deathlands Lore · Wasteland 2 Armor Tiers · Auto Duel Equipment Logic[^1][^2][^3][^4][^5][^6]

***
## Overview
The character body uses a 19-slot paperdoll system derived from Ultima Online's equipment architecture. Every slot accepts exactly one item. No slot can be left in an invalid state — each defaults to a "bare" state with no modifier. Items are tiered T1 through T5, with T1 being common wasteland junk and T5 being faction-crafted or Redoubt-recovered pre-dark technology. **No hard numbers are used** — all bonuses are expressed as general stat modifiers to keep the feel gritty and relative rather than clinical.[^1][^3][^5][^6]

Slots are divided into three categories:
- **Armor Slots (6)** — Damage reduction, radiation resistance, environmental protection
- **Clothing Slots (7)** — Social bonuses, environmental comfort, faction signaling, stealth
- **Accessory Slots (6)** — Passive stat buffs, utility, faction identity

***
## Part 1 — Armor Slots (6 Slots)
Armor types span five material tiers: Cloth/Scrap, Leather, Reinforced Leather, Scav-Plate (salvaged metal), Mil-Spec (military surplus), and Composite (White Coat faction-crafted).[^2][^4]
### 1.1 Slot Overview
| Slot | Location | Item Types | Primary Benefit |
|------|----------|-----------|-----------------|
| **Head** | Skull/face | Helm, Gas Mask, Goggles, Hood, Bandana | Head protection, Rad resist |
| **Neck** | Throat | Gorget, Kevlar Collar, Rad Filter Scarf | Bleed resist, Rad resist |
| **Chest** | Torso | Body Armor, Duster, Rad Suit Torso, Combat Plate | Core HP buffer, Rad resist |
| **Arms** | Upper arms | Arm Guards, Sleeve Armor, Bracer Wraps | Melee defense |
| **Hands** | Palms/fingers | Gloves, Gauntlets, Mechanic Wraps | Grip, weapon handling |
| **Legs** | Thighs/shins | Leg Guards, Combat Leggings, Armored Chaps | Movement, leg protection |

***
### 1.2 Head Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Head | — | No modifier | Default state |
| Rag Wrap | T1 | Negligible protection | Torn cloth; found in every ruin |
| Scavver Hood | T1 | No protection | Cloth wrap; offers concealment from dust only |
| Leather Cap | T1 | Slight head armor | Basic Ville craftwork |
| Bandana | T1 | Slight Rad resist | Common; found everywhere[^3] |
| Scavver Skullcap | T1 | Slight head armor, slight Rad resist | Improvised from salvaged padding |
| Work Goggles | T2 | Moderate eye protection, dust resist | Found in garages and workshops |
| Combat Goggles | T2 | Moderate visibility boost at night | Mil-surplus; pre-dark find |
| Gas Mask (cracked) | T2 | Moderate Rad resist, moderate airborne toxin resist | Cracked filter; reduced effectiveness |
| Sec-Man Helmet | T2 | Moderate head armor, faction ID tag | Looted from Barony Steele Sec-Men |
| Armored Bandana | T2 | Moderate head armor, slight Rad resist | Cloth wrap reinforced with metal plates |
| Reinforced Skid Lid | T3 | Strong head armor, moderate collision resist | Motorcycle helmet fused with scrap plate |
| Full Gas Mask | T3 | Strong Rad resist, full toxin resist | Requires Gas Mask Filters in inventory[^7] |
| Riot Helm | T3 | Strong head armor, moderate blunt resist | Police surplus; found in dead precincts |
| Rust Prophet Skull Mask | T3 | Moderate head armor, strong faction ID (Rust Prophets) | Cult ceremonial; intimidates civilians |
| Combat Helmet (Mil-Spec) | T4 | Very strong head armor, moderate all-resist | Pre-dark military; rare Redoubt find[^1] |
| Arena Champion Visor | T4 | Strong head armor, strong vehicle-combat visibility | Arena faction reward; cosmetically distinct |
| White Coat Cranial Shield | T5 | Maximum head armor, strong Rad resist, intelligence buff | Crafted by White Coat faction NPCs[^7] |
| Barony Steele Warlord Helm | T5 | Maximum head armor, faction prestige aura | Unique faction reward; visible to all players |
| Mutie Bone Crown | T5 | Moderate head armor, strong Unbound faction identity, fear proc on nearby civilians | Unbound faction artifact; terrifies standard NPCs |

***
### 1.3 Neck Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Neck | — | No modifier | Default state |
| Cloth Wrap | T1 | Negligible protection | Tied rag; common starting item |
| Bandana Wrap | T1 | Slight Rad resist | Folded bandana around the throat |
| Leather Collar | T1 | Slight bleed resist | Scavver craftwork |
| Rad Filter Scarf | T2 | Moderate Rad resist, moderate dust resist | Soaked in chemical filter solution |
| Kevlar Collar | T2 | Moderate bleed resist, moderate slash resist | Cut from Mil-Spec vest; improvised |
| Neck Guard (Scav-Plate) | T2 | Moderate head/neck armor junction | Sheet metal; rough but effective |
| Gorget (Leather) | T3 | Strong bleed resist, moderate head armor boost | Proper throat guard; artisan crafted |
| Rad Seal Collar | T3 | Strong Rad resist, integrates with Gas Mask | Designed to seal under full Gas Mask slot[^7] |
| Tactical Neck Wrap | T3 | Moderate all physical resist, slight stealth | Black mil-surplus wrap; reduces silhouette |
| Gorget (Mil-Spec) | T4 | Very strong bleed resist, strong slash resist | Pre-dark throat armor; Redoubt find |
| White Coat Bio-Collar | T4 | Strong Rad resist, moderate poison resist, intelligence buff | White Coat faction craft; biosensor embedded |
| Barony Commander Gorget | T5 | Maximum bleed resist, faction command aura boost | Faction reward; boosts nearby NPC Esteem reaction |

***
### 1.4 Chest Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Torn Shirt | T1 | No modifier | Starting item |
| Leather Vest | T1 | Slight chest armor | Crafted from animal hide |
| Scav-Plate Vest | T2 | Moderate chest armor | Sheet metal bolted to straps |
| Bullet Proof Vest (cracked) | T2 | Moderate chest armor, reduced effectiveness | Found in dead police stations; damaged[^3] |
| Leather Duster | T2 | Slight chest armor, slight Rad resist | Iconic road traveler look[^7] |
| Road Rat Jacket | T2 | Slight chest armor, strong Free Road Collective faction ID | Customized biker jacket; road gang signal |
| Kevlar Vest | T3 | Strong chest armor | Mil-surplus; rare find |
| Reinforced Combat Coat | T3 | Strong chest armor, moderate melee resist | Long coat with embedded metal inserts |
| Rad Suit Torso | T3 | Slight chest armor, very strong Rad resist | Required for Hot Spot zone traversal[^7] |
| Rust Prophet Robe | T3 | Slight armor, strong Rust Prophet faction ID, slight fear aura | Cult garb; worn over armor |
| Battle Plate (Torso) | T4 | Very strong chest armor, slight movement penalty | Heavy scrap-forged plate; slow but tough |
| Mil-Spec Body Armor | T4 | Very strong chest armor, strong toxin resist | Pre-dark find; Redoubt loot[^1][^3] |
| Composite Combat Shell | T5 | Maximum chest armor, strong all-resist | White Coat faction; requires Composite recipe |
| Barony Steele Marshal Coat | T5 | Very strong chest armor, faction command aura, strong prestige | Unique; faction political reward tier |
| Mutie Carapace Chest | T5 | Strong chest armor, strong Unbound faction ID, radiation absorption | Grown from mutant bio-material; unique to Unbound path |

***
### 1.5 Arms Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Arms | — | No modifier | Default |
| Cloth Sleeve Wraps | T1 | Negligible protection | Torn fabric |
| Leather Arm Wraps | T1 | Slight melee defense | Basic craftwork |
| Bracer Wraps (Scrap) | T2 | Moderate melee defense | Improvised metal bracers |
| Reinforced Sleeves | T2 | Moderate melee defense, slight bleed resist | Leather with metal rivets |
| Sec-Man Arm Guards | T2 | Moderate melee defense, faction ID | Looted from Sec-Men |
| Combat Arm Guards | T3 | Strong melee defense, slight ranged resist | Standard wasteland combatant gear |
| Driving Arm Guards | T3 | Moderate melee defense, moderate vehicle handling | Articulated for driving movement |
| Rad Suit Arms | T3 | Slight melee defense, strong Rad resist | Pairs with Rad Suit Torso for full bonus |
| Arena Arm Guards | T3 | Moderate melee defense, strong arena prestige ID | Arena faction cosmetic reward |
| Mil-Spec Arm Guards | T4 | Very strong melee defense, moderate all-resist | Pre-dark; Redoubt find[^1] |
| White Coat Articulated Bracers | T4 | Moderate melee defense, strong crafting quality buff | Precision movement assist |
| Composite Vambrace | T5 | Maximum arm armor, moderate all physical resist | White Coat faction; Composite recipe required |

***
### 1.6 Hands Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Hands | — | No modifier | Default |
| Work Gloves | T1 | Slight crafting speed | Cloth work gloves |
| Leather Gloves | T1 | Slight grip boost | Standard scavver find |
| Driving Gloves | T2 | Moderate vehicle handling | Pre-dark driving accessory |
| Combat Gloves | T2 | Slight unarmed damage, slight grip | Padded knuckle gloves |
| Mechanic Wraps | T2 | Strong repair speed | Cloth wraps used by mechanics |
| Tac Gloves | T3 | Moderate grip, moderate ranged accuracy from vehicle | Tacticool fingerless style |
| Gauntlets (Light) | T3 | Moderate unarmed damage, moderate hand armor | Leather-and-metal hybrid |
| Gauntlets (Heavy) | T4 | Strong unarmed damage, slight reload speed penalty | Full metal fist; heavy and slow |
| White Coat Lab Gloves | T4 | Strong crafting quality, strong poison crafting | Chemical-resistant; White Coat faction gear |
| Electro-Gauntlets | T5 | Strong unarmed damage, stun proc on hit | Pre-dark White Coat weapon; rare Redoubt find[^1] |
| Arena Spiked Gauntlets | T5 | Maximum unarmed damage, bleed proc on hit | Arena champion reward; illegal outside Arena District |

***
### 1.7 Legs Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Legs | — | No modifier | Default |
| Torn Pants | T1 | No protection | Starting item |
| Leather Pants | T1 | Slight leg protection | Common craftwork |
| Jeans (Reinforced) | T2 | Moderate leg protection | Denim with metal knee patches |
| Rad Pants | T2 | Slight leg protection, moderate Rad resist | Sealed-seam rad protection |
| Combat Leggings | T2 | Moderate leg protection, slight movement | Standard scavver combatant gear |
| Armored Chaps | T3 | Strong leg protection, moderate riding/driving stability | Motorcycle-origin; Road Rat aesthetic |
| Sec-Man Leg Guards | T3 | Strong leg protection, faction ID | Looted Barony Steele gear |
| Rad Suit Legs | T3 | Slight leg protection, strong Rad resist | Full Rad Suit set bonus when combined[^7] |
| Battle Plate (Legs) | T4 | Very strong leg protection, slight movement penalty | Heavy scrap-forged; slow but tough |
| Mil-Spec Leg Armor | T4 | Very strong leg protection, moderate all-resist | Pre-dark Redoubt find[^1] |
| Composite Greaves | T5 | Maximum leg protection, strong movement | White Coat faction; Composite recipe |
| Mutie Scale Legs | T5 | Strong leg protection, strong Rad resist, Unbound faction ID | Mutant-scale material; Unbound faction craft |

***
## Part 2 — Clothing Slots (7 Slots)
Clothing slots sit under or over armor. They provide social signaling, environmental bonuses, faction identity, and stealth modifiers rather than raw damage protection. Worn over armor, they are visible to other players and NPCs — affecting NPC faction reactions and Respect Ledger thresholds.[^8][^9]
### 2.1 Slot Overview
| Slot | Location | Item Types | Primary Benefit |
|------|----------|-----------|-----------------|
| **Outer Coat** | Full torso over-layer | Duster, Cloak, Poncho, Jacket | Faction ID, stealth, weather resist |
| **Shirt/Under-armor** | Torso base layer | Shirts, Undershirts, Flex Armor | Comfort, bonus stat to adjacent slot |
| **Belt** | Waist | Belts, Utility Belts, Ammo Rig | Carry weight, quick-draw access |
| **Footwear** | Feet | Boots, Shoes, Sandals, Rad Boots | Movement speed, terrain traversal |
| **Sash/Bandolier** | Diagonal chest | Bandolier, Sash, Strap Rig | Ammo carry, reload speed |
| **Face Cover** | Face (under head armor) | Scarves, Rebreathers, War Paint | Toxin resist, faction identity, intimidation |
| **Back** | Back mounting | Backpack, Pack Frame, Duffel | Carry weight, mobile crafting access |

***
### 2.2 Outer Coat Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Coat | — | No modifier | Default |
| Torn Poncho | T1 | Negligible wind resist | Scavenged tarp; common |
| Leather Duster (Light) | T2 | Slight weather resist, slight Free Road faction ID | Classic post-dark road traveler garb[^7] |
| Scavver Cloak | T2 | Slight stealth, slight weather resist | Patched together from rags and tarps |
| Rust Prophet Robe | T2 | Slight armor, strong Rust Prophet faction ID | Cult over-robe; NPC Rust Prophets react more favorably |
| Road Rat Colors Jacket | T2 | Slight weather resist, strong Free Road Collective ID | Cut-off jacket with hand-painted faction symbol |
| Long Duster (Reinforced) | T3 | Moderate weather resist, moderate stealth | Long coat with sewn-in padding |
| Barony Steele Officer Coat | T3 | Moderate weather resist, strong Barony Steele ID | Looted or awarded; NPC Sec-Men react more favorably |
| Ghillie Poncho | T3 | Strong stealth outdoors, slight movement penalty | Wasteland camouflage; reduces pedestrian detection range |
| Mil-Spec Field Jacket | T4 | Strong weather resist, moderate all-environment resist | Pre-dark military surplus[^3] |
| White Coat Research Coat | T4 | Moderate weather resist, strong White Coat faction ID, crafting buff | The iconic lab coat; worn with pride |
| Composite Assault Cloak | T5 | Strong weather and environmental resist, moderate stealth | White Coat faction craft; adaptive insulation |
| Warlord's Mantle | T5 | Strong all-environment resist, maximum faction prestige aura | Unique political reward; recognized world-wide |

***
### 2.3 Shirt / Under-Armor Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Chest | — | No modifier | Default |
| Torn Undershirt | T1 | No bonus | Starting item |
| Cotton Shirt | T1 | Slight comfort (fatigue resist) | Common Ville craftwork |
| Thermal Undershirt | T2 | Moderate cold resist | Useful in northern zone travel |
| Flex Armor Base | T2 | Slight all physical resist | Thin armor layer; worn under chest slot |
| Trauma Plate Insert | T3 | Moderate torso damage reduction, pairs with Chest slot | Slipped between shirt and armor vest |
| Rad-Lined Undershirt | T3 | Strong Rad resist, pairs with Rad Suit Torso for full bonus | Lead-fiber lining[^7] |
| Mil-Spec Base Layer | T4 | Moderate all-resist, moderate fatigue resist | Pre-dark thermal-regulation fabric |
| Bio-Weave Underlayer | T5 | Strong all-resist, moderate health regen rate | White Coat faction; living fiber technology |

***
### 2.4 Belt Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Belt | — | No modifier | Default |
| Rope Belt | T1 | Negligible carry bonus | Scavenged cordage |
| Leather Belt | T1 | Slight carry weight | Basic craftwork |
| Utility Belt | T2 | Moderate carry weight, one extra quick-slot | Pouches and loops; scavver standard |
| Ammo Belt | T2 | Moderate ammo carry, slight reload speed | Loops sized for common calibers |
| Sec-Man Duty Belt | T2 | Moderate carry weight, faction ID (Barony) | Looted from Sec-Men; has cuff hook |
| Tactical Rig Belt | T3 | Strong carry weight, two extra quick-slots | MOLLE-style; modular attachment points |
| Melee Loop Belt | T3 | Moderate carry weight, slight draw speed for blades | Scabbard loops and dagger hooks |
| Mil-Spec Belt | T4 | Strong carry weight, strong quick-slot access | Pre-dark issue; D-ring mounts |
| White Coat Tool Belt | T4 | Strong carry weight, strong crafting tool access speed | Specialized loops for White Coat instruments |
| Arena Champion Belt | T5 | Strong carry weight, arena prestige ID | Award item; cosmetically unique buckle |

***
### 2.5 Footwear Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Feet | — | Slight rough terrain penalty | Default |
| Rags/Wrappings | T1 | Negligible foot protection | Tied cloth; found anywhere |
| Scavver Sandals | T1 | Minimal terrain penalty reduction | Cut from tire rubber |
| Work Boots | T1 | Slight foot protection, slight terrain traversal | Standard Ville labor wear |
| Combat Boots | T2 | Moderate foot protection, moderate terrain traversal | Common scavver find |
| Road Rat Riding Boots | T2 | Moderate foot protection, strong vehicle mounting speed | Built for motorcycle/car entry[^2] |
| Rad Boots | T2 | Slight foot protection, strong Rad resist | Sealed at ankle; required for some Hot Spots[^7] |
| Tactical Boots | T3 | Strong foot protection, strong terrain traversal, slight stealth | Thick sole; rubber-dampened steps |
| Driving Boots | T3 | Moderate foot protection, strong vehicle pedal response | Thin sole for precision pedal control |
| Mil-Spec Jump Boots | T4 | Very strong foot protection, strong terrain traversal | Pre-dark paratrooper issue[^3] |
| White Coat Enviro-Boots | T4 | Strong foot protection, strong Rad resist, chemical resist | Sealed and insulated; White Coat faction |
| Composite Sprint Boots | T5 | Maximum foot protection, strong movement speed, strong Rad resist | White Coat faction; articulated sole |

***
### 2.6 Sash / Bandolier Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Sash | — | No modifier | Default |
| Cloth Sash | T1 | Negligible; purely cosmetic | Ville fashion; faction color optional |
| Scav Bandolier | T1 | Slight ammo carry | Leather strap with shell loops |
| Ammo Bandolier | T2 | Moderate ammo carry, slight reload speed | Cross-chest strap; common scavver gear |
| Faction Sash | T2 | Strong faction ID signal, slight NPC reaction boost | Each faction has a color/symbol variant |
| Grenade Rig | T3 | Moderate explosive carry, strong grenade draw speed | Chest rig for thrown explosives |
| Dual Bandolier | T3 | Strong ammo carry, moderate reload speed | Two crossed straps; heavy load out |
| Medic Rig | T3 | Moderate ammo carry, strong medical item access speed | White cross marking; NPCs treat medics differently |
| Mil-Spec Chest Rig | T4 | Strong ammo carry, strong explosive carry, moderate reload speed | Pre-dark MOLLE chest rig[^1] |
| White Coat Sample Harness | T4 | Strong chemical carry, strong crafting access | Vials and tool slots for White Coat faction |
| Warlord Sash | T5 | Strong faction prestige ID, slight all-combat buff near allies | Unique political item; visible to all players |

***
### 2.7 Face Cover Slot — Full Item List
*Note: This slot operates independently from the Head slot. A Gas Mask in the Head slot does not automatically fill the Face Cover slot.*

| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| Bare Face | — | No modifier | Default |
| Cloth Face Wrap | T1 | Slight dust resist | Common scavver standard |
| Bandana (Face) | T1 | Slight dust resist, slight anonymity (lowers NPC facial recognition) | Classic outlaw look[^3] |
| War Paint | T2 | Strong faction ID signal, slight intimidation to hostile NPCs | Applied pigment; each faction has colors |
| Rebreather Mask | T2 | Moderate airborne toxin resist | Half-face industrial mask |
| Scavver Skull Face | T2 | Slight intimidation, Cannie faction ID signal | Painted bone fragments; feared in civilized zones |
| Tactical Half-Mask | T3 | Moderate toxin resist, moderate NPC anonymity | Ballistic half-mask; obscures identity |
| Arena War Mask | T3 | Strong intimidation, strong arena prestige ID | Ceremonial combat mask; arena culture item |
| Rad Rebreather | T3 | Strong airborne Rad resist, moderate toxin resist | Pairs with Full Gas Mask for complete coverage |
| Mil-Spec Half-Respirator | T4 | Very strong toxin resist, moderate Rad resist | Pre-dark CBRN half-mask[^1] |
| White Coat Biosensor Mask | T4 | Strong toxin resist, strong chemical detection (alerts to traps) | White Coat faction crafted |
| Warlord Face Guard | T5 | Strong intimidation aura, maximum NPC recognition (fame instead of anonymity) | Unique faction reward; opposite of stealth |

***
### 2.8 Back Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Pack | — | No modifier | Default |
| Sack | T1 | Slight carry weight | Tied cloth bag; common |
| Scavver Sling Bag | T1 | Moderate carry weight | Over-shoulder scrap bag |
| Canvas Backpack | T2 | Moderate carry weight, slight organized access speed | Standard wasteland pack |
| Military Duffel | T2 | Strong carry weight, slight movement penalty | Large; slows movement when full |
| Frame Pack | T3 | Strong carry weight, no movement penalty | Rigid frame distributes load |
| Medic Pack | T3 | Moderate carry weight, strong medical crafting access | Red cross back panel; NPCs identify as medic |
| Armored Saddlebag | T3 | Moderate carry weight, strong vehicle attachment speed | Designed to hook onto vehicle exterior |
| Mil-Spec Field Pack | T4 | Very strong carry weight, moderate movement, organized slot system | Pre-dark ALICE pack[^1] |
| White Coat Research Pack | T4 | Strong carry weight, strong crafting station access, mobile lab slot | Portable White Coat equipment rig |
| Composite Assault Pack | T5 | Maximum carry weight, no movement penalty, built-in armor backing | White Coat faction; hardened shell |

***
## Part 3 — Accessory Slots (6 Slots)
Accessory slots provide passive stat modifications, faction signaling, and utility triggers. They do not provide direct armor protection but can significantly shift secondary stats, skill caps, and social interactions.[^10][^11]
### 3.1 Slot Overview
| Slot | Location | Item Types | Primary Benefit |
|------|----------|-----------|-----------------|
| **Earring (Left)** | Left ear | Earrings, Comm Pieces, Faction Tags | Passive stat buff, comms range |
| **Earring (Right)** | Right ear | Earrings, Comm Pieces, Faction Tags | Passive stat buff, comms range |
| **Ring (Left)** | Left hand | Rings, Knuckle Dusters, Signet Rings | Unarmed, social buff |
| **Ring (Right)** | Right hand | Rings, Knuckle Dusters, Signet Rings | Unarmed, social buff |
| **Talisman** | Chest inner layer | Charms, Tokens, Faction Medallions | Luck, faction passive, special proc |
| **Bracelet** | Wrist (either) | Bracelets, Cuffs, Tech Bands | Passive skill buff, crafting bonus |

***
### 3.2 Earring Slots (Left & Right) — Full Item List
*Both slots draw from the same pool. Some items are pairs (both slots required for full bonus).*

| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Earring | — | No modifier | Default |
| Bone Stud | T1 | Slight Unbound faction ID | Carved from wasteland bone; primitive |
| Wire Loop | T1 | Negligible; cosmetic | Twisted salvage wire |
| Brass Ring (Earring) | T1 | Slight Jack carry bonus (barter recognition) | Traders notice wealth signals |
| Faction Tag (Clipped) | T2 | Moderate faction ID signal for chosen faction | Stamped metal; worn by faction members |
| Comm Bead (Single) | T2 | Slight short-range communication boost | Rudimentary wireless earpiece |
| Sec-Man Comm Piece | T3 | Moderate comms range, Barony Steele faction ID | Looted from Sec-Men; Barony frequency |
| Scavver Lucky Charm (Ear) | T3 | Slight loot quality boost | Superstition with mild systemic effect |
| Rad Dosimeter Clip | T3 | Real-time radiation level display, moderate Rad awareness | Worn on ear; audio ping in Hot Spots[^7] |
| Mil-Spec Comms Earpiece | T4 | Strong comms range, party coordination buff | Pre-dark encrypted channel device[^1] |
| White Coat Neural Stud | T4 | Moderate intelligence buff, strong crafting complexity unlock | Bio-embedded; White Coat faction only |
| Warlord Faction Sigils (Pair) | T5 | Maximum faction prestige ID, strong NPC command aura | Paired set; both slots required for full effect |

***
### 3.3 Ring Slots (Left & Right) — Full Item List
*Both slots draw from the same pool. Stacking two rings of the same type has diminishing returns.*

| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Ring | — | No modifier | Default |
| Bone Ring | T1 | Slight Unbound faction ID | Carved primitive ring |
| Scrap Metal Band | T1 | Negligible; cosmetic | Welded salvage |
| Copper Barter Ring | T1 | Slight vendor price negotiation | Merchants recognize it as a barter signal |
| Lead-Lined Ring | T2 | Slight Rad resist | Dense metal; modest protection |
| Knuckle Duster (Ring Style) | T2 | Slight unarmed damage | Fits over two fingers; subtle version |
| Faction Signet Ring | T2 | Moderate faction ID, moderate NPC Esteem reaction | Stamped with faction emblem[^12] |
| Brass Knuckle Ring | T3 | Moderate unarmed damage, slight bleed proc | One-finger brass knuckle |
| Trader's Ring | T3 | Moderate vendor price reduction, moderate barter speed | Recognized by Traders as a deal-maker signal |
| Rad Shielding Band | T3 | Strong Rad resist | Dense composite; White Coat basic item |
| Mil-Spec Tactical Band | T4 | Moderate all-combat stat buff | Pre-dark biometric ring; reads pulse, adjusts grip[^1] |
| White Coat Data Ring | T4 | Strong intelligence buff, crafting recipe memory expansion | Stores extra recipe slots |
| Warlord's Signet (Pair) | T5 | Maximum faction prestige, strong intimidation to neutral NPCs | Political item; stacks with Warlord Sash |

***
### 3.4 Talisman Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Talisman | — | No modifier | Default |
| Lucky Rabbit's Foot | T1 | Slight loot quality | Classic superstition |
| Bone Token | T1 | Slight Unbound faction ID, slight fear aura | Mutie cultural item |
| Ville Charm | T1 | Slight NPC positive reaction in home Ville | Locally made; only works in origin zone |
| Trader's Scale Medallion | T2 | Moderate vendor price reduction | Merchants guild recognition token |
| Rust Prophet Eye | T2 | Moderate Rust Prophet faction ID, slight fear to civilians | Cult eye symbol; civilians react nervously |
| Arena Medal | T2 | Moderate Arena District prestige | Awarded for arena participation |
| Ryan's Panga Cross | T3 | Moderate melee damage buff, slight luck | Reference to Ryan Cawdor's blade; scavver legend[^13] |
| Scavver's Compass | T3 | Strong navigation bonus, moderate exploration range | Magnetic compass; improves travel efficiency |
| Rad Saint Medallion | T3 | Moderate Rad resist, moderate fear resist | Religious icon; common among wasteland faithful |
| Faction Champion Token | T4 | Strong faction prestige for chosen faction, moderate all-stat buff | Awarded by T5 faction NPCs for major contracts |
| White Coat Resonance Core | T4 | Strong intelligence buff, strong crafting complexity, moderate Rad resist | Experimental science token |
| Warlord's Skull Pendant | T5 | Maximum intimidation aura, strong faction prestige | Unique; recognizable world-wide as political item |
| Redoubt Keystone | T5 | Access to Tier 5 Redoubt zones, strong all-stat buff | Pre-dark MAT-TRANS auth token[^1]; extremely rare |

***
### 3.5 Bracelet Slot — Full Item List
| Item | Tier | Stat Benefit | Lore Notes |
|------|------|-------------|-----------|
| No Bracelet | — | No modifier | Default |
| Bone Cuff | T1 | Slight Unbound faction ID | Primitive waste-culture item |
| Leather Wristband | T1 | Negligible; cosmetic | Common scavver fashion |
| Copper Coil Bracelet | T1 | Slight anti-static bonus (slight electronics crafting) | Folk remedy with mild systemic effect |
| Barbed Wire Cuff | T2 | Slight unarmed bleed proc | Intimidation fashion; Hostile NPCs wary |
| Mechanic's Wrist Wrap | T2 | Moderate repair speed | Stabilizes wrist for tool use |
| Rad Reader Band | T2 | Real-time Rad level display on wrist | Simpler version of Rad Dosimeter[^7] |
| Faction Loyalty Band | T3 | Strong faction ID, moderate Esteem reaction from faction NPCs | Faction-specific design; woven or stamped |
| Combat Brace | T3 | Moderate melee accuracy, moderate unarmed damage | Wrist stabilization for striking |
| Pulse Monitor Band | T3 | Moderate health awareness, slight health regen rate | Monitors vital signs; alerts to bleed/poison |
| Mil-Spec Data Cuff | T4 | Strong crafting bonus, strong vehicle interface speed | Pre-dark tactical wrist computer[^1] |
| White Coat Bio-Cuff | T4 | Strong poison crafting, strong medical quality | Measures chemical composition in real time |
| Warlord's Command Cuff | T5 | Strong faction aura boost, strong NPC command range | Political item; NPCs within range respond to commands faster |

***
## Part 4 — Full Slot Summary Reference
| # | Slot | Category | Key Purpose |
|---|------|----------|------------|
| 1 | Head | Armor | Head protection, Rad resist |
| 2 | Neck | Armor | Bleed/slash resist |
| 3 | Chest | Armor | Core HP buffer, Rad resist |
| 4 | Arms | Armor | Melee defense |
| 5 | Hands | Armor | Grip, weapon/vehicle handling |
| 6 | Legs | Armor | Movement, leg protection |
| 7 | Outer Coat | Clothing | Faction ID, stealth, weather |
| 8 | Shirt/Under-Armor | Clothing | Comfort, adjacent slot synergy |
| 9 | Belt | Clothing | Carry weight, quick-draw |
| 10 | Footwear | Clothing | Movement, terrain traversal |
| 11 | Sash/Bandolier | Clothing | Ammo carry, reload speed |
| 12 | Face Cover | Clothing | Toxin resist, faction ID, anonymity |
| 13 | Back | Clothing | Carry weight, crafting access |
| 14 | Earring Left | Accessory | Stat buff, comms |
| 15 | Earring Right | Accessory | Stat buff, comms |
| 16 | Ring Left | Accessory | Unarmed, social |
| 17 | Ring Right | Accessory | Unarmed, social |
| 18 | Talisman | Accessory | Luck, faction passive, special proc |
| 19 | Bracelet | Accessory | Skill buff, crafting bonus |

***
## Part 5 — Set Bonus System
Certain items from matching factions or material tiers grant **Set Bonuses** when worn together, rewarding thematic character builds.[^10]

| Set Name | Required Pieces | Set Bonus |
|----------|----------------|-----------|
| **Full Rad Suit** | Rad Suit Torso + Rad Suit Arms + Rad Suit Legs + Full Gas Mask + Rad Boots | Very strong Rad resist across full body; Hot Spot traversal unlocked |
| **Barony Steele Marshal** | Barony Steele Warlord Helm + Marshal Coat + Sec-Man Leg Guards + Sec-Man Arm Guards | Strong Barony Steele faction aura; Sec-Men become allied escorts |
| **Rust Prophet Zealot** | Rust Prophet Skull Mask + Rust Prophet Robe + Bone Stud + Bone Ring + Bone Token | Strong Rust Prophet faction aura; cult NPCs offer unique routes through ruins |
| **White Coat Researcher** | White Coat Cranial Shield + Research Coat + Lab Gloves + Bio-Cuff + Biosensor Mask | Maximum crafting quality; unlocks Tier 5 crafting recipes |
| **Full Road Rat Colors** | Road Rat Colors Jacket + Armored Chaps + Driving Boots + Driving Gloves + Riding Boots | Strong Free Road Collective faction; open highway NPC encounters turn friendly |
| **Arena Champion Full Kit** | Arena Champion Visor + Arena Arm Guards + Arena Spiked Gauntlets + Arena Medal + Arena War Mask | Maximum arena prestige; bookmaker NPCs offer best odds; crowd gives combat buff |
| **Unbound Mutie Build** | Mutie Bone Crown + Mutie Carapace Chest + Mutie Scale Legs + Bone Cuff + Bone Token | Strong Unbound faction identity; strong Rad absorption; civil NPCs scatter on sight |

---

## References

1. [Deathlands - Wikipedia](https://en.wikipedia.org/wiki/Deathlands) - Deathlands is a series of novels written by Christopher Lowder under the pseudonym Jack Adrian and p...

2. [Autoduel Driver's Manual Guide | PDF | Suspension (Vehicle) - Scribd](https://www.scribd.com/document/19759441/Autoduel) - This document provides an overview and instructions for the computer game Autoduel. It discusses: 1)...

3. [Deathlands (Literature) - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Literature/Deathlands) - In the year 2104 life in Deathlands is nasty, brutish, short, and frequently mutated. However, the H...

4. [Category:Wasteland 2 items - Official Wasteland 3 Wiki](https://wasteland.fandom.com/wiki/Category:Wasteland_2_items) - All items (23) W Category:Wasteland 2 ammunition Category:Wasteland 2 armor Category:Wasteland 2 boo...

5. [Paperdoll - Ultima Online Forever Wiki](https://uoforever.com/wiki/index.php/Paperdoll) - There are 19 different equipment slots. Belt - Bracelet - Back - Chest - Sash - Earrings - Footwear ...

6. [Paper doll - The Codex of Ultima Wisdom](https://wiki.ultimacodex.com/wiki/Paper_doll) - Paper dolls are the mainstay of an inventory management system, integrated late in the Ultima series...

7. [Savage Deathlands Part Two: World Background](https://roleplayersimaginarium.blog/2018/01/07/savage-deathlands-part-two-world-background/) - A feudal society of cruel and often deranged barons control most of the larger city-states. The smal...

8. [No game (to my knowlegde) so far has recreated GTA 2's reputation ...](https://www.reddit.com/r/patientgamers/comments/15q8u58/no_game_to_my_knowlegde_so_far_has_recreated_gta/) - GTA 2 had a reptutation system that determined how gangs reacted to you. If you were neutral or on t...

9. [Respect - Grand Theft Wiki, the GTA wiki](https://www.grandtheftwiki.com/Respect) - Respect is a fundamental aspect of the gang system, determining which gangs the player may work with...

10. [Equipment - UOGuide, the Ultima Online Encyclopedia](https://www.uoguide.com/Equipment) - Types of Equipment · Armor · Artifacts · Clothing · Item Sets · Jewelry · Shields · Talismans · Weap...

11. [Item Properties - UOAlive Wiki](https://uoalive.com/wiki/Item_Properties) - Found On - The allowable items the property can be found on. Five categories listed below are armors...

12. [City Loyalty - Ultima Online](https://uo.com/wiki/ultima-online-wiki/gameplay/city-loyalty/) - For each city, each player character has individual ratings for Love, Hate, and Neutrality. These va...

13. [Ryan Cawdor | Deathlands Wiki | Fandom](https://deathlands.fandom.com/wiki/Ryan_Cawdor) - He now carries a Steyr Scout rifle, a Sig-Sauer P-226 pistol with a baffle silencer, a panga (a mach...

