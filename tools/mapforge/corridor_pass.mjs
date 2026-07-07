// THE CORRIDOR PASS — executes docs/design/MAP_POLISH_PLAN.md Phases A–F
// against a running MapForge (:8899). Deterministic, idempotent (refuses a
// corridor that already carries exits), plan-faithful: archetype variety rule
// (no two adjacent exits share an archetype), risk gradient F2, named
// communities from the §3.2 roster at their described geography, Alligator
// Alley's three exits pinned to I-75's final span + the swamp band painted,
// Maple Hill as a WINDING SPUR (never an exit node).
//
// Run: node tools/mapforge/corridor_pass.mjs
const API = "http://localhost:8899";

const get = async (p) => (await fetch(API + p)).json();
const post = async (p, body) => {
	const r = await fetch(API + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const j = await r.json();
	if (!r.ok) throw new Error(`${p} -> ${r.status}: ${JSON.stringify(j)}`);
	return j;
};

// Archetype base dangers (mirror of exit_blueprints.json — fetched live below).
let DANGER = { service: 1, neighborhood: 1, county_seat: 2, industrial: 2, metro: 3, military_spur: 5, dead: 4 };

// --- The five corridors (plan §3.1 budgets + §3.2 roster at its geography) ----
// Each slot: fraction of the corridor's arc (start→end of its pts), archetype,
// tier, name (null = generated T1 flavor), town (adds a §3.2 community), and
// purpose (drives Phase D placements). Adjacent archetypes NEVER repeat.
const T1_NAMES = {
	"I-95": ["MILEPOST 4 FUEL", "GREENBRIAR ROWS", "THE BURNED RAMP", "CHAPEL PUMPS", "TOLLGATE MEADOWS", "IRONWORKS SIDING"],
	"I-75": ["PIKE MILE 6", "SCRAPLINE SIDING", "THE WASHOUT"],
	"I-40": ["BONE ROAD FUEL", "DUST ROW", "QUARRY GATE", "THE SUNKEN RAMP", "WAGON WHEEL STOP", "PINE FLATS", "SMELTER SPUR", "CROSSTIE REST"],
	"I-10": ["FURNACE MILE 9", "THE SAND TRAP", "BORDER WELLS", "HEAT SHIMMER PUMPS", "CACTUS ROW", "LAST SHADE"],
	"I-90": ["COLD MILE ONE", "SNOW FENCE ROWS", "THE DRIFT", "SIGNAL BLUFF", "PRAIRIE SIDING", "FROSTLINE FUEL", "THE LONG QUIET"],
};

const CORRIDORS = {
	"I-95": [ // 8 new (+ Meridian X1 existing) — Rosewood ~14km south of Meridian (the corn route)
		{ f: 0.08, arch: "service", tier: "T1" },
		{ f: 0.17, arch: "neighborhood", tier: "T1" },
		{ f: 0.26, arch: "dead", tier: "T1" },
		{ f: 0.34, arch: "industrial", tier: "T1" },
		{ f: 0.47, arch: "service", tier: "T1" },
		{ f: 0.58, arch: "industrial", tier: "T2", name: "HOLLOWPOINT", town: "hollowpoint", purpose: "salvage" },
		{ f: 0.68, arch: "neighborhood", tier: "T1" },
		{ f: 0.79, arch: "county_seat", tier: "T3", name: "ROSEWOOD", town: "rosewood", purpose: "farm" },
	],
	"I-75": [ // 9 new — GA faith mission, the FL border checkpoint, ALLIGATOR ALLEY's trio
		{ f: 0.10, arch: "service", tier: "T1" },
		{ f: 0.22, arch: "industrial", tier: "T1" },
		{ f: 0.34, arch: "neighborhood", tier: "T2", name: "LOWCOUNTRY LANDING", town: "lowcountry-landing", purpose: "faith" },
		{ f: 0.46, arch: "dead", tier: "T1" },
		{ f: 0.58, arch: "county_seat", tier: "T3", name: "REEF FLEET WHARF", town: "reef-fleet-wharf", purpose: "wharf" },
		{ f: 0.72, arch: "military_spur", tier: "T1", name: "SAINT REGIS CHECKPOINT", town: "saint-regis", purpose: "checkpoint" },
		{ alley: 0.25, arch: "service", tier: "T1", name: "COTTONMOUTH FUEL & BAIT", town: "cottonmouth", purpose: "fuel_t1" },
		{ alley: 0.55, arch: "neighborhood", tier: "T2", name: "THE DRY DOCK", town: "the-dry-dock", purpose: "market" },
		{ alley: 0.85, arch: "dead", tier: "T1", name: "FLOODED GHOST EXIT" },
	],
	"I-40": [ // 10 new — Fairweather + Bragg's Shadow in NC (the eastern end); Maple Hill is a SPUR, not an exit
		{ f: 0.08, arch: "service", tier: "T1" },
		{ f: 0.17, arch: "neighborhood", tier: "T1" },
		{ f: 0.26, arch: "industrial", tier: "T1" },
		{ f: 0.35, arch: "dead", tier: "T1" },
		{ f: 0.44, arch: "service", tier: "T1" },
		{ f: 0.53, arch: "neighborhood", tier: "T1" },
		{ f: 0.62, arch: "industrial", tier: "T1" },
		{ f: 0.72, arch: "service", tier: "T1" },
		{ f: 0.82, arch: "neighborhood", tier: "T2", name: "FAIRWEATHER CROSS", town: "fairweather-cross", purpose: "market" },
		{ f: 0.90, arch: "county_seat", tier: "T3", name: "BRAGG'S SHADOW", town: "braggs-shadow", purpose: "law" },
	],
	"I-10": [ // 9 new — the Furnace Run gets its fuel-depot T3
		{ f: 0.10, arch: "service", tier: "T1" },
		{ f: 0.20, arch: "dead", tier: "T1" },
		{ f: 0.30, arch: "neighborhood", tier: "T2", name: "LAS PALMAS STRIP" },
		{ f: 0.40, arch: "industrial", tier: "T1" },
		{ f: 0.50, arch: "service", tier: "T1" },
		{ f: 0.60, arch: "county_seat", tier: "T3", name: "PEACH COMBINE DEPOT", town: "peach-combine-depot", purpose: "fuel" },
		{ f: 0.70, arch: "neighborhood", tier: "T1" },
		{ f: 0.80, arch: "industrial", tier: "T2", name: "SALTPAN WORKS" },
		{ f: 0.90, arch: "service", tier: "T1" },
	],
	"I-90": [ // 10 new — Quartermaster's Rest on the west leg, Rail Yard Seven near the eastern cities
		{ f: 0.08, arch: "service", tier: "T1" },
		{ f: 0.16, arch: "neighborhood", tier: "T1" },
		{ f: 0.25, arch: "service", tier: "T2", name: "QUARTERMASTER'S REST", town: "quartermasters-rest", purpose: "fuel" },
		{ f: 0.34, arch: "dead", tier: "T1" },
		{ f: 0.43, arch: "industrial", tier: "T1" },
		{ f: 0.52, arch: "neighborhood", tier: "T1" },
		{ f: 0.61, arch: "service", tier: "T1" },
		{ f: 0.70, arch: "county_seat", tier: "T3", name: "RAIL YARD SEVEN", town: "rail-yard-seven", purpose: "railyard" },
		{ f: 0.80, arch: "industrial", tier: "T2", name: "GRAIN SCALE SIDING" },
		{ f: 0.90, arch: "dead", tier: "T1" },
	],
};

// Phase D building sets by purpose (§3.2 table; ids must exist in the catalog).
const PURPOSE_BUILDINGS = {
	farm: ["farmhouse_field", "market_general", "warehouse", "house_small", "house_small"],
	salvage: ["junkyard", "auto_shop", "house_small"],
	market: ["market_general", "diner_roadside", "motel_strip"],
	law: ["courthouse", "police_station", "market_general"],
	fuel: ["gas_station_small", "auto_shop", "warehouse"],
	fuel_t1: ["gas_station_small", "house_small"],
	faith: ["church_small", "house_small", "house_small"],
	checkpoint: ["checkpoint_road"],
	wharf: ["courthouse", "market_general", "warehouse"],
	railyard: ["junkyard", "auto_shop", "police_station"],
	maple: ["junkyard", "auto_shop", "farmhouse_field", "market_general", "house_small", "house_small"],
};

const arcOf = (pts) => {
	const cum = [0];
	for (let i = 1; i < pts.length; i++)
		cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
	return cum;
};
const pointAt = (pts, cum, arc) => {
	for (let i = 0; i + 1 < pts.length; i++) {
		const seg = cum[i + 1] - cum[i];
		if (arc <= cum[i + 1] || i === pts.length - 2) {
			const t = Math.max(0, Math.min(1, (arc - cum[i]) / (seg || 1)));
			const d = [(pts[i + 1][0] - pts[i][0]) / (seg || 1), (pts[i + 1][1] - pts[i][1]) / (seg || 1)];
			return { p: [pts[i][0] + d[0] * seg * t, pts[i][1] + d[1] * seg * t], d };
		}
	}
	return { p: pts[0], d: [1, 0] };
};

async function main() {
	const meta = await get("/api/meta");
	const roadsAll = await get("/api/roads");
	const exitsDoc = await get("/api/exits");
	for (const b of exitsDoc.blueprints || []) DANGER[b.id] = b.danger ?? DANGER[b.id] ?? 1;
	const catalog = (await get("/api/structures"));
	const catalogIds = new Set((Array.isArray(catalog) ? catalog : catalog.structures || []).map((s) => s.id));

	// --- Phase F FIRST: the two new catalog rows the towns below will place ----
	for (const row of [
		{
			id: "farmhouse_field", category: "agriculture", display_name: "Farmhouse & Field", sign_glyph: "🌽",
			allowed_tiers: ["T1", "T2", "T3"], districts: ["outskirts", "roadside"], footprint: "large_rect",
			footprint_m: [22, 16], floors: 1, enterable: true, entrances: ["front"], interior_template: "none",
			loot_table: "chest_common", npc_jobs: ["farmer", "hand"], law_hooks: [], event_hooks: ["harvest", "raid"],
			faction_overrides: ["prices"], power_required: false,
		},
		{
			id: "kennel_small", category: "service", display_name: "Kennel", sign_glyph: "🐕",
			allowed_tiers: ["T1", "T2"], districts: ["outskirts", "roadside"], footprint: "small_rect",
			footprint_m: [10, 8], floors: 1, enterable: true, entrances: ["front"], interior_template: "none",
			loot_table: "chest_common", npc_jobs: ["breeder"], law_hooks: [], event_hooks: ["stray", "adoption"],
			faction_overrides: ["prices"], power_required: false,
		},
	]) {
		if (!catalogIds.has(row.id)) { await post("/api/structures", row); catalogIds.add(row.id); console.log(`structure row +${row.id}`); }
	}

	// --- Phase A: the exits, corridor by corridor -------------------------------
	let placedExits = 0, placedTowns = 0, placedBuildings = 0;
	const townPos = {};
	for (const [hwy, slots] of Object.entries(CORRIDORS)) {
		const road = roadsAll.find((r) => r.id === hwy);
		if (!road) { console.log(`SKIP ${hwy}: not on the map`); continue; }
		const already = (exitsDoc.exits || []).filter((e) => e.highway_id === hwy && !e.id.includes("X1")).length;
		if (already > 0) { console.log(`SKIP ${hwy}: already has ${already} non-X1 exits (idempotence)`); continue; }
		const cum = arcOf(road.pts);
		const total = cum[cum.length - 1];
		// ALLIGATOR ALLEY: the final span (last two segments) of I-75.
		const alleyStart = hwy === "I-75" ? cum[Math.max(0, road.pts.length - 3)] : 0;
		// T3 arcs for the risk gradient (Meridian's X1 counts on I-95).
		const t3arcs = slots.filter((s) => s.tier === "T3").map((s) => (s.alley !== undefined ? alleyStart + s.alley * (total - alleyStart) : s.f * total));
		if (hwy === "I-95") t3arcs.push(12939); // Meridian X1's arc (county seat already standing)
		let names = [...(T1_NAMES[hwy] || [])];
		let i = 0;
		for (const s of slots) {
			const arc = s.alley !== undefined ? alleyStart + s.alley * (total - alleyStart) : s.f * total;
			const { p, d } = pointAt(road.pts, cum, arc);
			const side = i % 2 === 0 ? 1 : -1; // alternate departure sides — both directions get service
			const right = [-d[1] * side, d[0] * side];
			const off = s.tier === "T1" ? 520 : 720;
			const dest = [Math.round(p[0] + right[0] * off), Math.round(p[1] + right[1] * off)];
			// F2 risk gradient: base + proximity (±1) + occupation (+1 in FLORIDA).
			const nearT3 = t3arcs.some((a) => Math.abs(a - arc) < total * 0.12);
			const deepT3 = t3arcs.every((a) => Math.abs(a - arc) > total * 0.3);
			const cell = await get(`/api/cell?wx=${dest[0]}&wz=${dest[1]}`);
			const occupied = (cell.state || "") === "FLORIDA" ? 1 : 0;
			const risk = Math.max(0, Math.min(5, (DANGER[s.arch] ?? 1) + (nearT3 ? -1 : deepT3 ? 1 : 0) + occupied));
			const name = s.name || names.shift() || `${hwy} SERVICES ${i + 1}`;
			await post("/api/exits", {
				dest, name, archetype: s.arch, highway_id: hwy,
				community_tier: s.tier, risk_rating: risk, has_return_ramp: s.tier !== "T1",
			});
			placedExits++;
			if (s.town) townPos[s.town] = { pos: dest, name, purpose: s.purpose, tier: s.tier };
			i++;
		}
		console.log(`${hwy}: ${slots.length} exits placed`);
	}

	// --- Phase B: MAPLE HILL — a winding spur off I-40's eastern leg, NO exit ---
	const i40 = roadsAll.find((r) => r.id === "I-40");
	if (i40 && !(await get("/api/roads")).some((r) => r.id === "SPUR-maple-hill")) {
		const cum = arcOf(i40.pts);
		const { p, d } = pointAt(i40.pts, cum, 0.86 * cum[cum.length - 1]);
		const right = [-d[1], d[0]];
		const spur = [
			[Math.round(p[0]), Math.round(p[1])],
			[Math.round(p[0] + right[0] * 700 + d[0] * 300), Math.round(p[1] + right[1] * 700 + d[1] * 300)],
			[Math.round(p[0] + right[0] * 1500 - d[0] * 250), Math.round(p[1] + right[1] * 1500 - d[1] * 250)],
			[Math.round(p[0] + right[0] * 2300 + d[0] * 420), Math.round(p[1] + right[1] * 2300 + d[1] * 420)],
			[Math.round(p[0] + right[0] * 3100 + d[0] * 100), Math.round(p[1] + right[1] * 3100 + d[1] * 100)],
		];
		await post("/api/roads", { id: "SPUR-maple-hill", kind: "exit", pts: spur, danger: 2, nickname: "THE UNMARKED TURN" });
		townPos["maple-hill"] = { pos: spur[spur.length - 1], name: "MAPLE HILL", purpose: "maple", tier: "T2" };
		// The hand-painted sign at the mouth — wayfinding, no law hooks (plan §3.4).
		await post("/api/placements", { building: "market_stall", pos: spur[0], rot: 0 }).catch(() => {});
		console.log("SPUR-maple-hill laid (winding, 3.1km off the Bone Road)");
	}

	// --- Phase C+D: towns + their purpose buildings ------------------------------
	const templates = { T2: "hamlet", T3: "hamlet" };
	for (const [id, t] of Object.entries(townPos)) {
		await post("/api/towns", { id, name: t.name, pos: t.pos, kind: "holdout" });
		placedTowns++;
		if (templates[t.tier])
			await post("/api/stamp_template", { template: templates[t.tier], pos: t.pos, name: t.name }).catch(() => {});
		const set = PURPOSE_BUILDINGS[t.purpose] || [];
		let k = 0;
		for (const b of set) {
			if (!catalogIds.has(b)) { console.log(`  (skip unknown structure '${b}')`); continue; }
			const ang = (k / Math.max(1, set.length)) * Math.PI * 2;
			await post("/api/placements", {
				building: b,
				pos: [Math.round(t.pos[0] + Math.cos(ang) * 55), Math.round(t.pos[1] + Math.sin(ang) * 55)],
				rot: Math.round(((ang + Math.PI) % (Math.PI * 2)) * 100) / 100,
			});
			placedBuildings++;
			k++;
		}
	}

	// --- Phase E: the ALLIGATOR ALLEY swamp band ---------------------------------
	const i75 = roadsAll.find((r) => r.id === "I-75");
	if (i75) {
		const pts = i75.pts.slice(-3);
		const cells = new Set();
		const [ox, oz] = meta.world_offset || [-60000, -20500];
		const cm = meta.cell_m || 500;
		const cum2 = arcOf(pts);
		for (let a = 0; a <= cum2[cum2.length - 1]; a += 220) {
			const { p } = pointAt(pts, cum2, a);
			const cx = Math.floor((p[0] - ox) / cm), cz = Math.floor((p[1] - oz) / cm);
			for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.add(`${cx + dx},${cz + dz}`);
		}
		const cellList = [...cells].map((s) => s.split(",").map(Number)).filter(([x, z]) => x >= 0 && z >= 0 && x < meta.w && z < meta.h);
		await post("/api/paint", { biome: "swamp", cells: cellList });
		console.log(`ALLIGATOR ALLEY: ${cellList.length} cells painted swamp`);
	}

	console.log(`\nCORRIDOR PASS COMPLETE: ${placedExits} exits, ${placedTowns} towns, ${placedBuildings} purpose buildings.`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
