# LSW faceted bodies: provenance

What ships here: `kit.bin` / `kit.json` (every module of LSW's modular-hero kit, merged and packed by
`tools/lsw-faceted-ingest.mjs`) and `faces/*.png` (the six faces LSW baked into its FACETNPC1 civilians).

- **Source repo:** Living Superweapon (Machine King Studios), checkout `C:/lswwt/gunkit1`, branch `alpine/facetnpc1-kc21df3d3`
  (2026-10-23, the newest LSW branch carrying `body.faceted*` packages; every other LSW worktree and branch was searched).
- **Kit:** `public/models/modular-hero/modular-hero.glb`, sha256 `8c24bc5145cf9801d1ac8de879f7d5764bffbce93d0043513eb13286c6a5e840`.
  46 modules, 53-bone `ual-deform-v1` skeleton, 8812 vertices, 4126 triangles.
- **Licence:** **Proprietary-Internal** studio geometry (modular-hero.glb is studio-authored by Machine King Studios; LSW's
  `assets-src/faceted-civilians/PROVENANCE.md` states runtime embed only). Same owner as this game; embedded at runtime
  here, never redistributed as a source asset.
- **Skeleton:** the ual-deform-v1 skeleton from the Universal Animation Library (Quaternius, **CC0-1.0**). No animation clip
  is shipped: DSOA poses the bones from its own joint solver.
- **Faces:** drawn by LSW's own face-kit code (no generated image, no paid service), extracted from the GLBs below.
- **Not shipped:** the round Quaternius Superhero bodies (models/lsw/, removed), LSW's motion banks (fab-close-combat is
  Proprietary-Internal and must never ship; UAL CC0 and CMU mocap are not needed).

| face | from (LSW repo) | GLB sha256 | PNG sha256 |
|---|---|---|---|
| worker | `public/authored-assets/body.faceted-civilian-worker/v1/model.glb` | `3eb553a5e19e2c02183be72286c8e613c6402f7c71c1ea5b3a1cde3576957cb9` | `0229c17898948407bb3d7c114d193b65855e689f0691362307e4e2b8a8c03d87` |
| cop-off-duty | `public/authored-assets/body.faceted-civilian-cop-off-duty/v1/model.glb` | `050d5cee182f56e45cd4db3ed255c2a4df3af0553541c75f57cb45aa1ec9ab9e` | `49fba1fef57d70c829abb33bf8827cb45a1ee9600ccfeec1e0c4233d0901feb8` |
| nurse | `public/authored-assets/body.faceted-civilian-nurse/v1/model.glb` | `a849580e0ed5cf2115a907cd5b41dbc7dc0ce53feebbc88998c7ae06e064d5f5` | `3b63b358ae11fac269e5a38c3728b9d7a7c39bb0b68d256390819497f8929515` |
| kid | `public/authored-assets/body.faceted-civilian-kid/v1/model.glb` | `b6082e9fe812754865dda5d89766949886c29f29b2b89b30272dc0889f390eae` | `49fba1fef57d70c829abb33bf8827cb45a1ee9600ccfeec1e0c4233d0901feb8` |
| elder | `public/authored-assets/body.faceted-civilian-elder/v1/model.glb` | `438e848b108b37d176260cf664f7d1d9ca33bf53399f15c468afbfc6339176fe` | `f69ee28054e36fbb96f962fe23c12eda7fe2071c7f0914201c222a0e425695f9` |
| gang-member | `public/authored-assets/body.faceted-civilian-gang-member/v1/model.glb` | `c24ad72ad0478aa7b6d3d6f872338f9abb412e492b6346f0dfd5c55784335ac8` | `0229c17898948407bb3d7c114d193b65855e689f0691362307e4e2b8a8c03d87` |
