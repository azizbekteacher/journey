Run your max-detail escalation pass now. Delegate to all five asset subagents in parallel — each owns one asset and only edits its own region:

- asset-hero → src/player.js (buildKnight, buildHorse)
- asset-trees → src/world.js (buildWoods, buildHighlands flora)
- asset-enemies → src/enemies.js (buildModel + helpers)
- asset-houses → src/world.js (buildVillage, buildProps, house, lantern)
- asset-terrain → src/world.js (buildTerrain, buildSky, groundMat, buildAmbient, buildRoadDeco)

Escalation rule: this is NOT a first pass — the game is already at high-detail (hero ~240 meshes, 8 creatures 45-62 meshes each, textured houses, 512-seg terrain, 3D-dressed roads). Each agent must push density ~one notch further than the current model state (roughly +40-80% mesh count via new layered sub-parts), never stop because the existing spec was already met, and never break a documented contract (parts/legs/tail/wings/antlers/sword/shield/cape, anims.* fields, heightAt/h0 byte-identical).

After all five return, verify with: node --check src/player.js src/enemies.js src/world.js, then npm run build, then a headless screenshot smoke test. Report per-asset mesh-count deltas and any contract risk.