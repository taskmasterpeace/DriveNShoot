// THE RELIEF PAINTER'S FIRST DRAFT (THE_COUNTRY_PLAN 1A) — authors the painted
// relief grid into usmap.json: digits 0-9 per 500m cell (0.0-1.0 amplitude for
// world_builder's macro law). Geography, not noise: the Rockies band, the
// Sierra/Cascade wall, the Appalachian spine, low plains, carved river valleys,
// a flat Gulf/Florida south, ZERO on water and across the authored Meridian slab.
// Re-runnable: overwrites map.relief wholesale (the grid IS the artifact; MapForge's
// RELIEF paint layer edits it cell-by-cell afterward).
// Run: node tools/mapforge/gen_relief.mjs [--dry]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP_PATH = process.env.USMAP_PATH || join(ROOT, "game", "data", "usmap.json");
const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));

const [ox, oz] = map.world_offset;
const cm = map.cell_m;
const W = map.w, H = map.h;
const biomeLeg = map.legend;
const stateLeg = map.state_legend;

const stateBase = {
	// the painted BANDS come from mountain-biome proximity; this is the floor tone
	COLORADO: 5, UTAH: 5, NEVADA: 4, CALIFORNIA: 3, ARIZONA: 3, NEWMEXICO: 3,
	WYOMING: 4, MONTANA: 4, IDAHO: 4, OREGON: 3, WASHINGTON: 3,
	KENTUCKY: 3, VIRGINIA: 3, WESTVIRGINIA: 4, TENNESSEE: 3, NORTHCAROLINA: 2,
	PENNSYLVANIA: 2, NEWYORK: 2, VERMONT: 3, NEWHAMPSHIRE: 3, MAINE: 2,
	FLORIDA: 0, LOUISIANA: 0, MISSISSIPPI: 1, ALABAMA: 1, GEORGIA: 1,
	TEXAS: 1, OKLAHOMA: 1, KANSAS: 1, NEBRASKA: 1, IOWA: 1, ILLINOIS: 1,
	INDIANA: 1, OHIO: 1, MISSOURI: 1, ARKANSAS: 2, MINNESOTA: 1, WISCONSIN: 1,
	MICHIGAN: 1, NORTHDAKOTA: 1, SOUTHDAKOTA: 2, DELAWARE: 0, MARYLAND: 1,
	NEWJERSEY: 0, CONNECTICUT: 1, RHODEISLAND: 0, MASSACHUSETTS: 1,
	SOUTHCAROLINA: 1,
};

const biomeAt = (cx, cz) => biomeLeg[(map.grid[cz] || [])[cx]] || "ocean";
const stateAt = (cx, cz) => stateLeg[(map.states_grid[cz] || [])[cx]] || "";

// pass 1: base tone from state + mountain-biome boost (the RANGES)
const relief = [];
for (let cz = 0; cz < H; cz++) {
	let row = "";
	for (let cx = 0; cx < W; cx++) {
		const b = biomeAt(cx, cz);
		if (b === "ocean" || b === "water") { row += "0"; continue; }
		let v = stateBase[stateAt(cx, cz)] ?? 1;
		if (b === "mountains") v = Math.max(v + 3, 7);       // the painted range core
		else {
			// range FOOTHILLS: mountain cells within 2 cells lift their neighbors
			let near = 0;
			for (let dz = -2; dz <= 2; dz++)
				for (let dx = -2; dx <= 2; dx++)
					if (biomeAt(cx + dx, cz + dz) === "mountains") near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dz)));
			v += near;
		}
		if (b === "swamp") v = 0;                             // wetlands are FLAT
		row += String(Math.max(0, Math.min(9, v)));
	}
	relief.push(row);
}

// pass 2: river VALLEYS — carve 1-2 digits within ~2 cells of any river polyline
const rivers = map.rivers || [];
function distToRivers(x, z) {
	let best = 1e18;
	for (const r of rivers)
		for (let i = 0; i + 1 < r.pts.length; i++) {
			const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
			const dx = bx - ax, dz = bz - az;
			const L2 = dx * dx + dz * dz || 1;
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
			const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
			if (d < best) best = d;
		}
	return best;
}
for (let cz = 0; cz < H; cz++) {
	let row = relief[cz].split("");
	for (let cx = 0; cx < W; cx++) {
		if (row[cx] === "0") continue;
		const wx = ox + (cx + 0.5) * cm, wz = oz + (cz + 0.5) * cm;
		const d = distToRivers(wx, wz);
		if (d < cm) row[cx] = String(Math.max(0, Number(row[cx]) - 2));
		else if (d < cm * 2) row[cx] = String(Math.max(0, Number(row[cx]) - 1));
	}
	relief[cz] = row.join("");
}

// pass 3: the authored Meridian slab is FLAT BY CONSTRUCTION — zero it (+1 cell apron)
for (let cz = 0; cz < H; cz++) {
	let row = relief[cz].split("");
	for (let cx = 0; cx < W; cx++) {
		const wx = ox + (cx + 0.5) * cm, wz = oz + (cz + 0.5) * cm;
		if (Math.abs(wx) < 6300 && Math.abs(wz) < 6300) row[cx] = "0";
	}
	relief[cz] = row.join("");
}

// pass 4: towns sit in worked lowland — soften 1 digit within 1 cell of a town
for (const t of map.towns || []) {
	const cx = Math.floor((t.pos[0] - ox) / cm), cz = Math.floor((t.pos[1] - oz) / cm);
	for (let dz = -1; dz <= 1; dz++)
		for (let dx = -1; dx <= 1; dx++) {
			const r = relief[cz + dz];
			if (!r) continue;
			const c = r[cx + dx];
			if (c === undefined) continue;
			relief[cz + dz] = r.slice(0, cx + dx) + String(Math.max(0, Number(c) - 1)) + r.slice(cx + dx + 1);
		}
}

map.relief = relief;
const hist = {};
for (const row of relief) for (const ch of row) hist[ch] = (hist[ch] || 0) + 1;
console.log("RELIEF: painted", W + "x" + H, "histogram", JSON.stringify(hist));
if (!process.argv.includes("--dry")) {
	writeFileSync(MAP_PATH, JSON.stringify(map));
	console.log("RELIEF: written to " + MAP_PATH);
} else console.log("RELIEF: dry run");
