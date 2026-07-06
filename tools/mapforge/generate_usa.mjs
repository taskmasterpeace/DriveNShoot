#!/usr/bin/env node
// MapForge — DEATHLANDS USA generator.
// Builds game/data/usmap.json: the macro map of the compressed United States that
// BOTH the game (ProtoUSMap) and the MapForge editor/API read and write.
//
// Scale law (user-set 2026-07-05): 4 real hours of driving = 4 real minutes → 60×.
// Continental US ≈ 4500×2600 km → 75×42.5 km in-game → 150×85 cells of 500 m.
//
// The 30×17 TEMPLATE below is hand-authored geography (west→east, north→south),
// upscaled ×5 with seeded noise for organic borders. Edit the map afterward with
// MapForge (tools/mapforge/server.mjs) or its REST API — regenerating OVERWRITES.
//
// Run: node tools/mapforge/generate_usa.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "game", "data", "usmap.json");

const CELL_M = 500;
const UPSCALE = 5;
const TW = 30, TH = 17;              // template dims
const W = TW * UPSCALE, H = TH * UPSCALE; // 150 × 85 fine cells
const WORLD_OFFSET = [-60000, -20500]; // world = offset + cell*CELL_M (Meridian ≈ Virginia)
const SEED = 0xD817D;

// Biomes: . ocean · w water · F forest · f scrub · p plains · a farmland
//         d desert · m mountains · s swamp · u urban
const LEGEND = {
	".": "ocean", "w": "water", "F": "forest", "f": "scrub", "p": "plains",
	"a": "farmland", "d": "desert", "m": "mountains", "s": "swamp", "u": "urban",
};

// ---- The hand-authored USA (30 wide × 17 tall, ~193 km/col · ~157 km/row real) ----
const TEMPLATE = [
	"FFmmmmmmppppppaaawwwwFF...FFF.", //  0 N border: WA forest, MT rockies, Dakotas, Superior, Maine
	"FuFmmffmmpppppaaaawwFFwwFFFFF.", //  1 Seattle · plains · Superior tail · N New England
	"FFmmffmmmpppppaaaFFwFwFFFFFFF.", //  2 OR/ID · WY · MN farm · L.Michigan · upstate NY
	"FfmfdfmmpppppaaauaFwwFFwFFFFF.", //  3 Minneapolis · lakes Michigan/Huron/Ontario
	"FfmdddfmmppppaaaaaawaFuwFFFFu.", //  4 NV desert edge · Iowa corn · Detroit · Boston
	"FFmddddmmmppppaaaaauaaFFFFuFF.", //  5 Great Basin · Chicago · PA forest · NYC
	"FamddddmmmuppppaaaaaaFFmFuFu..", //  6 CA valley · Denver · corn belt · WV mtns · DC · Philly
	"FuamddddmmmppppaaauaFFFmFF....", //  7 San Francisco · Utah/CO · St. Louis · Appalachia
	"FaamddddmffpppaaaaFFFFmFFu....", //  8 Fresno valley · KS wheat · KY/TN/VA forest · Richmond
	".amdduddfffpppaaFFFFFFFFF.....", //  9 LAS VEGAS · OK plains · the Southeast woods
	"..mudddddffppppaFaFFFuFFF.....", // 10 LOS ANGELES · NM/AZ · Dallas plains · ATLANTA
	"...uddduddffpppuaaFFFFFF......", // 11 San Diego · PHOENIX · DALLAS · GA/Carolinas
	"....ddddffffppaaasssFFF.......", // 12 W TX scrub · MS delta farm · gulf swamp belt
	".....fffffffpaaussusssus......", // 13 S TX brush · HOUSTON · NEW ORLEANS · Jacksonville
	"....ff...............sss......", // 14 Rio Grande valley · Gulf of Mexico · FL spine
	"....f................sus......", // 15 S TX tip · TAMPA
	".....................ssu......", // 16 Everglades · MIAMI
];

// Sanity: template must be exactly TW×TH.
TEMPLATE.forEach((row, i) => {
	if (row.length !== TW) throw new Error(`template row ${i} is ${row.length} chars, want ${TW}`);
	for (const ch of row) if (!(ch in LEGEND)) throw new Error(`row ${i}: unknown biome '${ch}'`);
});
if (TEMPLATE.length !== TH) throw new Error(`template is ${TEMPLATE.length} rows, want ${TH}`);
// Anchor law: the authored Meridian/I-9 zone (world ~0,0…-400) must sit in Virginia forest.
if (TEMPLATE[8][24] !== "F") throw new Error("row 8 col 24 must stay forest — Meridian lives there");

// ---- The 48 states (template-coord anchors → Voronoi) ------------------------
// [name, template col, template row] from real centroids (lon→col, lat→row).
const STATE_ANCHORS = [
	["ALABAMA", 19.8, 11.5], ["ARIZONA", 6.9, 10.4], ["ARKANSAS", 16.9, 10.0],
	["CALIFORNIA", 2.7, 8.6], ["COLORADO", 10.1, 7.1], ["CONNECTICUT", 27.1, 5.2],
	["DELAWARE", 25.6, 7.1], ["FLORIDA", 22.5, 14.4], ["GEORGIA", 21.5, 11.6],
	["IDAHO", 5.4, 3.3], ["ILLINOIS", 18.8, 6.0], ["INDIANA", 20.0, 6.4], // IL nudged NE so Chicago is Illinois
	["IOWA", 16.3, 5.0], ["KANSAS", 13.8, 7.4], ["KENTUCKY", 20.8, 8.1],
	["LOUISIANA", 17.1, 12.7], ["MAINE", 28.9, 2.5], ["MARYLAND", 25.0, 7.1],
	["MASSACHUSETTS", 27.5, 4.7], ["MICHIGAN", 20.9, 3.3], ["MINNESOTA", 15.9, 1.9],
	["MISSISSIPPI", 18.3, 11.5], ["MISSOURI", 16.8, 7.5], ["MONTANA", 8.0, 1.4],
	["NEBRASKA", 13.0, 5.3], ["NEVADA", 4.4, 7.4], ["NEW HAMPSHIRE", 27.7, 3.7], // NV pulled south so Vegas is Nevada
	["NEW JERSEY", 26.2, 6.3], ["NEW MEXICO", 9.8, 10.4], ["NEW YORK", 25.6, 4.2],
	["NORTH CAROLINA", 23.6, 9.5], ["NORTH DAKOTA", 12.7, 1.1], ["OHIO", 21.8, 5.8],
	["OKLAHOMA", 14.2, 9.5], ["OREGON", 2.3, 2.9], ["PENNSYLVANIA", 24.4, 5.7],
	["RHODE ISLAND", 27.7, 5.2], ["SOUTH CAROLINA", 22.8, 10.7], ["SOUTH DAKOTA", 12.8, 3.3],
	["TENNESSEE", 20.0, 9.3], ["TEXAS", 13.3, 12.4], ["UTAH", 6.9, 6.9],
	["VERMONT", 27.0, 3.5], ["VIRGINIA", 23.9, 8.1], ["WASHINGTON", 2.4, 1.1],
	["WEST VIRGINIA", 23.0, 7.4], ["WISCONSIN", 18.1, 3.1], ["WYOMING", 9.0, 4.3],
];
const STATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv";

// ---- Interstates (template coords; converted to world meters below) ----------
const ROADS_T = [
	["I-95", [[28.0, 4.7], [26.4, 5.9], [25.7, 6.5], [24.9, 7.2], [24.6, 8.1], [23.6, 9.9], [22.9, 11.8], [22.4, 13.3], [23.2, 16.4]]],
	["I-90", [[1.4, 1.0], [4.5, 1.8], [8.5, 2.3], [12.8, 3.2], [16.4, 2.9], [19.4, 5.0], [22.4, 5.3], [25.6, 4.6], [28.0, 4.7]]],
	["I-80", [[1.3, 7.9], [2.7, 6.7], [6.8, 5.8], [10.4, 5.6], [15.0, 5.5], [19.4, 5.0], [23.0, 5.6], [26.4, 5.9]]],
	["I-70", [[6.7, 7.0], [10.4, 6.6], [13.8, 6.9], [15.8, 7.0], [18.0, 7.4], [21.7, 6.4], [25.0, 7.0]]],
	["I-40", [[4.1, 10.0], [6.9, 9.8], [9.5, 9.8], [12.0, 9.8], [14.2, 9.6], [16.9, 9.9], [18.1, 9.9], [19.8, 9.1], [23.0, 9.6], [25.4, 9.9]]],
	["I-10", [[3.5, 10.6], [6.7, 11.1], [9.6, 12.2], [13.7, 13.9], [15.3, 13.6], [18.1, 13.5], [20.3, 13.4], [22.4, 13.3]]],
	["I-5", [[1.4, 1.0], [1.2, 2.5], [1.8, 7.4], [2.9, 9.4], [3.5, 10.6], [4.0, 11.6]]],
	["I-35", [[17.0, 1.6], [16.4, 2.8], [15.8, 7.0], [14.2, 9.6], [14.6, 11.5], [13.7, 13.9], [13.2, 15.2]]],
	["I-25", [[9.5, 3.3], [10.4, 6.6], [9.5, 9.8], [9.6, 12.2]]],
	["I-75", [[21.0, 1.8], [21.8, 4.7], [20.9, 7.0], [21.2, 9.3], [21.0, 10.8], [22.0, 14.9], [23.2, 16.4]]],
];

// ---- Rivers (rasterized into the grid as water) -------------------------------
const RIVERS_T = [
	["MISSISSIPPI", [[17.4, 1.6], [17.8, 4.5], [18.0, 7.4], [18.1, 9.9], [17.9, 12.0], [18.1, 13.5], [18.2, 14.4]]],
	["MISSOURI", [[8.6, 2.2], [12.0, 5.0], [15.8, 7.0], [17.9, 7.3]]],
	["OHIO", [[21.8, 6.5], [20.5, 7.3], [18.3, 8.3]]],
	["COLORADO", [[6.9, 7.2], [5.5, 9.5], [4.6, 11.3], [4.2, 12.0]]],
	["COLUMBIA", [[0.8, 2.0], [2.5, 1.4], [4.5, 1.8]]],
	["RIO GRANDE", [[9.6, 12.2], [12.5, 14.5], [13.4, 15.6]]],
];

// ---- Towns / landmarks (template coords except authored world entries) --------
const TOWNS_T = [
	["seattle", "SEATTLE", 1.4, 1.0, "city", null],
	["portland", "PORTLAND", 1.2, 2.5, "city", null],
	["sanfrancisco", "SAN FRANCISCO", 1.3, 7.9, "city", null],
	["losangeles", "LOS ANGELES", 3.5, 10.6, "city", null],
	["sandiego", "SAN DIEGO", 4.0, 11.6, "city", null],
	["vegas", "LAS VEGAS", 5.0, 9.1, "city", "THE DEAD STRIP"],
	["phoenix", "PHOENIX", 6.7, 11.1, "city", null],
	["saltlake", "SALT LAKE", 6.8, 5.8, "city", null],
	["denver", "DENVER", 10.4, 6.6, "city", null],
	["albuquerque", "ALBUQUERQUE", 9.5, 9.8, "city", null],
	["elpaso", "EL PASO", 9.6, 12.2, "city", null],
	["billings", "BILLINGS", 8.5, 2.3, "ville", null],
	["cheyenne", "CHEYENNE", 10.4, 5.6, "ville", null],
	["minneapolis", "MINNEAPOLIS", 16.4, 2.8, "city", null],
	["omaha", "OMAHA", 15.0, 5.5, "city", null],
	["kansascity", "KANSAS CITY", 15.8, 7.0, "city", null],
	["oklahomacity", "OKLAHOMA CITY", 14.2, 9.6, "city", null],
	["dallas", "DALLAS", 14.6, 11.5, "city", null],
	["sanantonio", "SAN ANTONIO", 13.7, 13.9, "city", null],
	["houston", "HOUSTON", 15.3, 13.6, "city", null],
	["stlouis", "ST. LOUIS", 18.0, 7.4, "city", "THE RUSTED ARCH"],
	["memphis", "MEMPHIS", 18.1, 9.9, "city", null],
	["neworleans", "NEW ORLEANS", 18.1, 13.5, "city", null],
	["chicago", "CHICAGO", 19.4, 5.0, "city", null],
	["detroit", "DETROIT", 21.8, 4.7, "city", null],
	["cincinnati", "CINCINNATI", 20.9, 7.0, "ville", null],
	["nashville", "NASHVILLE", 19.8, 9.1, "city", null],
	["atlanta", "ATLANTA", 21.0, 10.8, "city", null],
	["jacksonville", "JACKSONVILLE", 22.4, 13.3, "city", null],
	["tampa", "TAMPA", 22.0, 14.9, "city", null],
	["miami", "MIAMI", 23.2, 16.4, "city", null],
	["richmond", "RICHMOND", 24.6, 8.1, "city", null],
	["washington", "WASHINGTON RUIN", 24.9, 7.2, "city", "THE DROWNED MONUMENTS"],
	["philadelphia", "PHILADELPHIA", 25.7, 6.5, "city", null],
	["newyork", "NEW YORK", 26.4, 5.9, "city", null],
	["boston", "BOSTON", 28.0, 4.7, "city", null],
];

// ---- Deterministic hash noise --------------------------------------------------
function hash01(x, z) {
	let h = (SEED ^ (x * 374761393) ^ (z * 668265263)) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const tw2world = (tc, tr) => [
	Math.round(WORLD_OFFSET[0] + tc * UPSCALE * CELL_M),
	Math.round(WORLD_OFFSET[1] + tr * UPSCALE * CELL_M),
];

// ---- 1) Upscale with noisy borders ---------------------------------------------
const grid = [];
for (let fz = 0; fz < H; fz++) {
	let row = "";
	for (let fx = 0; fx < W; fx++) {
		const jx = (hash01(fx, fz * 7 + 3) - 0.5) * 2.4;
		const jz = (hash01(fx * 13 + 5, fz) - 0.5) * 2.4;
		const tc0 = Math.min(TW - 1, Math.max(0, Math.floor(fx / UPSCALE)));
		const tr0 = Math.min(TH - 1, Math.max(0, Math.floor(fz / UPSCALE)));
		const tcj = Math.min(TW - 1, Math.max(0, Math.floor((fx + jx) / UPSCALE)));
		const trj = Math.min(TH - 1, Math.max(0, Math.floor((fz + jz) / UPSCALE)));
		let ch = TEMPLATE[trj][tcj];
		const base = TEMPLATE[tr0][tc0];
		if (base === "u") ch = "u";            // urban cores don't smear away
		else if (ch === "u") ch = base;        // ...and don't smear outward either
		row += ch;
	}
	grid.push(row.split(""));
}

// ---- 2) Rasterize rivers as water ----------------------------------------------
for (const [, pts] of RIVERS_T) {
	for (let i = 0; i + 1 < pts.length; i++) {
		const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
		const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * UPSCALE * 2);
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			const fx = Math.round((ax + (bx - ax) * t) * UPSCALE);
			const fz = Math.round((az + (bz - az) * t) * UPSCALE);
			const wob = Math.round((hash01(fx, fz) - 0.5) * 2);
			const cx = Math.min(W - 1, Math.max(0, fx + wob));
			if (fz >= 0 && fz < H && grid[fz][cx] !== ".") grid[fz][cx] = "w";
		}
	}
}

// ---- 3) Lake country: sprinkle small lakes where America has them ---------------
function sprinkleLakes(c0, c1, r0, r1, count, tag) {
	for (let i = 0; i < count; i++) {
		const fx = Math.floor(c0 * UPSCALE + hash01(i * 31 + 7, i + tag) * (c1 - c0) * UPSCALE);
		const fz = Math.floor(r0 * UPSCALE + hash01(i + tag, i * 17 + 3) * (r1 - r0) * UPSCALE);
		if (fz < 0 || fz >= H || fx < 0 || fx >= W) continue;
		if (grid[fz][fx] === "." || grid[fz][fx] === "u") continue;
		grid[fz][fx] = "w";
		if (fx + 1 < W && grid[fz][fx + 1] !== "." && grid[fz][fx + 1] !== "u" && hash01(fx, fz + tag) < 0.6)
			grid[fz][fx + 1] = "w";
	}
}
sprinkleLakes(14, 22, 1, 4, 26, 100);  // Minnesota / Wisconsin / Michigan lake country
sprinkleLakes(24, 28, 2, 5, 10, 200);  // Adirondacks / New England
sprinkleLakes(21, 23, 13, 16, 10, 300); // Florida

// ---- 4) Roads to world coords + roadside forest strips --------------------------
const roads = ROADS_T.map(([id, pts]) => ({
	id, kind: "interstate",
	pts: pts.map(([c, r]) => tw2world(c, r)),
}));
for (const [, pts] of ROADS_T) {
	for (let i = 0; i + 1 < pts.length; i++) {
		const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
		const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * UPSCALE);
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			const fx = Math.round((ax + (bx - ax) * t) * UPSCALE);
			const fz = Math.round((az + (bz - az) * t) * UPSCALE);
			for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = fx + dx, nz = fz + dz;
				if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
				const b = grid[nz][nx];
				// Small woods hug the highway through farm and plain country.
				if ((b === "p" || b === "a") && hash01(nx * 3 + 1, nz * 5 + 2) < 0.2) grid[nz][nx] = "F";
			}
		}
	}
}

// ---- 5) States: Voronoi over anchors (land cells only) ---------------------------
if (STATE_ANCHORS.length > STATE_CHARS.length) throw new Error("not enough state chars");
const state_legend = {};
STATE_ANCHORS.forEach(([name], i) => { state_legend[STATE_CHARS[i]] = name; });
const states_grid = [];
for (let fz = 0; fz < H; fz++) {
	let row = "";
	for (let fx = 0; fx < W; fx++) {
		if (grid[fz][fx] === ".") { row += "."; continue; }
		const tc = (fx + 0.5) / UPSCALE, tr = (fz + 0.5) / UPSCALE;
		let best = 0, bestD = Infinity;
		for (let i = 0; i < STATE_ANCHORS.length; i++) {
			const d = (STATE_ANCHORS[i][1] - tc) ** 2 + (STATE_ANCHORS[i][2] - tr) ** 2;
			if (d < bestD) { bestD = d; best = i; }
		}
		row += STATE_CHARS[best];
	}
	states_grid.push(row);
}

// ---- 6) Towns to world coords -----------------------------------------------------
const towns = TOWNS_T.map(([id, name, c, r, kind, landmark]) => {
	const [x, z] = tw2world(c, r);
	return { id, name, pos: [x, z], kind, ...(landmark ? { landmark } : {}) };
});
// The hand-built starter town keeps its authored world position.
towns.push({ id: "meridian", name: "MERIDIAN", pos: [110, -325], kind: "ville", authored: true });

const usmap = {
	version: 1,
	name: "DEATHLANDS USA",
	generated: "2026-07-05 by tools/mapforge/generate_usa.mjs",
	compression: 60,
	cell_m: CELL_M,
	world_offset: WORLD_OFFSET,
	w: W, h: H,
	legend: LEGEND,
	grid: grid.map((r) => r.join("")),
	state_legend,
	states_grid,
	roads,
	rivers: RIVERS_T.map(([id, pts]) => ({ id, pts: pts.map(([c, r]) => tw2world(c, r)) })),
	towns,
	authored_zones: [{ id: "meridian_i9", rect: [-60, -440, 280, 900] }],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(usmap));
const biomeCount = {};
for (const r of usmap.grid) for (const ch of r) biomeCount[ch] = (biomeCount[ch] || 0) + 1;
console.log(`usmap.json written: ${W}x${H} cells (${(W * CELL_M / 1000)}x${(H * CELL_M / 1000)} km), ${roads.length} interstates, ${towns.length} towns`);
console.log("biome cells:", Object.entries(biomeCount).map(([k, v]) => `${LEGEND[k]}:${v}`).join(" "));
