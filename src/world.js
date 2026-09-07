import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

export const SIZE = 400
const HALF = SIZE / 2

// ---- GLTF asset integration (null-safe: every branch falls back to procedural) ----
let ASSETS = null
const fitCache = {}
/** Cached bbox of a loaded model: {minY, sx, sy, sz} or null when missing. */
function gltfFit(name) {
  if (fitCache[name] !== undefined) return fitCache[name]
  const g = ASSETS && ASSETS.gltf(name)
  if (!g) return (fitCache[name] = null)
  const bb = new THREE.Box3().setFromObject(g.scene)
  const sz = bb.getSize(new THREE.Vector3())
  return (fitCache[name] = { minY: bb.min.y, sx: sz.x || 1, sy: sz.y || 1, sz: sz.z || 1 })
}
/** Plant GLTF tree clones at spots; returns false when model missing (caller uses procedural). */
function plantTrees(parent, spots, name, targetH, sMin = 0.9, sMax = 1.4) {
  const proto = ASSETS && ASSETS.model(name)
  if (!proto) return false
  const f = gltfFit(name)
  for (const p of spots) {
    const t = proto.clone()
    const s = (targetH / (f ? f.sy : targetH)) * (sMin + Math.random() * (sMax - sMin))
    t.scale.setScalar(s)
    t.position.set(p.x, p.y - (f ? f.minY * s : 0), p.z)
    t.rotation.y = Math.random() * Math.PI * 2
    t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    parent.add(t)
  }
  return true
}

// Batch planting: ONE InstancedMesh per (species, sub-mesh) — low draw calls,
// tiny vertex memory, same tri count as clones. Instances span the map, so the
// mesh itself is never frustum-culled; vertex cost is trivial for these trees.
function plantTreesMerged(parent, spots, name, targetH, sMin = 0.9, sMax = 1.4) {
  const proto = ASSETS && ASSETS.model(name)
  if (!proto) return false
  const f = gltfFit(name)
  proto.updateMatrixWorld(true)
  const rel = proto.matrixWorld.clone().invert()
  const parts = []
  proto.traverse((o) => { if (o.isMesh) parts.push(o) })
  const N = spots.length
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3()
  for (const mesh of parts) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    const im = new THREE.InstancedMesh(geo, mesh.material, N)
    const local = mesh.matrixWorld.clone().premultiply(rel)
    spots.forEach((p, i) => {
      const s = (targetH / (f ? f.sy : targetH)) * (sMin + Math.random() * (sMax - sMin))
      E.set(0, Math.random() * Math.PI * 2, 0)
      Q.setFromEuler(E)
      V.set(p.x, p.y - (f ? f.minY * s : 0), p.z)
      S.setScalar(s)
      M.compose(V, Q, S).multiply(local)
      im.setMatrixAt(i, M)
    })
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.frustumCulled = false
    parent.add(im)
  }
  return true
}

const DIRS = {
  woods: new THREE.Vector2(-1, 0.32).normalize(),
  plains: new THREE.Vector2(1, -0.28).normalize(),
  highlands: new THREE.Vector2(0.34, -0.94).normalize()
}

const FLATS = [
  { x: 0, z: 0, r: 60, k: 0 },
  { x: -90, z: 28, r: 13, k: null },
  { x: -123, z: 49, r: 13, k: null },
  { x: -155, z: 69, r: 13, k: null },
  { x: 90, z: -25, r: 13, k: null },
  { x: 123, z: -45, r: 13, k: null },
  { x: 154, z: -64, r: 13, k: null },
  { x: 55, z: -98, r: 13, k: null },
  { x: 78, z: -133, r: 13, k: null },
  { x: 99, z: -168, r: 13, k: null },
  { x: -80, z: -6, r: 12, k: null },
  { x: 161, z: -100, r: 11, k: null },
  { x: 25, z: -68, r: 10, k: null },
  { x: 128, z: -16, r: 10, k: null }
]

export const BATTLE_SPOTS = [
  { zone: "woods", x: -90, z: 28 }, { zone: "woods", x: -123, z: 49 }, { zone: "woods", x: -155, z: 69 },
  { zone: "plains", x: 90, z: -25 }, { zone: "plains", x: 123, z: -45 }, { zone: "plains", x: 154, z: -64 },
  { zone: "highlands", x: 55, z: -98 }, { zone: "highlands", x: 78, z: -133 }, { zone: "highlands", x: 99, z: -168 }
]

export const SPECIALS = { pond: FLATS[10], windmill: FLATS[13], stream: FLATS[11], summit: FLATS[12] }

function h0(x, z) {
  let h = 3.2 * Math.sin(x * 0.0288) * Math.cos(z * 0.032)
    + 1.9 * Math.sin(x * 0.072 + 1.3) * Math.cos(z * 0.0608 + 0.6)
    + 5.5 * Math.sin(x * 0.0128 + 2.1) * Math.cos(z * 0.0144 + 1.0)
  const w = Math.max(0, (z + 37.5) / 150)
  h += 7 * w * w
  const s = Math.max(0, (-x - 62.5) / 100) * Math.max(0, (z - 12.5) / 87.5)
  h += 5 * s * s
  return h
}

/** Find the destructible asset in front of a point and hit it. */
export function hitAssetAt(px, pz, fwx, fwz, reach = 3.6) {
  let best = null, bestD = 1e9
  for (const it of DESTRUCTIBLES) {
    if (it.done || it.destT >= 0) continue
    const dx = it.x - px, dz = it.z - pz
    const d = Math.hypot(dx, dz)
    if (d > reach) continue
    const dot = (dx / (d || 1)) * fwx + (dz / (d || 1)) * fwz
    if (dot < 0.55) continue
    if (d < bestD) { bestD = d; best = it }
  }
  if (!best) return null
  const destroyed = hitDestroyable(best)
  return { item: best, destroyed }
}

const pathPts = []
const smooth = (a, b, t) => a + (b - a) * t * t * (3 - 2 * t)

function buildPaths() {
  const P = (v) => Array.isArray(v) ? v : [v.x, v.z]
  const mk = (a, b, c, d) => {
    ;[a, b, c, d] = [P(a), P(b), P(c), P(d)]
    for (let t = 0; t <= 1; t += 1 / 16) {
      const mt = 1 - t
      const x = mt * mt * mt * a[0] + 3 * mt * mt * t * b[0] + 3 * mt * t * t * c[0] + t * t * t * d[0]
      const zz = mt * mt * mt * a[1] + 3 * mt * mt * t * b[1] + 3 * mt * t * t * c[1] + t * t * t * d[1]
      pathPts.push({ x, z: zz, h: h0(x, zz) })
    }
  }
  mk([-25, 8], [-44, 14], [-68, 19], FLATS[1])
  mk(FLATS[1], [-106, 34], [-113, 43], FLATS[2])
  mk(FLATS[2], [-135, 55], [-144, 63], FLATS[3])
  mk([25, -6], [45, -13], [68, -19], FLATS[4])
  mk(FLATS[4], [105, -33], [114, -39], FLATS[5])
  mk(FLATS[5], [135, -51], [144, -58], FLATS[6])
  mk([11, -25], [25, -49], [39, -74], FLATS[6 + 1])
  mk(FLATS[6 + 1], [63, -113], [69, -123], FLATS[6 + 2])
  mk(FLATS[6 + 2], [84, -149], [90, -159], FLATS[6 + 3])
}

buildPaths()

export function heightAt(x, z) {
  let h = h0(x, z)
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z)
    if (d < f.r) {
      const t = smooth(0, 1, 1 - d / f.r)
      const target = f.k !== undefined && f.k !== null ? f.k : h0(f.x, f.z)
      h = h * (1 - t) + target * t
    }
  }
  const R = 4.6
  for (const p of pathPts) {
    const dx = x - p.x, dz = z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 < R * R) {
      const t = smooth(0, 1, 1 - Math.sqrt(d2) / R)
      h = h * (1 - t * 0.92) + p.h * t * 0.92
    }
  }
  return h
}

export function zoneAt(x, z) {
  if (Math.hypot(x, z) < 62) return "village"
  let best = "woods", bd = -Infinity
  for (const k of ["woods", "plains", "highlands"]) {
    const d = (x * DIRS[k].x + z * DIRS[k].y) / Math.max(20, Math.hypot(x, z))
    if (d > bd) { bd = d; best = k }
  }
  return best
}

let windMats = []
const anims = { banners: [], blades: [], fireflies: null, butterflies: [], birds: [], clouds: [], smokeTimer: 0, fountainTimer: 0, destroying: [], destroySmoke: [] }
let coinsGroup = null

export function getCoins() { return coinsGroup }

// ---- destructible assets (houses, trees) ----
const DESTRUCTIBLES = []
export function getDestroyables() { return DESTRUCTIBLES }

function registerDestroyable(parent, group, { kind, label, icon = "🌳", hp = 1, rx = 2.2, rz = 2.2 }) {
  const y = group.position.y
  const item = {
    id: "a" + DESTRUCTIBLES.length + Date.now().toString(36),
    kind, label, icon,
    group, parent,
    x: group.position.x, y, z: group.position.z,
    hp, maxHp: hp, done: false,
    hitT: 0, destT: -1, rx, rz
  }
  DESTRUCTIBLES.push(item)
  return item
}

function makeRuins(item) {
  const g = new THREE.Group()
  const stoneCols = ["#8d8a80", "#9b9484", "#7d786c"]
  const woodCols = ["#6b4a30", "#7a5a3d", "#8a6a44"]
  const blocks = []
  const isWood = item.kind === "tree" || item.kind === "barrel" || item.kind === "stall" || item.kind === "hay"
  const n = item.kind === "house" ? 7 : isWood ? 3 : 2
  const cols = isWood ? woodCols : stoneCols
  for (let i = 0; i < n; i++) {
    const m = box(0.4 + Math.random() * 0.7, 0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.7, cols[i % cols.length])
    m.position.set((Math.random() - 0.5) * item.rx, 0.15, (Math.random() - 0.5) * item.rz)
    m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4)
    g.add(m)
    blocks.push(m)
  }
  if (item.kind === "tree") {
    const stM = ASSETS && ASSETS.model("stump")
    if (stM) {
      const f = gltfFit("stump")
      const s = f ? 1.3 / f.sy : 1
      stM.scale.setScalar(s)
      stM.position.y = f ? -f.minY * s : 0.35
      g.add(stM)
    } else {
      const stump = cyl(0.4, 0.62, 0.7, "#6b4a30", {}, 7)
      stump.position.set(0, 0.35, 0)
      g.add(stump)
    }
  }
  g.position.set(item.x, item.y, item.z)
  g.visible = false
  item.parent.add(g)
  return { group: g, blocks }
}

/** Reduce an asset's hp; returns true the frame it falls. */
export function hitDestroyable(item, dirX = 0, dirZ = 0) {
  if (!item || item.done || item.destT >= 0) return false
  item.hp -= 1
  item.hitT = 0.18
  if (item.hp <= 0) {
    item.done = true
    item.destT = 0
    const ruins = makeRuins(item)
    anims.destroying.push({ item, ruins, t: 0, dur: item.kind === "tree" ? 0.7 : 0.9, dirX, dirZ })
    return true
  }
  return false
}

const windChunk = `
uniform float uTime;
vec3 wind(vec3 p, float strength){
  float s = sin(uTime*1.6 + p.x*0.35 + p.z*0.3) * 0.5 + sin(uTime*2.7 + p.x*0.7) * 0.25;
  float f = max(position.y, 0.0);
  p.x += s * strength * f * f * 0.06;
  p.z += cos(uTime*1.3 + p.z*0.4) * strength * f * f * 0.04;
  return p;
}`

function windify(mat, strength = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }
    sh.vertexShader = sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n transformed = wind(transformed, ${strength.toFixed(2)});`
    ).replace("void main() {", windChunk + "\nvoid main() {")
    mat.userData.shader = sh
    windMats.push(sh.uniforms.uTime)
  }
  mat.needsUpdate = true
}

function groundMat() {
  const N = 512
  const c = document.createElement("canvas")
  c.width = c.height = N
  const ctx = c.getContext("2d")
  const img = ctx.createImageData(N, N)
  const lat = new Float32Array(N * N)
  for (let i = 0; i < lat.length; i++) lat[i] = Math.random()
  const val = (x, y) => {
    const xi = Math.floor(x) & (N - 1), yi = Math.floor(y) & (N - 1)
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const x1 = (xi + 1) & (N - 1), y1 = (yi + 1) & (N - 1)
    const a = lat[yi * N + xi], b = lat[yi * N + x1]
    const d = lat[y1 * N + xi], e = lat[y1 * N + x1]
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v
  }
  const H = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = val(x / 9, y / 9) * 0.45 + val(x / 3.5 + 41, y / 3.5 + 87) * 0.33 + val(x / 1.7 + 133, y / 1.7 + 12) * 0.22
      H[y * N + x] = n
      const i = (y * N + x) * 4
      let g = 224 + (n - 0.5) * 34
      const r = Math.random()
      if (r > 0.982) g -= 34
      else if (r < 0.008) g += 20
      else if (r > 0.972 && r <= 0.982) g -= 12
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(56, 56)
  tex.colorSpace = THREE.SRGBColorSpace
  const nc = document.createElement("canvas")
  nc.width = nc.height = N
  const nctx = nc.getContext("2d")
  const nimg = nctx.createImageData(N, N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hl = H[y * N + ((x - 1 + N) % N)], hr = H[y * N + ((x + 1) % N)]
      const hd = H[((y - 1 + N) % N) * N + x], hu = H[((y + 1) % N) * N + x]
      const nx = (hl - hr) * 2.4, nz = (hd - hu) * 2.4
      const i = (y * N + x) * 4
      nimg.data[i] = Math.round((nx * 0.5 + 0.5) * 255)
      nimg.data[i + 1] = Math.round((nz * 0.5 + 0.5) * 255)
      nimg.data[i + 2] = 255
      nimg.data[i + 3] = 255
    }
  }
  nctx.putImageData(nimg, 0, 0)
  const ntex = new THREE.CanvasTexture(nc)
  ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping
  ntex.repeat.set(56, 56)
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: tex, normalMap: ntex, normalScale: new THREE.Vector2(0.6, 0.6) })
}

// ---- terrain splat material (PBR layers from assets; per-vertex weights aw0/aw1) ----
let neutralCTex = null, neutralNTex = null
function makeNeutralTex(isNormal) {
  const d = isNormal ? new Uint8Array([128, 128, 255, 255]) : new Uint8Array([128, 128, 128, 255])
  const t = new THREE.DataTexture(d, 1, 1)
  t.needsUpdate = true
  return t
}
const SPLAT_TILES = { grass: 0.55, forest: 0.5, dry: 0.45, rock: 0.35, snow: 0.5, path: 0.4 }
function splatGroundMat() {
  const L = ASSETS.terrain || {}
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  if (!neutralCTex) { neutralCTex = makeNeutralTex(false); neutralNTex = makeNeutralTex(true) }
  const uni = {}
  for (const k of Object.keys(SPLAT_TILES)) {
    const l = L[k] || {}
    uni["uC" + k] = { value: l.color || neutralCTex }
    uni["uN" + k] = { value: l.normal || neutralNTex }
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni)
    sh.vertexShader = `
      attribute vec4 aw0; attribute vec4 aw1;
      varying vec4 vW0; varying vec4 vW1; varying vec3 vWPos; varying vec3 vWN;
    ` + sh.vertexShader
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vW0 = aw0; vW1 = aw1;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        vWN = normalize(mat3(modelMatrix) * objectNormal);`)
    sh.fragmentShader = `
      uniform sampler2D uCgrass; uniform sampler2D uCforest; uniform sampler2D uCdry;
      uniform sampler2D uCrock; uniform sampler2D uCsnow; uniform sampler2D uCpath;
      uniform sampler2D uNgrass; uniform sampler2D uNforest; uniform sampler2D uNdry;
      uniform sampler2D uNrock; uniform sampler2D uNsnow; uniform sampler2D uNpath;
      varying vec4 vW0; varying vec4 vW1; varying vec3 vWPos; varying vec3 vWN;
    ` + sh.fragmentShader
      .replace("#include <color_fragment>", `
        vec3 splatC = texture2D(uCgrass, vWPos.xz * 0.55).rgb * vW0.x;
        splatC += texture2D(uCforest, vWPos.xz * 0.5).rgb * vW0.y;
        splatC += texture2D(uCdry, vWPos.xz * 0.45).rgb * vW0.z;
        splatC += texture2D(uCrock, vWPos.xz * 0.35).rgb * vW0.w;
        splatC += texture2D(uCsnow, vWPos.xz * 0.5).rgb * vW1.x;
        splatC += texture2D(uCpath, vWPos.xz * 0.4).rgb * vW1.y;
        diffuseColor.rgb *= splatC * mix(vec3(1.0), vColor * 1.9, 0.55);`)
      .replace("#include <normal_fragment_maps>", ``)
  }
  return m
}

// ---- water: shared upgraded material (scrolling procedural noise normals + vertex ripple) ----
let waveTexA = null, waveTexB = null
function waveNormalTex(seed) {
  const N = 256
  const cv = document.createElement("canvas")
  cv.width = cv.height = N
  const x = cv.getContext("2d")
  const img = x.createImageData(N, N)
  const rnd = new Float32Array(N * N)
  let s = seed
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
  for (let i = 0; i < rnd.length; i++) rnd[i] = rand()
  const val = (lx, ly) => {
    const xi = Math.floor(lx) & 255, yi = Math.floor(ly) & 255
    const xf = lx - Math.floor(lx), yf = ly - Math.floor(ly)
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const x1 = (xi + 1) & 255, y1 = (yi + 1) & 255
    const a = rnd[yi * N + xi], b = rnd[yi * N + x1], c = rnd[y1 * N + xi], d = rnd[y1 * N + x1]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const H = new Float32Array(N * N)
  for (let yy = 0; yy < N; yy++) {
    for (let xx = 0; xx < N; xx++) {
      H[yy * N + xx] = val(xx / 32, yy / 32) * 0.55 + val(xx / 16, yy / 16) * 0.3 + val(xx / 8, yy / 8) * 0.15
    }
  }
  for (let yy = 0; yy < N; yy++) {
    for (let xx = 0; xx < N; xx++) {
      const hl = H[yy * N + ((xx - 1 + N) % N)], hr = H[yy * N + ((xx + 1) % N)]
      const hd = H[((yy - 1 + N) % N) * N + xx], hu = H[((yy + 1) % N) * N + xx]
      const nx = (hl - hr) * 2.2, nz = (hd - hu) * 2.2
      const i = (yy * N + xx) * 4
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255)
      img.data[i + 1] = Math.round((nz * 0.5 + 0.5) * 255)
      img.data[i + 2] = 255
      img.data[i + 3] = 255
    }
  }
  x.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
function waterMat(color) {
  if (!waveTexA) { waveTexA = waveNormalTex(1234567); waveTexB = waveNormalTex(7654321) }
  const m = new THREE.MeshStandardMaterial({
    color: "#3f7d9c", transparent: true, opacity: 0.9, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.4
  })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }
    sh.uniforms.uWaveA = { value: waveTexA }
    sh.uniforms.uWaveB = { value: waveTexB }
    sh.vertexShader = "uniform float uTime;\nvarying vec2 vWUv; varying vec3 vWNw;\n" + sh.vertexShader
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.y += (sin(transformed.x * 0.85 + uTime * 1.8) + cos(transformed.z * 1.05 + uTime * 1.35)) * 0.022;
        vWUv = (modelMatrix * vec4(transformed, 1.0)).xz;
        vWNw = normalize(mat3(modelMatrix) * objectNormal);`)
    sh.fragmentShader = "uniform float uTime; uniform sampler2D uWaveA; uniform sampler2D uWaveB;\nvarying vec2 vWUv; varying vec3 vWNw;\n" + sh.fragmentShader
      .replace("#include <normal_fragment_maps>", `
        vec2 wUvA = vWUv * 0.24 + vec2(uTime * 0.031, uTime * 0.022);
        vec2 wUvB = vWUv * 0.15 - vec2(uTime * 0.018, uTime * 0.027);
        vec3 wNa = texture2D(uWaveA, wUvA).xyz * 2.0 - 1.0;
        vec3 wNb = texture2D(uWaveB, wUvB).xyz * 2.0 - 1.0;
        vec3 wNs = normalize(wNa + wNb);
        vec3 wNw = normalize(vWNw);
        vec3 wTw = normalize(cross(vec3(0.0, 0.0, 1.0), wNw) + vec3(0.001, 0.0, 0.0));
        vec3 wBw = cross(wNw, wTw);
        normal = normalize(wTw * wNs.x + wBw * wNs.y + wNw * max(wNs.z, 0.4));`)
    windMats.push(sh.uniforms.uTime)
  }
  return m
}

const texCache = {}
function tex(name, draw, rep = 3) {
  if (!texCache[name]) {
    const c = document.createElement("canvas")
    c.width = c.height = 512
    draw(c.getContext("2d"), 512)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rep, rep)
    texCache[name] = t
  }
  return texCache[name]
}
function boxTex(w, h, d, color, name, draw, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { map: tex(name, draw), ...opts }))
  m.castShadow = true; m.receiveShadow = true
  return m
}
function coneTex(r, h, color, name, draw, seg = 16, opts = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color, { map: tex(name, draw, 6), ...opts }))
  m.castShadow = true
  return m
}

const D_plaster = (x, s) => {
  const u = s / 128
  x.fillStyle = "#f0e6ca"; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 120; i++) {
    x.fillStyle = `rgba(120,95,60,${0.05 + Math.random() * 0.08})`
    x.fillRect(Math.random() * s, Math.random() * s, (4 + Math.random() * 9) * u, 1.5 * u)
  }
  x.fillStyle = "rgba(255,250,235,0.5)"
  for (let i = 0; i < 42; i++) x.fillRect(Math.random() * s, Math.random() * s, (20 + Math.random() * 30) * u, 2 * u)
  x.strokeStyle = "rgba(96,78,52,0.35)"
  x.lineWidth = 0.9 * u
  for (let i = 0; i < 5; i++) {
    const sx = Math.random() * s, sy = Math.random() * s
    x.beginPath()
    x.moveTo(sx, sy)
    x.bezierCurveTo(sx + (Math.random() - 0.5) * 30 * u, sy + 12 * u, sx + (Math.random() - 0.5) * 40 * u, sy + 26 * u, sx + (Math.random() - 0.5) * 44 * u, sy + 40 * u)
    x.stroke()
  }
}
const D_shingle = (x, s) => {
  const u = s / 128
  x.fillStyle = "#6b4a30"; x.fillRect(0, 0, s, s)
  const rows = 12, cols = 4
  for (let r = 0; r < rows; r++) {
    for (let ccol = 0; ccol < cols; ccol++) {
      const ox = (ccol * (s / cols)) + (r % 2 ? s / (cols * 2) : 0)
      const oy = r * (s / rows)
      const broken = Math.random() < 0.05
      x.fillStyle = `hsl(${26 + Math.floor(Math.random() * 8)}, 38%, ${34 + Math.random() * 14}%)`
      x.beginPath()
      if (broken) {
        const cut = ox + (s / cols) * (0.35 + Math.random() * 0.45)
        x.moveTo(ox + 1, oy + s / rows - 3)
        x.lineTo(cut, oy + s / rows - 3)
        x.lineTo(cut, oy + s / rows - 1)
        x.lineTo(ox + 1, oy + s / rows - 1)
      } else {
        x.moveTo(ox + 1, oy + s / rows - 3)
        x.quadraticCurveTo(ox + (s / cols) / 2, oy - 3, ox + (s / cols) - 1, oy + s / rows - 3)
        x.lineTo(ox + (s / cols) - 1, oy + s / rows - 1)
        x.lineTo(ox + 1, oy + s / rows - 1)
      }
      x.closePath(); x.fill()
      x.fillStyle = "rgba(255,235,200,0.10)"
      x.fillRect(ox + 2, oy + 2, (s / cols) - 4, 1.5 * u)
      x.fillStyle = "rgba(20,12,6,0.25)"
      x.fillRect(ox + 1, oy + s / rows - 2, (s / cols) - 2, 1.5 * u)
    }
  }
}
const D_stone = (x, s) => {
  const u = s / 128
  x.fillStyle = "#9a9484"; x.fillRect(0, 0, s, s)
  const w = s / 6, hgt = s / 6
  for (let r = 0; r < 6; r++) {
    for (let ccol = 0; ccol < 6; ccol++) {
      const ox = ccol * w + (r % 2 ? w / 2 : 0)
      const moss = Math.random() < 0.09
      x.fillStyle = moss ? `hsl(${70 + Math.random() * 20}, ${12 + Math.random() * 10}%, ${38 + Math.random() * 10}%)` : `hsl(${34}, ${8 + Math.random() * 7}%, ${52 + Math.random() * 16}%)`
      x.fillRect(ox + 2 * u, r * hgt + 2 * u, w - 4 * u, hgt - 4 * u)
      x.fillStyle = "rgba(255,250,240,0.16)"
      x.fillRect(ox + 2 * u, r * hgt + 2 * u, w - 4 * u, 1.5 * u)
      x.fillStyle = "rgba(40,34,26,0.3)"
      x.fillRect(ox + 2 * u, (r + 1) * hgt - 2.5 * u, w - 4 * u, 1.5 * u)
    }
    x.fillStyle = "rgba(40,34,26,0.4)"
    x.fillRect(0, r * hgt, s, 2 * u)
  }
}
const D_timber = (x, s) => {
  const u = s / 128
  x.fillStyle = "#5d4630"; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(35,22,10,${0.25 + Math.random() * 0.5})`
    x.lineWidth = (1 + Math.random() * 2) * u
    x.beginPath()
    const y0 = Math.random() * s
    x.moveTo(0, y0)
    x.quadraticCurveTo(s / 2, y0 + (Math.random() - 0.5) * 8 * u, s, Math.random() * s)
    x.stroke()
  }
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * s, ky = Math.random() * s
    for (let ring = 3; ring > 0; ring--) {
      x.strokeStyle = `rgba(30,18,8,${0.3 + ring * 0.1})`
      x.lineWidth = u
      x.beginPath()
      x.ellipse(kx, ky, ring * 2.4 * u, ring * 3.4 * u, 0, 0, Math.PI * 2)
      x.stroke()
    }
  }
}

export function buildWorld(scene, A = null) {
  ASSETS = A || null
  for (const k of Object.keys(fitCache)) delete fitCache[k]
  grassPts.length = 0
  grassChunks.length = 0
  windMats = []
  const g = new THREE.Group()
  scene.add(g)

  buildTerrain(g)
  buildSky(scene)
  buildVillage(g)
  buildWoods(g)
  buildPlains(g)
  buildHighlands(g)
  buildPathsDeco(g)
  buildRoadDeco(g)
  buildProps(g)
  buildCoins(g)
  buildAmbient(g)
  buildSiteMarkers(g)
  finishGrass(g)

  return { anims }
}

function buildTerrain(parent) {
  const seg = 512
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const aw0 = new Float32Array(pos.count * 4)
  const aw1 = new Float32Array(pos.count * 4)
  const cGrass = new THREE.Color("#7ba85c")
  const cWoods = new THREE.Color("#4e8a52")
  const cPlains = new THREE.Color("#c2ad62")
  const cHigh = new THREE.Color("#8f7fb0")
  const cHigh2 = new THREE.Color("#79a061")
  const cVillage = new THREE.Color("#b9a678")
  const cPathEdge = new THREE.Color("#8a8264")
  const cPathCore = new THREE.Color("#c3b48d")
  const cSnow = new THREE.Color("#f2f0ea")
  const cRock = new THREE.Color("#8a8378")
  const cLush = new THREE.Color("#5f9a4a")
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, h)
    const dist = Math.hypot(x, z)
    const wWoods = Math.max(0, (x * DIRS.woods.x + z * DIRS.woods.y) / 90) * Math.min(1, dist / 70)
    const wPlains = Math.max(0, (x * DIRS.plains.x + z * DIRS.plains.y) / 90) * Math.min(1, dist / 70)
    const wHigh = Math.max(0, (x * DIRS.highlands.x + z * DIRS.highlands.y) / 90) * Math.min(1, dist / 70)
    c.copy(cGrass)
    c.lerp(cWoods, Math.min(1, wWoods))
    c.lerp(cPlains, Math.min(1, wPlains * 0.9))
    c.lerp(cHigh, Math.min(1, wHigh * 0.75))
    c.lerp(cHigh2, Math.min(1, wHigh * 0.4))
    if (dist < 62) c.lerp(cVillage, 1 - dist / 62)
    const slope = Math.abs(heightAt(x + 1.5, z) - heightAt(x - 1.5, z)) + Math.abs(heightAt(x, z + 1.5) - heightAt(x, z - 1.5))
    const rockT = Math.min(1, Math.max(0, (slope - 0.85) / 2.4))
    c.lerp(cRock, rockT * 0.85)
    const lushT = Math.min(0.5, Math.max(0, (0.55 - slope) / 1.6) * (0.6 + 0.4 * wWoods))
    c.lerp(cLush, lushT)
    let pd = Infinity
    for (const p of pathPts) { const d2 = (x - p.x) ** 2 + (z - p.z) ** 2; if (d2 < pd) pd = d2 }
    const pdist = Math.sqrt(pd)
    if (pdist < 10.5) {
      const edgeT = Math.min(0.7, Math.max(0, (10.5 - pdist) / 3.6) * 0.75)
      const coreT = Math.min(0.9, Math.max(0, (6 - pdist) / 4.6) * 0.95)
      c.lerp(cPathEdge, edgeT)
      c.lerp(cPathCore, coreT)
    }
    for (const wf of [FLATS[10], FLATS[11]]) {
      const dw = Math.hypot(x - wf.x, z - wf.z)
      if (dw < wf.r + 7) {
        const wetT = 1 - dw / (wf.r + 7)
        const damp = wetT * wetT
        c.offsetHSL(0, 0.03 * damp, -0.05 * damp)
      }
    }
    let snowT = 0
    if (h > 9.5) {
      const patch = Math.sin(x * 0.55 + Math.cos(z * 0.43) * 2.2) * Math.cos(z * 0.61 + Math.sin(x * 0.37) * 1.9) + Math.sin(x * 0.19) * Math.cos(z * 0.23) * 0.7
      snowT = Math.min(1, Math.max(0, (h - 9.5) / 5.2 + patch * 0.22))
      c.lerp(cSnow, snowT)
    }
    const mot = Math.sin(x * 0.11 + 3.1) * Math.cos(z * 0.13 + 1.7) + Math.sin(x * 0.31) * Math.cos(z * 0.27) * 0.5
    c.offsetHSL(0.008 * mot, 0.05 * mot, 0.045 * mot)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    // splat weights (mirror of the tint logic above; normalized to sum 1)
    let edgeT2 = 0, coreT2 = 0
    if (pdist < 10.5) {
      edgeT2 = Math.min(0.7, Math.max(0, (10.5 - pdist) / 3.6) * 0.75)
      coreT2 = Math.min(0.9, Math.max(0, (6 - pdist) / 4.6) * 0.95)
    }
    let wForest = Math.min(1, wWoods) * 0.9 + lushT * 0.6 + Math.min(1, wHigh) * 0.3
    let wDry = Math.min(1, wPlains * 0.9) * 0.85
    if (dist < 62) wDry += (1 - dist / 62) * 0.8
    let wRock = rockT * 0.85 + Math.min(1, wHigh) * 0.35
    const wSnow = snowT
    const wPath = Math.max(edgeT2, coreT2)
    let wGrass = 1 - (wForest + wDry + wRock + wSnow + wPath)
    if (wGrass < 0.02) wGrass = 0.02
    const wSum = wGrass + wForest + wDry + wRock + wSnow + wPath
    aw0[i * 4] = wGrass / wSum; aw0[i * 4 + 1] = wForest / wSum; aw0[i * 4 + 2] = wDry / wSum; aw0[i * 4 + 3] = wRock / wSum
    aw1[i * 4] = wSnow / wSum; aw1[i * 4 + 1] = wPath / wSum
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.setAttribute("aw0", new THREE.BufferAttribute(aw0, 4))
  geo.setAttribute("aw1", new THREE.BufferAttribute(aw1, 4))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, ASSETS && ASSETS.terrain ? splatGroundMat() : groundMat())
  mesh.receiveShadow = true
  parent.add(mesh)

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(HALF - 4, HALF + 120, 48, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: "#20301f" })
  )
  rim.position.y = -0.4
  parent.add(rim)
}

function buildSky(scene) {
  const useShaderSky = !!scene.userData.useSkyShader
  if (!useShaderSky) {
    const geo = new THREE.SphereGeometry(560, 24, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color("#7fa7d9") }, mid: { value: new THREE.Color("#f2c9a0") }, bot: { value: new THREE.Color("#f7dcb0") } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ vec3 n = normalize(vP); float h = n.y;
          vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h)) : mix(bot, mid, smoothstep(-0.1, 0.18, h));
          float haze = 1.0 - smoothstep(0.0, 0.3, abs(h + 0.02));
          c = mix(c, vec3(0.96, 0.88, 0.72), haze * 0.5);
          float sg = pow(max(dot(n, normalize(vec3(-0.55, 0.33, 0.72))), 0.0), 24.0);
          c += sg * vec3(0.55, 0.42, 0.22);
          float warm = pow(max(dot(n, normalize(vec3(-0.55, 0.33, 0.72))), 0.0), 3.0);
          c += warm * vec3(0.1, 0.055, 0.02) * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.45, h)));
          gl_FragColor = vec4(c, 1.0); }`
    })
    scene.add(new THREE.Mesh(geo, mat))

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(26, 16, 16),
      new THREE.MeshBasicMaterial({ color: "#fff3cf" })
    )
    sun.position.set(-200, 190, 262)
    scene.add(sun)

    const glowCv = document.createElement("canvas")
    glowCv.width = 128; glowCv.height = 128
    const gctx = glowCv.getContext("2d")
    const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    grad.addColorStop(0, "rgba(255,244,214,0.9)")
    grad.addColorStop(0.35, "rgba(255,220,150,0.38)")
    grad.addColorStop(1, "rgba(255,210,140,0)")
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, 128, 128)
    const glowTex = new THREE.CanvasTexture(glowCv)
    glowTex.colorSpace = THREE.SRGBColorSpace
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: "#ffedb8", transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }))
    glow.scale.set(240, 240, 1)
    glow.position.copy(sun.position)
    scene.add(glow)

    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: "#ffd9a0", transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }))
    halo2.scale.set(520, 520, 1)
    halo2.position.copy(sun.position)
    scene.add(halo2)

    const halo3 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: "#ffcf90", transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }))
    halo3.scale.set(900, 900, 1)
    halo3.position.copy(sun.position)
    scene.add(halo3)
  }

  // Billboard clouds: soft radial-gradient sprites (kept even when Sky shader is active)
  const clCv = document.createElement("canvas")
  clCv.width = 128; clCv.height = 128
  const clx = clCv.getContext("2d")
  const clGrad = clx.createRadialGradient(64, 64, 6, 64, 64, 62)
  clGrad.addColorStop(0, "rgba(255,250,240,0.95)")
  clGrad.addColorStop(0.55, "rgba(250,242,228,0.5)")
  clGrad.addColorStop(1, "rgba(248,238,220,0)")
  clx.fillStyle = clGrad
  clx.fillRect(0, 0, 128, 128)
  const clTex = new THREE.CanvasTexture(clCv)
  clTex.colorSpace = THREE.SRGBColorSpace
  for (let i = 0; i < 20; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: clTex, color: "#fff8ec", transparent: true, opacity: 0.4 + Math.random() * 0.22,
      depthWrite: false, fog: false
    }))
    const cs = 60 + Math.random() * 95
    sp.scale.set(cs, cs * (0.4 + Math.random() * 0.22), 1)
    sp.position.set((Math.random() - 0.5) * 640, 100 + Math.random() * 85, (Math.random() - 0.5) * 640)
    sp.userData.spd = 1.5 + Math.random() * 2
    anims.clouds.push(sp)
    scene.add(sp)
  }
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02, ...opts })
}

function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts))
  m.castShadow = true; m.receiveShadow = true
  return m
}

function cyl(rt, rb, h, color, opts = {}, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts))
  m.castShadow = true; m.receiveShadow = true
  return m
}

function banner(color) {
  const geo = new THREE.PlaneGeometry(2.6, 3.6, 16, 10)
  geo.translate(0, -1.8, 0)
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))
  m.castShadow = true
  anims.banners.push(m)
  return m
}

function house(parent, x, z, ry, w = 7, d = 6, h = 4.5, roofColor = "#9a5a3c") {
  const gr = new THREE.Group()
  let y = heightAt(x, z)
  if (!Number.isFinite(y)) y = 0
  const footing = boxTex(w + 0.9, 0.6, d + 0.9, "#8d8a80", "stone", D_stone)
  footing.position.y = 0.3
  gr.add(footing)
  const plinth = boxTex(w + 0.4, 0.2, d + 0.4, "#9b9484", "stone", D_stone)
  plinth.position.y = 0.65
  gr.add(plinth)
  const body = boxTex(w, h, d, "#f2e6c8", "plaster", D_plaster)
  body.position.y = h / 2 + 0.35
  gr.add(body)
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      const corner = boxTex(0.32, h, 0.32, "#5d4630", "stone", D_stone)
      corner.position.set(cx * (w / 2 - 0.12), h / 2 + 0.35, cz * (d / 2 - 0.12))
      gr.add(corner)
    }
  }
  for (const vx of [-1, 1]) {
    const beam = box(0.22, h, 0.22, "#5d4630")
    beam.position.set(vx * w * 0.22, h / 2 + 0.35, d / 2 + 0.02)
    gr.add(beam)
    const beam2 = beam.clone(); beam2.position.z = -d / 2 - 0.02
    gr.add(beam2)
  }
  const braceL = box(0.14, 1.15, 0.12, "#5d4630")
  braceL.position.set(-1.35, 1.95, d / 2 + 0.04)
  braceL.rotation.z = -Math.PI / 4
  gr.add(braceL)
  const braceR = braceL.clone()
  braceR.position.x = 1.35
  braceR.rotation.z = Math.PI / 4
  gr.add(braceR)
  const braceBL = box(0.14, 1.15, 0.12, "#5d4630")
  braceBL.position.set(-w * 0.36, 1.95, d / 2 + 0.04)
  braceBL.rotation.z = -Math.PI / 4
  gr.add(braceBL)
  const braceBR = braceBL.clone()
  braceBR.position.x = w * 0.36
  braceBR.rotation.z = Math.PI / 4
  gr.add(braceBR)
  const braceBL2 = braceBL.clone()
  braceBL2.position.set(-w * 0.36, 1.95, -d / 2 - 0.04)
  braceBL2.rotation.y = Math.PI
  gr.add(braceBL2)
  const braceBR2 = braceBR.clone()
  braceBR2.position.set(w * 0.36, 1.95, -d / 2 - 0.04)
  braceBR2.rotation.y = Math.PI
  gr.add(braceBR2)
  const hbeam = box(w, 0.22, 0.24, "#5d4630")
  hbeam.position.set(0, h * 0.62 + 0.35, d / 2 + 0.03)
  gr.add(hbeam)
  const door = boxTex(1.4, 2.2, 0.15, "#6d4a2f", "timber", D_timber, {})
  door.position.set(0, 1.45, d / 2 + 0.06)
  gr.add(door)
  for (const hy of [0.75, 1.75]) {
    const hinge = box(1.05, 0.09, 0.05, "#3f3122")
    hinge.position.set(0, hy, d / 2 + 0.16)
    gr.add(hinge)
  }
  const handle = box(0.09, 0.26, 0.06, "#c9a24a")
  handle.position.set(0.5, 1.5, d / 2 + 0.17)
  gr.add(handle)
  for (const sx of [-1, 1]) {
    const strap = box(0.18, 0.06, 0.05, "#3f3122")
    strap.position.set(sx * 0.6, 1.4, d / 2 + 0.17)
    gr.add(strap)
  }
  for (const sx of [-1, 1]) {
    const stud = box(0.05, 0.05, 0.06, "#c9a24a")
    stud.position.set(sx * 0.62, 1.06, d / 2 + 0.19)
    stud.rotation.y = 0.4
    gr.add(stud)
    const stud2 = stud.clone()
    stud2.position.y = 1.74
    gr.add(stud2)
  }
  for (let ai = 0; ai < 5; ai++) {
    const a = Math.PI * (0.2 + (ai / 4) * 0.6)
    const archStone = boxTex(0.34, 0.34, 0.24, "#9b9484", "stone", D_stone)
    archStone.position.set(Math.cos(a) * 0.95, 2.62 + Math.sin(a) * 0.42, d / 2 + 0.1)
    archStone.rotation.z = a - Math.PI / 2
    gr.add(archStone)
  }
  const keystone = boxTex(0.26, 0.42, 0.26, "#a89e8c", "stone", D_stone)
  keystone.position.set(0, 3.06, d / 2 + 0.11)
  gr.add(keystone)
  const stoop = boxTex(2.4, 0.12, 0.9, "#8d8a80", "stone", D_stone)
  stoop.position.set(0, 0.06, d / 2 + 0.7)
  gr.add(stoop)
  for (let ci = 0; ci < 2; ci++) {
    const crack = box(0.03, 0.9 + Math.random() * 0.5, 0.02, "#a8996f")
    crack.position.set(ci ? w * 0.28 : -w * 0.22, 1.6 + Math.random(), d / 2 + 0.005)
    crack.rotation.z = (Math.random() - 0.5) * 0.5
    gr.add(crack)
  }
  for (const wx of [-w / 3, w / 3]) {
    const frame = box(1.32, 1.22, 0.1, "#5d4630")
    frame.position.set(wx, 2.75, d / 2 + 0.04)
    gr.add(frame)
    const win = box(1.1, 1, 0.12, "#8fb4c9", { emissive: "#3d5a70", emissiveIntensity: 0.4 })
    win.position.set(wx, 2.75, d / 2 + 0.09)
    gr.add(win)
    const mullV = box(0.07, 1, 0.04, "#5d4630")
    mullV.position.set(wx, 2.75, d / 2 + 0.16)
    gr.add(mullV)
    const mullH = box(1.1, 0.07, 0.04, "#5d4630")
    mullH.position.set(wx, 2.75, d / 2 + 0.16)
    gr.add(mullH)
    for (const sd of [-1, 1]) {
      const shutter = box(0.5, 1.15, 0.08, "#7c5637")
      shutter.position.set(wx + sd * 0.95, 2.75, d / 2 + 0.07)
      gr.add(shutter)
    }
    const wbox = boxTex(1.5, 0.2, 0.28, "#7a5228", "timber", D_timber)
    wbox.position.set(wx, 2.08, d / 2 + 0.18)
    gr.add(wbox)
    for (let fi = 0; fi < 3; fi++) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(["#e79ab5", "#f2d98a", "#c94f43"][fi]))
      flower.position.set(wx - 0.45 + fi * 0.45, 2.24, d / 2 + 0.18)
      flower.castShadow = true
      gr.add(flower)
      const stem = box(0.02, 0.1, 0.02, "#4e7a44")
      stem.position.set(wx - 0.45 + fi * 0.45, 2.16, d / 2 + 0.18)
      gr.add(stem)
    }
  }
  const chim = box(0.9, 2.4, 0.9, "#8d7a6a")
  chim.position.set(w / 3, h + 1.95, -d / 4)
  gr.add(chim)
  for (const by of [h + 1.1, h + 2.3]) {
    const band = box(0.98, 0.14, 0.98, "#7d6a5c")
    band.position.set(w / 3, by, -d / 4)
    gr.add(band)
  }
  const chimCap = boxTex(1.3, 0.16, 1.3, "#8d8a80", "stone", D_stone)
  chimCap.position.set(w / 3, h + 3.06, -d / 4)
  gr.add(chimCap)
  const soot = box(0.5, 0.1, 0.5, "#2a221a")
  soot.position.set(w / 3, h + 3.16, -d / 4)
  gr.add(soot)
  const pot1 = cyl(0.26, 0.3, 0.34, "#b5704a", {}, 8)
  pot1.position.set(w / 3, h + 3.3, -d / 4)
  gr.add(pot1)
  const pot2 = cyl(0.18, 0.23, 0.26, "#a2603f", {}, 8)
  pot2.position.set(w / 3, h + 3.58, -d / 4)
  gr.add(pot2)
  chim.userData.smoke = true
  anims.smokeSrc = anims.smokeSrc || []
  anims.smokeSrc.push(new THREE.Vector3(x + w / 3, y + h + 3.9, z - d / 4))
  const roofR = Math.max(w, d) * 0.82
  const roof1 = coneTex(roofR, 2.1, roofColor, "shingle", D_shingle, 10)
  roof1.position.y = h + 0.4 + 1.05
  roof1.rotation.y = Math.PI / 4
  gr.add(roof1)
  const eave = boxTex(w + 1.1, 0.12, d + 1.1, new THREE.Color(roofColor).offsetHSL(0, 0.04, -0.12), "timber", D_timber, {})
  eave.position.y = h + 0.4 + 0.06
  gr.add(eave)
  const roof2 = coneTex(roofR * 0.64, 1.9, new THREE.Color(roofColor).offsetHSL(0, 0.03, -0.09), "shingle", D_shingle, 10)
  roof2.position.y = h + 0.4 + 2.1 + 0.85
  roof2.rotation.y = Math.PI / 4
  gr.add(roof2)
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 8), mat("#5d4630"))
  finial.position.y = h + 0.4 + 4.95
  gr.add(finial)
  const finBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat("#c9a53f"))
  finBall.position.y = h + 0.4 + 5.05
  finBall.castShadow = true
  gr.add(finBall)
  gr.position.set(x, y, z)
  gr.rotation.y = ry
  parent.add(gr)
  return gr
}

function lantern(parent, x, z) {
  let y = heightAt(x, z)
  if (!Number.isFinite(y)) y = 0
  const gr = new THREE.Group()
  const lm = ASSETS && ASSETS.model("lantern")
  let lightX = 0, lightY = 3.02
  if (lm) {
    const f = gltfFit("lantern")
    const s = f ? 3.2 / f.sy : 1
    lm.scale.setScalar(s)
    lm.position.y = f ? -f.minY * s : 0
    gr.add(lm)
    lightY = f ? f.sy * s * 0.82 : 2.9
  } else {
    const lbase = boxTex(0.5, 0.3, 0.5, "#8d8a80", "stone", D_stone)
    lbase.position.y = 0.15
    gr.add(lbase)
    const post = cyl(0.09, 0.13, 3.2, "#4a3826")
    post.position.y = 1.6
    gr.add(post)
    const arm = box(0.7, 0.1, 0.1, "#4a3826")
    arm.position.set(0.3, 3.2, 0)
    gr.add(arm)
    lightX = 0.58
  }
  const bulbMat = new THREE.MeshStandardMaterial({ color: "#ffd98a", emissive: "#ffb84d", emissiveIntensity: 1.2, roughness: 0.4, side: THREE.DoubleSide })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), bulbMat)
  bulb.position.set(lightX, lightY, 0)
  gr.add(bulb)
  if (!lm) {
    for (let pi = 0; pi < 8; pi++) {
      const a = (pi / 8) * Math.PI * 2 + 0.4
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.32), bulbMat)
      pane.position.set(lightX + Math.cos(a) * 0.19, lightY, Math.sin(a) * 0.19)
      pane.rotation.y = Math.PI / 2 - a
      gr.add(pane)
    }
    for (let bi = 0; bi < 4; bi++) {
      const a = (bi / 4) * Math.PI * 2 + 0.4 + Math.PI / 8
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6), mat("#3a2c1c"))
      cage.position.set(lightX + Math.cos(a) * 0.2, lightY, Math.sin(a) * 0.2)
      gr.add(cage)
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 8), mat("#3a2c1c"))
    cap.position.set(lightX, lightY + 0.26, 0)
    gr.add(cap)
  }
  const glow = new THREE.PointLight("#ffb35c", 0.5, 14, 2)
  glow.position.copy(bulb.position)
  gr.add(glow)
  anims.lanterns = anims.lanterns || []
  anims.lanterns.push({ light: glow, bulb: bulbMat, ph: Math.random() * Math.PI * 2 })
  gr.position.set(x, y, z)
  parent.add(gr)
}

function buildVillage(parent) {
  const v = new THREE.Group()
  parent.add(v)

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(26, 40).rotateX(-Math.PI / 2), mat("#b7a37b"))
  plaza.position.y = 0.03
  plaza.receiveShadow = true
  v.add(plaza)

  const keep = new THREE.Group()
  const keepM = ASSETS && ASSETS.model("keep")
  if (keepM) {
    const f = gltfFit("keep")
    const s = f ? Math.min(24 / f.sx, 13.5 / f.sz) : 1
    keepM.scale.setScalar(s)
    keepM.position.y = f ? -f.minY * s : 0
    keep.add(keepM)
    // boss gate stays procedural so anims.gateDoors (20/20 mechanic) is preserved
    const frontZ = f ? (f.sz * s) / 2 + 0.15 : 6.3
    const doorFrame = boxTex(6, 6.5, 1, "#6e685c", "stone", D_stone)
    doorFrame.position.set(0, 3.25, frontZ)
    keep.add(doorFrame)
    const doorL = boxTex(1.9, 5.6, 0.4, "#4a3626", "timber", D_timber)
    doorL.position.set(-0.95, 2.8, frontZ)
    keep.add(doorL)
    const doorR = doorL.clone()
    doorR.position.x = 0.95
    keep.add(doorR)
    anims.gateDoors = [doorL, doorR]
    for (const px of [-1, 0, 1]) {
      const port = box(0.09, 5.4, 0.09, "#3f3122")
      port.position.set(px * 1.5, 2.9, frontZ - 0.35)
      keep.add(port)
    }
  } else {
  const base = boxTex(20, 9, 12, "#e8e0cd", "stone", D_stone)
  base.position.y = 4.5
  keep.add(base)
  const skirt = boxTex(20.7, 1.1, 12.7, "#8d8a80", "stone", D_stone)
  skirt.position.y = 0.55
  keep.add(skirt)
  for (const tx of [-1, 1]) {
    for (const tz of [-1, 1]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 10.5, 12), mat("#efe8d6", { map: tex("stone", D_stone, 4) }))
      turret.position.set(tx * 9.4, 5.25, tz * 5.4)
      turret.castShadow = true; turret.receiveShadow = true
      keep.add(turret)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.7, 10), mat("#33507c"))
      cap.position.set(tx * 9.4, 11.35, tz * 5.4)
      cap.castShadow = true
      keep.add(cap)
    }
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.42, 8, 18, Math.PI), mat("#c9bfa4"))
  arch.position.set(0, 3.25, 6.35)
  keep.add(arch)
  const keystone = boxTex(0.44, 0.62, 0.5, "#a89e8c", "stone", D_stone)
  keystone.position.set(0, 6.5, 6.35)
  keep.add(keystone)
  const cren = new THREE.Group()
  for (let i = 0; i < 18; i++) {
    const t = box(0.92, 1.1, 1.2, "#ded5c0")
    t.position.set(-8.6 + i * 1.01, 9.55 + (i % 2) * 0.12, -6 + (i % 2) * 0.14)
    cren.add(t)
    const t2 = t.clone(); t2.position.z = 6 - (i % 2) * 0.14
    cren.add(t2)
  }
  keep.add(cren)
  const roof = coneTex(9, 4.5, "#3f5f8a", "shingle", D_shingle, 12)
  roof.position.y = 13.5
  roof.rotation.y = Math.PI / 4
  keep.add(roof)
  for (const tx of [-12, 12]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 15, 14), mat("#efe8d6", { map: tex("stone", D_stone, 4) }))
    tower.position.set(tx, 7.5, 0)
    tower.castShadow = true; tower.receiveShadow = true
    keep.add(tower)
    const tr = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 14), mat("#33507c"))
    tr.position.set(tx, 17.5, 0)
    tr.castShadow = true
    keep.add(tr)
    const trRim = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.5, 14), mat("#8d8a80"))
    trRim.position.set(tx, 15.1, 0)
    trRim.castShadow = true
    keep.add(trRim)
    for (const by of [5, 10]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.06, 3.06, 0.28, 16), mat("#8d8a80"))
      band.position.set(tx, by, 0)
      keep.add(band)
    }
    for (const sy of [6.5, 9.5]) {
      const slit = box(0.14, 1.3, 0.1, "#241c14")
      slit.position.set(tx, sy, 2.98)
      keep.add(slit)
    }
    const b1 = banner("#2f5b9d")
    b1.position.set(tx - 3.1, 12.5, 0)
    b1.rotation.y = Math.PI / 2
    keep.add(b1)
    const b2 = banner("#2f5b9d")
    b2.position.set(tx + 3.1, 12.5, 0)
    b2.rotation.y = -Math.PI / 2
    keep.add(b2)
  }
  const doorFrame = boxTex(6, 6.5, 1, "#6e685c", "stone", D_stone)
  doorFrame.position.set(0, 3.25, 6.2)
  keep.add(doorFrame)
  const doorL = boxTex(1.9, 5.6, 0.4, "#4a3626", "timber", D_timber)
  doorL.position.set(-0.95, 2.8, 6.2)
  keep.add(doorL)
  const doorR = doorL.clone()
  doorR.position.x = 0.95
  keep.add(doorR)
  for (let bi = 0; bi < 5; bi++) {
    const bar = box(0.12, 5.2, 0.1, "#3f3122")
    bar.position.set(-1.6 + bi * 0.8, 2.7, 5.85)
    keep.add(bar)
  }
  for (const hy of [1.2, 3.9]) {
    const hbar = box(3.9, 0.12, 0.1, "#3f3122")
    hbar.position.set(0, hy, 5.85)
    keep.add(hbar)
  }
  anims.gateDoors = [doorL, doorR]
  for (const px of [-1, 0, 1]) {
    const port = box(0.09, 5.4, 0.09, "#3f3122")
    port.position.set(px * 1.5, 2.9, 5.9)
    keep.add(port)
  }
  for (const wx of [-6.5, -3.2, 3.2, 6.5]) {
    const win = box(1.3, 1.7, 0.14, "#8fb4c9", { emissive: "#3d5a70", emissiveIntensity: 0.55 })
    win.position.set(wx, 5.6, 6.25)
    keep.add(win)
    const sill = box(1.5, 0.14, 0.24, "#c9bfa4")
    sill.position.set(wx, 4.68, 6.25)
    keep.add(sill)
    const mulV = box(0.08, 1.7, 0.05, "#5d4630")
    mulV.position.set(wx, 5.6, 6.34)
    keep.add(mulV)
    const mulH = box(1.3, 0.08, 0.05, "#5d4630")
    mulH.position.set(wx, 5.6, 6.34)
    keep.add(mulH)
  }
  const flagPole = cyl(0.07, 0.07, 3.4, "#5d4630")
  flagPole.position.set(0, 17.2, 0)
  keep.add(flagPole)
  const keepFlag = banner("#b03a30")
  keepFlag.scale.set(0.6, 0.6, 1)
  keepFlag.position.set(1, 18.4, 0)
  keepFlag.rotation.y = Math.PI / 2
  keep.add(keepFlag)
  }
  keep.position.set(0, 0, -26)
  keep.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  v.add(keep)

  const fountain = new THREE.Group()
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1, 20), mat("#cfc4ac", { map: tex("stone", D_stone, 6) }))
  basin.position.y = 0.5
  basin.castShadow = true; basin.receiveShadow = true
  fountain.add(basin)
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.1, 24).rotateX(-Math.PI / 2), waterMat("#5fa8c9"))
  water.position.y = 0.95
  water.userData.baseY = 0.95
  fountain.add(water)
  anims.fountainWater = water
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 12), mat("#cfc4ac", { map: tex("stone", D_stone, 3) }))
  pillar.position.y = 2
  pillar.castShadow = true; pillar.receiveShadow = true
  fountain.add(pillar)
  const basin2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.45, 18), mat("#c4b89e", { map: tex("stone", D_stone, 4) }))
  basin2.position.y = 3.2
  basin2.castShadow = true; basin2.receiveShadow = true
  fountain.add(basin2)
  const spout = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14), mat("#a89e8c"))
  spout.position.y = 3.55
  spout.rotation.x = Math.PI / 2
  fountain.add(spout)
  const topknot = cyl(0.12, 0.18, 0.6, "#cfc4ac", {}, 8)
  topknot.position.y = 3.85
  fountain.add(topknot)
  fountain.position.set(0, 0, 8)
  anims.fountainPos = new THREE.Vector3(0, 2.6, 8)
  v.add(fountain)

  const houseDefs = [
    [-16, -6, 0.4, 8, 7, 5, "#9a5a3c", "Cottage of Dilnoza"],
    [17, -4, -0.5, 7, 6, 4.5, "#a5663f", "The Chalk House"],
    [-20, 16, 1.1, 6.5, 5.5, 4, "#8f5c40", "The Robin's Rest"],
    [21, 14, -1.2, 7.5, 6, 4.5, "#9a5a3c", "Founder's Board"],
    [-8, 30, 2.6, 6, 5, 4, "#a5663f", "The East Gatehouse"],
    [9, 31, -2.4, 6, 5, 4, "#8f5c40", "The Lantern House"],
    [-30, 2, 0.9, 6.5, 5.5, 4.2, "#9a5a3c", "The Old Merchant's Home"]
  ]
  let hi = 0
  for (const [hx, hz, hry, hw, hd, hh, hrc, label] of houseDefs) {
    const hname = hi % 2 ? "house_b" : "house_a"
    const hm = ASSETS && ASSETS.model(hname)
    let gr
    if (hm) {
      const f = gltfFit(hname)
      const s = f ? Math.min((hw + 1.2) / f.sx, (hd + 1.2) / f.sz) : 1
      hm.scale.setScalar(s)
      hm.position.y = f ? -f.minY * s : 0
      const hy = heightAt(hx, hz)
      gr = new THREE.Group()
      gr.add(hm)
      gr.position.set(hx, hy, hz)
      gr.rotation.y = hry
      gr.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      v.add(gr)
      anims.smokeSrc = anims.smokeSrc || []
      anims.smokeSrc.push(new THREE.Vector3(hx + hw / 3, hy + (f ? f.sy * s : hh + 3.6), hz - hd / 4))
    } else {
      gr = house(v, hx, hz, hry, hw, hd, hh, hrc)
    }
    registerDestroyable(v, gr, { kind: "house", label, icon: "🏠", hp: 2, rx: hw, rz: hd })
    hi++
  }

  for (let i = 0; i < 2; i++) {
    const stall = new THREE.Group()
    const tentM = ASSETS && ASSETS.model("tent")
    if (tentM) {
      const f = gltfFit("tent")
      const s = f ? Math.min(3.6 / f.sx, 3 / f.sz) : 1
      tentM.scale.setScalar(s)
      tentM.position.y = f ? -f.minY * s : 0
      stall.add(tentM)
    } else {
    const top = box(3.4, 0.2, 2, "#8a6a44")
    top.position.y = 1.5
    stall.add(top)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4, 6, 3), new THREE.MeshLambertMaterial({ color: i ? "#b04a3e" : "#3f6f4f", side: THREE.DoubleSide }))
    cloth.position.set(0, 2.9, -0.6)
    cloth.rotation.x = -0.35
    stall.add(cloth)
    anims.banners.push(cloth)
    for (const px of [-1.6, 1.6]) {
      const pole = cyl(0.08, 0.08, 3.1, "#5d4630")
      pole.position.set(px, 1.55, -0.6)
      stall.add(pole)
    }
    const crateM = ASSETS && ASSETS.model("crate")
    for (const px of [-0.9, 0, 0.9]) {
      if (crateM) {
        const cf = gltfFit("crate")
        const cs = cf ? 0.7 / cf.sy : 1
        const cr = crateM.clone()
        cr.scale.setScalar(cs)
        cr.position.set(px, cf ? -cf.minY * cs : 0, 0)
        cr.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        stall.add(cr)
        continue
      }
      const crate = box(0.7, 0.6, 0.7, i ? "#c98a3f" : "#b8483e")
      crate.position.set(px, 1.95, 0)
      stall.add(crate)
      for (const sy of [1.81, 2.09]) {
        const slat = box(0.68, 0.09, 0.04, "#7a5228")
        slat.position.set(px, sy, 0.37)
        stall.add(slat)
      }
    }
    const goodsCols = i ? ["#c94f43", "#e8c25a", "#7fa85c"] : ["#e8c25a", "#c94f43", "#8fb4c9"]
    for (let gi = 0; gi < 12; gi++) {
      const gx = -1.15 + (gi % 6) * 0.46, gz = 0.5 + (gi >= 6 ? 0.4 : 0)
      if (gi % 4 === 3) {
        const mini = box(0.22, 0.16, 0.22, gi % 2 ? "#c98a3f" : "#b8483e")
        mini.position.set(gx, 1.68, gz)
        stall.add(mini)
        const lid = box(0.24, 0.03, 0.24, "#7a5228")
        lid.position.set(gx, 1.78, gz)
        stall.add(lid)
      } else if (gi % 4 === 2) {
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(gi % 2 ? "#d8bd6e" : "#c9a878"))
        sack.scale.y = 0.8
        sack.position.set(gx, 1.66, gz)
        sack.castShadow = true
        stall.add(sack)
      } else {
        const good = new THREE.Mesh(new THREE.SphereGeometry(0.13 + (gi % 2) * 0.04, 10, 8), mat(goodsCols[gi % 3]))
        good.position.set(gx, 1.68, gz)
        good.castShadow = true
        stall.add(good)
      }
    }
    }
    stall.position.set(i ? 8 : -8, 0, 20)
    stall.rotation.y = i ? -0.5 : 0.5
    stall.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    v.add(stall)
    registerDestroyable(v, stall, { kind: "stall", label: i ? "The Crimson Stall" : "The Green Stall", icon: "⛺", hp: 1, rx: 2.4, rz: 1.8 })
  }

  const board = new THREE.Group()
  const post1 = cyl(0.12, 0.12, 2.6, "#5d4630")
  post1.position.set(-1.2, 1.3, 0)
  board.add(post1)
  const post2 = post1.clone()
  post2.position.x = 1.2
  board.add(post2)
  const panel = box(3, 1.6, 0.14, "#7a5c3a")
  panel.position.y = 2
  board.add(panel)
  for (let pi = 0; pi < 5; pi++) {
    const paper = box(0.7, 0.9, 0.05, "#f3e8cc")
    paper.position.set(-0.9 + pi * 0.45, 2 + (pi % 2 ? -0.1 : 0.05), 0.1)
    paper.rotation.z = (pi % 2 ? -1 : 1) * (0.06 + pi * 0.02)
    board.add(paper)
    const pin = box(0.05, 0.05, 0.03, "#8a6a44")
    pin.position.set(paper.position.x, paper.position.y + 0.38, 0.14)
    board.add(pin)
  }
  for (const nx of [-1.35, 1.35]) {
    for (const ny of [1.4, 2.6]) {
      const nail = box(0.04, 0.04, 0.06, "#c9a24a")
      nail.position.set(nx, ny, 0.1)
      board.add(nail)
    }
  }
  board.position.set(4.5, 0, 27)
  board.rotation.y = -0.4
  v.add(board)

  const stable = new THREE.Group()
  const stableM = ASSETS && ASSETS.model("stable")
  if (stableM) {
    const f = gltfFit("stable")
    const s = f ? Math.min(8 / f.sx, 6.5 / f.sz) : 1
    stableM.scale.setScalar(s)
    stableM.position.y = f ? -f.minY * s : 0
    stable.add(stableM)
  } else {
  const sBase = boxTex(7.5, 0.5, 6, "#8d8a80", "stone", D_stone)
  sBase.position.y = 0.25
  stable.add(sBase)
  const sb = boxTex(7, 3.4, 5.5, "#d9c9a4", "plaster", D_plaster)
  sb.position.y = 1.7
  stable.add(sb)
  const sr = coneTex(4.6, 2.4, "#7c5637", "shingle", D_shingle, 10)
  sr.position.y = 4.6
  sr.rotation.y = Math.PI / 4
  stable.add(sr)
  const sdoor = boxTex(2.4, 2.6, 0.15, "#6d4a2f", "timber", D_timber)
  sdoor.position.set(0, 1.3, 2.8)
  stable.add(sdoor)
  for (let hi = 0; hi < 3; hi++) {
    const hay = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), mat("#d8bd6e"))
    hay.scale.y = 0.5
    hay.position.set(-0.6 + hi * 0.62, 0.42, 1.3)
    stable.add(hay)
  }
  const rack = new THREE.Group()
  for (const rz of [-0.7, 0.7]) {
    const rpost = box(0.13, 1.9, 0.13, "#5d4630")
    rpost.position.set(0, 0.95, rz)
    rack.add(rpost)
  }
  const rbar = box(0.11, 0.11, 1.6, "#5d4630")
  rbar.position.y = 1.9
  rack.add(rbar)
  for (const ry2 of [-0.45, 0.45]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 6, 12, Math.PI), mat("#8a6a44"))
    ring.position.set(0, 1.62, ry2)
    ring.rotation.x = 0.35
    ring.rotation.z = Math.PI
    rack.add(ring)
  }
  rack.position.set(4.3, 0, 0)
  stable.add(rack)
  }
  stable.position.set(24, 0, 24)
  stable.rotation.y = -0.8
  v.add(stable)
  anims.stablePos = new THREE.Vector3(24, 0, 27)

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3
    lantern(v, Math.cos(a) * 30, Math.sin(a) * 30 + 4)
  }

  const sigil = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#caa64a" }))
  sigil.position.set(0, 0.05, 8)
  v.add(sigil)

  const gseeds = []
  let g3 = 0
  while (gseeds.length < 480 && g3++ < 9000) {
    const a = Math.random() * Math.PI * 2
    const r = 26 + Math.random() * 32
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 4
    if (Math.hypot(x, z) > 60 || Math.hypot(x, z) < 27) continue
    if (Math.hypot(x - 24, z - 24) < 7) continue
    if (Math.hypot(x, z + 26) < 16) continue
    gseeds.push({ x, z, y: heightAt(x, z) })
  }
  instanced(parent, new THREE.PlaneGeometry(0.16, 0.7, 1, 2).translate(0, 0.35, 0),
    (() => { const m = mat("#7fa85c", { side: THREE.DoubleSide }); windify(m, 1.2); return m })(),
    gseeds.map(p => ({ ...p, s: 0.8 + Math.random() * 0.8 })), { shadow: false })
}

function instanced(parent, geo, material, positions, opts = {}) {
  const im = new THREE.InstancedMesh(geo, material, positions.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const tint = new THREE.Color()
  positions.forEach((p, i) => {
    e.set(0, p.ry || Math.random() * Math.PI * 2, 0)
    q.setFromEuler(e)
    const s = p.s || 1
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, p.sy || s, s))
    im.setMatrixAt(i, m)
    tint.setRGB(1, 1, 1)
    tint.offsetHSL((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.16)
    im.setColorAt(i, tint)
  })
  if (im.instanceColor) im.instanceColor.needsUpdate = true
  im.castShadow = opts.shadow !== false
  im.receiveShadow = true
  parent.add(im)
  return im
}

function scatter(count, zone, minDist = 45, maxDist = 195, near = null, spread = 30) {
  const out = []
  let guard = 0
  while (out.length < count && guard++ < count * 40) {
    let x, z
    if (near) { x = near.x + (Math.random() - 0.5) * spread; z = near.z + (Math.random() - 0.5) * spread }
    else { x = (Math.random() - 0.5) * (maxDist * 2); z = (Math.random() - 0.5) * (maxDist * 2) }
    const d = Math.hypot(x, z)
    if (d < minDist || d > maxDist) continue
    if (zoneAt(x, z) !== zone) continue
    let ok = true
    for (const p of pathPts) { const dd = (x - p.x) ** 2 + (z - p.z) ** 2; if (dd < 34) { ok = false; break } }
    if (ok) for (const f of FLATS) { if (Math.hypot(x - f.x, z - f.z) < f.r + 2) { ok = false; break } }
    if (ok) out.push({ x, z, y: heightAt(x, z) })
  }
  return out
}

const TREE_NAMES = ["Oak", "Ironwood", "Fallow Elm", "The Old Willow", "Guild Pine", "Sentinel Oak", "The Whispering Birch"]

// ---- grass system: crossed-blade tufts, ~80k instances in ~12 culled chunks ----
const grassPts = []
const grassChunks = []
let grassPathGrid = null
function grassPathBlocked(x, z) {
  if (!grassPathGrid) {
    grassPathGrid = new Uint8Array(40 * 40)
    const cell = SIZE / 40
    for (let gy = 0; gy < 40; gy++) {
      for (let gx = 0; gx < 40; gx++) {
        const cx = -HALF + (gx + 0.5) * cell, cz = -HALF + (gy + 0.5) * cell
        let best = 1e9
        for (const p of pathPts) { const d2 = (cx - p.x) ** 2 + (cz - p.z) ** 2; if (d2 < best) best = d2 }
        if (best < 64) grassPathGrid[gy * 40 + gx] = 1
      }
    }
  }
  const gx = Math.floor((x + HALF) / (SIZE / 40)), gy = Math.floor((z + HALF) / (SIZE / 40))
  if (gx < 0 || gy < 0 || gx > 39 || gy > 39) return true
  return grassPathGrid[gy * 40 + gx] === 1
}
function collectGrass(count, zone) {
  let n = 0, guard = 0
  while (n < count && guard++ < count * 4) {
    const x = (Math.random() - 0.5) * 380
    const z = (Math.random() - 0.5) * 380
    if (zoneAt(x, z) !== zone) continue
    if (grassPathBlocked(x, z)) continue
    let wet = false
    for (const wf of [FLATS[10], FLATS[11]]) { if (Math.hypot(x - wf.x, z - wf.z) < wf.r + 2) { wet = true; break } }
    if (wet) continue
    const h = heightAt(x, z)
    if (h > 9.2) continue
    grassPts.push({ x, y: h, z })
    n++
  }
}
function grassTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const x = c.getContext("2d")
  const k = 2
  const n = 12 + Math.floor(Math.random() * 5)
  for (let i = 0; i < n; i++) {
    const bx = 14 * k + (i / (n - 1)) * 100 * k + (Math.random() - 0.5) * 12 * k
    const bend = (Math.random() - 0.5) * 44 * k
    const w = (4.5 + Math.random() * 3.5) * k
    const grad = x.createLinearGradient(0, 128 * k, 0, 8 * k)
    grad.addColorStop(0, "#2e5a24")
    grad.addColorStop(0.55, "#4e8a34")
    grad.addColorStop(1, "#a8c86a")
    x.fillStyle = grad
    x.beginPath()
    x.moveTo(bx - w, 128 * k)
    x.quadraticCurveTo(bx - w * 0.4 + bend * 0.4, 64 * k, bx + bend, (6 + Math.random() * 14) * k)
    x.quadraticCurveTo(bx + w * 0.4 + bend * 0.4, 64 * k, bx + w, 128 * k)
    x.closePath()
    x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function crossedTuftGeo() {
  const geos = []
  for (const ry of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const p = new THREE.PlaneGeometry(0.5, 0.6, 1, 2)
    p.translate(0, 0.3, 0)
    p.rotateY(ry)
    geos.push(p)
  }
  let vCount = 0, iCount = 0
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count }
  const posA = new Float32Array(vCount * 3), norA = new Float32Array(vCount * 3), uvA = new Float32Array(vCount * 2)
  const idxA = new Uint16Array(iCount)
  let vo = 0, io = 0
  for (const g of geos) {
    posA.set(g.attributes.position.array, vo * 3)
    norA.set(g.attributes.normal.array, vo * 3)
    uvA.set(g.attributes.uv.array, vo * 2)
    const gi = g.index.array
    for (let i = 0; i < gi.length; i++) idxA[io + i] = gi[i] + vo
    vo += g.attributes.position.count
    io += gi.length
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(posA, 3))
  geo.setAttribute("normal", new THREE.BufferAttribute(norA, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvA, 2))
  geo.setIndex(new THREE.BufferAttribute(idxA, 1))
  return geo
}
function finishGrass(parent) {
  if (!grassPts.length) return
  const geo = crossedTuftGeo()
  const mtl = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 })
  windify(mtl, 0.8)
  const COLS = 4, ROWS = 3
  const cellX = SIZE / COLS, cellZ = SIZE / ROWS
  const buckets = []
  for (let i = 0; i < COLS * ROWS; i++) buckets.push([])
  for (const p of grassPts) {
    const gx = Math.min(COLS - 1, Math.max(0, Math.floor((p.x + HALF) / cellX)))
    const gz = Math.min(ROWS - 1, Math.max(0, Math.floor((p.z + HALF) / cellZ)))
    buckets[gz * COLS + gx].push(p)
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
  const pv = new THREE.Vector3(), sv = new THREE.Vector3(), tint = new THREE.Color()
  for (let b = 0; b < buckets.length; b++) {
    const arr = buckets[b]
    if (!arr.length) continue
    const im = new THREE.InstancedMesh(geo, mtl, arr.length)
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i]
      e.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25)
      q.setFromEuler(e)
      const s = 0.7 + Math.random() * 0.9
      pv.set(p.x, p.y - 0.03, p.z)
      sv.set(s, s * (0.85 + Math.random() * 0.5), s)
      mtx.compose(pv, q, sv)
      im.setMatrixAt(i, mtx)
      tint.setHSL(0.25 + (Math.random() - 0.5) * 0.05, 0.25, 0.55 + (Math.random() - 0.5) * 0.18)
      im.setColorAt(i, tint)
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.castShadow = false
    im.receiveShadow = true
    const cx = -HALF + ((b % COLS) + 0.5) * cellX
    const cz = -HALF + (Math.floor(b / COLS) + 0.5) * cellZ
    grassChunks.push({ im, cx, cz })
    parent.add(im)
  }
}

function heroTree(parent, x, z, name) {
  const g = new THREE.Group()
  const hm = ASSETS && ASSETS.model("oak")
  if (hm) {
    const f = gltfFit("oak")
    const s = (f ? 10 / f.sy : 6) * 1.7 * (0.92 + Math.random() * 0.16)
    hm.scale.setScalar(s)
    hm.position.y = f ? -f.minY * s : 0
    g.add(hm)
  } else {
  const s = 1 + Math.random() * 0.35
  const trunk = cyl(0.34, 0.54, 2.7, "#5f4128", {}, 14)
  trunk.position.y = 1.35
  g.add(trunk)
  const trunk2 = cyl(0.22, 0.34, 2.2, "#6b4a30", {}, 12)
  trunk2.position.y = 3.6
  g.add(trunk2)
  const f1 = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 12).scale(1, 0.85, 1), (() => { const m = mat("#558a4e"); windify(m, 0.6); return m })())
  f1.position.y = 5.7
  g.add(f1)
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 10), (() => { const m = mat("#6da161"); windify(m, 0.8); return m })())
  f2.position.set(0, 7.9, 0)
  g.add(f2)
  const f3 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 9), (() => { const m = mat("#7dae6a"); windify(m, 0.95); return m })())
  f3.position.set(0, 8.9, 0)
  g.add(f3)
  const f4 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 9), (() => { const m = mat("#558a4e"); windify(m, 0.9); return m })())
  f4.position.set(0, 10.1, 0)
  g.add(f4)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const r = k < 3 ? 2.1 : 1.6
    const fs = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 9), (() => { const m = mat(k % 2 ? "#5f9355" : "#7dae6a"); windify(m, 0.85); return m })())
    fs.position.set(Math.cos(a) * r, 6.2 + (k % 3) * 1.4, Math.sin(a) * r)
    g.add(fs)
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 1.1, 6).translate(0, 0.55, 0).rotateZ(0.95), mat("#544026"))
    stub.position.set(Math.cos(a) * 0.24, 2.1 + (k % 2) * 0.6, Math.sin(a) * 0.24)
    stub.rotation.y = -a
    g.add(stub)
  }
  g.scale.setScalar(s)
  }
  g.position.set(x, heightAt(x, z), z)
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true } })
  parent.add(g)
  registerDestroyable(parent, g, { kind: "tree", label: name || "Oak", icon: "🌳", hp: 1, rx: 2.4, rz: 2.4 })
  return g
}

function buildWoods(parent) {
  const oakSpots = scatter(120, "woods")
  if (!plantTreesMerged(parent, oakSpots, "oak", 10)) {
  const trunks = oakSpots.map(p => ({ ...p, y: p.y, s: 0.9 + Math.random() * 0.5 }))
  instanced(parent, new THREE.CylinderGeometry(0.34, 0.54, 2.7, 14).translate(0, 1.35, 0), mat("#5f4128"), trunks)
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.34, 2.2, 12).translate(0, 3.6, 0), mat("#6b4a30"), trunks)
  const flareGeo = new THREE.ConeGeometry(0.3, 1.3, 7).translate(0, 0.65, 0).rotateZ(0.55)
  const flares = []
  for (const t of trunks) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + t.x * 0.7 + t.z * 1.3
      flares.push({ x: t.x + Math.cos(a) * 0.34 * t.s, y: t.y - 0.1, z: t.z + Math.sin(a) * 0.34 * t.s, ry: Math.PI - a, s: t.s * (0.85 + Math.random() * 0.5) })
    }
  }
  instanced(parent, flareGeo, mat("#544026"), flares)
  const stubGeo = new THREE.CylinderGeometry(0.08, 0.14, 1.2, 6).translate(0, 0.6, 0).rotateZ(0.95)
  const stubs = []
  for (const t of trunks) {
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2
      stubs.push({ x: t.x + Math.cos(a) * 0.24 * t.s, y: t.y + (1.8 + Math.random() * 0.8) * t.s, z: t.z + Math.sin(a) * 0.24 * t.s, ry: Math.PI - a, s: t.s * (0.9 + Math.random() * 0.5) })
    }
  }
  instanced(parent, stubGeo, mat("#544026"), stubs)
  instanced(parent, new THREE.SphereGeometry(2.7, 16, 12).scale(1, 0.85, 1).translate(0, 5.7, 0),
    (() => { const m = mat("#558a4e"); windify(m, 0.6); return m })(),
    trunks.map(t => ({ ...t, s: t.s * (0.9 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(1.8, 14, 10).translate(0, 7.9, 0),
    (() => { const m = mat("#6da161"); windify(m, 0.8); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.4, y: t.y, z: t.z + (Math.random() - 0.5) * 1.4, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.2, 12, 9).translate(0, 8.9, 0),
    (() => { const m = mat("#7dae6a"); windify(m, 0.95); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.1, y: t.y, z: t.z + (Math.random() - 0.5) * 1.1, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.1, 12, 9).translate(0, 10.1, 0),
    (() => { const m = mat("#558a4e"); windify(m, 0.9); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.8, y: t.y, z: t.z + (Math.random() - 0.5) * 0.8, s: t.s * (0.45 + Math.random() * 0.2) })), { shadow: false })
  const satGeoA = new THREE.SphereGeometry(1.05, 12, 9).translate(0, 6.4, 0)
  const satMatA = (() => { const m = mat("#5f9355"); windify(m, 0.85); return m })()
  const satGeoB = new THREE.SphereGeometry(0.85, 12, 9).translate(0, 8.6, 0)
  const satMatB = (() => { const m = mat("#6da161"); windify(m, 0.9); return m })()
  const sats = []
  for (const t of trunks) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t.x * 0.9 + t.z * 0.5
      const r = k < 3 ? 1.55 : 1.15
      sats.push({ x: t.x + Math.cos(a) * r * t.s, y: t.y, z: t.z + Math.sin(a) * r * t.s, s: t.s * (0.5 + Math.random() * 0.3) })
    }
  }
  instanced(parent, satGeoA, satMatA, sats.filter((_, i) => i % 2 === 0), { shadow: false })
  instanced(parent, satGeoB, satMatB, sats.filter((_, i) => i % 2 === 1), { shadow: false })
  }

  const blSpots = scatter(75, "woods")
  if (!plantTreesMerged(parent, blSpots, "blossom", 9, 0.9, 1.5)) {
  const bl = blSpots.map(p => ({ ...p, s: 0.9 + Math.random() * 0.6 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.42, 3.9, 12).translate(0, 1.95, 0), mat("#5f4530"), bl)
  instanced(parent, new THREE.SphereGeometry(2.4, 16, 12).scale(1, 0.9, 1).translate(0, 4.9, 0),
    (() => { const m = mat("#e79ab5"); windify(m, 0.75); return m })(),
    bl.map(t => ({ ...t, s: t.s * (0.9 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(1.55, 14, 10).translate(0, 6.6, 0),
    (() => { const m = mat("#f2b7cf"); windify(m, 0.9); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.1, y: t.y, z: t.z + (Math.random() - 0.5) * 1.1, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.0, 12, 9).translate(0, 7.7, 0),
    (() => { const m = mat("#f7b8d2"); windify(m, 0.95); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.9, y: t.y, z: t.z + (Math.random() - 0.5) * 0.9, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(0.95, 12, 9).translate(0, 8.4, 0),
    (() => { const m = mat("#e79ab5"); windify(m, 0.85); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.7, y: t.y, z: t.z + (Math.random() - 0.5) * 0.7, s: t.s * (0.45 + Math.random() * 0.2) })), { shadow: false })
  const blSats = []
  for (const t of bl) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + t.x * 0.6 + t.z * 1.1
      blSats.push({ x: t.x + Math.cos(a) * 1.35 * t.s, y: t.y, z: t.z + Math.sin(a) * 1.35 * t.s, s: t.s * (0.5 + Math.random() * 0.28) })
    }
  }
  instanced(parent, new THREE.SphereGeometry(1.15, 12, 9).translate(0, 5.9, 0),
    (() => { const m = mat("#ee9fc0"); windify(m, 0.8); return m })(), blSats, { shadow: false })
  const bpetals = []
  for (const t of bl) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + t.x * 0.31 + t.z * 0.17
      bpetals.push({ x: t.x + Math.cos(a) * 2.25 * t.s, y: t.y + 5.0 * t.s + (Math.random() - 0.5) * 0.8, z: t.z + Math.sin(a) * 2.25 * t.s, s: t.s * (0.7 + Math.random() * 0.7) })
    }
  }
  instanced(parent, new THREE.SphereGeometry(0.16, 6, 5).translate(0, 0.16, 0),
    (() => { const m = mat("#f7cadd"); windify(m, 0.9); return m })(), bpetals, { shadow: false })
  }

  const heroSpots = scatter(14, "woods", 55, 185)
  heroSpots.forEach((p, i) => {
    heroTree(parent, p.x, p.z, TREE_NAMES[i % TREE_NAMES.length])
  })
  collectGrass(32000, "woods")

  const shroomSpots = scatter(100, "woods", 45, 190)
  const shroomM = ASSETS && ASSETS.model("mushroom")
  if (shroomM) {
    const mf = gltfFit("mushroom")
    for (const p of shroomSpots) {
      const m = shroomM.clone()
      const s = (0.8 + Math.random()) * (mf ? 0.7 / mf.sy : 1)
      m.scale.setScalar(s)
      m.position.set(p.x, p.y - (mf ? mf.minY * s : 0), p.z)
      m.rotation.y = Math.random() * Math.PI * 2
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      parent.add(m)
    }
  } else {
    instanced(parent, new THREE.CylinderGeometry(0.18, 0.25, 0.55, 10).translate(0, 0.27, 0), mat("#f0e6d2"), shroomSpots.map(s => ({ ...s, s: 0.8 + Math.random() })))
    instanced(parent, new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.55, 0), mat("#c94f43"), shroomSpots.map(s => ({ ...s, s: 0.8 + Math.random() })))
    instanced(parent, new THREE.ConeGeometry(0.42, 0.16, 12).rotateX(Math.PI).translate(0, 0.56, 0), mat("#e8d8c0"), shroomSpots.map(s => ({ ...s, s: 0.8 + Math.random() })), { shadow: false })
  }

  const pond = SPECIALS.pond
  const pw = new THREE.Mesh(new THREE.CircleGeometry(10.5, 40).rotateX(-Math.PI / 2), waterMat("#4f8fae"))
  pw.position.set(pond.x, heightAt(pond.x, pond.z) + 0.3, pond.z)
  pw.userData.baseY = pw.position.y
  parent.add(pw)
  anims.pond = pw

  const lilies = []
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2), mat("#4e8a52"))
    l.position.set(pond.x + Math.cos(a) * r, heightAt(pond.x, pond.z) + 0.36, pond.z + Math.sin(a) * r)
    l.userData.baseY = l.position.y
    l.userData.ph = Math.random() * Math.PI * 2
    lilies.push(l)
    parent.add(l)
  }
  anims.lilies = lilies

  const ff = []
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 10
    ff.push(new THREE.Vector3(pond.x + Math.cos(a) * r, heightAt(pond.x, pond.z) + 0.6 + Math.random() * 2.4, pond.z + Math.sin(a) * r))
  }
  const ffg = new THREE.BufferGeometry().setFromPoints(ff)
  const ffm = new THREE.PointsMaterial({ color: "#ffe9a3", size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  anims.fireflies = new THREE.Points(ffg, ffm)
  anims.fireflies.userData.base = ff
  parent.add(anims.fireflies)

  for (let i = 0; i < 16; i++) {
    const b = new THREE.Group()
    const wgeo = new THREE.PlaneGeometry(0.5, 0.35)
    const wm = new THREE.MeshLambertMaterial({ color: i % 2 ? "#e8b3d0" : "#f2d98a", side: THREE.DoubleSide })
    const wl = new THREE.Mesh(wgeo, wm); wl.position.x = -0.25
    const wr = new THREE.Mesh(wgeo, wm); wr.position.x = 0.25
    b.add(wl); b.add(wr)
    b.userData = { t: Math.random() * 100, base: new THREE.Vector3(-56 + Math.random() * 62, 0, 12 + Math.random() * 56), w1: wl, w2: wr }
    b.userData.base.y = heightAt(b.userData.base.x, b.userData.base.z) + 1.5 + Math.random() * 2
    anims.butterflies.push(b)
    parent.add(b)
  }
}

function buildPlains(parent) {
  const wheat = scatter(4200, "plains", 47, 180)
  const wgeo = new THREE.PlaneGeometry(0.14, 1.15, 1, 2).translate(0, 0.575, 0)
  const wmat = (() => { const m = mat("#d3b45c", { side: THREE.DoubleSide }); windify(m, 1.6); return m })()
  instanced(parent, wgeo, wmat, wheat.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })

  const poppies = scatter(420, "plains", 47, 180)
  instanced(parent, new THREE.SphereGeometry(0.16, 6, 5).translate(0, 0.55, 0), mat("#c2432f"), poppies.map(p => ({ ...p, s: 0.9 + Math.random() * 0.5 })), { shadow: false })
  collectGrass(38000, "plains")

  const fenceM = ASSETS && ASSETS.model("fence")
  if (fenceM) {
    const ff = gltfFit("fence")
    for (let i = 0; i < 5; i++) {
      const fx = 75 + i * 2.5 + 1.25, fz = -11
      const seg = fenceM.clone()
      const s = ff ? 2.5 / ff.sx : 1
      seg.scale.setScalar(s)
      seg.position.set(fx, heightAt(fx, fz) - (ff ? ff.minY * s : 0), fz)
      seg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      parent.add(seg)
    }
  } else {
  const fenceMat = mat("#b8a27a")
  for (let i = 0; i < 5; i++) {
    const fx = 75 + i * 2.5, fz = -11
    const post = box(0.18, 1.2, 0.18, "#b8a27a")
    post.position.set(fx, heightAt(fx, fz) + 0.6, fz)
    parent.add(post)
    if (i < 4) {
      const rail = box(4, 0.14, 0.1, "#b8a27a")
      rail.position.set(fx + 2, heightAt(fx, fz) + 1, fz)
      parent.add(rail)
    }
  }
  }

  const wm = SPECIALS.windmill
  const wy = heightAt(wm.x, wm.z)
  const mill = new THREE.Group()
  const tower = cyl(2.6, 3.6, 9, "#e8dcc0", {}, 16)
  tower.position.y = 4.5
  mill.add(tower)
  for (const by of [2.2, 4.6, 7]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.72 - by * 0.03, 2.78 - by * 0.03, 0.22, 16), mat("#b8a98a"))
    band.position.y = by
    mill.add(band)
  }
  const wdoor = boxTex(1.1, 1.9, 0.12, "#6d4a2f", "timber", D_timber)
  wdoor.position.set(0, 1.15, 3.42)
  mill.add(wdoor)
  for (const wx of [-1.35, 1.35]) {
    const mw = box(0.7, 0.9, 0.12, "#8fb4c9", { emissive: "#3d5a70", emissiveIntensity: 0.4 })
    mw.position.set(wx, 4.4, 3.05)
    mill.add(mw)
    const msill = box(0.86, 0.1, 0.2, "#8d8a80")
    msill.position.set(wx, 3.9, 3.05)
    mill.add(msill)
  }
  const mroof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 16), mat("#7c5637"))
  mroof.position.y = 10.2
  mill.add(mroof)
  const finialM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat("#c9a53f"))
  finialM.position.y = 11.5
  mill.add(finialM)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12).rotateX(Math.PI / 2), mat("#5d4630"))
  hub.position.set(0, 8.6, 3.4)
  mill.add(hub)
  const blades = new THREE.Group()
  const clothM = new THREE.MeshLambertMaterial({ color: "#e8ddc2", side: THREE.DoubleSide })
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group()
    const spine = box(0.1, 7.5, 0.1, "#5d4630")
    spine.position.y = 3.75
    arm.add(spine)
    for (let ci = 0; ci < 6; ci++) {
      const cross = box(0.62, 0.09, 0.06, "#8a6a44")
      cross.position.set(0.22, 0.75 + ci * 1.2, 0.02)
      arm.add(cross)
      const cross2 = cross.clone()
      cross2.position.x = -0.22
      arm.add(cross2)
    }
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 6.2), clothM)
    cloth.position.set(0.05, 3.75, 0.08)
    arm.add(cloth)
    const brace = box(0.05, 3.4, 0.05, "#5d4630")
    brace.position.set(0.24, 3.7, 0.05)
    brace.rotation.z = -0.32
    arm.add(brace)
    const brace2 = brace.clone()
    brace2.position.x = -0.24
    brace2.rotation.z = 0.32
    arm.add(brace2)
    arm.rotation.z = (i / 4) * Math.PI * 2
    blades.add(arm)
  }
  blades.position.set(0, 8.6, 3.4)
  mill.add(blades)
  anims.blades.push(blades)
  mill.position.set(wm.x, wy, wm.z)
  mill.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  parent.add(mill)

  for (let i = 0; i < 7; i++) {
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.1, 14), mat("#d8bd6e"))
    const p = scatter(1, "plains", 50, 150, { x: 106, z: -38 }, 56)[0]
    if (!p) continue
    hay.position.set(p.x, p.y + 0.55, p.z)
    hay.rotation.z = Math.PI / 2
    hay.rotation.y = Math.random() * Math.PI
    hay.castShadow = true
    parent.add(hay)
    for (const hbx of [-0.38, 0.38]) {
      const hband = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.045, 6, 18), mat("#b89a4e"))
      hband.position.set(p.x, p.y + 0.55, p.z)
      hband.rotation.y = hay.rotation.y
      hband.rotation.x = Math.PI / 2
      hband.position.x += Math.cos(hay.rotation.y + Math.PI / 2) * hbx * -1
      hband.position.z += Math.sin(hay.rotation.y + Math.PI / 2) * hbx * -1
      parent.add(hband)
    }
    registerDestroyable(parent, hay, { kind: "hay", label: "Hay Bale", icon: "🌾", hp: 1, rx: 1.4, rz: 1.4 })
  }
}

function buildHighlands(parent) {
  const lav = scatter(3000, "highlands", 56, 190)
  const lgeo = new THREE.SphereGeometry(0.3, 6, 5).translate(0, 0.42, 0)
  const lmat = (() => { const m = mat("#9a7fc9"); windify(m, 1.1); return m })()
  instanced(parent, lgeo, lmat, lav.map(p => ({ ...p, s: 0.9 + Math.random() * 0.9 })), { shadow: false })

  const willowT = scatter(36, "highlands").map(p => ({ ...p, s: 1 + Math.random() * 0.4 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.5, 6.6, 14).translate(0, 3.3, 0), mat("#5f4630"), willowT)
  const wstubs = []
  for (const t of willowT) {
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2
      wstubs.push({ x: t.x + Math.cos(a) * 0.3 * t.s, y: t.y + (3.2 + k * 0.7) * t.s, z: t.z + Math.sin(a) * 0.3 * t.s, ry: Math.PI - a, s: t.s * (1 + Math.random() * 0.6) })
    }
  }
  instanced(parent, new THREE.CylinderGeometry(0.09, 0.16, 1.7, 6).translate(0, 0.85, 0).rotateZ(0.9), mat("#54402a"), wstubs)
  instanced(parent, new THREE.SphereGeometry(3.1, 16, 12).scale(1, 1.05, 1).translate(0, 7.6, 0),
    (() => { const m = mat("#7ea369"); windify(m, 0.6); return m })(),
    willowT.map(t => ({ ...t, s: t.s * (0.95 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(2.1, 14, 10).translate(0, 8.8, 0),
    (() => { const m = mat("#8fb374"); windify(m, 0.75); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.2, y: t.y, z: t.z + (Math.random() - 0.5) * 1.2, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.4, 12, 9).translate(0, 10.2, 0),
    (() => { const m = mat("#9cc083"); windify(m, 0.85); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.9, y: t.y, z: t.z + (Math.random() - 0.5) * 0.9, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.7, 12, 9).translate(0, 9.5, 0),
    (() => { const m = mat("#96bb7c"); windify(m, 0.8); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.6, y: t.y, z: t.z + (Math.random() - 0.5) * 1.6, s: t.s * (0.55 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(3.1, 4.4, 20, 1, true).rotateX(Math.PI).translate(0, 4.1, 0),
    (() => { const m = mat("#6b9159", { side: THREE.DoubleSide }); windify(m, 0.55); return m })(),
    willowT.map(t => ({ ...t, ry: t.x * 0.13 + t.z * 0.29, s: t.s * (0.95 + Math.random() * 0.35), sy: t.s * (0.9 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(2.3, 3.4, 20, 1, true).rotateX(Math.PI).translate(0, 3.9, 0),
    (() => { const m = mat("#7ea369", { side: THREE.DoubleSide }); windify(m, 0.65); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.5, y: t.y, z: t.z + (Math.random() - 0.5) * 0.5, ry: t.z * 0.21 + t.x * 0.17, s: t.s * (0.8 + Math.random() * 0.3), sy: t.s * (0.85 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(1.5, 2.6, 20, 1, true).rotateX(Math.PI).translate(0, 3.6, 0),
    (() => { const m = mat("#8fb374", { side: THREE.DoubleSide }); windify(m, 0.75); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.4, y: t.y, z: t.z + (Math.random() - 0.5) * 0.4, ry: t.x * 0.14 + t.z * 0.31, s: t.s * (0.8 + Math.random() * 0.3), sy: t.s * (0.85 + Math.random() * 0.3) })), { shadow: false })

  const pineSpots = scatter(90, "highlands", 63, 190)
  if (!plantTreesMerged(parent, pineSpots, "pine", 11.5, 1, 1.7)) {
  const pines = pineSpots.map(p => ({ ...p, s: 1 + Math.random() * 0.7 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.38, 3.4, 12).translate(0, 1.7, 0), mat("#4d3a2a"), pines)
  const pflares = []
  for (const t of pines) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + t.x * 0.9 + t.z * 1.1
      pflares.push({ x: t.x + Math.cos(a) * 0.32 * t.s, y: t.y - 0.1, z: t.z + Math.sin(a) * 0.32 * t.s, ry: Math.PI - a, s: t.s * (0.8 + Math.random() * 0.5) })
    }
  }
  instanced(parent, new THREE.ConeGeometry(0.26, 1.2, 7).translate(0, 0.6, 0).rotateZ(0.5), mat("#4a3a2c"), pflares)
  const pstubs = []
  for (const t of pines) {
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2
      pstubs.push({ x: t.x + Math.cos(a) * 0.22 * t.s, y: t.y + (1.4 + Math.random() * 1.2) * t.s, z: t.z + Math.sin(a) * 0.22 * t.s, ry: Math.PI - a, s: t.s * (0.8 + Math.random() * 0.5) })
    }
  }
  instanced(parent, new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6).translate(0, 0.45, 0).rotateZ(0.9), mat("#4a3a2c"), pstubs)
  instanced(parent, new THREE.ConeGeometry(2.0, 4.4, 16).translate(0, 4.7, 0),
    (() => { const m = mat("#3c6245"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 })))
  instanced(parent, new THREE.ConeGeometry(1.6, 3.8, 16).translate(0, 6.5, 0),
    (() => { const m = mat("#456e50"); windify(m, 0.55); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 0.6 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(1.45, 3.6, 16).translate(0, 8.1, 0),
    (() => { const m = mat("#4a7452"); windify(m, 0.6); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 1.1 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.95, 2.8, 16).translate(0, 10.3, 0),
    (() => { const m = mat("#568260"); windify(m, 0.7); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 1.9 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.48, 0.9, 10).translate(0, 11.6, 0),
    (() => { const m = mat("#eef2ec"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 2.5 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.6, 1.6, 10).translate(0, 10.9, 0),
    (() => { const m = mat("#eef2ec"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.z * 0.07 + t.x * 0.11 + 9.4 })), { shadow: false })
  const psnows = []
  for (const t of pines) {
    for (const [py, pr, ph] of [[7.3, 0.5, 0.9], [9.2, 0.4, 0.7], [11.2, 0.3, 0.5]]) {
      psnows.push({ ...t, ry: t.x * 0.13 + t.z * 0.07 + py, s: t.s * pr * (0.7 + Math.random() * 0.6), sy: t.s * ph })
    }
  }
  instanced(parent, new THREE.ConeGeometry(0.62, 1.1, 10).translate(0, 0.55, 0),
    (() => { const m = mat("#eef2ec"); windify(m, 0.5); return m })(),
    psnows.map(p => ({ ...p, sy: p.sy })), { shadow: false })
  }

  const stm = SPECIALS.stream
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(150, 7, 20, 2).rotateX(-Math.PI / 2), waterMat("#6aa5c4"))
  stream.position.set(stm.x, heightAt(stm.x, stm.z) + 0.4, stm.z)
  stream.userData.baseY = stream.position.y
  stream.rotation.z = 0.28
  parent.add(stream)
  anims.stream = stream

  const br = new THREE.Group()
  const deck = box(7, 0.5, 3, "#8a6a44")
  deck.position.y = 0.8
  br.add(deck)
  for (let si = 0; si < 8; si++) {
    const seam = box(0.06, 0.52, 3.02, "#6d4a2f")
    seam.position.set(-3.05 + si * 0.87, 0.8, 0)
    br.add(seam)
  }
  for (const sx of [-3, 3]) {
    const rail = box(0.15, 0.9, 3, "#6d4a2f")
    rail.position.set(sx, 1.5, 0)
    br.add(rail)
    for (let vz = -1; vz <= 1; vz++) {
      const post = box(0.14, 1.1, 0.14, "#6d4a2f")
      post.position.set(sx, 1.35, vz)
      br.add(post)
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#c9a24a"))
      fin.position.set(sx, 1.95, vz)
      br.add(fin)
    }
  }
  br.position.set(stm.x, heightAt(stm.x, stm.z), stm.z)
  br.rotation.y = 1.29
  br.traverse(o => { if (o.isMesh) o.castShadow = true })
  parent.add(br)

  const smt = SPECIALS.summit
  const sy = heightAt(smt.x, smt.z)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const st = cyl(0.7, 1, 2.6 + Math.random(), "#9b9484", {}, 12)
    st.position.set(smt.x + Math.cos(a) * 5, sy + 1.2, smt.z + Math.sin(a) * 5)
    st.rotation.z = (Math.random() - 0.5) * 0.15
    st.castShadow = true
    parent.add(st)
    if (i % 2 === 0) {
      const rune = box(0.5, 0.5, 0.06, "#7a5aa0", { emissive: "#5a3f88", emissiveIntensity: 0.5 })
      rune.position.set(smt.x + Math.cos(a) * 5, sy + 2.2, smt.z + Math.sin(a) * 5)
      rune.lookAt(smt.x, sy + 2.2, smt.z)
      parent.add(rune)
    }
  }
  const altar = cyl(1.6, 2, 0.8, "#a89e8c", {}, 10)
  altar.position.set(smt.x, sy + 0.4, smt.z)
  parent.add(altar)

  const seeds = []
  for (let i = 0; i < 100; i++) {
    seeds.push(new THREE.Vector3(smt.x - 38 + Math.random() * 88, 1 + Math.random() * 5, smt.z - 38 + Math.random() * 88))
  }
  const sg = new THREE.BufferGeometry().setFromPoints(seeds)
  const sm = new THREE.PointsMaterial({ color: "#f2ead8", size: 0.18, transparent: true, opacity: 0.85 })
  anims.seeds = new THREE.Points(sg, sm)
  anims.seeds.userData.base = seeds
  parent.add(anims.seeds)

  for (const [px, pz, r, h] of [[-188, -181, 60, 55], [-113, -200, 50, 44], [200, -188, 65, 58], [144, -206, 48, 40]]) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), mat("#b9b4c6"))
    peak.position.set(px, -6, pz)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.3, 10), mat("#f2f0ea"))
    cap.position.set(px, -6 + h * 0.75, pz)
    const cap2 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, h * 0.14, 10), mat("#f2f0ea"))
    cap2.position.set(px, -6 + h * 0.5, pz)
    parent.add(peak, cap, cap2)
  }
}

function buildPathsDeco(parent) {
  for (let i = 0; i < pathPts.length; i += 5) {
    const p = pathPts[i]
    if (Math.hypot(p.x, p.z) < 34) continue
    if (i % 20 === 0) lantern(parent, p.x + 1.6, p.z)
  }
}

function buildRoadDeco(parent) {
  const edgeGeo = new THREE.BoxGeometry(0.55, 0.14, 0.38).translate(0, 0.07, 0)
  const edgeMat = mat("#9a9184")
  const rutGeo = new THREE.BoxGeometry(0.34, 0.05, 0.6).translate(0, 0.025, 0)
  const rutMat = new THREE.MeshLambertMaterial({ color: "#6a5236", transparent: true, opacity: 0.82 })
  const gGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42).translate(0, 0.03, 0)
  const gMat = mat("#8a8264")
  const edgeP = [], rutP = [], guideP = []
  for (let i = 0; i < pathPts.length; i++) {
    const p = pathPts[i]
    const n = pathPts[Math.min(i + 1, pathPts.length - 1)]
    const dx = n.x - p.x, dz = n.z - p.z
    const dl = Math.hypot(dx, dz) || 1
    const px = -dz / dl, pz = dx / dl
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const ox = p.x + px * 2.7 * s, oz = p.z + pz * 2.7 * s
        edgeP.push({ x: ox, y: heightAt(ox, oz) + 0.02, z: oz, ry: Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6, s: 0.8 + Math.random() * 0.5 })
      }
    }
    const side = i % 2 ? 1 : -1
    const rx = p.x + px * 1.05 * side + (Math.random() - 0.5) * 0.35
    const rz = p.z + pz * 1.05 * side + (Math.random() - 0.5) * 0.35
    rutP.push({ x: rx, y: heightAt(rx, rz) + 0.02, z: rz, ry: Math.atan2(dx, dz), s: 0.9 + Math.random() * 0.4 })
    if (i % 4 === 0) {
      const cx0 = p.x + px * (Math.random() - 0.5) * 0.6, cz0 = p.z + pz * (Math.random() - 0.5) * 0.6
      guideP.push({ x: cx0, y: heightAt(cx0, cz0) + 0.02, z: cz0, ry: Math.random() * Math.PI, s: 0.8 + Math.random() * 0.5 })
    }
  }
  instanced(parent, edgeGeo, edgeMat, edgeP, { shadow: true })
  instanced(parent, rutGeo, rutMat, rutP, { shadow: false })
  instanced(parent, gGeo, gMat, guideP, { shadow: false })
}

function buildProps(parent) {
  const pebbles = []
  let pg = 0
  while (pebbles.length < 140 && pg++ < 3000) {
    const p = pathPts[Math.floor(Math.random() * pathPts.length)]
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3.4
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r
    if (Math.hypot(x, z) < 30) continue
    pebbles.push({ x, z, y: heightAt(x, z) })
  }
  instanced(parent, new THREE.DodecahedronGeometry(0.13, 0).translate(0, 0.06, 0), mat("#9a9184"),
    pebbles.map(p => ({ ...p, s: 0.6 + Math.random() * 1.1, sy: 0.45 + Math.random() * 0.5 })), { shadow: false })

  const corn = scatter(240, "plains", 47, 185)
  instanced(parent, new THREE.SphereGeometry(0.11, 6, 5).translate(0, 0.42, 0), mat("#5a7fc9"),
    corn.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(0.07, 5, 4).translate(0, 0.56, 0), mat("#2a3a6a"),
    corn.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })

  const rocks = scatter(70, "woods", 45, 190)
  instanced(parent, new THREE.DodecahedronGeometry(0.9, 1).translate(0, 0.45, 0), mat("#8d8a80"),
    rocks.map(p => ({ ...p, s: 0.7 + Math.random() * 1.3, sy: 0.55 + Math.random() * 0.7 })))

  const logs = scatter(28, "woods", 45, 190)
  instanced(parent, new THREE.CylinderGeometry(0.42, 0.48, 3.2, 10).rotateZ(Math.PI / 2).translate(0, 0.42, 0), mat("#6b4a30"),
    logs.map(p => ({ ...p, s: 0.8 + Math.random() * 0.6 })))

  const stumps = scatter(22, "woods", 45, 190)
  instanced(parent, new THREE.CylinderGeometry(0.5, 0.62, 0.7, 10).translate(0, 0.35, 0), mat("#7a5a3d"), stumps)

  const ferns = scatter(460, "woods", 45, 190)
  instanced(parent, new THREE.ConeGeometry(0.44, 0.85, 5).translate(0, 0.42, 0),
    (() => { const m = mat("#4e7a44"); windify(m, 0.5); return m })(),
    ferns.map(p => ({ ...p, s: 0.7 + Math.random() * 0.9 })), { shadow: false })

  const bells = scatter(220, "woods", 45, 190)
  instanced(parent, new THREE.SphereGeometry(0.1, 5, 4).translate(0, 0.46, 0), mat("#8fa8e0"),
    bells.map(p => ({ ...p, s: 0.8 + Math.random() * 0.6 })), { shadow: false })

  const bushSpots = scatter(110, "plains", 47, 185)
  const bushM = ASSETS && ASSETS.model("bush")
  if (bushM) {
    const bf = gltfFit("bush")
    for (const p of bushSpots) {
      const m = bushM.clone()
      const s = (0.7 + Math.random() * 0.9) * (bf ? 1.5 / bf.sy : 1)
      m.scale.setScalar(s)
      m.position.set(p.x, p.y - (bf ? bf.minY * s : 0), p.z)
      m.rotation.y = Math.random() * Math.PI * 2
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      parent.add(m)
    }
  } else {
    instanced(parent, new THREE.SphereGeometry(0.75, 7, 5).translate(0, 0.38, 0).scale(1.3, 0.8, 1.3),
      (() => { const m = mat("#7d9a4e"); windify(m, 0.6); return m })(),
      bushSpots.map(p => ({ ...p, s: 0.7 + Math.random() * 0.9 })))
  }

  const daisySpots = scatter(260, "plains", 47, 185)
  const flowerM = ASSETS && ASSETS.model("flower")
  if (flowerM) {
    const df = gltfFit("flower")
    for (const p of daisySpots) {
      const m = flowerM.clone()
      const s = (0.8 + Math.random() * 0.7) * (df ? 0.5 / df.sy : 1)
      m.scale.setScalar(s)
      m.position.set(p.x, p.y - (df ? df.minY * s : 0), p.z)
      m.rotation.y = Math.random() * Math.PI * 2
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      parent.add(m)
    }
  } else {
    instanced(parent, new THREE.SphereGeometry(0.09, 5, 4).translate(0, 0.4, 0), mat("#f5f2e6"),
      daisySpots.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })
  }

  const brocks = scatter(62, "highlands", 56, 190)
  instanced(parent, new THREE.DodecahedronGeometry(1.25, 1).translate(0, 0.6, 0), mat("#9b9484"),
    brocks.map(p => ({ ...p, s: 0.9 + Math.random() * 1.6, sy: 0.7 + Math.random() * 0.6 })))

  const snow = scatter(90, "highlands", 80, 195)
  instanced(parent, new THREE.CircleGeometry(1.7, 7).rotateX(-Math.PI / 2).translate(0, 0.07, 0),
    new THREE.MeshLambertMaterial({ color: "#f2f0ea" }),
    snow.map(p => ({ ...p, s: 0.6 + Math.random() * 1.2 })), { shadow: false })

  const well = new THREE.Group()
  const wellM = ASSETS && ASSETS.model("well")
  if (wellM) {
    const f = gltfFit("well")
    const s = f ? Math.min(3.6 / f.sx, 3.6 / f.sy) : 1
    wellM.scale.setScalar(s)
    wellM.position.y = f ? -f.minY * s : 0
    well.add(wellM)
  } else {
  const wbase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.1, 12), mat("#a89e8c", { map: tex("stone", D_stone, 4) }))
  wbase.position.y = 0.55
  wbase.castShadow = true; wbase.receiveShadow = true
  well.add(wbase)
  const winner = cyl(1.25, 1.25, 0.12, "#2a3a34", {}, 10)
  winner.position.y = 1.02
  well.add(winner)
  for (const sx of [-1.1, 1.1]) {
    const post = box(0.16, 1.7, 0.16, "#6d4a2f")
    post.position.set(sx, 1.9, 0)
    well.add(post)
  }
  for (const sx of [-1, 1]) {
    const strut = box(0.11, 1.9, 0.11, "#6d4a2f")
    strut.position.set(sx * 0.72, 1.85, 0)
    strut.rotation.z = sx * 0.52
    well.add(strut)
  }
  for (let ri = 0; ri < 14; ri++) {
    const ra = (ri / 14) * Math.PI * 2
    const rimBlock = box(0.3, 0.24, 0.22, "#9b9484")
    rimBlock.position.set(Math.cos(ra) * 1.55, 1.18, Math.sin(ra) * 1.55)
    rimBlock.rotation.y = -ra
    well.add(rimBlock)
  }
  const crankArm = box(0.08, 0.42, 0.08, "#5d4630")
  crankArm.position.set(1.1, 2.18, 0)
  well.add(crankArm)
  const crankGrip = box(0.32, 0.08, 0.08, "#8a6a44")
  crankGrip.position.set(1.26, 1.97, 0)
  well.add(crankGrip)
  const wroof = coneTex(1.7, 1, "#7c5637", "shingle", D_shingle, 12)
  wroof.position.y = 3.2
  wroof.rotation.y = Math.PI / 4
  well.add(wroof)
  for (const [wr, wy] of [[1.5, 2.92], [1.2, 3.4]]) {
    const wr2 = coneTex(wr, 0.55, "#6d4228", "shingle", D_shingle, 12)
    wr2.position.y = wy
    wr2.rotation.y = Math.PI / 4
    well.add(wr2)
  }
  const axle = cyl(0.07, 0.07, 2.2, "#5d4630", {}, 6)
  axle.rotation.z = Math.PI / 2
  axle.position.y = 2.4
  well.add(axle)
  const rope = box(0.04, 0.9, 0.04, "#c9b78e")
  rope.position.set(0, 1.95, 0)
  well.add(rope)
  for (let ci = 0; ci < 3; ci++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 6, 10), mat("#c9b78e"))
    coil.position.set(-0.45 + ci * 0.12, 2.4, 0)
    coil.rotation.y = Math.PI / 2
    well.add(coil)
  }
  const bucket = cyl(0.28, 0.22, 0.32, "#8a6a44", {}, 12)
  bucket.position.set(0, 1.42, 0)
  well.add(bucket)
  for (const by of [1.32, 1.52]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.02, 6, 12).rotateX(Math.PI / 2), mat("#4a3826"))
    band.position.set(0, by, 0)
    well.add(band)
  }
  }
  well.position.set(-6, heightAt(-6, 14), 14)
  well.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  parent.add(well)

  const bandMat = mat("#4a3826")
  const barrelM = ASSETS && ASSETS.model("barrel")
  const propSpots = [[-13, 1], [19.5, 3], [7, 27.5], [-9.5, 24]]
  for (const [bx, bz] of propSpots) {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let k = 0; k < n; k++) {
      const brl = new THREE.Group()
      if (barrelM) {
        const f = gltfFit("barrel")
        const s = f ? 1.15 / f.sy : 1
        const b = barrelM.clone()
        b.scale.setScalar(s)
        b.position.y = f ? -f.minY * s : 0
        brl.add(b)
      } else {
      const body = cyl(0.5, 0.55, 1.1, "#8a6a44", {}, 16)
      body.position.y = 0.55
      brl.add(body)
      for (const by of [0.18, 0.55, 0.92]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.035, 6, 14).rotateX(Math.PI / 2), bandMat)
        band.position.y = by
        brl.add(band)
      }
      const bung = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat("#3a2c1c"))
      bung.position.set(0.52, 0.68, 0.1)
      brl.add(bung)
      const nStaves = 8
      for (let si = 0; si < nStaves; si++) {
        const sa = si * 0.785 + k * 0.3
        const stave = box(0.09, 1.06, 0.035, "#7a5c3a")
        stave.position.set(Math.cos(sa) * 0.53, 0.55, Math.sin(sa) * 0.53)
        stave.rotation.y = Math.PI / 2 - sa
        brl.add(stave)
      }
      }
      brl.position.set(bx + (Math.random() - 0.5) * 1.6, heightAt(bx, bz), bz + (Math.random() - 0.5) * 1.6)
      brl.rotation.y = Math.random() * Math.PI * 2
      brl.traverse(o => { if (o.isMesh) o.castShadow = true })
      parent.add(brl)
      registerDestroyable(parent, brl, { kind: "barrel", label: "Merchant's Barrel", icon: "🛢️", hp: 1, rx: 1, rz: 1 })
    }
  }

  const petals = []
  const housesPts = [[-16, -6], [17, -4], [-20, 16], [21, 14], [-8, 30], [9, 31], [-30, 2]]
  let guard2 = 0
  while (petals.length < 70 && guard2++ < 900) {
    const a = Math.random() * Math.PI * 2
    const r = 6 + Math.random() * 24
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 2
    if (Math.hypot(x, z) > 30) continue
    if (housesPts.some(h => Math.hypot(x - h[0], z - h[1]) < 6)) continue
    if (Math.hypot(x, z - 8) < 4.5) continue
    petals.push({ x, z, y: heightAt(x, z) })
  }
  const petalGeo = new THREE.SphereGeometry(0.11, 5, 4).translate(0, 0.14, 0)
  const petalCols = ["#e79ab5", "#f2d98a", "#c98ad0"]
  for (const pc of petalCols) {
    instanced(parent, petalGeo, mat(pc),
      petals.filter((_, i) => i % 3 === petalCols.indexOf(pc)).map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })
  }
}

function buildSiteMarkers(parent) {
  BATTLE_SPOTS.forEach((s, i) => {
    const gr = new THREE.Group()
    const ringMat = new THREE.MeshStandardMaterial({ color: "#d9b45b", emissive: "#c9a24a", emissiveIntensity: 0.3, transparent: true, opacity: 0.55 })
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.1, 26).rotateX(-Math.PI / 2), ringMat)
    ring.position.y = 0.12
    anims.siteRings = anims.siteRings || []
    anims.siteRings.push(ringMat)
    gr.add(ring)
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + 0.5
      const stone = box(0.8, 1.1, 0.6, "#a89e8c")
      stone.position.set(Math.cos(a) * 6, 0.5, Math.sin(a) * 6)
      stone.rotation.y = -a
      gr.add(stone)
    }
    const flagP = cyl(0.07, 0.07, 3.4, "#5d4630")
    flagP.position.set(5.5, 1.7, 0)
    gr.add(flagP)
    const fc = { woods: "#3f6f4f", plains: "#c98a3f", highlands: "#7a5aa0" }[s.zone]
    const fl = banner(fc)
    fl.scale.set(0.55, 0.55, 1)
    fl.position.set(5.5, 3.4, 0)
    gr.add(fl)
    gr.position.set(s.x, heightAt(s.x, s.z), s.z)
    gr.userData.siteIndex = i
    parent.add(gr)
    s.marker = gr
  })
}

function buildCoins(parent) {
  coinsGroup = new THREE.Group()
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 28)
  geo.rotateX(Math.PI / 2)
  const cmat = new THREE.MeshStandardMaterial({ color: "#f0c34e", metalness: 1.0, roughness: 0.18, envMapIntensity: 1.6, emissive: "#a97b1e", emissiveIntensity: 0.55 })
  anims.coinMat = cmat
  let ci = 0
  for (const zn of ["woods", "plains", "highlands"]) {
    const zi = ["woods", "plains", "highlands"].indexOf(zn)
    const zpath = pathPts.filter((p, i) => Math.floor(i / 51) === zi)
    for (let i = 2; i < zpath.length - 2 && ci < 14 * (zi + 1); i += 4) {
      const p = zpath[i]
      const coin = new THREE.Mesh(geo, cmat)
      const off = 1.4
      coin.position.set(p.x + (Math.random() - 0.5) * off, heightAt(p.x, p.z) + 1.1, p.z + (Math.random() - 0.5) * off)
      coin.userData.coinIndex = ci++
      coinsGroup.add(coin)
    }
    const spot = BATTLE_SPOTS.find(s => s.zone === zn)
    for (let j = 0; j < 2; j++) {
      const coin = new THREE.Mesh(geo, cmat)
      coin.position.set(spot.x + 7 + j * 2, heightAt(spot.x, spot.z) + 1.1, spot.z + 5)
      coin.userData.coinIndex = ci++
      coinsGroup.add(coin)
    }
  }
  coinsGroup.userData.count = ci
  parent.add(coinsGroup)
}

function buildAmbient(parent) {
  const birdMats = [new THREE.MeshBasicMaterial({ color: "#3a3328", side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: "#5c5240", side: THREE.DoubleSide })]
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group()
    const wm = birdMats[i % 2]
    const s = 0.7 + Math.random() * 0.7
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.25 * s), wm)
    w1.position.x = -0.42 * s
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.25 * s), wm)
    w2.position.x = 0.42 * s
    b.add(w1, w2)
    b.userData = { r: 18 + i * 5, a: Math.random() * Math.PI * 2, spd: 0.25 + Math.random() * 0.2, h: 22 + i * 3, w1, w2 }
    anims.birds.push(b)
    parent.add(b)
  }
}

export function updateWorld(t, dt, fx, playerPos) {
  for (const u of windMats) u.value = t
  for (let i = 0; i < grassChunks.length; i++) {
    const ch = grassChunks[i]
    if (playerPos && Number.isFinite(playerPos.x)) {
      const dx = ch.cx - playerPos.x
      const dz = ch.cz - playerPos.z
      ch.im.visible = dx * dx + dz * dz < 8100
    } else {
      ch.im.visible = true
    }
  }
  if (anims.coinMat) anims.coinMat.emissiveIntensity = 0.45 + Math.sin(t * 3.1) * 0.22
  if (anims.siteRings) {
    for (let i = 0; i < anims.siteRings.length; i++) {
      anims.siteRings[i].emissiveIntensity = 0.22 + Math.sin(t * 2.2 + i * 0.8) * 0.16
    }
  }
  if (anims.lanterns) {
    for (const L of anims.lanterns) {
      const fl = 0.42 + Math.sin(t * 7.3 + L.ph) * 0.06 + Math.sin(t * 13.7 + L.ph * 2.1) * 0.04
      L.light.intensity = fl
      L.bulb.emissiveIntensity = 0.9 + fl * 0.8
    }
  }
  for (const b of anims.banners) {
    const pos = b.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      pos.setZ(i, Math.sin(t * 2.4 + x * 1.6) * 0.22 * (1 + x))
    }
    pos.needsUpdate = true
  }
  for (const bl of anims.blades) bl.rotation.z += dt * 0.9
  if (anims.pond) anims.pond.position.y = anims.pond.userData.baseY + Math.sin(t * 1.4) * 0.05
  if (anims.fountainWater) anims.fountainWater.position.y = anims.fountainWater.userData.baseY + Math.sin(t * 2.6) * 0.04
  if (anims.stream) {
    anims.stream.position.y = anims.stream.userData.baseY + Math.sin(t * 1.7) * 0.035
    anims.stream.material.opacity = 0.74 + Math.sin(t * 2.2) * 0.08
  }
  if (anims.lilies) anims.lilies.forEach((l, i) => { l.position.y = l.userData.baseY + Math.sin(t * 1.6 + l.userData.ph) * 0.05 })
  anims.clouds.forEach(c => {
    c.position.x += c.userData.spd * dt
    if (c.position.x > 340) c.position.x = -340
  })
  if (anims.fireflies) {
    anims.fireflies.material.opacity = 0.55 + Math.sin(t * 2.3) * 0.35
    anims.fireflies.material.size = 0.19 + Math.sin(t * 3.1) * 0.06
    const pos = anims.fireflies.geometry.attributes.position
    const base = anims.fireflies.userData.base
    for (let i = 0; i < base.length; i++) {
      pos.setXYZ(i, base[i].x + Math.sin(t * 0.9 + i) * 0.8, base[i].y + Math.sin(t * 1.4 + i * 2.3) * 0.5, base[i].z + Math.cos(t * 0.7 + i * 1.7) * 0.8)
    }
    pos.needsUpdate = true
  }
  if (anims.seeds) {
    const pos = anims.seeds.geometry.attributes.position
    const base = anims.seeds.userData.base
    for (let i = 0; i < base.length; i++) {
      pos.setXYZ(i, base[i].x + Math.sin(t * 0.35 + i) * 3, base[i].y + Math.sin(t * 0.55 + i * 1.3) * 0.9, base[i].z + Math.sin(t * 0.4 + i * 2) * 2)
    }
    pos.needsUpdate = true
  }
  anims.butterflies.forEach(b => {
    const u = b.userData
    if (!u || !u.w1 || !u.w2) return
    u.t += dt
    b.position.set(u.base.x + Math.sin(u.t * 0.45) * 7, u.base.y + Math.sin(u.t * 1.3) * 0.5, u.base.z + Math.cos(u.t * 0.33) * 7)
    b.rotation.y = -u.t * 0.5
    const flap = Math.sin(u.t * 14) * 0.7
    u.w1.rotation.z = flap
    u.w2.rotation.z = -flap
  })
  anims.birds.forEach(b => {
    const u = b.userData
    if (!u || !u.w1 || !u.w2) return
    u.a += u.spd * dt
    b.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(u.a * 3) * 1.5, -26 + Math.sin(u.a) * u.r)
    b.rotation.y = -u.a
    const flap = Math.sin(t * 7 + u.r) * 0.5
    u.w1.rotation.y = flap
    u.w2.rotation.y = -flap
  })
  if (anims.destroying && anims.destroying.length) {
    for (const d of anims.destroying) {
      d.t += dt
      const k = Math.min(1, d.t / d.dur)
      const ease = k < 0.6 ? k / 0.6 : 1 - Math.pow(1 - (k - 0.6) / 0.4, 2)
      const dropMap = { tree: 3.4, house: 4.5, stall: 2.8, barrel: 1.4, hay: 1.3 }
      const drop = (dropMap[d.item.kind] ?? 2) * ease
      d.item.group.position.y = d.item.y - drop
      const scale = d.item.kind === "tree" ? Math.max(0.05, 1 - k) : Math.max(0.3, 1 - k * 0.7)
      d.item.group.scale.setScalar(scale)
      d.item.group.rotation.y += dt * 3 * ease
      if (Math.random() < dt * 10) fx.burst("dust", d.item.x + (Math.random() - 0.5) * 2, d.item.y + 0.4, d.item.z + (Math.random() - 0.5) * 2, 2)
      if (d.t >= d.dur) {
        d.item.group.visible = false
        d.ruins.group.visible = true
        const P = d.item
        if (P.kind === "tree") {
          fx.burst("spark", P.x, P.y + 4, P.z, 10)
          fx.burst("dust", P.x, P.y + 1, P.z, 18)
          for (let i = 0; i < 16; i++) fx.emit(P.x + (Math.random() - 0.5) * 2.2, P.y + 2 + Math.random() * 3.5, P.z + (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 3, 0.34, 0.62, 0.25, 1.5, -1.6)
        } else {
          fx.burst("dust", P.x, P.y + 1.6, P.z, 24)
          fx.burst("spark", P.x, P.y + 2.6, P.z, 16)
        }
        anims.destroySmoke.push({ x: P.x, y: P.y + (P.kind === "tree" ? 1.1 : 2.8), z: P.z, t: 0 })
        d.done = true
      }
    }
    anims.destroying = anims.destroying.filter(x => !x.done)
  }
  if (anims.destroySmoke && anims.destroySmoke.length) {
    for (const s of anims.destroySmoke) {
      s.t += dt
      if (s.t < 3.4 && Math.random() < dt * 7) fx.emit(s.x + (Math.random() - 0.5) * 0.9, s.y + Math.random() * 1.4, s.z + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.3, 1.5, (Math.random() - 0.5) * 0.3, 0.72, 0.72, 0.7, 2.2, 0.15)
    }
    anims.destroySmoke = anims.destroySmoke.filter(s => s.t < 4)
  }
  anims.smokeTimer -= dt
  if (anims.petalTimer === undefined) anims.petalTimer = 0
  anims.petalTimer -= dt
  if (anims.petalTimer <= 0) {
    anims.petalTimer = 0.3
    const a = Math.random() * Math.PI * 2
    fx.emit(Math.cos(a) * 20, 5 + Math.random() * 3, 8 + Math.sin(a) * 20, (Math.random() - 0.5) * 0.5, -0.45, (Math.random() - 0.5) * 0.5, 1, 0.72, 0.8, 5, -0.01)
  }
  anims.leafTimer = (anims.leafTimer ?? 0) - dt
  if (anims.leafTimer <= 0) {
    anims.leafTimer = 0.28
    fx.emit(-105 + (Math.random() - 0.5) * 70, 5.5 + Math.random() * 3, 40 + (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 0.6, -0.5, (Math.random() - 0.5) * 0.6, 0.45, 0.62, 0.28, 5, -0.01)
  }
  anims.emberTimer = (anims.emberTimer ?? 0) - dt
  if (anims.emberTimer <= 0 && anims.lanterns && anims.lanterns.length) {
    anims.emberTimer = 0.45
    const L = anims.lanterns[Math.floor(Math.random() * anims.lanterns.length)]
    const wp = L.light.getWorldPosition(fx._v || (fx._v = new THREE.Vector3()))
    fx.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 0.2, 0.45, (Math.random() - 0.5) * 0.2, 1, 0.75, 0.35, 1.3, 0.12)
  }
  if (anims.smokeTimer <= 0) {
    anims.smokeTimer = 0.5
    anims.smokeSrc?.forEach(s => fx.emit(s.x, s.y, s.z, (Math.random() - 0.5) * 0.3, 1.2, (Math.random() - 0.5) * 0.3, 0.82, 0.82, 0.82, 2.6, 0.12))
  }
  anims.fountainTimer -= dt
  if (anims.fountainTimer <= 0) {
    anims.fountainTimer = 0.16
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2
      fx.emit(anims.fountainPos.x, anims.fountainPos.y, anims.fountainPos.z, Math.cos(a) * 1.4, 3 + Math.random() * 1.6, Math.sin(a) * 1.4, 0.62, 0.84, 0.94, 1.1, -7)
    }
  }
}
