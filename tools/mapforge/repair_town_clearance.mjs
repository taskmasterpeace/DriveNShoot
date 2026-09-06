#!/usr/bin/env node
// Bounded opt-in repair, separate from the world bake (never a global regen).
// Review: node tools/mapforge/repair_town_clearance.mjs --town peach-combine-depot
// Apply:  node tools/mapforge/repair_town_clearance.mjs --town peach-combine-depot --apply
// USMAP_PATH may select a fixture/copy. Dry run is the default and changes no bytes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { repairGeneratedTownPlacements } from "./road_clearance.mjs";

const args = process.argv.slice(2);
const townIndex = args.indexOf("--town");
const town = townIndex >= 0 ? args[townIndex + 1] : null;
const rest = args.filter((_, i) => i !== townIndex && i !== townIndex + 1);
if (!town || town.startsWith("--") || rest.some((arg) => arg !== "--apply" && arg !== "--dry")
	|| (rest.includes("--apply") && rest.includes("--dry"))) {
	console.error("Usage: node tools/mapforge/repair_town_clearance.mjs --town <town-id> [--apply]");
	process.exitCode = 1;
} else {
	try {
		const path = process.env.USMAP_PATH || fileURLToPath(new URL("../../game/data/usmap.json", import.meta.url));
		const original = readFileSync(path, "utf8");
		const map = JSON.parse(original);
		const doc = JSON.parse(readFileSync(new URL("../../game/data/world/structure_profiles.json", import.meta.url), "utf8"));
		const profiles = Object.fromEntries(doc.structures.map((p) => [p.id, p]));
		const result = repairGeneratedTownPlacements(map, town, profiles);
		const applied = rest.includes("--apply");
		if (applied && result.moves.length) {
			// Refuse to overwrite an intervening editor/agent save.
			if (readFileSync(path, "utf8") !== original) throw new Error("Map changed during repair; rerun the dry run");
			writeFileSync(path, JSON.stringify(map));
		}
		console.log(JSON.stringify({ ...result, applied }, null, 2));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
