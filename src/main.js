import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

import { buildWorld, updateWorld, heightAt, zoneAt, getCoins, SIZE } from "./world.js"
import { FX } from "./fx.js"
import { Player } from "./player.js"
import { EnemyManager } from "./enemies.js"
import { Combat } from "./combat.js"
import { initVaultSync, saveTip } from "./obsidian.js"
import { showPlan, savePlanToVault } from "./plan.js"
import { todo } from "./todo.js"
import { initAI } from "./ai.js"
import { FACTS, BATTLES, BOSS, COIN_LESSONS, ZONES } from "./data/curriculum.js"
import { S, saveGame, loadGame, progressCount, MAX_HEARTS } from "./state.js"
import { audio } from "./audio.js"

const $ = (id) => document.getElementById(id)

try { $("btn-begin")?.addEventListener("click", () => {
  try { $("title")?.classList.add("hidden"); $("hud")?.classList.remove("hidden"); } catch(e){}
}); } catch(e){}
window.addEventListener("fallback-begin", () => {
  try { $("title")?.classList.add("hidden"); $("hud")?.classList.remove("hidden"); } catch(e){}
});

const canvas = $("game")
let renderer
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
} catch(e) {
  const t=document.getElementById('toasts'); if(t){const d=document.createElement('div'); d.className='toast'; d.style.background='#a63a2e'; d.style.color='#fff'; d.textContent='WebGL error: '+e.message; t.appendChild(d);}
  throw e;
}
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2.5))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.fog = new THREE.Fog("#f2d9b8", 90, 430)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.3

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1400)
camera.position.set(0, 8, 30)

const hemi = new THREE.HemisphereLight("#ffe8c8", "#5a6a4a", 0.7)
scene.add(hemi)
const sun = new THREE.DirectionalLight("#ffd9a0", 1.5)
sun.position.set(-60, 80, 70)
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
sun.shadow.camera.left = -70
sun.shadow.camera.right = 70
sun.shadow.camera.top = 70
sun.shadow.camera.bottom = -70
sun.shadow.camera.far = 400
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.025
scene.add(sun)
scene.add(sun.target)
const sunFill = new THREE.DirectionalLight("#d9c9ff", 0.25)
sunFill.position.set(80, 40, -60)
scene.add(sunFill)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.7, 0.82)
composer.addPass(bloom)

const world = buildWorld(scene)
const fx = new FX(scene)
const player = new Player(scene, camera, fx)
const enemyMgr = new EnemyManager(scene, fx, {
  onPlayerHit(e) {
    if (S.hearts <= 0 || invulnT > 0 || player.rollT >= 0) return
    invulnT = 1.1
    S.hearts--
    saveGame()
    const dx = player.pos.x - e.group.position.x
    const dz = player.pos.z - e.group.position.z
    const dl = Math.hypot(dx, dz) || 1
    player.applyKnockback(dx / dl, dz / dl, e.battle ? 7 : 10)
    player.playHurt()
    enemyMgr.shakeT = Math.max(enemyMgr.shakeT, 0.35)
    flashVignette()
    audio.hit()
    fx.ring(player.pos.x, player.pos.y + 0.15, player.pos.z, "#d9452f", 2.8, 0.5)
    updateHUD()
    if (S.hearts <= 0) {
      toast("\u2620 You fall... but the quest is not over.")
      $("fade").classList.add("on")
      setTimeout(() => {
        player.group.position.set(0, heightAt(0, 18), 18)
        player.kb.set(0, 0, 0)
        S.hearts = MAX_HEARTS
        saveGame()
        updateHUD()
        toast("\ud83d\udea9 You awaken at the Keep fountain. Your truths remain yours.")
        $("fade").classList.remove("on")
      }, 900)
    } else {
      toast("\u2694 The guardian strikes! Raise your shield with Right Mouse.")
    }
  },
  onPerfectBlock() {
    timeScale = 0.3
    setTimeout(() => { timeScale = 1 }, 650)
  },
  onPlayerDodge() {
    timeScale = 0.35
    setTimeout(() => { timeScale = 1 }, 500)
    player.stamina = Math.min(1, player.stamina + 0.2)
  },
  onKnockdown(e) {
    if (!combat.open) combat.show(e)
  }
})
player.enemies = enemyMgr.enemies
enemyMgr.player = player
enemyMgr.spawnAll()
window.__game = { player, enemyMgr, scene, fx }

player.onSwingHit = (e, dmg) => {
  if (enemyMgr.hitByPlayer(e, dmg)) hitStopT = dmg > 1 ? 0.09 : 0.055
}
player.onSlashFx = (big) => {
  const y = player.pos.y + (player.mounted ? 3.4 : 2.1)
  fx.slash(player.pos.x, y, player.pos.z, player.yaw + Math.PI, big)
}
player.onAssetHit = (item, destroyed, dmg) => {
  const P = item.group.position
  fx.burst("spark", P.x, P.y + item.kind === "tree" ? 3 : 2, P.z, dmg > 1 ? 14 : 9)
  fx.ring(P.x, P.y + 0.2, P.z, "#e8d9b0", 2, 0.4)
  audio.clang()
  if (destroyed) {
    const reward = item.kind === "house" ? 10 : 5
    S.gold += reward
    saveGame()
    updateHUD()
    audio.hit()
    toast(`⚔ ${item.label} falls — +${reward} gold`)
    setTimeout(() => showDeedPopup(item), 500)
  } else {
    toast(`💥 ${item.label} takes the blow (${Math.max(0, item.hp)} left)`)
  }
}

const combat = new Combat({
  onVictory,
  onDefeatDamage() {
    player.playHurt()
    audio.hit()
    updateHUD()
    toast("\u2694 The guardian strikes! Gather yourself, founder.")
  },
  onRespawn() {
    $("fade").classList.add("on")
    setTimeout(() => {
      player.group.position.set(0, heightAt(0, 18), 18)
      S.hearts = MAX_HEARTS
      saveGame()
      updateHUD()
      toast("\ud83d\udea9 You awaken at the Keep fountain. Your truths remain yours.")
      $("fade").classList.remove("on")
    }, 800)
  },
  onShowTodo() {
    todo.openInBattle($("b-pane-todo"))
  },
  onHideTodo() {
    if (todo.active === "battle") todo.closeAll()
  }
})
const loaded = loadGame()
for (const f of FACTS) {
  if (!S.notes[f.id]) S.notes[f.id] = { title: f.title, text: f.text }
}
try { initVaultSync() } catch (e) {}
initTodo()

function initTodo() {
  todo.onTick((task, done) => {
    if (done && combat.open && !combat.done) {
      combat.completeByTask(task)
    }
  })
  todo.init()
  $("todo-toggle").addEventListener("click", () => {
    if (todo.active === "overlay") todo.closeOverlay()
    else if (combat.open) combat.setTab("todo")
    else todo.openOverlay()
  })
  $("todo-close").addEventListener("click", () => todo.closeOverlay())
  $("deed-create").addEventListener("click", () => {
    $("deed").classList.add("hidden")
    todo.openOverlay()
    setTimeout(() => {
      const newBtn = document.querySelector(".todo-app .ta-new")
      newBtn?.click()
      const title = document.querySelector("#qa-title")
      if (title) title.focus()
    }, 60)
  })
  $("deed-open").addEventListener("click", () => {
    $("deed").classList.add("hidden")
    todo.openOverlay()
  })
  $("deed-dismiss").addEventListener("click", () => {
    $("deed").classList.add("hidden")
    document.getElementById("game")?.requestPointerLock?.()
  })
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (todo.active === "overlay") { todo.closeOverlay(); e.stopPropagation() }
      else if (!$("deed").classList.contains("hidden")) { $("deed").classList.add("hidden"); document.getElementById("game")?.requestPointerLock?.() }
    }
  })
}

function showDeedPopup(item) {
  const isTree = item.kind === "tree"
  $("deed-icon").textContent = item.icon
  $("deed-title").textContent = isTree ? `${item.label} is felled` : `${item.label} lies in ruins`
  $("deed-text").textContent = isTree
    ? "The wood is cleared. A deed waits to be written — what shall you build, cut down, or begin in this quarter?"
    : "Bricks and beam fall to your blade. Every ruin is a question: what will you rebuild here before the quarter ends?"
  $("deed").classList.remove("hidden")
  document.exitPointerLock?.()
  audio.page()
}
const ai = initAI()
if (loaded) {
  for (const coin of getCoins().children) {
    if (S.coinsTaken[coin.userData.coinIndex]) coin.visible = false
  }
  if (S.horseUnlocked) player.horse.visible = player.mounted
}
$("audio-toggle").classList.toggle("off", !S.soundOn)
saveGame()
updateHUD()

const _beginHandler = () => {
  try { $("title")?.classList.add("hidden"); $("hud")?.classList.remove("hidden"); } catch(e){}
  try { audio.setEnabled(S.soundOn) } catch(e){}
  if (progressOf() === 0 && !loaded) {
    setTimeout(() => toast("\ud83e\udd89 The CMO Owl: \u201cRide the west lantern path first, founder — know your customer.\u201d"), 900)
  } else {
    setTimeout(() => toast(`\ud83d\udcdc Welcome back, founder. ${progressOf()}/20 truths inscribed.`), 700)
  }
};
try { $("btn-begin")?.addEventListener("click", _beginHandler); } catch(e){}
window.addEventListener("fallback-begin", _beginHandler);

$("audio-toggle").addEventListener("click", (e) => {
  S.soundOn = !S.soundOn
  audio.setEnabled(S.soundOn)
  e.currentTarget.classList.toggle("off", !S.soundOn)
  saveGame()
})

$("plan-close").addEventListener("click", () => {
  $("plan").classList.add("hidden")
  $("win-stats").innerHTML = `\ud83e\ude99 ${S.gold} gold · \ud83d\udcdc 20/20 truths · \ud83e\udede ${Object.keys(S.coinsTaken).length} coins gathered`
  $("win").classList.remove("hidden")
  audio.bigFanfare()
})
$("plan-obsidian").addEventListener("click", () => {
  savePlanToVault()
  toast("\ud83d\udcd3 The plan rests in your Obsidian vault.")
})
$("win-close").addEventListener("click", () => {
  $("win").classList.add("hidden")
  document.getElementById("game").requestPointerLock?.()
})

function progressOf() {
  return BATTLES.filter(b => S.defeated[b.id]).length
}

function updateHUD() {
  $("hud-hearts").textContent = "\u2764".repeat(Math.max(0, S.hearts)) + "\u2661".repeat(Math.max(0, MAX_HEARTS - S.hearts))
  $("hud-gold").textContent = `\ud83e\ude99 ${S.gold}`
  $("hud-progress").textContent = `\ud83d\udcdc ${progressOf()}/20`
  $("vignette").classList.toggle("low", S.hearts > 0 && S.hearts <= 2)
}

function toast(text) {
  const el = document.createElement("div")
  el.className = "toast"
  el.textContent = text
  $("toasts").appendChild(el)
  setTimeout(() => el.remove(), 4300)
}

function showCard(title, tip, ms = 6000) {
  $("coin-title").textContent = title
  $("coin-tip").textContent = tip
  $("coin-card").classList.remove("hidden")
  clearTimeout(showCard.t)
  showCard.t = setTimeout(() => $("coin-card").classList.add("hidden"), ms)
}

window.addEventListener("toast", (e) => toast(e.detail))

let lastHint = null
function setHint(text) {
  if (text === lastHint) return
  lastHint = text
  if (!text) { $("hud-hint").classList.add("hidden"); return }
  $("hud-hint").textContent = text
  $("hud-hint").classList.remove("hidden")
}

function onVictory(enemy, challenge, val) {
  if (challenge) {
    S.defeated[challenge.key] = true
    S.gold += 25
    saveGame()
    if (BOSS.challenges.every(c => S.defeated[c.key])) {
      S.bossDone = true
      saveGame()
      setTimeout(() => {
        playExecution(enemy)
        setTimeout(() => {
          const b = $("banner")
          b.classList.remove("hidden")
          b.style.animation = "none"
          void b.offsetWidth
          b.style.animation = ""
          audio.bigFanfare()
          setTimeout(() => { b.classList.add("hidden"); showPlan() }, 3300)
        }, 1600)
      }, 500)
    } else {
      toast(`\u2713 The Bull nods. Challenge ${BOSS.challenges.filter(c => S.defeated[c.key]).length}/5 endured.`)
      player.playVictory()
    }
    return
  }

  const battle = enemy.battle
  S.defeated[battle.id] = true
  S.gold += 10
  saveGame()
  setTimeout(() => playExecution(enemy), 450)
  audio.fanfare()
  updateHUD()
  toast("\ud83e\ude99 +10 gold — the guardian's tribute")
  const p = progressOf()
  showCard(`\u270d Inscribed — ${battle.title}`, val.length > 140 ? val.slice(0, 140) + "\u2026" : val)
  if (p === 7 && !S.horseUnlocked) {
    S.horseUnlocked = true
    saveGame()
    setTimeout(() => toast("\ud83d\udc0e Thunder awaits at the stable! Press H to mount."), 2200)
  }
  if (p === 20) {
    setTimeout(() => toast("\ud83d\udc02 The Bull Market paws the earth at the Keep gate..."), 2400)
  }
}

let eDown = false
function isTyping() {
  const a = document.activeElement
  if (!a) return false
  const tag = a.tagName
  if (tag === "TEXTAREA" || tag === "INPUT") return true
  return false
}
window.addEventListener("keydown", (e) => {
  if (isTyping()) {
    e.stopPropagation()
    return
  }
  if (e.code === "KeyE" && !eDown) {
    eDown = true
    tryChallenge()
  }
}, true)
window.addEventListener("keyup", (e) => { if (e.code === "KeyE") eDown = false })

function tryChallenge() {
  if (combat.open || ai.isOpen() || !$("title").classList.contains("hidden")) return
  if (!$("todo").classList.contains("hidden") || !$("deed").classList.contains("hidden")) return
  const e = enemyMgr.near
  if (!e) return
  if (!e.battle) {
    const remaining = BOSS.challenges.filter(c => !S.defeated[c.key])
    if (!remaining.length) return
    const first = BOSS.challenges.filter(c => !S.defeated[c.key])[0]
    const intro = BOSS.challenges.every(c => !S.defeated[c.key])
    combat.show(e, first, intro)
    return
  }
  combat.show(e)
}

const clock = new THREE.Clock()
let coinPhase = 0
let timeScale = 1
let hitStopT = 0
let invulnT = 0
let regenT = 0
let lastHearts = S.hearts
let healT = 0

function regenTick(dt, uiOpen) {
  const lostHeart = S.hearts < lastHearts
  lastHearts = S.hearts
  const engaging = enemyMgr.engaged(player.pos) || uiOpen
  if (lostHeart || engaging || S.hearts >= MAX_HEARTS) { regenT = 0; return }
  regenT += dt
  if (regenT >= 4) {
    regenT = 0
    S.hearts = Math.min(MAX_HEARTS, S.hearts + 1)
    saveGame()
    updateHUD()
  }
}

function playExecution(enemy) {
  const P = enemy.group.position
  player.faceTowards(P.x, P.z)
  player.blockHeld = false
  timeScale = 0.3
  player.playExecute()
  setTimeout(() => { timeScale = 1 }, 430)
  setTimeout(() => {
    const hy = P.y + (enemy.type === "bull" ? 2.6 : 1.4)
    fx.slash(player.pos.x, player.pos.y + (player.mounted ? 3.6 : 2.1), player.pos.z, player.yaw + Math.PI, true)
    fx.burst("spark", P.x, hy, P.z, 36)
    fx.burst("poof", P.x, hy - 0.3, P.z, 18)
    flashWhite()
    audio.clang()
    enemyMgr.executeKill(enemy)
  }, 500)
}

function flashVignette() {
  const v = $("vignette")
  if (!v) return
  v.classList.add("on")
  clearTimeout(flashVignette.t)
  flashVignette.t = setTimeout(() => v.classList.remove("on"), 340)
}

function flashWhite() {
  const w = $("whiteflash")
  if (!w) return
  w.classList.add("on")
  clearTimeout(flashWhite.t)
  flashWhite.t = setTimeout(() => w.classList.remove("on"), 90)
}

const mmCanvas = $("minimap")
const mmCtx = mmCanvas ? mmCanvas.getContext("2d") : null
const MM_HALF = SIZE / 2
const mmBase = document.createElement("canvas")
mmBase.width = 96
mmBase.height = 96
;(function prerenderMinimap() {
  const c = mmBase.getContext("2d")
  const N = 96, cell = SIZE / N
  const zc = { village: "#b9a678", woods: "#4e7a4e", plains: "#c2ad62", highlands: "#8f7fb0" }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i + 0.5) * cell - MM_HALF, z = (j + 0.5) * cell - MM_HALF
    c.fillStyle = zc[zoneAt(x, z)] || "#7ba85c"
    c.fillRect(i, j, 1, 1)
    const h = heightAt(x, z)
    if (h > 5) { c.fillStyle = `rgba(255,255,255,${Math.min(0.3, (h - 5) / 26)})`; c.fillRect(i, j, 1, 1) }
    else if (h < 0) { c.fillStyle = `rgba(30,45,25,${Math.min(0.28, -h / 14)})`; c.fillRect(i, j, 1, 1) }
  }
  const pathLines = [
    [[0, 0], [-90, 28], [-123, 49], [-155, 69]],
    [[0, 0], [90, -25], [123, -45], [154, -64]],
    [[0, 0], [55, -98], [78, -133], [99, -168]]
  ]
  c.strokeStyle = "rgba(150,130,95,0.95)"
  c.lineWidth = 2
  c.lineCap = "round"
  for (const pl of pathLines) {
    c.beginPath()
    c.moveTo((pl[0][0] + MM_HALF) / SIZE * N, (pl[0][1] + MM_HALF) / SIZE * N)
    for (let k = 1; k < pl.length; k++) c.lineTo((pl[k][0] + MM_HALF) / SIZE * N, (pl[k][1] + MM_HALF) / SIZE * N)
    c.stroke()
  }
})()

function drawMinimap() {
  if (!mmCtx) return
  const w = mmCanvas.width
  mmCtx.clearRect(0, 0, w, w)
  mmCtx.save()
  mmCtx.beginPath()
  mmCtx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2)
  mmCtx.clip()
  mmCtx.imageSmoothingEnabled = false
  mmCtx.drawImage(mmBase, 2, 2, w - 4, w - 4)
  const toMap = (x, z) => [2 + (x + MM_HALF) / SIZE * (w - 4), 2 + (z + MM_HALF) / SIZE * (w - 4)]
  const [kx, kzz] = toMap(0, -26)
  mmCtx.fillStyle = "#3f5f8a"
  mmCtx.fillRect(kx - 3, kzz - 3, 6, 6)
  mmCtx.strokeStyle = "#e8dcc0"
  mmCtx.lineWidth = 1
  mmCtx.strokeRect(kx - 3, kzz - 3, 6, 6)
  for (const e of enemyMgr.enemies) {
    if (e.state === "gone" || e.defeatT >= 0) continue
    const [ex, ez] = toMap(e.group.position.x, e.group.position.z)
    const boss = !e.battle
    mmCtx.beginPath()
    mmCtx.arc(ex, ez, boss ? 4.5 : 2.8, 0, Math.PI * 2)
    mmCtx.fillStyle = boss ? "#8a1f1f" : "#d9452f"
    mmCtx.fill()
    if (boss) { mmCtx.strokeStyle = "#d9b45b"; mmCtx.lineWidth = 1.5; mmCtx.stroke() }
  }
  const [px, pz] = toMap(player.pos.x, player.pos.z)
  mmCtx.save()
  mmCtx.translate(px, pz)
  mmCtx.rotate(-player.yaw)
  mmCtx.beginPath()
  mmCtx.moveTo(0, -6.5)
  mmCtx.lineTo(4.6, 4.6)
  mmCtx.lineTo(0, 2.4)
  mmCtx.lineTo(-4.6, 4.6)
  mmCtx.closePath()
  mmCtx.fillStyle = "#f0c34e"
  mmCtx.fill()
  mmCtx.strokeStyle = "#3a2f1a"
  mmCtx.lineWidth = 1.2
  mmCtx.stroke()
  mmCtx.restore()
  mmCtx.restore()
}

function animate() {
  requestAnimationFrame(animate)
  const rawDt = Math.min(clock.getDelta(), 0.05)
  const t = clock.elapsedTime
  invulnT = Math.max(0, invulnT - rawDt)
  let dt = rawDt * timeScale
  if (hitStopT > 0) { hitStopT -= rawDt; dt = rawDt * 0.06 }

  player.update(rawDt)
  sun.position.set(player.pos.x - 60, player.pos.y + 80, player.pos.z + 70)
  sun.target.position.copy(player.pos)
  sun.target.updateMatrixWorld()
  const uiOpen = combat.open || ai.isOpen() || !$("title").classList.contains("hidden") || !$("plan").classList.contains("hidden") || !$("win").classList.contains("hidden") || !$("todo").classList.contains("hidden") || !$("deed").classList.contains("hidden")
  enemyMgr.update(dt, t, player, uiOpen)
  regenTick(rawDt, uiOpen)
  updateWorld(t, dt, fx)
  fx.update(rawDt)

  if (enemyMgr.shakeT > 0) {
    camera.position.x += (Math.random() - 0.5) * enemyMgr.shakeT * 1.6
    camera.position.y += (Math.random() - 0.5) * enemyMgr.shakeT * 1.2
  }

  coinPhase += dt
  const fountainDist = Math.hypot(player.pos.x, player.pos.z - 8)
  if (fountainDist < 5.5 && S.hearts > 0 && S.hearts < MAX_HEARTS) {
    healT += dt
    if (Math.random() < dt * 3) fx.emit(player.pos.x + (Math.random() - 0.5) * 1.6, player.pos.y + 0.4, player.pos.z + (Math.random() - 0.5) * 1.6, 0, 1.2, 0, 0.95, 0.85, 0.4, 0.9, 0)
    if (healT >= 2.5) {
      healT = 0
      S.hearts++
      saveGame()
      updateHUD()
      audio.coin()
      toast("\u2691 The Keep fountain restores a heart")
    }
  } else {
    healT = 0
  }
  const coins = getCoins().children
  for (const coin of coins) {
    if (!coin.visible) continue
    coin.rotation.y += dt * 2.4
    coin.position.y += Math.sin(coinPhase * 2.5 + coin.userData.coinIndex) * 0.004
    if (Math.random() < dt * 0.6) fx.emit(coin.position.x, coin.position.y, coin.position.z, 0, 0.4, 0, 1, 0.85, 0.35, 0.8, 0)
    const d = coin.position.distanceTo(player.pos)
    if (d < 2.1) {
      coin.visible = false
      const ci = coin.userData.coinIndex
      S.coinsTaken[ci] = true
      S.gold += 5
      saveGame()
      updateHUD()
      audio.coin()
      fx.burst("spark", coin.position.x, coin.position.y, coin.position.z, 10)
      const lesson = ci < COIN_LESSONS.length ? COIN_LESSONS[ci] : null
      if (lesson && !S.notes[`coin${ci}`]) {
        S.notes[`coin${ci}`] = { title: lesson.title, text: lesson.tip }
        saveGame()
        try {
          saveTip(`coin${ci}`, lesson.title, lesson.tip).catch(() => {})
        } catch (e) {}
        showCard(`\ud83e\ude99 ${lesson.title}`, lesson.tip, 7000)
      } else {
        toast("+5 gold")
      }
    } else if (d < 3.6) {
      const pull = Math.min(1, dt * 6)
      coin.position.x += (player.pos.x - coin.position.x) * pull
      coin.position.z += (player.pos.z - coin.position.z) * pull
      coin.position.y += (player.pos.y + 1.1 - coin.position.y) * pull
    }
  }

  if (!combat.open) {
    const e = enemyMgr.near
    if (e) {
      setHint(e.down ? `[ E ] Demand its answer: ${e.battle.title}` : e.battle ? `[ E ] Challenge: ${e.battle.title} (${NAMES_LABEL(e)})` : `[ E ] Face the Bull Market`)
    } else {
      const sd = player.pos.distanceTo(new THREE.Vector3(24, player.pos.y, 27))
      if (S.horseUnlocked && sd < 12 && !player.mounted) setHint("[ H ] Mount Thunder")
      else if (!S.horseUnlocked && progressOf() < 7) setHint(`Reach 7/20 truths to earn Thunder the horse (${progressOf()}/7)`)
      else if (enemyMgr.engaged(player.pos)) setHint("[ Space ] Sword · [ C ] Roll · [ RMB ] Shield")
      else setHint(null)
    }
    const z = zoneAt(player.pos.x, player.pos.z)
    const zEl = $("hud-zone")
    if (zEl.textContent !== ZONES[z]) {
      zEl.textContent = ZONES[z]
      zEl.style.opacity = 1
      clearTimeout(setHint.zt)
      setHint.zt = setTimeout(() => { zEl.style.opacity = 0 }, 2600)
    }
  } else {
    setHint(null)
  }

  drawMinimap()
  composer.render()
}

function NAMES_LABEL(e) {
  return ({ rat: "Rat Grunt", fox: "Fox Trickster", boar: "Boar Brute", wolf: "Wolf Alpha", bear: "Bear Brawler", owl: "Owl Sentinel", elder: "Elder Stag", bull: "The Bull Market" })[e.type]
}

const zElStyle = document.createElement("style")
zElStyle.textContent = "#hud-zone { transition: opacity 1s ease; }"
document.head.appendChild(zElStyle)

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  composer.setSize(innerWidth, innerHeight)
})

animate()
