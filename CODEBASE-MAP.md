# CODEBASE-MAP — Journey: The CMO's Quest
> Read this first. What / where / how for every key function. Lines pinned 2026-09-06; re-pin with `rg -n "^(export )?(async )?function|class " src/*.js`.
> Stack: Vite 6 + Three.js 0.169 ESM, no framework. Entry `index.html` → `src/main.js`. Prod `worker.js` serves `dist/` only.

## 0. How to use this map
- Read order: `state.js` → `data/curriculum.js` → `world.js` → `player.js` → `enemies.js` → `combat.js` → `main.js` → `obsidian.js` → `ai.js` → `todo.js` → `plan.js` → `vite.config.js`.
- Conventions: `$ = id => document.getElementById(id)`; `S` singleton is truth; `toast` via `window CustomEvent("toast")`; `fx` injected for particles; Three.js only in `world/player/enemies/fx/main`.
- Caps: body 2M, section 200k, file 500k (`vite.config.js` vaultMiddleware). Prod Worker has no `/api/*` — vault+AI are local-dev only (`localhost:3000`).
- `package.json:6-9`: `dev=vite`, `build=vite build`. Deps `three^0.169`; dev `vite^6.3.5/wrangler/playwright`.

## 1. File inventory (what lives where)
| File | Lines | Owns | Must not own |
|---|---|---|---|
| `index.html` | 213 | DOM shell, all overlay IDs, fallback-begin + error toasts | Game logic |
| `src/main.js` | 615 | Renderer/scene/loop/HUD/minimap/coins/death wiring | Terrain gen, quiz copy, vault transport |
| `src/state.js` | 59 | `S`, save/load/reset, `MAX_HEARTS` | Everything else |
| `src/data/curriculum.js` | ~280 | All quiz/lesson text, BATTLES/BOSS IDs | Logic |
| `src/world.js` | 1616 | Terrain/zones/props/coins/destructibles/ambient | Player/enemy logic |
| `src/player.js` | 981 | Knight+horse+camera+combo anim | Damage resolution, vault |
| `src/enemies.js` | 1408 | Models+AI FSM+HP+defeat cinematics | Quiz UI, persistence shape |
| `src/combat.js` | 206 | Quiz modal+timer+win/lose flow | Enemy removal, XP math |
| `src/fx.js` | 147 | Pooled particles/rings/text | Game rules |
| `src/audio.js` | 170 | WebAudio synth SFX+ambient | Playback triggers |
| `src/obsidian.js` | 198 | Vault upsert+queue+pill | Prompt building, task parsing |
| `src/ai.js` | 468 | Coach overlay, vault→prompt→SSE→Extra details | Server proxy itself |
| `src/todo.js` | 925 | Tasks.md parse/serialize/sync/render | Quiz validation |
| `src/plan.js` | 85 | Plan view over `S.notes` | Vault transport (delegates) |
| `vite.config.js` | 266 | Dev `/api/vault/*` + `/api/ai/*` | Prod serving |
| `worker.js` | 13 | Prod static `ASSETS.fetch` | Any `/api/*` |
| `src/style.css` | ~1000 | Styling only | Logic |

## 2. Dependency graph (who imports whom)
- `main.js:1-15` imports: `three` + postprocessing + `world{buildWorld,updateWorld,heightAt,zoneAt,getCoins,SIZE}` + `fx{FX}` + `player{Player}` + `enemies{EnemyManager}` + `combat{Combat}` + `obsidian{initVaultSync,saveTip}` + `plan{showPlan,savePlanToVault}` + `todo{todo}` + `ai{initAI}` + `curriculum{FACTS,BATTLES,BOSS,COIN_LESSONS,ZONES}` + `state{S,saveGame,loadGame,progressCount,MAX_HEARTS}` + `audio{audio}`.
- `player.js:1-4` imports `three`, `world{heightAt,hitAssetAt}`, `audio`, `state{S}` (only `horseUnlocked`).
- `world.js:1` imports `three` only. Self-contained; `fx` injected as arg to `updateWorld`.
- `enemies.js:1-5` imports `three`, `world{heightAt,zoneAt,BATTLE_SPOTS}`, `curriculum{BATTLES,BOSS,ZONES}`, `state{S,saveGame}`, `audio`. Receives `scene,fx` via constructor.
- `combat.js:1-4` imports `curriculum{BATTLES,BOSS,NUDGES,TIMEOUT_NUDGES,PRAISES,MODULE_NAMES,ZONES}`, `state{S,saveGame,progressCount,MAX_HEARTS}`, `audio`, `obsidian{saveAnswer}`. DOM-only.
- `fx.js:1` imports `three` only. `audio.js` imports nothing (browser AudioContext).
- `obsidian.js:10` imports `curriculum{BATTLES,BOSS,MODULE_NAMES}`. `ai.js:17-19` imports `curriculum{FACTS,BATTLES,BOSS,MODULE_NAMES}`. `todo.js` imports nothing. `plan.js:1-4` imports `curriculum{BATTLES,BOSS}`, `state{S,saveGame}`, `audio`, `obsidian{savePlan}`.
- Rule: `world/fx/audio/curriculum` are leaves; `player/enemies/combat/obsidian/ai/todo/plan` are mid; `main` is root; `vite.config` is server sidecar.

## 3. Boot & master loop
- `index.html:173-192` fallback-begin: `btn-begin` click → hide `#title`, show `#hud`, dispatch `fallback-begin`. Survives module throw; also closes on backdrop click.
- `index.html:192-210` error hooks: `error/unhandledrejection` → red `.toast` in `#toasts`.
- `src/main.js:253-283` boot: `loadGame()` → `buildWorld(scene)` → `new FX/Player/EnemyManager/Combat` with callbacks → `initVaultSync()/initAI()/initTodo()` → `prerenderMinimap()` → `animate()`. Sets `window.__game`.
- `src/main.js:189-228` `initTodo()`: WHAT wire ledger/deed/battle-tab + `Escape`. HOW binds `#todo-toggle/#deed-create/#deed-open/#deed-dismiss`, combat `onShowTodo/onHideTodo`.
- `src/main.js:228-240` `showDeedPopup(item)`: WHAT ruin/stump → author-deed modal. HOW fills `#deed-icon/title/text`; `deed-create` → `todo.addQuickDeed`.
- `src/main.js:542-615` `animate()`: WHAT frame driver. HOW `requestAnimationFrame`; `hitStopT` slow-mo (`dt*0.06`); order `player.update → enemyMgr.update → regenTick → updateWorld → fx.update`; then coin magnet/pickup, fountain heal (`<5.5` units), zone hints, `drawMinimap`, composer render. Skips enemy logic when `combat.open` or ledger visible.
- `src/main.js:616-642` coin/hint tail of `animate`: magnet coins `<4`, pickup `<1.6` → `S.coinsTaken/gold/saveGame/updateHUD/showCard/saveTip`.
- `src/main.js:643-658` `NAMES_LABEL(e)`: WHAT display name. HOW `battleId` → `BATTLES.title` else type fallback.

## 4. State — `src/state.js` (no imports)
| Function | Where | What | How / callers |
|---|---|---|---|
| `SAVE_KEY` | `state.js:1` | `"journey_cmo_save_v1"` storage key | Used by save/load/reset |
| `MAX_HEARTS` | `state.js:3` | `5` HP tuning | HUD, combat hearts, regen cap |
| `S` | `state.js:5-15` | `{defeated,coinsTaken,notes,gold,hearts,horseUnlocked,bossDone,soundOn}` mutable singleton | Mutated directly, then `saveGame()` |
| `saveGame()` | `state.js:16-29` | Serialize `S` → localStorage | After victory/coin/heart/horse/plan |
| `loadGame()` | `state.js:31-50` | Hydrate `S` with defaults → bool found | Boot only |
| `resetGame()` | `state.js:52-62` | Clear storage + reset `S` | Debug/console only |
| `progressCount()` | `state.js:63-65` | Count truthy `S.defeated` | HUD, horse@7, win@20 |

## 5. Curriculum — `src/data/curriculum.js` (pure data, no imports)
- `curriculum.js:1-7` `ZONES`: `woods/customer-woods`, `plains/offer-plains`, `highlands/channel-highlands`, `village/founder-hollow`.
- `curriculum.js:8-14` `MODULE_NAMES`: `A=Customer, B=Offer, C=Machine, D=Strategy`.
- `curriculum.js:15-23` `FACTS[6]`: course/price/budget/team/assets/students lore; consumed by `ai.buildSystemPrompt`.
- Module A woods `b01-b07` (`curriculum.js:24-88`): keys `persona/motivation/levels/pains/competitors/decision/proof`; enemies `rat,rat,fox,fox,boar,boar,wolf`; zones all `woods`.
- Module B plains `b08-b12` (`curriculum.js:90-120`): keys `product/promise/usp/bonus/pricing`; enemies `wolf,wolf,bear,bear,bear`; zone `plains`.
- Module C highlands `b13-b16` (`curriculum.js:122-152`): keys `channels/telegram/website/capacity`; enemies all `owl`; zone `highlands`.
- Module D highlands `b17-b20` (`curriculum.js:154-185`): keys `goal/bet/test/metric`; enemies all `elder`; zone `highlands`.
- `BOSS` (`curriculum.js:187-223`): `enemy:bull` at `0,4`; `challenges boss1-5` titles Promise/`$200`/Path/Math/Final Vow, each `minLen 15-25`; 180s timer.
- `PRAISES@225/NUDGES@232/TIMEOUT_NUDGES@239`: 4/4/2 feedback strings rotated in `Combat`.
- `COIN_LESSONS@244+` ~32 `{zone,title,tip}`: woods 12 (persona/segmentation), plains 11 (offer/pricing), highlands 9 (channels/funnel); shown by `main.showCard`, saved by `saveTip`.

## 6. main.js tables (imports §2, no exports)
| Function | Where | What | How |
|---|---|---|---|
| `onPlayerHit(e)` | `main.js:82` | Enemy damages player | Checks block/roll; `flashVignette/player.playHurt/audio.hit/hearts--/saveGame`; death → `onRespawn` |
| `onPerfectBlock` | `main.js:113` | Perfect-parry reward | Slow-mo `hitStopT` + `fx.text("PERFECT")+audio.parry` |
| `onPlayerDodge` | `main.js:117` | Dodge tick passthrough | Hook for future stamina FX |
| `onKnockdown(e)` | `main.js:122` | Enemy down → `[E]` hint | Sets `enemyMgr.near`; `setHint("Press E")` |
| `onAssetHit(item)` | `main.js:~143` | Sword hit tree/house | `hitDestroyable` → if fell `showDeedPopup` + `fx.burst` |
| `onDefeatDamage` | `main.js:158` | Timeout fail → lose heart | ← `Combat.timeout`; vignette + save |
| `onRespawn` | `main.js:164` | Death → Keep respawn | Reset hearts/pos, `saveGame`, toast |
| `onShowTodo/onHideTodo` | `main.js:175-178` | Pause world for ledger | Toggle `uiOpen` flag consumed by `animate/enemyMgr` |
| `progressOf` | `main.js:284` | Count BATTLES defeated | Wraps `progressCount`; win check `===20` |
| `updateHUD` | `main.js:288` | Hearts/gold/`📜 n/20` + low-HP vignette | Every frame + after economy change |
| `toast` | `main.js:295` | Transient `#toasts` msg | Also `window.addEventListener("toast")` for worker threads |
| `showCard` | `main.js:303` | Coin lesson `#coin-card` 6s | `(title,tip,ms=6000)`; queue-safe |
| `setHint` | `main.js:314` | Contextual `#hud-hint` | `null` hides; used for E/H prompts |
| `onVictory` | `main.js:322` | Rewards+cinematics+unlocks | ← `Combat`; `gold+=`, `executeKill`, horse@7 (`S.horseUnlocked`), bull/plan@20 |
| `isTyping` | `main.js:370` | Input-focus guard | `activeElement` is `TEXTAREA/INPUT`; gates KeyE/H |
| `tryChallenge` | `main.js:389` | `KeyE` → `combat.show` | Guards `enemyMgr.near+battle`; boss branch if `bossDone==false && p==20` |
| `regenTick` | `main.js:414` | +1 heart/4s when safe | Skips if `lostHeart/engaging/hearts>=MAX/uiOpen` |
| `playExecution` | `main.js:428` | Slow-mo lunge + kill | `player.playExecute` → `enemyMgr.executeKill` |
| `flashVignette/flashWhite` | `main.js:446/454` | Damage/kill flashes | Opacity pulse on `#vignette/#whiteflash` |
| `prerenderMinimap` | `main.js:472` | 96px zone+height base | Offscreen once; path lines + Keep dot |
| `drawMinimap` | `main.js:496` | Overlay enemies/player arrow | Per frame on `#minimap`; culls `gone` |

## 7. player.js — `class Player@609` (factories `lam@6/std@9/box@12/sph@17`)
| Function | Where | What | How |
|---|---|---|---|
| `isTyping` | `player.js:23` | Typing guard | Same activeElement check as main |
| `uiBlocking` | `player.js:28` | Modal-open guard | Checks `#battle/#plan/#win/#title/#todo/#deed/#ai` visibility |
| `buildHorse` | `player.js:39` | Horse+tack+saddle+4 legs | Sub-meshes named for gallop anim |
| `buildKnight` | `player.js:313` | Armor/sword/shield/cape/limbs | Joints `armR/sword/cape` posed by `applySwingPose` |
| `buildArcTrail` | `player.js:596` | Additive swing arc | Opacity driven by `attackT` |
| `constructor` | `player.js:610` | `group/knight/horse/yaw/camYaw/camPitch/mounted/stamina/combo/roll/exec` + callbacks | `onSwingHit/onAssetHit/onSlashFx` wired by main |
| `toggleHorse` | `player.js:692` | Mount/dismount | Gates `S.horseUnlocked` else toast; `audio.gallop`; speed ×1.8 |
| `tryRoll` | `player.js:703` | Dodge roll + i-frames | Costs stamina; `rollT` window checked by `resolveChargeImpact` |
| `tryAttack` | `player.js:732` | Combo starter/queue | `LMB/Space`; blocked when `uiBlocking/rolling/executing` |
| `startSwing` | `player.js:743` | Begin swing timing | Sets `attackT/comboIdx`; schedules hit at mid-swing |
| `applySwingPose(t)` | `player.js:750` | Arm/torso pose per phase | Consumed in `update` while attacking |
| `doHitCheck` | `player.js:768` | Frontal enemy else asset | Nearest enemy in reach+yaw → `onSwingHit`, else `hitAssetAt` → `onAssetHit` |
| `faceTowards` | `player.js:789` | Yaw toward target | Used on lock-on + execution lunge |
| `applyKnockback` | `player.js:795` | Impulse + decay | `(dirX,dirZ,strength=6)`; damped in `update` |
| `playExecute/playVictory/playHurt` | `player.js:799/806/807` | Set `execT/victoryT/hurtT` | Anim state machines in `update` |
| `update(dt)` | `player.js:809` | Move/sprint/stamina/roll/kb/`heightAt` clamp/block/anim/camera | WASD camera-relative; Shift sprint drains; RMB block; FOV kick on sprint; cam terrain-collide |

## 8. world.js — terrain + content (exports `SIZE@3/BATTLE_SPOTS@29/SPECIALS@35/heightAt@92/zoneAt@114/getCoins@128/getDestroyables@132/hitAssetAt@49/hitDestroyable@172/buildWorld@328`)
| Function | Where | What | How |
|---|---|---|---|
| `h0` | `world.js:37` | Base sine terrain | `sin/cos` octaves; flattened by FLATS |
| `buildPaths` | `world.js:68` | 3 cubic path splines | Sampled in `heightAt`; drawn by road deco |
| `registerDestroyable` | `world.js:134` | Register house/tree hitbox | `{kind,label,icon,hp,rx,rz}`; pushes `DESTRUCTIBLES` |
| `makeRuins` | `world.js:148` | Hidden rubble/stump | Revealed on fell; tree→stump, house→rubble |
| `windify` | `world.js:196` | Wind shader inject | `onBeforeCompile` vertex sway; `windMats[]` |
| `groundMat` | `world.js:209` | 256px village/grass canvas mat | Noise speckle loop `y<256` |
| `waterMat` | `world.js:246` | Pond/stream translucent | Animated UV offset in `updateWorld` |
| `tex/boxTex/coneTex` | `world.js:251/264/269` | Cached canvas textures | `texCache[name]`; reps for roofs/bark |
| `buildTerrain` | `world.js:349` | 512² vertex-colored ground | Colors by height/zone; path blend strip |
| `buildSky` | `world.js:426` | Gradient sky+sun+16 clouds | Clouds drift in `updateWorld` |
| `mat/box/cyl/banner` | `world.js:505/509/515/521` | Shared factories | `banner` returns waving cloth ref |
| `house` | `world.js:530` | Plaster/timber/shingle house | Loops windows/beams `cx/vx/sx`; registers destroyable |
| `lantern` | `world.js:649` | Stone lantern + point glow | Flicker in `updateWorld` |
| `buildVillage` | `world.js:671` | Keep/fountain/houses/stable/tents | Fountain heals; stable hints horse |
| `instanced` | `world.js:948` | InstancedMesh scatter helper | `(geo,material,positions,opts)` |
| `scatter` | `world.js:971` | Zone scatter sampler | `guard count*40`; rejects near paths/FLATS |
| `heroTree` | `world.js:990` | Named landmark tree | Larger scale + label sprite |
| `buildWoods` | `world.js:1019` | Instanced oaks+blossoms+fireflies | Trunks loop, blossom loop, 70 grass tufts |
| `buildPlains` | `world.js:1128` | Wheat/windmill/lavender/fences | Blades rotate; wheat uses `windify` |
| `buildHighlands` | `world.js:1187` | Pines/stream/summit/shrines | Stream water anim; summit flag |
| `buildPathsDeco` | `world.js:1305` | Edge stones/ruts/pebbles | Follows `buildPaths` spline |
| `buildRoadDeco` | `world.js:1313` | Cart ruts + signposts | Zone-labeled signs |
| `buildProps` | `world.js:1347` | Rocks/bushes/crates/barrels | Some registered destroyable |
| `buildSiteMarkers` | `world.js:1503` | Battle rings + boss gate | Rings pulse; gate opens at 20/20 |
| `buildCoins` | `world.js:1531` | Coin group + lesson bind | `coin.userData={zone,title,tip}` from COIN_LESSONS |
| `buildAmbient` | `world.js:1560` | Birds/butterflies/petals/clouds | `anims[]` stepped in `updateWorld` |
| `updateWorld(t,dt,fx)` | `world.js:~1590` | Animate all ambient | Wind/lantern/banner/water/cloud/bird/smoke/fountain; `fx.emit` for petals |

## 9. enemies.js — `class EnemyManager@806` (factories `lam@7/std@10/box@13/sph@18/hideTex@41/hsph@73/addLegs@31/addClaws@79/addHooves@88/addRings@96/cyl2@742/cn@748/shine@754`)
| Function | Where | What | How |
|---|---|---|---|
| `buildModel(type)` | `enemies.js:105` | ~630L procedural models | `rat(109)/fox/boar/wolf/bear/owl/elder/bull`; `userData.legs/tail/wings/antlers` |
| `makeTelegraph` | `enemies.js:761` | Red charge lane + head disc | Shown in `stateWindup`, hidden after |
| `makeHealthBar` | `enemies.js:786` | `bg+fg` HP sprites | `HP/BAR_Y/BAR_W/SITE_OFFS/ICONS/NAMES` tables |
| `constructor` | `enemies.js:807` | Store `scene,fx` + callbacks | `onPlayerHit/onPerfectBlock/onKnockdown` from main |
| `spawnAll` | `enemies.js:822` | Group BATTLES by zone + offset spots | `woods/plains/highlands` around `BATTLE_SPOTS`; boss `0,4`; skip `S.defeated` |
| `spawn` | `enemies.js:838` | One enemy group+bar+telegraph | `(type,x,z,battle,idx)`; `gone` if defeated |
| `engaged` | `enemies.js:893` | Player within aggro | Distance + `!gone`; gates AI vs wander |
| `hideTelegraph` | `enemies.js:902` | Hide lane/disc | After charge/dive resolve |
| `update` | `enemies.js:~910` | Master AI dispatcher | `updateCommon` + boss/normal branch; frozen if `uiOpen`; strafe/alert/wander, coward(rat/fox) flee, bear enrage, owl dive |
| `updateCommon` | `enemies.js:1061` | Knockback decay + leg swing + face player | Every tick for alive enemies |
| `updateBar` | `enemies.js:1086` | HP color/scale | Green→red; hide when full |
| `bossAI` | `enemies.js:1096` | Bull chase + slam pattern | Faster windup; multi-heart damage |
| `stateWindup` | `enemies.js:1113` | Telegraph + crouch | Timer → `stateCharge`; plays `growl` |
| `stateCharge` | `enemies.js:1203` | Dash forward | → `resolveChargeImpact` on contact/range end |
| `resolveChargeImpact` | `enemies.js:1224` | Block/parry/dodge vs hit | `blockT<0.3`→perfect; `rollT`→miss; else `onPlayerHit`+knockback |
| `stateFlee` | `enemies.js:1141` | Coward retreat | rat/fox when player close + low HP |
| `stateDive/stateStagger` | `enemies.js:1158/1262` | Owl arc flight / stun wobble | Dive → `resolveDiveImpact@1183` (same block logic) |
| `hitByPlayer` | `enemies.js:1271` | HP-- + feedback | Flash/flinch/knockback/`audio.clang`; `0`→`down`+`onKnockdown` |
| `executeKill` | `enemies.js:1328` | Host-triggered kill | ← `main.playExecution`; → `startDefeat` |
| `breathe` | `enemies.js:1338` | Idle scale pulse | `sin(t)` on chest |
| `startDefeat/updateDefeat` | `enemies.js:1344/1355` | Death cinematic stepper | rat spin-shrink, fox poof+`smoke`, boar/bear/bull slam+`dust`, owl/elder ascend+`petal` |

### Enemy type catalog (all built in `buildModel@105`)
- `rat` woods b01-b02: coward, flees, 1 HP, fast strafe; spin-shrink death.
- `fox` woods b03-b04: coward+, lunges; poof death.
- `boar` woods b05-b06: charger, telegraph lane; slam death.
- `wolf` woods/plains b07-b09: balanced chaser, windup→charge.
- `bear` plains b10-b12: tank, enrage `<50%`, heavy knockback.
- `owl` highlands b13-b16: flyer, `stateDive` arc from sky.
- `elder` highlands b17-b20: slow caster-like, high HP, ascend death.
- `bull` boss: huge HP, `bossAI` chase+slam, multi-phase via `progressCountBoss`.

## 10. combat.js — `class Combat@8` (imports `combat.js:1-4`)
| Function | Where | What | How |
|---|---|---|---|
| `constructor` | `combat.js:9` | Store 5 callbacks + wire tabs/input | Binds `b-submit/b-example/b-input/btab-question/btab-todo`; `Enter` submits |
| `setTab` | `combat.js:47` | Toggle question/todo panes | Calls `onShowTodo/onHideTodo` to pause world; `todo.openInBattle` |
| `startTimer` | `combat.js:62` | 1s countdown | `(seconds)` 60 normal / 180 boss; → `timeout` |
| `updateRing` | `combat.js:74` | SVG ring + `m:ss` clock | Color green→amber→red |
| `timeout` | `combat.js:84` | Fail path | `audio.timeout`, `S.hearts--`, `saveGame`, shake; restart or `onRespawn` if dead |
| `show` | `combat.js:103` | Fill + open modal | `(enemy,challenge,bossIntro)`; `b-icon/b-name/b-meta/b-lesson/b-question/b-input/b-hearts`; ← `main.tryChallenge` |
| `completeByTask` | `combat.js:138` | Win via ledger deed | Validates deed title; `S.notes[key]={text}`, `S.defeated[key]=1`, `saveAnswer`, praise → `onVictory` |
| `submit` | `combat.js:171` | Win via textarea | `minLen` check else rotate `NUDGES`; same save flow as above; `audio.fanfare` |
| `close` | `combat.js:207` | Clear timer + hide `#battle` | Called after victory/timeout/Escape |
| `progressCountBoss` | `combat.js:216` | Count `boss1-5` defeated | `Final Trial n/5` in boss meta |

## 11. fx.js — `class FX@7` (`MAX=1600/RINGS=8/TEXTS=12`)
| Function | Where | What | How |
|---|---|---|---|
| `constructor` | `fx.js:8` | Alloc Points buffer + ring/text pools | `pos/col/vel/life/grav` Float32Arrays + torus + canvas sprites |
| `emit` | `fx.js:52` | One particle slot | `(x,y,z,vx,vy,vz,r,g,b,life,grav)` ring-buffer `cursor` |
| `ring` | `fx.js:62` | Expanding torus fade | `(x,y,z,color,to,dur)`; pool of 8 |
| `text` | `fx.js:73` | Floating label sprite | `(x,y,z,str,color,size)`; canvas stroke+fill; rise+fade |
| `slash` | `fx.js:95` | Arc slash particles | `(x,y,z,yaw,big)`; ← `Player` swing |
| `burst` | `fx.js:106` | Parametric explosion | `(kind,x,y,z,count)` kinds `poof/dust/spark/smoke/water/confetti/petal` |
| `update(dt)` | `fx.js:124` | Integrate + upload | Life/gravity step; `position/color` needsUpdate; ring scale/opacity; text rise |

## 12. audio.js — `const audio@58` (helpers `ensure@6/tone@19/noise@37`)
| Function | Where | What | How |
|---|---|---|---|
| `ensure` | `audio.js:6` | Lazy AudioContext+master(0.5) | Resume if suspended; null on failure |
| `tone` | `audio.js:19` | Enveloped osc blip | `(freq,dur,type,vol,when,slide)` |
| `noise` | `audio.js:37` | Filtered decaying noise | `(dur,vol,filterFreq,when)` buffer |
| `setEnabled/isEnabled` | `audio.js:59/64` | Global mute toggle | Persists `S.soundOn`; `#audio-toggle` |
| `coin/page/swing` | `audio.js:66/70/73` | Pickup / UI / whoosh | Two-tone sine / filtered noise |
| `clang/hit/parry` | `audio.js:77/82/118` | Sword hits | Square+triangle+noise stacks; `parry` brighter |
| `fanfare/bigFanfare` | `audio.js:86/92` | Win stingers | Arpeggio; big adds 4th + longer |
| `growl/timeout/magic` | `audio.js:98/102/106` | Enemy / fail / heal | Low saw slide / descending / shimmer |
| `gallop/dash/thud` | `audio.js:110/114/123` | Horse / roll / slam | Repeating ticks / noise burst / low thump |
| `startAmbient/stopAmbient` | `audio.js:128/171` | 32s 4-chord pad loop | `ambientNodes`; stopped on mute/title |

## 13. obsidian.js — vault sync (imports `obsidian.js:10`; `VAULT_FILES@11`)
| Function | Where | What | How |
|---|---|---|---|
| `announce` | `obsidian.js:19` | `toast` event emit | `(msg)` → `window.dispatchEvent` |
| `loadQueue/storeQueue` | `obsidian.js:23/33` | `localStorage:journey_vault_queue` JSON | Array of `{file,key,markdown,ts}` |
| `queuedCount` | `obsidian.js:39` | Pending count | Pill tooltip `N queued` |
| `updateVaultPill` | `obsidian.js:43` | `#obsidian-status[data-state]` | `saving/synced/queued/error` + text |
| `withTimeout` | `obsidian.js:56` | 3s abort guard | `AbortSignal.timeout(3000)` |
| `postUpsert` | `obsidian.js:64` | `POST /api/vault/upsert` JSON | Throws offline → caller enqueues |
| `enqueue` | `obsidian.js:75` | Dedupe push | Match `file+key`, replace markdown |
| `upsert` | `obsidian.js:82` | Core write path | Pill saving → post → prune/synced else queued+enqueue |
| `flushVaultQueue` | `obsidian.js:97` | Sequential replay | Stops on first failure; ← `probeVault/online` |
| `probeVault` | `obsidian.js:118` | `GET /api/vault/status` probe | If ok → flush; else pill queued |
| `todayStamp` | `obsidian.js:131` | `Mon D, YYYY` | Headings for answers/plans |
| `battleMeta/bossMeta` | `obsidian.js:139/146` | `Module X·Name·i/20` / `Final Trial i/5` | Lookup BATTLES/BOSS by key |
| `buildQuestionSection` | `obsidian.js:152` | `<!-- journey:q:key -->` md | `(key,title,question,answer,metaLine)` |
| `saveAnswer` | `obsidian.js:170` | Resolve meta → upsert questions | ← `Combat.submit/completeByTask` |
| `saveTip` | `obsidian.js:189` | Upsert `Tips.md tip:key` | ← coin pickup; silent offline |
| `savePlan` | `obsidian.js:201` | Upsert `questions plan` | ← `plan.savePlanToVault` |
| `initVaultSync` | `obsidian.js:214` | Boot probe + listeners | `probeVault` + `online/visibilitychange` flush |

## 14. ai.js — coach (exports `initAI@508`; consts `CONTEXT_FILES@20/CONTEXT_BUDGET=16000@22`)
| Function | Where | What | How |
|---|---|---|---|
| `toast` | `ai.js:24` | Toast emit | Same CustomEvent pattern |
| `todayStamp` | `ai.js:28` | `Mon D, YYYY` | Coach-note headings |
| `withTimeout/api` | `ai.js:37/45` | 12s fetch+JSON | `(path,opts)`; throws on timeout |
| `readVaultFile` | `ai.js:51` | `GET /api/vault/file?file=` | → `{text,ok}`; missing → empty |
| `appendToFile` | `ai.js:60` | Read→join→`PUT /api/vault/file` | Newline join; used for facts/tasks |
| `gateArc` | `ai.js:74` | BATTLES id+module+title list | Injected into system prompt gates |
| `buildContext` | `ai.js:83` | Vault digest under budget | Loops `CONTEXT_FILES`, `### File:` headers, `budget()` guard 16k |
| `buildSystemPrompt` | `ai.js:98` | Owl persona + FACTS + gates + digest + `[EXTRA_FACTS]` contract | Instructs model to end with facts block |
| `escapeHtml` | `ai.js:133` | `&<>"` escape | Chat injection guard |
| `inlineMd` | `ai.js:137` | Inline `b/i/code` | Regex on escaped html |
| `fmtMarkdown` | `ai.js:145` | Lite block md | Loops lines; `h2-h4/ul/p` only |
| `loadChat/saveChat` | `ai.js:177/187` | `localStorage:journey_ai_chat_v1` last 30 | Restored in `renderHistory` |
| `streamChat` | `ai.js:196` | `POST /api/ai/chat` SSE | Parse `choices[0].delta.content`, skip `[DONE]`; non-SSE → error JSON |
| `stripFactBlock` | `ai.js:245` | Split reply vs facts | Regex `/\[EXTRA_FACTS\]([\s\S]*?)\[\/EXTRA_FACTS\]/i`; returns `{visible,facts}` |
| `saveFacts` | `ai.js:256` | Dedupe append to Extra details | Case-insensitive vs existing; `## Coach notes — date` |
| `createTask` | `ai.js:270` | Selection → Tasks.md | Normalize whitespace → `- [ ] …` via `appendToFile` |
| `init` | `ai.js:281` | Panel lifecycle closure bundle | `setStatus/scrollBottom/addBubble/renderHistory/renderWelcome/open/close/send/fetchAIStatus/hideTaskPop`; `Enter=send`, streaming caret, chips, `contextmenu` task popup |
| `initAI` | `ai.js:508` | Safe wrapper | Try `init`, wire `onOpen/onClose`, `fetchAIStatus`; returns `{isOpen/open/close}` no-op on failure |
- API/DOM: `GET /api/ai/status→{configured,model}`, `POST /api/ai/chat{messages,model?,temperature?}` SSE; vault `GET/PUT /api/vault/file`; DOM `#ai/#ai-toggle/#ai-close/#ai-send/#ai-input/#ai-status/#ai-messages/#game`.

## 15. todo.js — Ledger (`FILE=Tasks.md/BACKUP journey_tasks_v1/POLL 2200@15-18`, zero imports)
| Function | Where | What | How |
|---|---|---|---|
| `toast/esc/aesc` | `todo.js:20/23/26` | Toast; html/attr escape | `esc` for text, `aesc` for attrs |
| `todayStr/uid` | `todo.js:29/34` | `YYYY-MM-DD`; id gen | Due parsing + `Math.random` ids |
| `indentOf/isBlank/fmtDate` | `todo.js:37/46/53` | Tab=2 indent; blank; date fmt | Indent drives sub/desc nesting |
| `stripMeta` | `todo.js:68` | Strip `📅/🔺⏫🔼🔽` from title | Display vs storage split |
| `parseMarkdown` | `todo.js:82` | Md → `{sections:[{id,title,tasks[]}]}` | Loops lines; `##`=section, `- [ ]`=task, indent=sub/desc |
| `taskLine/serializeTask` | `todo.js:149/156` | Node → md line(s) | Recurses `subs`; preserves desc indent |
| `serializeMarkdown` | `todo.js:163` | Sections → file text | Collapse `\n{3,}`; verbatim prose |
| `loadBackup/storeBackup` | `todo.js:194/202` | localStorage mirror | Offline fallback + prod mode |
| `api` | `todo.js:205` | Vault file fetch wrapper | Same timeout pattern as ai |
| `syncDot` | `todo.js:213` | `#todo-pill` dot state | `saving/synced/queued/offline`; loops both pill ids |
| `allTasks/taskById` | `todo.js:252/258` | Walk tree / find by id | DFS over sections+subs |
| `rootInfoOf` | `todo.js:261` | `{sec,idx,task}` for root | Drag + move target lookup |
| `counts/secCounts` | `todo.js:268/277` | open/done/overdue tallies | Badges + battle hint |
| `ensureInbox` | `todo.js:284` | Auto-create Inbox | First section if missing |
| `markChanged` | `todo.js:292` | Dirty + badges + hooks | `(immediate)` → `scheduleSave` + `onChanged` |
| `scheduleSave/writeNow` | `todo.js:299/308` | Debounced 650ms `PUT` | `writeNow` guards `_pendingWrite`; `sendBeacon` on `pagehide` |
| `reloadFromServer` | `todo.js:338` | `head`-mtime live reload | Skips if `dirty/_pendingWrite`; merges server text |
| `init` | `todo.js:368` | Boot load + badges + render | Backup → server → poll; ← main `initTodo` |
| `startPolling/stopPolling` | `todo.js:411/423` | 2200ms `head` poll while visible | `clearInterval` on hide |
| `buildDom` | `todo.js:431` | Build `#todo-app` once | Single node moved between hosts |
| `openOverlay/openInBattle` | `todo.js:454/466` | Move node to `#todo-slot` / `#b-pane-todo` | Set `led.active`; `render+startPolling` |
| `closeAll/closeOverlay` | `todo.js:475/481` | Hide + detach | `active=none`, `stopPolling`, optional relock |
| `refreshBadges` | `todo.js:495` | `.todo-count-badge` + `#todo-sub` | `counts()` open total |
| `metaChipsHtml/taskRowHtml` | `todo.js:511/525` | Due/pri/subs chips; row html | `showDue` flag; depth indent |
| `sectionTitleHtml/sectionSubtitle` | `todo.js:551/556` | Section headers | Counts + overdue in subtitle |
| `renderList/renderBoard` | `todo.js:562/586` | List vs board body | Loops sections; board groups by section |
| `cardHtml` | `todo.js:612` | Board card | Title+chips+sub count |
| `renderAddBox/renderEditor` | `todo.js:639/666` | `qa-*` quick-add; `ed-*` editor | `qa-title/qa-desc/qa-due/qa-pri`; `ed-title/ed-desc/ed-due/ed-pri/ed-sec/ed-newsub` |
| `addSubtask/deleteTask` | `todo.js:738/753` | Sub-add; recursive delete | `finishDelete@765` confirms; both `markChanged` |
| `createTask/toggleTask` | `todo.js:771/782` | Create in section; toggle cascade | Toggle cascades to subs; fires `onTick(task,done)` for combat |
| `moveRootTo` | `todo.js:797` | Drag root between sections | `(secId,taskId,toEnd,beforeId)`; same-section reorder |
| `addQuickDeed` | `todo.js:~815` | Deed popup → Inbox task | ← `main.showDeedPopup`; title+desc |
| Export `todo` | `todo.js:~830` | `{init,openOverlay,openInBattle,closeAll,…,onTick,onChange,setView,serialize,parseMarkdown}` | Single shared instance |

## 16. plan.js + server + DOM
- `plan.js:8-9` `keyOf/note`: `BATTLES[i].id` → `S.notes[key].text`.
- `plan.js:10` `buildPlanHtml`: 8 secs North Star/One Student/Message&Proof/Offer/`$200` Bet/Battle Rhythm/Ranks/Risks mapping `S.notes` indices; missing → `.plan-missing`.
- `plan.js:67` `buildPlanText`: `div.innerText` collapsed. `escapeHtml@73` (`&<>`). `showPlan@77` inject `#plan-body`, unhide `#plan`, `fanfare`. `savePlanToVault@83`: `S.notes.plan`, `saveGame`, `savePlan().catch`, `page`. Buttons `#plan-close/#plan-obsidian` wired in main.
- `vite.config.js:8-9` `VAULT_DIR=OBSIDIAN_VAULT||../Azizbek`; `ALLOWED_FILES` 5 md: `Journey questions/Tips/Tasks/Extra details/About me`.
- `vite.config.js:11/18/27/32/48` `sendJson/readBody/sectionBlock/queryMap/upsertSection`: JSON reply, 2M cap, `<!-- journey:key -->` replace-or-append with `\n{3,}` collapse, query parse.
- `vite.config.js:59` `vaultMiddleware` routes: `GET /api/vault/status→{vault,files,mtimes}`; `POST /api/vault/upsert{file,key,markdown}→{mtime}` 200k; `GET /api/vault/file/head?file=`; `GET /api/vault/file?file=→{content,mtime}` (`` if ENOENT); `PUT/POST /api/vault/file{file,content}` 500k; traversal guard `relative(..)` reject.
- `vite.config.js:145/157/161/239` `vaultPlugin/aiEndpoint/aiMiddleware/aiPlugin`: `configureServer(middlewares.use)`; `${base}/chat/completions` proxy validates `messages[{role,content}]`, forwards `model/temperature/stream:true`, pipes SSE `text/event-stream/no-cache`, 502 on upstream fail.
- `vite.config.js:248` `defineConfig`: `port 3000 strictPort host localhost`; `chunkSizeWarningLimit 1200`; `AI={AI_BASE_URL,AI_API_KEY,AI_MODEL}` via `loadEnv`.
- `worker.js:7` `fetch`: `env.ASSETS.fetch` try/catch else `404 Not found`. No `/api/*`.
- DOM shell: `#app/#game(canvas)/#toasts/#banner/#fade/#vignette/#whiteflash/#audio-toggle`.
- HUD: `#title/#btn-begin/#hud.hidden/#minimap(164)/#hud-hearts/#hud-gold/#hud-stamina-fill/#hud-progress/#obsidian-status[data-state]/#ai-toggle/#hud-hint/#hud-zone`.
- AI: `#ai.overlay.hidden>.ai-panel>#ai-status/#ai-close/#ai-messages/#ai-input/#ai-send`.
- Battle: `#battle>#b-icon/#b-name/#b-meta/#b-ring/#b-clock/#btab-question/#btab-todo/#b-pane-question>#b-lesson/#b-question/#b-input/#b-example/#b-nudge/#b-submit/#b-hearts` + `#b-pane-todo` host.
- Ledger/deed/plan/win: `#coin-card>#coin-title/#coin-tip`; `#todo>#todo-close/#todo-sub/#todo-slot`; `#deed>#deed-icon/#deed-title/#deed-text/#deed-create/#deed-open/#deed-dismiss`; `#plan>#plan-body/#plan-obsidian/#plan-close`; `#win>#win-stats/#win-close`; `#todo-toggle>.todo-count-badge`. `style.css` styling only.

## 17. Data flows (end-to-end)
- Answer flow: `KeyE→main.tryChallenge→Combat.show→submit/completeByTask→S.notes+S.defeated→saveGame+saveAnswer(upsert)→onVictory→EnemyManager.executeKill→updateHUD→horse/plan unlocks`.
- Coin flow: `animate coin check→S.coinsTaken/gold→saveGame→showCard(COIN_LESSONS)→saveTip(Tips.md)→audio.coin+fx`.
- Deed flow: `Player.doHitCheck→hitAssetAt→hitDestroyable fell→showDeedPopup→todo.addQuickDeed→markChanged→PUT Tasks.md`.
- Plan flow: `20/20→showPlan(buildPlanHtml from S.notes)→savePlanToVault→savePlan(Journey questions.md plan section)`.
- AI flow: `ai-toggle→buildContext(vault 4 files,16k)→buildSystemPrompt(FACTS+gates)→streamChat(SSE)→stripFactBlock→saveFacts(Extra details)+bubbles→right-click createTask(Tasks.md)`.
- Todo sync: `parseMarkdown→edits→markChanged→scheduleSave 650ms→PUT→mtime; poll head 2200ms→reloadFromServer; offline→localStorage mirror+syncDot queued`.

## 18. Cookbook
- Add question: append `BATTLES {id,key,module,zone,enemy,minLen}` in `curriculum.js:24-186`; `spawnAll` auto-groups by zone; `Combat.show` + `battleMeta` pick it up; add index to `plan.buildPlanHtml` if plan-visible.
- Add enemy look: new `type` branch in `buildModel@105` + `ICONS/NAMES/HP/BAR` tables; reference it from a `BATTLES.enemy`; no world change.
- Add coin tip: append `COIN_LESSONS {zone,title,tip}`; `buildCoins` binds automatically.
- New vault file: add to `vite.config.js:9 ALLOWED_FILES` + `obsidian VAULT_FILES` if answers/tips + `ai CONTEXT_FILES@20` if coach should read.
- New task field: extend `parseMarkdown/serializeTask/taskRowHtml/renderEditor/metaChipsHtml` together or file corrupts.
- Difficulty: `Combat` timer 60/180 + `minLen`, `enemies HP/dmg` tables, `state MAX_HEARTS`, `main regenTick 4s`, `Player` stamina costs.

## 19. Pitfalls for agents
- Always gate new keys with `isTyping/uiBlocking` or they fire while typing in `b-input/ai-input`.
- Prod has no vault/AI: always keep `enqueue`/offline fallback; verify locally via `GET /api/vault/status`, `GET /api/ai/status`.
- `S` mutated directly: call `saveGame()` after every write or progress lost on reload.
- `todo` single `#todo-app` node: never clone; move via `openOverlay/openInBattle`.
- Every spawn needs `heightAt`; clamp to `SIZE/2=200` or actors fall through.
- `BATTLES.key` and `boss1-5` share `S.notes/S.defeated` namespace: keep distinct.
- `upsertSection` idempotency relies on `<!-- journey:key -->` markers: never strip comments from vault files.
- SSE proxy requires `stream:true` + `text/event-stream`; plain JSON responses break `streamChat` parser.
- Large `Extra details` appends approach 500k file cap: `saveFacts` dedupes, do not duplicate.

## 20. BATTLES catalog (id → module/zone/enemy/key)
| ID | Where | Module/zone/enemy | `S.notes` key | Used by |
|---|---|---|---|---|
| `b01` | `curriculum.js:26` | A / woods / rat | `persona` | spawn woods; plan II Best student `g(0)` |
| `b02` | `curriculum.js:34` | A / woods / rat | `motivation` | plan II Why they buy `g(1)` |
| `b03` | `curriculum.js:42` | A / woods / fox | `levels` | plan II Level journey `g(2)` |
| `b04` | `curriculum.js:50` | A / woods / fox hard | `pains` | plan III Old pains `g(3)` |
| `b05` | `curriculum.js:58` | A / woods / boar hard | `competitors` | spawn only (lore for AI) |
| `b06` | `curriculum.js:66` | A / woods / boar hard | `decision` | spawn only (lore for AI) |
| `b07` | `curriculum.js:74` | A / woods / wolf | `proof` | plan III Proof `g(6)` |
| `b08` | `curriculum.js:82` | B / plains / wolf | `product` | plan IV What is inside `g(7)` |
| `b09` | `curriculum.js:90` | B / plains / wolf | `promise` | plan III Promise `g(8)` |
| `b10` | `curriculum.js:98` | B / plains / bear hard | `usp` | plan III USP `g(9)` |
| `b11` | `curriculum.js:106` | B / plains / bear | `bonus` | plan IV Value boost `g(10)` |
| `b12` | `curriculum.js:114` | B / plains / bear hard | `pricing` | plan IV Price levers `g(11)` |
| `b13` | `curriculum.js:122` | C / highlands / owl | `channels` | plan V truth `g(12)` + rhythm trial-lesson gate |
| `b14` | `curriculum.js:130` | C / highlands / owl | `telegram` | plan V Telegram `g(13)` + rhythm 3×/week gate |
| `b15` | `curriculum.js:138` | C / highlands / owl | `website` | plan V Website `g(14)` |
| `b16` | `curriculum.js:146` | C / highlands / owl hard | `capacity` | plan VII Team capacity `g(15)` |
| `b17` | `curriculum.js:154` | D / highlands / elder hard | `goal` | plan I Quarter goal `g(16)` |
| `b18` | `curriculum.js:162` | D / highlands / elder hard | `bet` | plan V `$200` bet `g(17)` |
| `b19` | `curriculum.js:170` | D / highlands / elder hard | `test` | plan V Month-one test `g(18)` + rhythm monthly gate |
| `b20` | `curriculum.js:178` | D / highlands / elder hard | `metric` | plan I Victory metric `g(19)` + rhythm Monday gate |
- HOW to read: `keyOf(i)=BATTLES[i].id`, `note(key)=S.notes[key]?.text` (`plan.js:7-8`); `g(i)` null → `.plan-missing`.
- BOSS challenges (`curriculum.js:193-217`): `boss1` Promise `minLen 15`; `boss2` Defend `$200` `25`; `boss3` Path of Stranger `25` → plan VII Funnel; `boss4` Bull Respects Math `25`; `boss5` Final Vow `25` → plan VIII Final vow. `boss2` also → plan VIII If-bet-fails.
- Plan rhythm (`plan.js:50-55`) is generated, not quoted: Monday needs `g(19)`; 3×/week needs `g(13)`; trial-lesson needs `g(12)`; monthly needs `g(18)`.

## 21. Vault + AI HTTP contracts (all local-dev only)
| Method | Route | Where | Request | Response |
|---|---|---|---|---|
| GET | `/api/vault/status` | `vite.config.js:63` | — | `{ok,vault,files[5],mtimes{file:mtimeMs\|null}}` |
| POST | `/api/vault/upsert` | `vite.config.js:73` | `{file,key,markdown}` 200k cap | `{ok,file,mtime}` or `400 {error}` |
| GET | `/api/vault/file/head` | `vite.config.js:94` | `?file=Tasks.md` | `{ok,file,mtime,exists}` |
| GET | `/api/vault/file` | `vite.config.js:109` | `?file=` | `{ok,file,content,mtime}` (`` if ENOENT) |
| PUT/POST | `/api/vault/file` | `vite.config.js:122` | `{file,content}` 500k cap | `{ok,file,mtime}` |
| GET | `/api/ai/status` | `vite.config.js:166` | — | `{ok,configured,model\|null}` |
| POST | `/api/ai/chat` | `vite.config.js:172` | `{messages:[{role,content}],model?,temperature?}` | SSE `text/event-stream` or `200 {error}` if unconfigured; `502` upstream fail |
- Callers: `obsidian postUpsert@64/probeVault@118` use status+upsert; `ai readVaultFile@51/appendToFile@60/streamChat@196` use file+chat; `todo api@205/writeNow@308/reloadFromServer@338` use file+head.
- Guards: `ALLOWED_FILES` 5 (`vite.config.js:9`); `relative(..)` traversal reject; `readBody` 2M cap (`vite.config.js:18`).
- Prod: `worker.js:7` has none of these; callers must handle fetch throw → queue/offline (`enqueue@75`, `storeBackup@202`).

## 22. Todo markdown spec (source of truth = `Tasks.md`)
```
## Inbox
- [ ] Book trial lesson room 📅 2026-09-10 🔺
  Description line, indented 2 spaces.
  - [ ] Subtask, 2-space indent per level
## Next week
- [x] Done task (counts.done, hidden from open badge)
Verbatim prose lines (no prefix) preserved as-is by parse/serialize.
```
- WHAT each token means: `##` = section/list (`parseMarkdown@82`); `- [ ]/- [x]` = open/done (`counts@268`); indent 2 = sub/desc (`indentOf@37`); `📅 YYYY-M-D` = due (`fmtDate@53`); `🔺/⏫/🔼/🔽` = pri high/med/low/none (`stripMeta@68`); prose verbatim round-trips (`serializeMarkdown@163` collapses `\n{3,}` only).
- DOM ids created by `buildDom@431`: `#todo-app>#ta-addbox>#qa-title/#qa-desc/#qa-due/#qa-pri`, `#ta-editor>#ed-title/#ed-desc/#ed-due/#ed-pri/#ed-sec/#ed-newsub`, `#ta-body`, `#todo-pill(-inline)` via `syncDot@213`.
- View: `led.view=list|board`, `renderList@562/renderBoard@586/cardHtml@612`; DnD moves roots via `moveRootTo@797`; `toggleTask@782` cascades + fires `led.onTick` (main kills enemy for battle deeds).
- Sync: `markChanged@292→scheduleSave@299(650ms)→writeNow@308 PUT`; `startPolling@411` 2200ms head → `reloadFromServer@338`; `pagehide` → `sendBeacon`; offline → `BACKUP_KEY journey_tasks_v1`.

## 23. AI prompt + fact contracts
- Context (`ai.js:83-96`): concat `CONTEXT_FILES = About me/Extra details/Journey questions/Tips.md` (`ai.js:20`) with `### File:` headers; `CONTEXT_BUDGET=16000` chars (`ai.js:22`); `budget()` stops appending mid-file (whole-file skip, not truncate).
- System prompt (`ai.js:98-131`): Owl persona + `FACTS[6]` + `gateArc()` (20 battle titles) + digest + hard rule: end reply with `[EXTRA_FACTS]\n- fact\n[/EXTRA_FACTS]` or empty block; only new durable facts, never repeat `Extra details.md`.
- Facts (`ai.js:245-268`): `stripFactBlock` regex split; `saveFacts` case-insensitive dedupe vs `Extra details.md`; append under `\n## Coach notes — {todayStamp}\n` or create `# Extra details` header if empty; toast `📓 N saved`.
- Tasks (`ai.js:270-279`): `contextmenu` on `#ai-messages` selection → `.ai-task-pop` button → `createTask` normalize → `- [ ] …` via `appendToFile("Tasks.md")`.
- Chat memory (`ai.js:177-194`): `loadChat/saveChat` last 30 in `journey_ai_chat_v1`; `renderHistory/renderWelcome` on open; `send` streams tokens into bubble with `.ai-caret`, `Enter` sends, `Shift+Enter` newline.

## 24. Debug + verify commands (PowerShell, run in repo root)
- `npm run dev` → `localhost:3000`; `Invoke-RestMethod http://localhost:3000/api/vault/status`; `Invoke-RestMethod http://localhost:3000/api/ai/status`.
- Re-pin lines: `rg -n "^(export )?(async )?function|export (const|class)|^  (async )?[a-zA-Z_]+\(" src/main.js src/player.js src/world.js src/enemies.js src/combat.js src/fx.js src/audio.js src/obsidian.js src/ai.js src/todo.js src/plan.js`.
- Check map freshness: `(Get-Content CODEBASE-MAP.md | Measure-Object -Line).Lines` should stay ~500; `rg -c "file:line|@\d+" CODEBASE-MAP.md` sanity.
- Vault dir override: `$env:OBSIDIAN_VAULT="C:\tmp\vault"; npm run dev` (`vite.config.js:8`).
- Common failure: pill `queued` → dev server not running or `VAULT_DIR` missing; AI `offline` → `.env AI_BASE_URL/AI_API_KEY/AI_MODEL` unset (never commit `.env`).

## 25. Combat numbers (tuning single-sources)
- HP table (`enemies.js:782`): `rat 2, fox 2, boar 3, wolf 3, bear 4, owl 3, elder 3, bull 4`. `spawn@847` uses `HP[type]||3`.
- Damage: `Player.doHitCheck@782-785` deals `comboIdx==2 ? 2 : 1`; heavy (`2`) → knockback `6.5`, `16 spark`, ring `2.6`, floating `"2"` (`hitByPlayer@1281-1292`); light → `4.5/10/1.9`. `hitByPlayer@1274` floors non-battle enemies at `1` (must use execution/quiz to finish); battle enemies go to `0` → `down`.
- Screenshake: `shakeT = dmg>1 ? 0.22 : 0.14` (`enemies.js:1300`); consumed in `main.animate@560`.
- Charge reach (`enemies.js:1206`): boss `2.8`, normal `2.1`; `d<reach` → `resolveChargeImpact`.
- Block (`player.js:910-913`): `blocking = RMB && attackT<0 && exec/victory/roll<0 && !UI`; `blockT=0` on raise, then `+=dt`. Perfect window `blockT<0.3` in `resolveChargeImpact/DiveImpact`; else chip `onPlayerHit`.
- Roll (`player.js:704-727`): cost `0.12` stamina, blocked if `stamina<0.12` (toast winded); sets `rollT=0`, cancels `attackT`; `rollT>=0` = i-frames vs charges.
- Combo (`player.js:732-746`): queue if `attackT/swingDur>0.45`; `swingDur = comboIdx==2 ? 0.46 : 0.38`; third hit deals 2.
- Sprint/stamina (`player.js:825-845`): speed `×2` foot / `×1.7` mounted; drain `0.30/s` foot / `0.22/s` mounted; regen `0.18/s`; `0` → `exhausted` until `>=0.35`; HUD `#hud-stamina` shows when `<0.995` or Shift held.
- Hearts: `MAX_HEARTS 5`; `regenTick` +1/4s safe; `timeout` −1; `onPlayerHit` −1 (perfect avoids); `onRespawn` refill; fountain heals when `<5.5` units + `<MAX`.
- Timers: combat `60`s normal / `180`s boss (`Combat.show@103`); minimap base prerendered once; enemy defeat cinematics `~0.6-1.2`s in `updateDefeat`.

## 26. AI state graphs (read before touching)
- Enemy lifecycle: `spawn(alive, hp=HP)` → `wander/strafe` (`update`) → `windup(telegraph ON, growl)` → `charge/dive` → `resolve(hit|perfect|miss)` → `stagger?` → `hitByPlayer(hp--)` → `down(knockdown pose, hint E)` → `tryChallenge→Combat` → `onVictory→executeKill→startDefeat→updateDefeat→gone` + `S.defeated=1`. Cowards (`rat/fox`) insert `flee` when player close; `bear` inserts `enrage` at `<50%`.
- Player attack: `tryAttack→startSwing(attackT=0)→update poses→mid-swing doHitCheck→onSwingHit(hp--) or onAssetHit(fell?)→combo queue or end`. Roll/block cancel attack; exec/victory/hurt lock input.
- Combat modal: `show(startTimer)→typing→submit(minLen? victory : NUDGES[next]) | completeByTask(deep-link) | timeout(hearts-- → retry or respawn)→close→onVictory`. `setTab(todo)` pauses world via `onShowTodo`.
- Vault write: `saveAnswer/saveTip/savePlan→upsert(pill saving)→postUpsert OK? synced+prune : queued+enqueue→flushVaultQueue later`. Never throws to caller; offline is silent except pill.
- Todo edit: `render→edit→markChanged→scheduleSave 650ms→writeNow PUT→syncDot synced/queued→poll head→reloadFromServer if mtime newer && !dirty`.
- AI chat: `open→renderHistory→send(buildContext+history→streamChat tokens→bubble)→stripFactBlock→saveFacts→render→saveChat`. `contextmenu` selection → `createTask` parallel path.

## 27. Glossary + ownership FAQ
- `BATTLE` vs `battleId` vs `key`: `BATTLES[]` entry; `battleId` like `b01`; `key` like `persona` is the `S.notes/S.defeated` key. Boss uses `boss1-5` keys, not `bXX`.
- `down` vs `gone` vs `defeated`: `down` = HP 0 pose awaiting quiz; `gone` = removed after victory (skipped on respawn); `defeated[key]=1` = persisted.
- `near`: `EnemyManager.near` = downed enemy in range for `KeyE`; set in `onKnockdown`, cleared on victory/leave.
- `uiOpen`: world-pause flag when battle/plan/ledger/ai open; `animate` + `enemy.update` freeze AI but still render.
- `anims`: `buildWorld` return `{anims[]}` stepped by `updateWorld`; ambient only, never gameplay.
- Who owns gold? `main.onVictory` adds, `updateHUD` shows, `S.gold` persists. No shop yet — search `gold` before adding one.
- Who owns hearts display? `main.updateHUD` (`#hud-hearts`) + `Combat.show` (`#b-hearts`); both read `S.hearts/MAX_HEARTS`.
- Where to add SFX? Compose in `audio.js` (`tone/noise`), trigger at call site (e.g. `audio.clang()` in `hitByPlayer`). Respect `enabled` + `S.soundOn`.
- Where to add particles? Add `FX` method or `burst` kind in `fx.js`, call with world coords; never allocate per-frame (pools are fixed).
- Vault file cased exactly (`Journey questions.md` etc.): `ALLOWED_FILES` is case-sensitive; mismatched case 400s.

## 28. Export surface (exact — do not invent imports)
- `src/main.js`: no exports. Side-effect entry; exposes `window.__game` for console debug only.
- `src/state.js:3,5,16,31,52,63`: `MAX_HEARTS`, `S`, `saveGame`, `loadGame`, `resetGame`, `progressCount`.
- `src/data/curriculum.js:1,8,15,24,187,225,232,239,244`: `ZONES`, `MODULE_NAMES`, `FACTS`, `BATTLES`, `BOSS`, `PRAISES`, `NUDGES`, `TIMEOUT_NUDGES`, `COIN_LESSONS`.
- `src/world.js:3,29,35,49,92,114,128,132,172,328,1577`: `SIZE`, `BATTLE_SPOTS`, `SPECIALS`, `hitAssetAt`, `heightAt`, `zoneAt`, `getCoins`, `getDestroyables`, `hitDestroyable`, `buildWorld`, `updateWorld`.
- `src/player.js:609`: `Player`. `src/enemies.js:806`: `EnemyManager`. `src/combat.js:8`: `Combat`. `src/fx.js:7`: `FX`.
- `src/audio.js:58`: `audio` (singleton object, not class).
- `src/obsidian.js:11,43,97,118,152,170,189,201,214`: `VAULT_FILES`, `updateVaultPill`, `flushVaultQueue`, `probeVault`, `buildQuestionSection`, `saveAnswer`, `saveTip`, `savePlan`, `initVaultSync`.
- `src/ai.js:508`: `initAI` only (all else module-private).
- `src/todo.js:958`: `todo` only (object with `init/openOverlay/openInBattle/closeAll/closeOverlay/render/counts/taskById/allTasks/toggleTask/createTask/deleteTask/addSubtask/addQuickDeed/ensureInbox/onTick/onChange/setView/serialize/parseMarkdown/serializeMarkdown/syncDot/visible/active`).
- `src/plan.js:10,67,77,83`: `buildPlanHtml`, `buildPlanText`, `showPlan`, `savePlanToVault`.
- `vite.config.js:248`: default `defineConfig`; `worker.js:6`: default `{fetch}`.
- Import rules: never import `main.js` (no exports, would double-boot); never import `vite.config.js` from `src/` (server-only, uses `node:fs`); `todo.js` imports nothing — keep it that way to avoid cycles.

## 29. Change-impact matrix (if you touch X, also check Y)
| Touch | Also check | Why |
|---|---|---|
| `BATTLES[].key/id` | `plan.js g(i)`, `obsidian battleMeta`, `ai gateArc`, `S.notes` keys | Key rename orphans saved answers + breaks plan sections |
| `BATTLES[].zone/enemy` | `enemies.spawnAll`, `world BATTLE_SPOTS`, minimap colors | Zone regroups spawns; enemy needs `buildModel` branch |
| `BATTLES[].minLen` | `Combat.submit`, `completeByTask` | Too high blocks progress; too low admits empty answers |
| `HP` table | `hitByPlayer` floor, `updateBar`, boss pacing | HP 1 makes quiz skippable; HP 6 makes grind |
| `S` shape | `saveGame/loadGame` defaults, `todo`? no — `S` only | Old saves hydrate with defaults; missing default = `undefined` crash |
| `heightAt/FLATS` | `player.update`, `enemies spawn/update`, `scatter`, minimap | Terrain change strands actors under/above ground |
| `ALLOWED_FILES` | `VAULT_FILES`, `CONTEXT_FILES`, `todo FILE` | Allow-list miss → 400 on write, silent queue growth |
| `COMPARE vault markers` | `upsertSection`, existing vault files | Marker edit duplicates sections instead of replacing |
| `Player stamina API` | `tryRoll`, `update` drain/regen, `#hud-stamina` | Cost change without HUD update confuses players |
| `Combat timer` | `startTimer`, `updateRing`, `timeout`, boss 180s | Timer leak (missing `clearInterval` in `close`) double-fires timeout |
| `todo parse/serialize` | `taskRowHtml`, `renderEditor`, `metaChipsHtml`, real `Tasks.md` | Asymmetric parse/emit corrupts user vault on save |
| `buildSystemPrompt` | `CONTEXT_BUDGET`, `stripFactBlock`, `FACTS` | Prompt growth past 16k silently drops whole files |
| `index.html IDs` | every `$("...")` call site | Renamed ID → null element → throw on open; fallback-begin masks it |
| `worker.js` | `wrangler.jsonc`, `dist/` | Worker never serves `/api/*`; adding routes there has no effect locally |
| `style.css classes` | `taskRowHtml/cardHtml`, `.plan-missing`, `.toast`, `#battle` tabs | Class rename breaks ledger/plan/combat rendering with no JS error |

## 30. Keep this map fresh
- After any rename/add/remove: update the row's `file:line` + §28 export list + §29 impact row in the same PR.
- Line drift check: `rg -n "^export |^function |^  [a-z]+\(" src/<file>.js` and fix stale `@lines`.
- Size guard: keep file ≤550 lines; if over, split per-type catalogs into `docs/` and link from §9 — never delete §28/§29.

## 31. Appendix — constants agents ask for
- `SIZE=400` (`world.js:3`), playable clamp `±200`; `HALF=200` used in `player.update` + `scatter`.
- `FLATS` (`world.js:14-27`): index `0` Keep `(0,0,r60)`; `10` pond; `11` stream; `12` summit; `13` windmill; `SPECIALS@35` aliases those four. `heightAt` flattens each `FLATS` disc, then blends path splines.
- `BATTLE_SPOTS[9]` (`world.js:29-34`): 3 per zone (woods/plains/highlands); `spawnAll` assigns one BATTLES group per spot with lateral offsets so enemies never stack.
- `DIRS` (`world.js:6-10`): normalized zone direction vectors for `zoneAt` + scatter bias: woods `(-1,0.32)`, plains `(1,-0.28)`, highlands `(0.34,-0.94)`.
- `FX` pools (`fx.js:3-5`): `MAX=1600` particles, `RINGS=8`, `TEXTS=12`. `burst` kinds: `poof` (white, defeat), `dust` (brown, slam/roll), `spark` (gold, sword hit), `smoke` (gray, fox/fire), `water` (blue, fountain/stream), `confetti` (multi, victory), `petal` (pink, elder/owl + ambient).
- Audio cues (`audio.js:66-123`): `coin` pickup arpeggio; `page` UI turn; `swing` whoosh; `clang` sword-on-flesh; `hit` player hurt; `parry` perfect (brighter than clang); `fanfare` quiz win; `bigFanfare` 20/20 + plan; `growl` windup warn; `timeout` fail descend; `magic` fountain/heal; `gallop` mount loop-ish; `dash` roll; `thud` slam/bull.
- `CONTEXT_FILES` (`ai.js:20`): exactly `About me.md, Extra details.md, Journey questions.md, Tips.md` — `Tasks.md` is NOT in coach context (only via `createTask` writes).
- `BACKUP_KEY journey_tasks_v1` + `POLL_MS 2200` + `scheduleSave 650ms` (`todo.js:15-18,299,411`): the three timing numbers that govern ledger sync.
- `SAVE_KEY journey_cmo_save_v1` (`state.js:1`) vs `journey_vault_queue` (obsidian) vs `journey_ai_chat_v1` (ai) vs `journey_tasks_v1` (todo): four localStorage namespaces; never reuse across modules.
- Title controls (copy in `index.html:159-161`): WASD ride, mouse look, LMB attack, RMB defend, Shift sprint, C roll, E answer, H horse (7/20), Space attack. `E` needs `near`; `H` needs `S.horseUnlocked`.
- Win condition: `progressOf()===20` (`main.js:364`) → boss gate opens → `BOSS` 5 challenges → `showPlan` → `savePlanToVault`. `bossDone` persists; `plan` text stored at `S.notes.plan`.

## 32. Quick-start for a new coding agent (15 min)
1. Read `src/state.js` (59L) + `src/data/curriculum.js:24-30` (one BATTLES entry shape) — learn `S` + IDs.
2. Read `src/main.js:542-615` (`animate`) + `src/main.js:322-368` (`onVictory`) — learn loop + progression gates.
3. Read the module you will touch (e.g. `todo.js:82-163` for tasks, `ai.js:98-131` for prompts, `enemies.js:822-910` for spawns).
4. Run `npm run dev`, open `http://localhost:3000`, click Begin, open DevTools console: `window.__game` exposes scene/player/enemyMgr for inspection.
5. Probe backends: `GET /api/vault/status`, `GET /api/ai/status` — if either fails, you are on prod build or wrong port; vault/AI work will silently queue.
6. Make the smallest change that updates one row of this map; run `npm run build` to catch import errors (especially `node:fs` accidentally pulled into `src/`).
7. Before finishing: re-run the `rg` line-pin for touched files, update stale `@lines` here, and add the impact row per §29.
8. Never commit `.env`, `node_modules/`, `dist/`, or vault contents (`../Azizbek/`); map + code only.
