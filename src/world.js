import * as THREE from "three"

export const SIZE = 400
const HALF = SIZE / 2

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
const anims = { banners: [], blades: [], fireflies: null, butterflies: [], birds: [], clouds: [], smokeTimer: 0, fountainTimer: 0 }
let coinsGroup = null

export function getCoins() { return coinsGroup }

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
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const ctx = c.getContext("2d")
  const img = ctx.createImageData(256, 256)
  const lat = new Float32Array(256 * 256)
  for (let i = 0; i < lat.length; i++) lat[i] = Math.random()
  const val = (x, y) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const x1 = (xi + 1) & 255, y1 = (yi + 1) & 255
    const a = lat[yi * 256 + xi], b = lat[yi * 256 + x1]
    const d = lat[y1 * 256 + xi], e = lat[y1 * 256 + x1]
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v
  }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = val(x / 9, y / 9) * 0.65 + val(x / 3.5 + 41, y / 3.5 + 87) * 0.35
      const i = (y * 256 + x) * 4
      let g = 224 + (n - 0.5) * 30
      const r = Math.random()
      if (r > 0.991) g -= 30
      else if (r < 0.005) g += 16
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(48, 48)
  tex.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: tex })
}

function waterMat(color) {
  return new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.86, roughness: 0.12, metalness: 0.25 })
}

const texCache = {}
function tex(name, draw, rep = 3) {
  if (!texCache[name]) {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    draw(c.getContext("2d"), 128)
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
function coneTex(r, h, color, name, draw, seg = 8, opts = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color, { map: tex(name, draw, 6), ...opts }))
  m.castShadow = true
  return m
}

const D_plaster = (x, s) => {
  x.fillStyle = "#f0e6ca"; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(120,95,60,${0.05 + Math.random() * 0.08})`
    x.fillRect(Math.random() * s, Math.random() * s, 4 + Math.random() * 9, 1.5)
  }
  x.fillStyle = "rgba(255,250,235,0.5)"
  for (let i = 0; i < 14; i++) x.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 30, 2)
}
const D_shingle = (x, s) => {
  x.fillStyle = "#6b4a30"; x.fillRect(0, 0, s, s)
  const rows = 8, cols = 3
  for (let r = 0; r < rows; r++) {
    for (let ccol = 0; ccol < cols; ccol++) {
      const ox = (ccol * (s / cols)) + (r % 2 ? s / (cols * 2) : 0)
      const oy = r * (s / rows)
      x.fillStyle = `hsl(${26 + Math.floor(Math.random() * 8)}, 38%, ${34 + Math.random() * 14}%)`
      x.beginPath()
      x.moveTo(ox + 1, oy + s / rows - 3)
      x.quadraticCurveTo(ox + (s / cols) / 2, oy - 3, ox + (s / cols) - 1, oy + s / rows - 3)
      x.lineTo(ox + (s / cols) - 1, oy + s / rows - 1)
      x.lineTo(ox + 1, oy + s / rows - 1)
      x.closePath(); x.fill()
      x.fillStyle = "rgba(20,12,6,0.25)"
      x.fillRect(ox + 1, oy + s / rows - 2, (s / cols) - 2, 1.5)
    }
  }
}
const D_stone = (x, s) => {
  x.fillStyle = "#9a9484"; x.fillRect(0, 0, s, s)
  const w = s / 4, hgt = s / 4
  for (let r = 0; r < 4; r++) {
    for (let ccol = 0; ccol < 4; ccol++) {
      const ox = ccol * w + (r % 2 ? w / 2 : 0) - (r % 2 ? w / 2 : 0)
      x.fillStyle = `hsl(${34}, ${8 + Math.random() * 7}%, ${52 + Math.random() * 16}%)`
      x.fillRect(ox + 2, r * hgt + 2, w - 4, hgt - 4)
    }
    x.fillStyle = "rgba(40,34,26,0.4)"
    x.fillRect(0, r * hgt, s, 2)
  }
}
const D_timber = (x, s) => {
  x.fillStyle = "#5d4630"; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(35,22,10,${0.35 + Math.random() * 0.5})`
    x.lineWidth = 1 + Math.random() * 2
    x.beginPath()
    x.moveTo(0, Math.random() * s)
    x.quadraticCurveTo(s / 2, (Math.random() - 0.5) * 8, s, Math.random() * s)
    x.stroke()
  }
}

export function buildWorld(scene) {
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
  buildProps(g)
  buildCoins(g)
  buildAmbient(g)
  buildSiteMarkers(g)

  return { anims }
}

function buildTerrain(parent) {
  const seg = 380
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
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
      c.lerp(cPathEdge, edgeT)
      const coreT = Math.min(0.9, Math.max(0, (6 - pdist) / 4.6) * 0.95)
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
    if (h > 9.5) {
      const patch = Math.sin(x * 0.55 + Math.cos(z * 0.43) * 2.2) * Math.cos(z * 0.61 + Math.sin(x * 0.37) * 1.9) + Math.sin(x * 0.19) * Math.cos(z * 0.23) * 0.7
      const snowT = Math.min(1, Math.max(0, (h - 9.5) / 5.2 + patch * 0.22))
      c.lerp(cSnow, snowT)
    }
    const mot = Math.sin(x * 0.11 + 3.1) * Math.cos(z * 0.13 + 1.7) + Math.sin(x * 0.31) * Math.cos(z * 0.27) * 0.5
    c.offsetHSL(0.008 * mot, 0.05 * mot, 0.045 * mot)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, groundMat())
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

  for (let i = 0; i < 16; i++) {
    const cl = new THREE.Group()
    const cloudMat = new THREE.MeshLambertMaterial({ color: "#fff8ec", emissive: "#eadbc4", emissiveIntensity: 0.25, transparent: true, opacity: 0.96 - Math.random() * 0.08 })
    const n = 6 + Math.floor(Math.random() * 4)
    for (let j = 0; j < n; j++) {
      const s = 9 + Math.random() * 15
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), cloudMat)
      m.position.set(j * s * 0.85 - n * s * 0.38, Math.random() * 4.5, (Math.random() - 0.5) * 10)
      m.scale.y = 0.4
      cl.add(m)
    }
    cl.position.set((Math.random() - 0.5) * 560, 95 + Math.random() * 60, (Math.random() - 0.5) * 560)
    cl.userData.spd = 1.5 + Math.random() * 2
    anims.clouds.push(cl)
    scene.add(cl)
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

function cyl(rt, rb, h, color, opts = {}, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts))
  m.castShadow = true; m.receiveShadow = true
  return m
}

function banner(color) {
  const geo = new THREE.PlaneGeometry(2.6, 3.6, 8, 5)
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
  }
  const chim = box(0.9, 2.4, 0.9, "#8d7a6a")
  chim.position.set(w / 3, h + 1.95, -d / 4)
  gr.add(chim)
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
  const roof1 = new THREE.Mesh(new THREE.ConeGeometry(roofR, 2.1, 4), mat(roofColor))
  roof1.position.y = h + 0.4 + 1.05
  roof1.rotation.y = Math.PI / 4
  roof1.castShadow = true
  gr.add(roof1)
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(roofR * 0.64, 1.9, 4), mat(new THREE.Color(roofColor).offsetHSL(0, 0.03, -0.09)))
  roof2.position.y = h + 0.4 + 2.1 + 0.85
  roof2.rotation.y = Math.PI / 4
  roof2.castShadow = true
  gr.add(roof2)
  gr.position.set(x, y, z)
  gr.rotation.y = ry
  parent.add(gr)
}

function lantern(parent, x, z) {
  let y = heightAt(x, z)
  if (!Number.isFinite(y)) y = 0
  const gr = new THREE.Group()
  const post = cyl(0.09, 0.13, 3.2, "#4a3826")
  post.position.y = 1.6
  gr.add(post)
  const arm = box(0.7, 0.1, 0.1, "#4a3826")
  arm.position.set(0.3, 3.2, 0)
  gr.add(arm)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshLambertMaterial({ color: "#ffd98a", emissive: "#ffb84d", emissiveIntensity: 1.2 }))
  bulb.position.set(0.58, 3.02, 0)
  gr.add(bulb)
  const glow = new THREE.PointLight("#ffb35c", 0.5, 14, 2)
  glow.position.copy(bulb.position)
  gr.add(glow)
  anims.lanterns = anims.lanterns || []
  anims.lanterns.push({ light: glow, bulb: bulb.material, ph: Math.random() * Math.PI * 2 })
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
  const base = box(20, 9, 12, "#e8e0cd")
  base.position.y = 4.5
  keep.add(base)
  const skirt = box(20.7, 1.1, 12.7, "#8d8a80")
  skirt.position.y = 0.55
  keep.add(skirt)
  for (const tx of [-1, 1]) {
    for (const tz of [-1, 1]) {
      const turret = cyl(0.95, 1.05, 10.5, "#efe8d6", {}, 10)
      turret.position.set(tx * 9.4, 5.25, tz * 5.4)
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
  const cren = new THREE.Group()
  for (let i = 0; i < 10; i++) {
    const t = box(1.2, 1.1, 1.2, "#ded5c0")
    t.position.set(-9 + i * 2, 9.55, -6)
    cren.add(t)
    const t2 = t.clone(); t2.position.z = 6
    cren.add(t2)
  }
  keep.add(cren)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 4.5, 4), mat("#3f5f8a"))
  roof.position.y = 13.5
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  keep.add(roof)
  for (const tx of [-12, 12]) {
    const tower = cyl(2.6, 3, 15, "#efe8d6", {}, 12)
    tower.position.set(tx, 7.5, 0)
    keep.add(tower)
    const tr = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 12), mat("#33507c"))
    tr.position.set(tx, 17.5, 0)
    tr.castShadow = true
    keep.add(tr)
    const b1 = banner("#2f5b9d")
    b1.position.set(tx - 3.1, 12.5, 0)
    b1.rotation.y = Math.PI / 2
    keep.add(b1)
    const b2 = banner("#2f5b9d")
    b2.position.set(tx + 3.1, 12.5, 0)
    b2.rotation.y = -Math.PI / 2
    keep.add(b2)
  }
  const doorFrame = box(6, 6.5, 1, "#efe8d6")
  doorFrame.position.set(0, 3.25, 6.2)
  keep.add(doorFrame)
  const doorL = box(1.9, 5.6, 0.4, "#5d4630")
  doorL.position.set(-0.95, 2.8, 6.2)
  keep.add(doorL)
  const doorR = doorL.clone()
  doorR.position.x = 0.95
  keep.add(doorR)
  anims.gateDoors = [doorL, doorR]
  for (const px of [-1, 0, 1]) {
    const port = box(0.09, 5.4, 0.09, "#3f3122")
    port.position.set(px * 1.5, 2.9, 5.9)
    keep.add(port)
  }
  for (const wx of [-6.5, 6.5]) {
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
  keep.position.set(0, 0, -26)
  keep.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  v.add(keep)

  const fountain = new THREE.Group()
  const basin = cyl(3.4, 3.8, 1, "#cfc4ac", {}, 16)
  basin.position.y = 0.5
  fountain.add(basin)
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.1, 24).rotateX(-Math.PI / 2), waterMat("#5fa8c9"))
  water.position.y = 0.95
  water.userData.baseY = 0.95
  fountain.add(water)
  anims.fountainWater = water
  const pillar = cyl(0.5, 0.7, 2.4, "#cfc4ac", {}, 8)
  pillar.position.y = 2
  fountain.add(pillar)
  const basin2 = cyl(1.5, 1.7, 0.45, "#c4b89e", {}, 14)
  basin2.position.y = 3.2
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

  house(v, -16, -6, 0.4, 8, 7, 5, "#9a5a3c")
  house(v, 17, -4, -0.5, 7, 6, 4.5, "#a5663f")
  house(v, -20, 16, 1.1, 6.5, 5.5, 4, "#8f5c40")
  house(v, 21, 14, -1.2, 7.5, 6, 4.5, "#9a5a3c")
  house(v, -8, 30, 2.6, 6, 5, 4, "#a5663f")
  house(v, 9, 31, -2.4, 6, 5, 4, "#8f5c40")
  house(v, -30, 2, 0.9, 6.5, 5.5, 4.2, "#9a5a3c")

  for (let i = 0; i < 2; i++) {
    const stall = new THREE.Group()
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
    for (const px of [-0.9, 0, 0.9]) {
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
    for (let gi = 0; gi < 5; gi++) {
      const good = new THREE.Mesh(new THREE.SphereGeometry(0.15 + (gi % 2) * 0.04, 8, 6), mat(goodsCols[gi % 3]))
      good.position.set(-1.15 + gi * 0.58, 1.68, 0.5)
      good.castShadow = true
      stall.add(good)
    }
    stall.position.set(i ? 8 : -8, 0, 20)
    stall.rotation.y = i ? -0.5 : 0.5
    v.add(stall)
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
  const paper = box(0.7, 0.9, 0.05, "#f3e8cc")
  paper.position.set(-0.6, 2, 0.1)
  paper.rotation.z = 0.08
  board.add(paper)
  const paper2 = paper.clone()
  paper2.position.set(0.5, 1.9, 0.1)
  paper2.rotation.z = -0.1
  board.add(paper2)
  board.position.set(4.5, 0, 27)
  board.rotation.y = -0.4
  v.add(board)

  const stable = new THREE.Group()
  const sBase = box(7.5, 0.5, 6, "#8d8a80")
  sBase.position.y = 0.25
  stable.add(sBase)
  const sb = box(7, 3.4, 5.5, "#d9c9a4")
  sb.position.y = 1.7
  stable.add(sb)
  const sr = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.4, 4), mat("#7c5637"))
  sr.position.y = 4.6
  sr.rotation.y = Math.PI / 4
  stable.add(sr)
  const sdoor = box(2.4, 2.6, 0.15, "#6d4a2f")
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
  while (gseeds.length < 320 && g3++ < 6000) {
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

function buildWoods(parent) {
  const trunks = scatter(120, "woods").map(p => ({ ...p, y: p.y, s: 0.9 + Math.random() * 0.5 }))
  instanced(parent, new THREE.CylinderGeometry(0.34, 0.54, 2.7, 9).translate(0, 1.35, 0), mat("#5f4128"), trunks)
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.34, 2.2, 8).translate(0, 3.6, 0), mat("#6b4a30"), trunks)
  const flareGeo = new THREE.ConeGeometry(0.3, 1.3, 7).translate(0, 0.65, 0).rotateZ(0.55)
  const flares = []
  for (const t of trunks) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + t.x * 0.7 + t.z * 1.3
      flares.push({ x: t.x + Math.cos(a) * 0.34 * t.s, y: t.y - 0.1, z: t.z + Math.sin(a) * 0.34 * t.s, ry: Math.PI - a, s: t.s * (0.85 + Math.random() * 0.5) })
    }
  }
  instanced(parent, flareGeo, mat("#544026"), flares)
  const stubGeo = new THREE.CylinderGeometry(0.08, 0.14, 1.2, 6).translate(0, 0.6, 0).rotateZ(0.95)
  const stubs = trunks.map(t => {
    const a = Math.random() * Math.PI * 2
    return { x: t.x + Math.cos(a) * 0.24 * t.s, y: t.y + 2.55 * t.s, z: t.z + Math.sin(a) * 0.24 * t.s, ry: Math.PI - a, s: t.s * (0.9 + Math.random() * 0.5) }
  })
  instanced(parent, stubGeo, mat("#544026"), stubs)
  instanced(parent, new THREE.SphereGeometry(2.7, 10, 8).scale(1, 0.85, 1).translate(0, 5.7, 0),
    (() => { const m = mat("#558a4e"); windify(m, 0.6); return m })(),
    trunks.map(t => ({ ...t, s: t.s * (0.9 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(1.8, 10, 8).translate(0, 7.9, 0),
    (() => { const m = mat("#6da161"); windify(m, 0.8); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.4, y: t.y, z: t.z + (Math.random() - 0.5) * 1.4, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.2, 9, 7).translate(0, 8.9, 0),
    (() => { const m = mat("#7dae6a"); windify(m, 0.95); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.1, y: t.y, z: t.z + (Math.random() - 0.5) * 1.1, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.1, 9, 7).translate(0, 10.1, 0),
    (() => { const m = mat("#558a4e"); windify(m, 0.9); return m })(),
    trunks.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.8, y: t.y, z: t.z + (Math.random() - 0.5) * 0.8, s: t.s * (0.45 + Math.random() * 0.2) })), { shadow: false })

  const bl = scatter(75, "woods").map(p => ({ ...p, s: 0.9 + Math.random() * 0.6 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.42, 3.9, 8).translate(0, 1.95, 0), mat("#5f4530"), bl)
  instanced(parent, new THREE.SphereGeometry(2.4, 10, 8).scale(1, 0.9, 1).translate(0, 4.9, 0),
    (() => { const m = mat("#e79ab5"); windify(m, 0.75); return m })(),
    bl.map(t => ({ ...t, s: t.s * (0.9 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(1.55, 10, 8).translate(0, 6.6, 0),
    (() => { const m = mat("#f2b7cf"); windify(m, 0.9); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.1, y: t.y, z: t.z + (Math.random() - 0.5) * 1.1, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.0, 9, 7).translate(0, 7.7, 0),
    (() => { const m = mat("#f7b8d2"); windify(m, 0.95); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.9, y: t.y, z: t.z + (Math.random() - 0.5) * 0.9, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(0.95, 9, 7).translate(0, 8.4, 0),
    (() => { const m = mat("#e79ab5"); windify(m, 0.85); return m })(),
    bl.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.7, y: t.y, z: t.z + (Math.random() - 0.5) * 0.7, s: t.s * (0.45 + Math.random() * 0.2) })), { shadow: false })
  const bpetals = []
  for (const t of bl) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + t.x * 0.31 + t.z * 0.17
      bpetals.push({ x: t.x + Math.cos(a) * 2.25 * t.s, y: t.y + 5.0 * t.s + (Math.random() - 0.5) * 0.8, z: t.z + Math.sin(a) * 2.25 * t.s, s: t.s * (0.7 + Math.random() * 0.7) })
    }
  }
  instanced(parent, new THREE.SphereGeometry(0.16, 6, 5).translate(0, 0.16, 0),
    (() => { const m = mat("#f7cadd"); windify(m, 0.9); return m })(), bpetals, { shadow: false })

  const shrooms = scatter(60, "woods", 45, 190)
  instanced(parent, new THREE.CylinderGeometry(0.18, 0.25, 0.55, 6).translate(0, 0.27, 0), mat("#f0e6d2"), shrooms.map(s => ({ ...s, s: 0.8 + Math.random() })))
  instanced(parent, new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.55, 0), mat("#c94f43"), shrooms.map(s => ({ ...s, s: 0.8 + Math.random() })))

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
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 10
    ff.push(new THREE.Vector3(pond.x + Math.cos(a) * r, heightAt(pond.x, pond.z) + 0.6 + Math.random() * 2.4, pond.z + Math.sin(a) * r))
  }
  const ffg = new THREE.BufferGeometry().setFromPoints(ff)
  const ffm = new THREE.PointsMaterial({ color: "#ffe9a3", size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  anims.fireflies = new THREE.Points(ffg, ffm)
  anims.fireflies.userData.base = ff
  parent.add(anims.fireflies)

  for (let i = 0; i < 8; i++) {
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
  const wheat = scatter(3600, "plains", 47, 180)
  const wgeo = new THREE.PlaneGeometry(0.14, 1.15, 1, 2).translate(0, 0.575, 0)
  const wmat = (() => { const m = mat("#d3b45c", { side: THREE.DoubleSide }); windify(m, 1.6); return m })()
  instanced(parent, wgeo, wmat, wheat.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })

  const poppies = scatter(240, "plains", 47, 180)
  instanced(parent, new THREE.SphereGeometry(0.16, 6, 5).translate(0, 0.55, 0), mat("#c2432f"), poppies.map(p => ({ ...p, s: 0.9 + Math.random() * 0.5 })), { shadow: false })

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

  const wm = SPECIALS.windmill
  const wy = heightAt(wm.x, wm.z)
  const mill = new THREE.Group()
  const tower = cyl(2.6, 3.6, 9, "#e8dcc0", {}, 10)
  tower.position.y = 4.5
  mill.add(tower)
  const mroof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 10), mat("#7c5637"))
  mroof.position.y = 10.2
  mill.add(mroof)
  const blades = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const bl = box(0.35, 7.5, 0.12, "#c9b78e")
    bl.position.y = 3.75
    const arm = new THREE.Group()
    arm.add(bl)
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
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.1, 10), mat("#d8bd6e"))
    const p = scatter(1, "plains", 50, 150, { x: 106, z: -38 }, 56)[0]
    if (!p) continue
    hay.position.set(p.x, p.y + 0.55, p.z)
    hay.rotation.z = Math.PI / 2
    hay.rotation.y = Math.random() * Math.PI
    hay.castShadow = true
    parent.add(hay)
  }
}

function buildHighlands(parent) {
  const lav = scatter(2400, "highlands", 56, 190)
  const lgeo = new THREE.SphereGeometry(0.3, 6, 5).translate(0, 0.42, 0)
  const lmat = (() => { const m = mat("#9a7fc9"); windify(m, 1.1); return m })()
  instanced(parent, lgeo, lmat, lav.map(p => ({ ...p, s: 0.9 + Math.random() * 0.9 })), { shadow: false })

  const willowT = scatter(36, "highlands").map(p => ({ ...p, s: 1 + Math.random() * 0.4 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.5, 6.6, 8).translate(0, 3.3, 0), mat("#5f4630"), willowT)
  const wstubs = willowT.map(t => {
    const a = Math.random() * Math.PI * 2
    return { x: t.x + Math.cos(a) * 0.3 * t.s, y: t.y + 3.5 * t.s, z: t.z + Math.sin(a) * 0.3 * t.s, ry: Math.PI - a, s: t.s * (1 + Math.random() * 0.6) }
  })
  instanced(parent, new THREE.CylinderGeometry(0.09, 0.16, 1.7, 6).translate(0, 0.85, 0).rotateZ(0.9), mat("#54402a"), wstubs)
  instanced(parent, new THREE.SphereGeometry(3.1, 11, 8).scale(1, 1.05, 1).translate(0, 7.6, 0),
    (() => { const m = mat("#7ea369"); windify(m, 0.6); return m })(),
    willowT.map(t => ({ ...t, s: t.s * (0.95 + Math.random() * 0.4) })))
  instanced(parent, new THREE.SphereGeometry(2.1, 10, 7).translate(0, 8.8, 0),
    (() => { const m = mat("#8fb374"); windify(m, 0.75); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 1.2, y: t.y, z: t.z + (Math.random() - 0.5) * 1.2, s: t.s * (0.6 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(1.4, 9, 7).translate(0, 10.2, 0),
    (() => { const m = mat("#9cc083"); windify(m, 0.85); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.9, y: t.y, z: t.z + (Math.random() - 0.5) * 0.9, s: t.s * (0.5 + Math.random() * 0.25) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(3.1, 4.4, 12, 1, true).rotateX(Math.PI).translate(0, 4.1, 0),
    (() => { const m = mat("#6b9159", { side: THREE.DoubleSide }); windify(m, 0.55); return m })(),
    willowT.map(t => ({ ...t, ry: t.x * 0.13 + t.z * 0.29, s: t.s * (0.95 + Math.random() * 0.35), sy: t.s * (0.9 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(2.3, 3.4, 12, 1, true).rotateX(Math.PI).translate(0, 3.9, 0),
    (() => { const m = mat("#7ea369", { side: THREE.DoubleSide }); windify(m, 0.65); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.5, y: t.y, z: t.z + (Math.random() - 0.5) * 0.5, ry: t.z * 0.21 + t.x * 0.17, s: t.s * (0.8 + Math.random() * 0.3), sy: t.s * (0.85 + Math.random() * 0.3) })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(1.5, 2.6, 12, 1, true).rotateX(Math.PI).translate(0, 3.6, 0),
    (() => { const m = mat("#8fb374", { side: THREE.DoubleSide }); windify(m, 0.75); return m })(),
    willowT.map(t => ({ x: t.x + (Math.random() - 0.5) * 0.4, y: t.y, z: t.z + (Math.random() - 0.5) * 0.4, ry: t.x * 0.14 + t.z * 0.31, s: t.s * (0.8 + Math.random() * 0.3), sy: t.s * (0.85 + Math.random() * 0.3) })), { shadow: false })

  const pines = scatter(90, "highlands", 63, 190).map(p => ({ ...p, s: 1 + Math.random() * 0.7 }))
  instanced(parent, new THREE.CylinderGeometry(0.22, 0.38, 3.4, 8).translate(0, 1.7, 0), mat("#4d3a2a"), pines)
  const pflares = []
  for (const t of pines) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + t.x * 0.9 + t.z * 1.1
      pflares.push({ x: t.x + Math.cos(a) * 0.32 * t.s, y: t.y - 0.1, z: t.z + Math.sin(a) * 0.32 * t.s, ry: Math.PI - a, s: t.s * (0.8 + Math.random() * 0.5) })
    }
  }
  instanced(parent, new THREE.ConeGeometry(0.26, 1.2, 7).translate(0, 0.6, 0).rotateZ(0.5), mat("#4a3a2c"), pflares)
  instanced(parent, new THREE.ConeGeometry(2.0, 4.4, 10).translate(0, 4.7, 0),
    (() => { const m = mat("#3c6245"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 })))
  instanced(parent, new THREE.ConeGeometry(1.6, 3.8, 10).translate(0, 6.5, 0),
    (() => { const m = mat("#456e50"); windify(m, 0.55); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 0.6 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(1.45, 3.6, 10).translate(0, 8.1, 0),
    (() => { const m = mat("#4a7452"); windify(m, 0.6); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 1.1 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.95, 2.8, 10).translate(0, 10.3, 0),
    (() => { const m = mat("#568260"); windify(m, 0.7); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 1.9 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.48, 0.9, 10).translate(0, 11.6, 0),
    (() => { const m = mat("#eef2ec"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.x * 0.05 + t.z * 0.09 + 2.5 })), { shadow: false })
  instanced(parent, new THREE.ConeGeometry(0.6, 1.6, 8).translate(0, 10.9, 0),
    (() => { const m = mat("#eef2ec"); windify(m, 0.5); return m })(),
    pines.map(t => ({ ...t, ry: t.z * 0.07 + t.x * 0.11 + 9.4 })), { shadow: false })

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
  for (const sx of [-3, 3]) {
    const rail = box(0.15, 0.9, 3, "#6d4a2f")
    rail.position.set(sx, 1.5, 0)
    br.add(rail)
  }
  br.position.set(stm.x, heightAt(stm.x, stm.z), stm.z)
  br.rotation.y = 1.29
  br.traverse(o => { if (o.isMesh) o.castShadow = true })
  parent.add(br)

  const smt = SPECIALS.summit
  const sy = heightAt(smt.x, smt.z)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const st = cyl(0.7, 1, 2.6 + Math.random(), "#9b9484", {}, 6)
    st.position.set(smt.x + Math.cos(a) * 5, sy + 1.2, smt.z + Math.sin(a) * 5)
    st.rotation.z = (Math.random() - 0.5) * 0.15
    st.castShadow = true
    parent.add(st)
  }
  const altar = cyl(1.6, 2, 0.8, "#a89e8c", {}, 10)
  altar.position.set(smt.x, sy + 0.4, smt.z)
  parent.add(altar)

  const seeds = []
  for (let i = 0; i < 60; i++) {
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

  const corn = scatter(150, "plains", 47, 185)
  instanced(parent, new THREE.SphereGeometry(0.11, 6, 5).translate(0, 0.42, 0), mat("#5a7fc9"),
    corn.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })
  instanced(parent, new THREE.SphereGeometry(0.07, 5, 4).translate(0, 0.56, 0), mat("#2a3a6a"),
    corn.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })

  const rocks = scatter(46, "woods", 45, 190)
  instanced(parent, new THREE.DodecahedronGeometry(0.9, 0).translate(0, 0.45, 0), mat("#8d8a80"),
    rocks.map(p => ({ ...p, s: 0.7 + Math.random() * 1.3, sy: 0.55 + Math.random() * 0.7 })))

  const logs = scatter(18, "woods", 45, 190)
  instanced(parent, new THREE.CylinderGeometry(0.42, 0.48, 3.2, 7).rotateZ(Math.PI / 2).translate(0, 0.42, 0), mat("#6b4a30"),
    logs.map(p => ({ ...p, s: 0.8 + Math.random() * 0.6 })))

  const stumps = scatter(14, "woods", 45, 190)
  instanced(parent, new THREE.CylinderGeometry(0.5, 0.62, 0.7, 7).translate(0, 0.35, 0), mat("#7a5a3d"), stumps)

  const ferns = scatter(280, "woods", 45, 190)
  instanced(parent, new THREE.ConeGeometry(0.44, 0.85, 5).translate(0, 0.42, 0),
    (() => { const m = mat("#4e7a44"); windify(m, 0.5); return m })(),
    ferns.map(p => ({ ...p, s: 0.7 + Math.random() * 0.9 })), { shadow: false })

  const bells = scatter(130, "woods", 45, 190)
  instanced(parent, new THREE.SphereGeometry(0.1, 5, 4).translate(0, 0.46, 0), mat("#8fa8e0"),
    bells.map(p => ({ ...p, s: 0.8 + Math.random() * 0.6 })), { shadow: false })

  const bushes = scatter(70, "plains", 47, 185)
  instanced(parent, new THREE.SphereGeometry(0.75, 7, 5).translate(0, 0.38, 0).scale(1.3, 0.8, 1.3),
    (() => { const m = mat("#7d9a4e"); windify(m, 0.6); return m })(),
    bushes.map(p => ({ ...p, s: 0.7 + Math.random() * 0.9 })))

  const daisies = scatter(160, "plains", 47, 185)
  instanced(parent, new THREE.SphereGeometry(0.09, 5, 4).translate(0, 0.4, 0), mat("#f5f2e6"),
    daisies.map(p => ({ ...p, s: 0.8 + Math.random() * 0.7 })), { shadow: false })

  const brocks = scatter(40, "highlands", 56, 190)
  instanced(parent, new THREE.DodecahedronGeometry(1.25, 0).translate(0, 0.6, 0), mat("#9b9484"),
    brocks.map(p => ({ ...p, s: 0.9 + Math.random() * 1.6, sy: 0.7 + Math.random() * 0.6 })))

  const snow = scatter(60, "highlands", 80, 195)
  instanced(parent, new THREE.CircleGeometry(1.7, 7).rotateX(-Math.PI / 2).translate(0, 0.07, 0),
    new THREE.MeshLambertMaterial({ color: "#f2f0ea" }),
    snow.map(p => ({ ...p, s: 0.6 + Math.random() * 1.2 })), { shadow: false })

  const well = new THREE.Group()
  const wbase = cyl(1.5, 1.7, 1.1, "#a89e8c", {}, 10)
  wbase.position.y = 0.55
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
  for (let ri = 0; ri < 8; ri++) {
    const ra = (ri / 8) * Math.PI * 2
    const rimBlock = box(0.34, 0.24, 0.22, "#9b9484")
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
  const wroof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1, 4), mat("#7c5637"))
  wroof.position.y = 3.2
  wroof.rotation.y = Math.PI / 4
  wroof.castShadow = true
  well.add(wroof)
  const axle = cyl(0.07, 0.07, 2.2, "#5d4630", {}, 6)
  axle.rotation.z = Math.PI / 2
  axle.position.y = 2.4
  well.add(axle)
  const rope = box(0.04, 0.9, 0.04, "#c9b78e")
  rope.position.set(0, 1.95, 0)
  well.add(rope)
  const bucket = cyl(0.28, 0.22, 0.32, "#8a6a44", {}, 8)
  bucket.position.set(0, 1.42, 0)
  well.add(bucket)
  well.position.set(-6, heightAt(-6, 14), 14)
  well.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  parent.add(well)

  const bandMat = mat("#4a3826")
  const propSpots = [[-13, 1], [19.5, 3], [7, 27.5], [-9.5, 24]]
  for (const [bx, bz] of propSpots) {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let k = 0; k < n; k++) {
      const brl = new THREE.Group()
      const body = cyl(0.5, 0.55, 1.1, "#8a6a44", {}, 10)
      body.position.y = 0.55
      brl.add(body)
      for (const by of [0.25, 0.85]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.035, 6, 12).rotateX(Math.PI / 2), bandMat)
        band.position.y = by
        brl.add(band)
      }
      const nStaves = 2 + Math.floor(Math.random() * 2)
      for (let si = 0; si < nStaves; si++) {
        const sa = si * 2.1 + k * 0.9
        const stave = box(0.09, 1.06, 0.035, "#7a5c3a")
        stave.position.set(Math.cos(sa) * 0.53, 0.55, Math.sin(sa) * 0.53)
        stave.rotation.y = Math.PI / 2 - sa
        brl.add(stave)
      }
      brl.position.set(bx + (Math.random() - 0.5) * 1.6, heightAt(bx, bz), bz + (Math.random() - 0.5) * 1.6)
      brl.rotation.y = Math.random() * Math.PI * 2
      brl.traverse(o => { if (o.isMesh) o.castShadow = true })
      parent.add(brl)
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.1, 26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#d9b45b", transparent: true, opacity: 0.55 }))
    ring.position.y = 0.12
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
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 14)
  geo.rotateX(Math.PI / 2)
  const cmat = new THREE.MeshLambertMaterial({ color: "#f0c34e", emissive: "#a97b1e", emissiveIntensity: 0.55 })
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
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group()
    const wm = birdMats[i % 2]
    const s = 0.7 + Math.random() * 0.7
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.25 * s), wm)
    w1.position.x = -0.42 * s
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.25 * s), wm)
    w2.position.x = 0.42 * s
    b.add(w1, w2)
    b.userData = { r: 18 + i * 6, a: Math.random() * Math.PI * 2, spd: 0.25 + Math.random() * 0.2, h: 22 + i * 4, w1, w2 }
    anims.birds.push(b)
    parent.add(b)
  }
}

export function updateWorld(t, dt, fx) {
  for (const u of windMats) u.value = t
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
    if (c.position.x > 310) c.position.x = -310
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
