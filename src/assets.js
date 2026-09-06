import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"
import { RGBELoader } from "three/addons/loaders/RGBELoader.js"
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js"

// Central asset pipeline. All art lives in /public/assets (CC0, see public/assets/CREDITS.md).
// Contract: every lookup may return null -> callers MUST fall back to their procedural builders.
// initAssets() is awaited once in main.js before buildWorld/Player/EnemyManager/FX creation.

const BASE = import.meta.env.BASE_URL || "/"

export const MANIFEST = {
  hdri: "assets/hdri/env_2k.hdr",
  terrainLayers: {
    grass: { color: "assets/textures/terrain/grass_color.jpg", normal: "assets/textures/terrain/grass_normal.jpg" },
    forest: { color: "assets/textures/terrain/forest_color.jpg", normal: "assets/textures/terrain/forest_normal.jpg" },
    dry: { color: "assets/textures/terrain/dry_color.jpg", normal: "assets/textures/terrain/dry_normal.jpg" },
    rock: { color: "assets/textures/terrain/rock_color.jpg", normal: "assets/textures/terrain/rock_normal.jpg" },
    snow: { color: "assets/textures/terrain/snow_color.jpg", normal: "assets/textures/terrain/snow_normal.jpg" },
    path: { color: "assets/textures/terrain/path_color.jpg", normal: "assets/textures/terrain/path_normal.jpg" },
  },
  models: {
    // characters (skinned, animated)
    knight: "assets/models/characters/knight.glb",
    horse: "assets/models/characters/horse.glb",
    rat: "assets/models/characters/rat.glb",
    fox: "assets/models/characters/fox.glb",
    boar: "assets/models/characters/boar.glb",
    wolf: "assets/models/characters/wolf.glb",
    bear: "assets/models/characters/bear.glb",
    owl: "assets/models/characters/owl.glb",
    elder: "assets/models/characters/elder.glb",
    bull: "assets/models/characters/bull.glb",
    deer: "assets/models/characters/deer.glb",
    chicken: "assets/models/characters/chicken.glb",
    // nature (static)
    oak: "assets/models/nature/oak.glb",
    pine: "assets/models/nature/pine.glb",
    blossom: "assets/models/nature/blossom.glb",
    bush: "assets/models/nature/bush.glb",
    rock: "assets/models/nature/rock.glb",
    stump: "assets/models/nature/stump.glb",
    tuft: "assets/models/nature/tuft.glb",
    flower: "assets/models/nature/flower.glb",
    mushroom: "assets/models/nature/mushroom.glb",
    log: "assets/models/nature/log.glb",
    // village (static)
    house_a: "assets/models/village/house_a.glb",
    house_b: "assets/models/village/house_b.glb",
    keep: "assets/models/village/keep.glb",
    well: "assets/models/village/well.glb",
    stable: "assets/models/village/stable.glb",
    tent: "assets/models/village/tent.glb",
    crate: "assets/models/village/crate.glb",
    barrel: "assets/models/village/barrel.glb",
    fence: "assets/models/village/fence.glb",
    lantern: "assets/models/village/lantern.glb",
  },
}

// Canonical clip names the game code asks for: idle, walk, run, attacks[], roll, death, jump, victory
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
function classifyClip(name) {
  const n = norm(name)
  if (/(attack|slash|punch|kick|bite|smash|swing)/.test(n)) return "attacks"
  if (/(gallop|run|sprint)/.test(n)) return "run"
  if (/walk/.test(n)) return "walk"
  if (/idle/.test(n) || /^breath/.test(n)) return "idle"
  if (/(roll|dodge)/.test(n)) return "roll"
  if (/(death|die|dead)/.test(n)) return "death"
  if (/jump/.test(n)) return "jump"
  if (/(wave|victory|celebrate|dance)/.test(n)) return "victory"
  if (/(hurt|hit|pain)/.test(n)) return "hurt"
  return null
}

function canonicalize(clips) {
  const map = { idle: null, walk: null, run: null, roll: null, death: null, jump: null, victory: null, hurt: null, attacks: [] }
  for (const c of clips || []) {
    const k = classifyClip(c.name)
    if (!k) continue
    if (k === "attacks") map.attacks.push(c)
    else if (!map[k]) map[k] = c
  }
  map.attacks.sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
  // horse-style packs: if no walk but run exists, degrade gracefully at call sites
  return map
}

function loadWithFallback(promise) {
  return promise.catch((e) => {
    console.warn("[assets] load failed:", e?.message || e)
    return null
  })
}

export class Assets {
  constructor() {
    this.env = null // PMREM environment texture (or null -> RoomEnvironment fallback)
    this.gltfs = {} // name -> { scene, clips: canonicalMap, animations }
    this.terrain = null // { layer: {color, normal} } or null
    this.missing = []
    this.ready = false
  }

  gltf(name) { return this.gltfs[name] || null }

  // Fresh clone (skeleton-safe for skinned meshes). Null if asset missing.
  model(name) {
    const g = this.gltfs[name]
    if (!g) return null
    return SkeletonUtils.clone(g.scene)
  }

  // Canonical clip map {idle, walk, run, attacks[], roll, death, ...} or null
  clips(name) {
    const g = this.gltfs[name]
    return g ? g.clips : null
  }

  report() {
    const total = Object.keys(MANIFEST.models).length + 1 + 1
    const got = Object.keys(this.gltfs).length + (this.env ? 1 : 0) + (this.terrain ? 1 : 0)
    return { loaded: got, total, missing: this.missing.slice() }
  }
}

export async function initAssets(renderer, onProgress) {
  const A = new Assets()
  const manager = new THREE.LoadingManager()
  const gltfLoader = new GLTFLoader(manager)
  const draco = new DRACOLoader(manager)
  draco.setDecoderPath(`${BASE}libs/draco/`)
  gltfLoader.setDRACOLoader(draco)
  const rgbeLoader = new RGBELoader(manager)
  const texLoader = new THREE.TextureLoader(manager)
  texLoader.setCrossOrigin("anonymous")

  let done = 0
  let total = 0
  const tick = () => { done++; try { onProgress?.(done, Math.max(total, done), done / Math.max(total, done)) } catch (e) {} }

  const items = []
  // HDRI environment
  items.push({ kind: "hdri", url: MANIFEST.hdri })
  // Terrain PBR layers
  for (const [key, layer] of Object.entries(MANIFEST.terrainLayers)) {
    items.push({ kind: "terrColor", url: layer.color, key })
    items.push({ kind: "terrNormal", url: layer.normal, key })
  }
  // Models
  for (const [name, url] of Object.entries(MANIFEST.models)) items.push({ kind: "gltf", url, name })
  total = items.length

  const terrain = {}
  let terrAny = false

  await Promise.all(items.map(async (item) => {
    if (item.kind === "hdri") {
      const tex = await loadWithFallback(new Promise((res, rej) => rgbeLoader.load(item.url, res, undefined, rej)))
      tick()
      if (tex) {
        const pmrem = new THREE.PMREMGenerator(renderer)
        pmrem.compileEquirectangularShader()
        A.env = pmrem.fromEquirectangular(tex).texture
        pmrem.dispose()
        tex.dispose()
      } else A.missing.push("hdri")
      return
    }
    if (item.kind === "terrColor" || item.kind === "terrNormal") {
      const t = await loadWithFallback(new Promise((res, rej) => texLoader.load(item.url, res, undefined, rej)))
      tick()
      if (t) {
        if (item.kind === "terrColor") {
          t.colorSpace = THREE.SRGBColorSpace
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          terrain[item.key] = terrain[item.key] || {}
          terrain[item.key].color = t
        } else {
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          terrain[item.key] = terrain[item.key] || {}
          terrain[item.key].normal = t
        }
        terrAny = true
      } else A.missing.push(item.key)
      return
    }
    const g = await loadWithFallback(new Promise((res, rej) => gltfLoader.load(item.url, res, undefined, rej)))
    tick()
    if (g) {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
          o.frustumCulled = true
        }
      })
      A.gltfs[item.name] = { scene: g.scene, animations: g.animations || [], clips: canonicalize(g.animations || []) }
    } else A.missing.push(item.name)
  }))

  A.terrain = terrAny ? terrain : null
  A.ready = true
  try { onProgress?.(total, total, 1) } catch (e) {}
  if (A.missing.length) console.warn("[assets] missing (procedural fallback active):", A.missing.join(", "))
  return A
}
