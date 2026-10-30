// HOW TO USE: the drawer each tab opens (the Godot FORGE hub's per-tool drawer, carried over).
const COMMON = `<h3>EVERY TAB</h3><ul>
<li>Every edit is a <b>data row</b> written straight to disk (field-preserving: what the forge does not know rides through untouched), checked, and with <b>LIVE</b> on pushed into the attached game at once (<code>forgePush</code>): only the chunks the rows reach are laid out again.</li>
<li><kbd>Ctrl Z</kbd> / <kbd>Ctrl Y</kbd> undo and redo <b>on this tab</b> (each tab keeps its own list). <kbd>Ctrl K</kbd> opens the palette: commands, towns, exits, sites, bases.</li>
<li>The chip on the right picks the game tab (AUTO follows the bridge). The dots: GAME, SHARD (:3280), HARNESS (a headless agent tab), FILES (the forge's files round-trip byte for byte).</li>
<li>Someone else changed a row you are editing since you opened it? The forge says so and asks before writing over it.</li>
<li>Every click is a COMMANDS row an agent can run: <code>node tools/dl.mjs forge</code>, <code>mapEdit</code>, <code>mapCheck</code>, <code>brushPaint</code>, <code>brush</code>, <code>forgePatch</code>, <code>forgePush</code>, <code>terrain</code>.</li></ul>`;
export const HELP = {
  map: `<p>The national map: <code>web/src/data/usmap.json</code>, the rows the engine streams (I-10 and its exits, the towns, their streets and building slots), plus the whole country's interstates, county and dirt roads, rivers and the travel network.</p>
<h3>MOVE AROUND</h3><ul><li>Wheel zooms about the cursor, from the country to a town's street. Drag pans (shift-drag or right-drag when a tool holds the mouse). <kbd>0</kbd> the whole country, <kbd>G</kbd> the player, <kbd>F</kbd> the selection.</li>
<li>Layers: toggle states, rivers, roads, streets, rails, towns, exits, building slots, the atlas's sites, the fifty bases, the brush, the checks, and the game (the P1 box, the dust wall, the island, where you are).</li></ul>
<h3>EDIT</h3><ol>
<li><b>SELECT</b> <kbd>V</kbd>: click a row; its handles appear. Drag a vertex, a town, an exit (and its destination square) to move it.</li>
<li><b>INSERT</b> <kbd>I</kbd> on a line; <b>DELETE</b> <kbd>X</kbd> on a vertex (or <kbd>Del</kbd> with one selected).</li>
<li><b>ADD EXIT</b> <kbd>E</kbd>: click beside an interstate on the side the community stands. On I-10 the engine builds its ramps, bridge, access road and community the moment it is pushed.</li>
<li><b>CITY</b> <kbd>T</kbd> / <b>HOLDOUT</b> <kbd>H</kbd>: click where it stands. Its streets are <code>ST-&lt;id&gt;-…</code>, its slots <code>&lt;id&gt;-…</code>.</li>
<li><b>RAIL</b> <kbd>R</kbd> / <b>ROAD</b> <kbd>D</kbd>: click points, double-click or <kbd>Enter</kbd> to finish.</li>
<li><b>EDIT FIELDS</b> in the inspector writes only the fields you change. Fields in green-yellow are ones the forge does not know: shown, kept, never dropped.</li>
<li><b>OPEN IN GAME</b> teleports the attached game's player there (inside the streamed corridor).</li></ol>
<h3>CHECKS</h3><ul><li><b>DEAD ENDS</b>: a road that stops short of any road, town, exit or the coast. <b>ORPHANS</b>: a street or slot no town claims, an exit off its highway (the engine's 400 m rule), a town nothing reaches. <b>CROSSINGS</b>: a road over a river or open water with no bridge row (the rivers-and-bridges layer builds them). <b>ENGINE</b>: WorldIndex's own warnings over these rows.</li></ul>
<div class="note">A re-import (<code>node tools/import-usmap.mjs</code>) keeps every row the forge edited (meta.forge.edits): authored rows win.</div>${COMMON}`,
  brush: `<p>Paint density over the land. Each stroke is one row in <code>web/src/data/brush.json</code>; the chunk generator reads it (<code>world/brush.js</code>), so painted woods are in the world the moment you let go.</p>
<h3>PAINT</h3><ol><li>Pick a layer: <b>FOREST</b> <kbd>1</kbd> (stems: pine, oak, cypress by state, young trees and undergrowth under them), <b>CANOPY</b> <kbd>2</kbd> (crown size, the tall share), <b>BRUSH</b> <kbd>3</kbd> (undergrowth), <b>RUIN</b> <kbd>4</kbd> (the corridor buildings' ruined share), <b>RAD</b> <kbd>5</kbd> (sick ground, dead trees, glowing seeps, leaking drums).</li>
<li><b>PAINT</b> <kbd>P</kbd> adds, <b>ERASE</b> <kbd>E</kbd> takes away, <b>SET</b> <kbd>S</kbd> sets. Radius in world metres (<kbd>[</kbd> <kbd>]</kbd>), strength, soft edge.</li>
<li>Drag across the land. The heat is the engine's own field; the dashed lines are the strokes.</li></ol>
<h3>SEE IT</h3><ul><li><b>PROBE</b> <kbd>C</kbd> (and every stroke): the chunk there laid out by the game's own generator, unpainted and painted, tree counts beside them, and <b>IN GAME</b>: the game's camera over it.</li>
<li><b>KNOBS</b>: stems per hectare, crown spread per species, tints, the hot zone's seeps and drums. A change lays every painted chunk out again.</li></ul>
<div class="note">A chunk no stroke reaches is built exactly as before (its own random stream is untouched), and a painted chunk is still a pure function of the rows: the strokes that reach it are in its hash.</div>${COMMON}`,
  terrain: `<p>The real land under the streamed world: public elevation and landcover, strip-mapped onto our compressed I-10 and held to THE GRADE (10%), baked into <code>src/data/terrain/i10.bin</code>.</p>
<h3>READ IT</h3><ul><li>The map is the baked land: biome colour, height lightens it, a hillshade from the north-west. Our I-10 runs over it coloured by grade (amber under 5%, yellow under 8%, rust above). Hover for the height (about Phoenix and real) and the landcover.</li>
<li>The profile: the real I-10 (bone) against ours (amber) and our land under it, Los Angeles to El Paso; the pinned pads where the road is held flat.</li></ul>
<h3>USE IT</h3><ul><li><b>REAL TERRAIN</b> switches the attached game onto the land or back to the flat, live (<code>terrain on=true|false</code>): every chunk laid out again; the island never moves.</li>
<li>Click the land: the game's camera over that spot.</li>
<li>Knobs are rows in <code>src/data/terrain.js</code>: bake knobs need <code>node tools/terrain-bake.mjs</code>, engine knobs a reload.</li></ul>${COMMON}`,
  building: `<p>The Building Lab, mounted: floor plans from the real <code>floorplan()</code>, edited by hand, proved by the ring's own NavProbe, exported as rows.</p><ul><li>Stand an export in the running game: <code>author row=&lt;json&gt; x= z=</code> (or <code>lot=</code>, <code>sample=office2</code>).</li><li>OWN WINDOW opens it alone; its own URL states (kind, seed, storey, floor, roof) still work there.</li></ul>${COMMON}`,
  observe: `<p>The observer, mounted: the live map of everyone, the wire, a card for whoever you click, perf, factions, census, the control log, record and replay with heatmaps.</p><ul><li>It watches the game tab the forge is attached to (the chip). Run it in its own window beside the game for the smoothest feed.</li><li>Every button and right-click in it is one COMMANDS row.</li></ul>${COMMON}`,
  crops: `<p>Every crop as a row with its numbers and a month strip (dark: off season, green: sow, bright: best, blue underline: frost risk), the garden rules and the cooking recipes. The validators run live on the rows the game uses (<code>validateFarming</code>, <code>validateCooking</code>). Rows live in <code>web/src/data/farming.js</code> and <code>data/cooking.js</code>; a row writer is the follow-up. Drive it from the shell with <code>garden</code> and <code>meal</code>.</p>${COMMON}`,
  stub: `<p>This tab is planned: the system it edits is being built by another agent. The card says what it will edit, what the game holds today, and how to drive it from the shell now.</p>${COMMON}`,
};
