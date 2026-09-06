import * as THREE from "three"
import { heightAt, zoneAt, BATTLE_SPOTS } from "./world.js"
import { BATTLES, BOSS, ZONES } from "./data/curriculum.js"
import { S, saveGame } from "./state.js"
import { audio } from "./audio.js"

function lam(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}
function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.35, ...opts })
}
function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color, opts))
  m.castShadow = true
  return m
}
function sph(r, color, opts = {}, w = 20, h = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), lam(color, opts))
  m.castShadow = true
  return m
}

const ICONS = { rat: "\ud83d\udc00", fox: "\ud83e\udd8a", boar: "\ud83d\udc17", wolf: "\ud83d\udc3a", bear: "\ud83d\udc3b", owl: "\ud83e\udd89", elder: "\ud83e\udd8c", bull: "\ud83d\udc02" }

const NAMES = {
  rat: "Rat Grunt", fox: "Fox Trickster", boar: "Boar Brute", wolf: "Wolf Alpha",
  bear: "Bear Brawler", owl: "Owl Sentinel", elder: "Elder Stag", bull: "The Bull Market"
}

function addLegs(g, arr, xs, z, w = 0.22, h = 0.6, color) {
  for (const sx of xs) {
    const leg = box(w, h, w, color)
    leg.geometry.translate(0, -h / 2, 0)
    leg.position.set(sx, h, z)
    g.add(leg)
    arr.push(leg)
  }
}

function hideTex(color, opts = {}) {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const x = c.getContext("2d")
  const img = x.createImageData(128, 128)
  const lat = new Float32Array(128 * 128)
  for (let i = 0; i < lat.length; i++) lat[i] = Math.random()
  const val = (px, py) => {
    const xi = Math.floor(px) & 127, yi = Math.floor(py) & 127
    const xf = px - Math.floor(px), yf = py - Math.floor(py)
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const x1 = (xi + 1) & 127, y1 = (yi + 1) & 127
    const a = lat[yi * 128 + xi], b = lat[yi * 128 + x1], d = lat[y1 * 128 + xi], e = lat[y1 * 128 + x1]
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v
  }
  for (let y = 0; y < 128; y++) {
    for (let px = 0; px < 128; px++) {
      const n = val(px / 11, y / 11) * 0.6 + val(px / 4 + 31, y / 4 + 57) * 0.4
      const i = (y * 128 + px) * 4
      const g = Math.floor(118 + n * 134)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  x.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshLambertMaterial({ color, map: t, ...opts })
}

function hsph(r, color, opts = {}, w = 20, h = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), hideTex(color, opts))
  m.castShadow = true
  return m
}

function addClaws(leg, n, cw, ch, color, z = -0.09) {
  for (let k = 0; k < n; k++) {
    const claw = cn(cw, ch, color, 5)
    claw.position.set((k - (n - 1) / 2) * cw * 2.2, -0.02, z)
    claw.rotation.x = Math.PI - 0.4
    leg.add(claw)
  }
}

function addHooves(leg, n, cw, ch, color, z = 0) {
  for (let k = 0; k < n; k++) {
    const hoof = box(cw, ch, 0.22, color)
    hoof.position.set((k - (n - 1) / 2) * cw * 1.7, -0.05, z)
    leg.add(hoof)
  }
}

function addRings(g, cx, cy, cz, r, n, color, ry = 0) {
  for (let i = 0; i < n; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 12).rotateX(Math.PI / 2), lam(color))
    ring.position.set(cx, cy - i * 0.08, cz)
    ring.rotation.z = ry
    g.add(ring)
  }
}

function buildModel(type) {
  const g = new THREE.Group()
  const legs = []
  g.userData.legs = legs
  if (type === "rat") {
    const body = hsph(0.55, "#8d8d95")
    body.scale.set(1, 0.85, 1.5)
    body.position.y = 0.6
    g.add(body)
    const back = hsph(0.42, "#7d7d86")
    back.scale.set(1, 0.9, 1.3)
    back.position.set(0, 0.72, 0.15)
    g.add(back)
    const head = hsph(0.34, "#9a9aa2")
    head.position.set(0, 0.72, -0.85)
    g.add(head)
    const snout = hsph(0.16, "#c9a0a8")
    snout.position.set(0, 0.64, -1.15)
    g.add(snout)
    const belly = sph(0.34, "#d8c0c8")
    belly.scale.set(1.3, 0.5, 1.1)
    belly.position.set(0, 0.38, 0.1)
    g.add(belly)
    for (const sx of [-0.16, 0.16]) {
      const ear = sph(0.14, "#b0889a")
      ear.position.set(sx, 0.95, -0.8)
      g.add(ear)
      const inner = sph(0.08, "#d8a8b8")
      inner.position.set(sx, 0.95, -0.72)
      g.add(inner)
    }
    const eyeL = sph(0.05, "#c0392b"); eyeL.position.set(-0.14, 0.78, -1.08); g.add(eyeL)
    const eyeR = eyeL.clone(); eyeR.position.x = 0.14; g.add(eyeR)
    shine(g, -0.1, 0.8, -1.12)
    shine(g, 0.1, 0.8, -1.12)
    const nose = sph(0.07, "#7a4a58")
    nose.position.set(0, 0.6, -1.28)
    g.add(nose)
    for (let i = 0; i < 4; i++) {
      const spine = cn(0.03, 0.16, "#6f6f78", 6)
      spine.position.set(0, 1.02 + i * 0.06, 0.1 - i * 0.18)
      spine.rotation.x = 0.2
      g.add(spine)
    }
    const tail = new THREE.Group()
    const tbase = sph(0.07, "#c9a0a8", {}, 10, 8)
    tbase.position.set(0, 0.5, 1.0)
    tail.add(tbase)
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055 - i * 0.006, 0.015, 6, 10).rotateX(Math.PI / 2), lam("#b0889a"))
      ring.position.set(0, 0.5 - i * 0.08, 1.12 + i * 0.12)
      ring.rotation.x = 0.3
      tail.add(ring)
    }
    const ttip = sph(0.05, "#c9a0a8", {}, 8, 6)
    ttip.position.set(0, 0.2, 1.7)
    tail.add(ttip)
    g.add(tail)
    g.userData.tail = tail
    for (const sx of [-0.2, 0.2]) for (const sz of [0, 0.12]) {
      const wh = box(0.18, 0.02, 0.02, "#e8d8d0")
      wh.position.set(sx, 0.66 + (sz ? 0.04 : 0), -1.2 - sz)
      wh.rotation.y = sx > 0 ? -0.5 : 0.5
      g.add(wh)
    }
    for (const sx of [-0.24, 0.24]) for (const sy of [0, 0.07]) {
      const wh2 = box(0.16, 0.02, 0.02, "#f2e6e0")
      wh2.position.set(sx, 0.72 + sy, -1.3 - sy * 1.4)
      wh2.rotation.y = sx > 0 ? -0.7 : 0.7
      g.add(wh2)
    }
    for (const sx of [-0.05, 0.05]) {
      const tooth = cn(0.03, 0.09, "#f5f0e0", 4)
      tooth.position.set(sx, 0.58, -1.24)
      tooth.rotation.x = Math.PI
      g.add(tooth)
    }
    const stripe = box(0.34, 0.05, 1.2, "#6f6f78")
    stripe.position.set(0, 1.08, 0.1)
    g.add(stripe)
    addLegs(g, legs, [-0.25, 0.25], -0.4, 0.12, 0.35, "#7a7a82")
    addLegs(g, legs, [-0.25, 0.25], 0.45, 0.12, 0.35, "#7a7a82")
    legs.forEach(l => {
      const paw = box(0.14, 0.06, 0.18, "#5f5f68")
      paw.position.set(0, -0.33, 0.02)
      l.add(paw)
      addClaws(l, 3, 0.018, 0.06, "#f0e6da")
    })
  } else if (type === "fox") {
    const body = hsph(0.5, "#d97a2e")
    body.scale.set(1, 0.9, 1.5)
    body.position.y = 0.75
    g.add(body)
    const back = hsph(0.38, "#c96f24")
    back.scale.set(1, 0.95, 1.3)
    back.position.set(0, 0.85, 0.15)
    g.add(back)
    const chest = sph(0.3, "#f2e6d4")
    chest.position.set(0, 0.62, -0.55)
    g.add(chest)
    const chestT = sph(0.2, "#f2e6d4")
    chestT.scale.set(1.2, 0.7, 0.8)
    chestT.position.set(0, 0.5, -0.4)
    g.add(chestT)
    const head = hsph(0.3, "#d97a2e")
    head.position.set(0, 1.0, -0.95)
    g.add(head)
    const snout = hsph(0.14, "#f2e6d4")
    snout.position.set(0, 0.92, -1.25)
    g.add(snout)
    const nose = sph(0.06, "#2a1c12")
    nose.position.set(0, 0.9, -1.37)
    g.add(nose)
    for (const sx of [-0.11, 0.11]) {
      const eye = sph(0.035, "#1a1208"); eye.position.set(sx, 1.08, -1.15); g.add(eye)
      shine(g, sx * 0.7, 1.09, -1.19)
    }
    for (const sx of [-0.15, 0.15]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 7), lam("#b35a1e"))
      ear.position.set(sx, 1.28, -0.9)
      g.add(ear)
      const earTip = sph(0.06, "#3a2a1a")
      earTip.position.set(sx, 1.42, -0.88)
      g.add(earTip)
      const inner = sph(0.06, "#d9a0b0")
      inner.position.set(sx, 1.26, -0.86)
      g.add(inner)
      const fluff = sph(0.1, "#f2e6d4")
      fluff.position.set(sx * 1.6, 0.92, -0.78)
      g.add(fluff)
    }
    const tail = new THREE.Group()
    const t1 = hsph(0.22, "#d97a2e")
    t1.scale.set(1, 1, 1.6)
    t1.position.set(0, 0.95, 1.1)
    tail.add(t1)
    const t2 = hsph(0.2, "#d97a2e")
    t2.scale.set(1, 1, 1.4)
    t2.position.set(0, 0.95, 1.45)
    tail.add(t2)
    const t3 = hsph(0.16, "#d97a2e")
    t3.scale.set(1, 1, 1.2)
    t3.position.set(0, 0.95, 1.7)
    tail.add(t3)
    const tip = sph(0.14, "#f2e6d4")
    tip.position.set(0, 0.95, 1.85)
    tail.add(tip)
    for (const zt of [0.78, 1.28]) {
      const band = sph(0.235, "#f2e6d4")
      band.scale.set(1, 1, 0.3)
      band.position.set(0, 0.95, zt)
      tail.add(band)
    }
    g.add(tail)
    g.userData.tail = tail
    addLegs(g, legs, [-0.22, 0.22], -0.4, 0.13, 0.5, "#b35a1e")
    addLegs(g, legs, [-0.22, 0.22], 0.45, 0.13, 0.5, "#b35a1e")
    legs.forEach(l => {
      const paw = box(0.16, 0.09, 0.22, "#8a4a1e")
      paw.position.set(0, -0.47, 0.02)
      l.add(paw)
      addClaws(l, 3, 0.016, 0.05, "#f2e6d4")
    })
  } else if (type === "boar") {
    const body = hsph(0.75, "#6b4a35")
    body.scale.set(1.1, 1, 1.35)
    body.position.y = 0.95
    g.add(body)
    const back = hsph(0.55, "#5d3f2d")
    back.scale.set(1, 0.95, 1.2)
    back.position.set(0, 1.15, 0.1)
    g.add(back)
    const head = hsph(0.45, "#5d3f2d")
    head.position.set(0, 1.0, -1.1)
    g.add(head)
    const snout = cyl2(0.18, 0.22, 0.35, "#c98a7a")
    snout.rotation.x = Math.PI / 2
    snout.position.set(0, 0.9, -1.55)
    g.add(snout)
    for (const sx of [-0.2, 0.2]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 7), lam("#f2ead8"))
      tusk.position.set(sx, 0.72, -1.5)
      tusk.rotation.x = -0.7
      g.add(tusk)
      const tuskRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10).rotateX(Math.PI / 2), lam("#c9b898"))
      tuskRing.position.set(sx, 0.72, -1.52)
      tuskRing.rotation.x = 0.3
      g.add(tuskRing)
    }
    const mane = box(0.2, 0.28, 1.1, "#4a3323")
    mane.position.set(0, 1.62, -0.7)
    g.add(mane)
    for (const bz of [-0.15, 0.35, 0.85]) {
      const br = cn(0.05, 0.28, "#54402c", 6)
      br.position.set(0, 1.72, bz)
      br.rotation.x = 0.25
      g.add(br)
    }
    for (let i = 0; i < 6; i++) {
      const bristle = cn(0.03, 0.24, "#4a3323", 6)
      bristle.position.set(0, 1.55 + i * 0.1, -0.9 + i * 0.12)
      bristle.rotation.x = 0.4
      g.add(bristle)
    }
    for (const sx of [-0.07, 0.07]) {
      const nos = sph(0.045, "#4a2f26")
      nos.position.set(sx, 0.9, -1.72)
      g.add(nos)
    }
    for (const wy of [0.95, 1.02]) {
      const wr = box(0.3, 0.035, 0.06, "#4a3323")
      wr.position.set(0, wy, -1.62)
      g.add(wr)
    }
    for (const sx of [-0.22, 0.22]) {
      const eye = sph(0.045, "#1a1208"); eye.position.set(sx, 1.18, -1.32); g.add(eye)
      shine(g, sx * 0.7, 1.19, -1.36)
    }
    const harness = box(0.34, 0.06, 1.2, "#4a3323")
    harness.position.set(0, 1.45, -0.6)
    g.add(harness)
    const buckleH = box(0.14, 0.1, 0.05, "#c9a53f")
    buckleH.position.set(0, 1.45, -1.2)
    g.add(buckleH)
    for (const [mx, mz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, -0.9], [0.3, -0.9]]) {
      const mud = sph(0.2, "#4a3a2a")
      mud.scale.set(1, 0.4, 0.7)
      mud.position.set(mx, 0.75, mz)
      g.add(mud)
    }
    addLegs(g, legs, [-0.4, 0.4], -0.55, 0.2, 0.65, "#5d3f2d")
    addLegs(g, legs, [-0.4, 0.4], 0.6, 0.2, 0.65, "#5d3f2d")
    legs.forEach(l => {
      addHooves(l, 2, 0.1, 0.12, "#2e211a")
      const dew = box(0.05, 0.06, 0.1, "#2e211a")
      dew.position.set(0, -0.6, 0.12)
      l.add(dew)
    })
  } else if (type === "wolf") {
    const body = hsph(0.6, "#7d838c")
    body.scale.set(1, 0.95, 1.6)
    body.position.y = 1.0
    g.add(body)
    const under = sph(0.55, "#b8bcc4")
    under.scale.set(1, 0.5, 1.4)
    under.position.set(0, 0.72, 0.05)
    g.add(under)
    const mane = hsph(0.5, "#5f656e")
    mane.position.set(0, 1.35, -0.5)
    g.add(mane)
    const head = hsph(0.32, "#7d838c")
    head.position.set(0, 1.35, -1.2)
    g.add(head)
    const snout = hsph(0.15, "#9aa0a8")
    snout.position.set(0, 1.25, -1.5)
    g.add(snout)
    const nose = sph(0.07, "#22262c")
    nose.position.set(0, 1.23, -1.63)
    g.add(nose)
    for (const sx of [-0.13, 0.13]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 7), lam("#5f656e"))
      ear.position.set(sx, 1.68, -1.15)
      g.add(ear)
      const inner = sph(0.05, "#d9a0b0")
      inner.position.set(sx, 1.66, -1.12)
      g.add(inner)
    }
    const eyeL = sph(0.05, "#e8c93f"); eyeL.position.set(-0.13, 1.42, -1.42); g.add(eyeL)
    const eyeR = eyeL.clone(); eyeR.position.x = 0.13; g.add(eyeR)
    shine(g, -0.09, 1.43, -1.46)
    shine(g, 0.09, 1.43, -1.46)
    for (let i = 0; i < 5; i++) {
      const spike = cn(0.04, 0.22, "#565c66", 6)
      spike.position.set(0, 1.55 + i * 0.06, -0.35 - i * 0.12)
      spike.rotation.x = 0.3
      g.add(spike)
    }
    const scar = box(0.3, 0.03, 0.04, "#c9cdd4")
    scar.position.set(-0.12, 1.2, -0.9)
    scar.rotation.y = 0.4
    g.add(scar)
    const tail = new THREE.Group()
    const t1 = hsph(0.14, "#5f656e")
    t1.scale.set(1, 1, 1.6)
    t1.position.set(0, 1.2, 1.35)
    tail.add(t1)
    const t2 = hsph(0.11, "#5f656e")
    t2.scale.set(1, 1, 1.3)
    t2.position.set(0, 1.28, 1.6)
    tail.add(t2)
    const tailTip = sph(0.09, "#e8e4da")
    tailTip.position.set(0, 1.42, 1.78)
    tail.add(tailTip)
    g.add(tail)
    g.userData.tail = tail
    for (const sx of [-0.06, 0.06]) {
      const fang = cn(0.035, 0.12, "#f5f0e0", 5)
      fang.position.set(sx, 1.12, -1.52)
      fang.rotation.x = Math.PI
      g.add(fang)
    }
    for (const sx of [-0.42, 0.42]) {
      const tuft = sph(0.16, "#565c66")
      tuft.position.set(sx, 1.45, -0.15)
      g.add(tuft)
    }
    addLegs(g, legs, [-0.28, 0.28], -0.55, 0.16, 0.75, "#6f757e")
    addLegs(g, legs, [-0.28, 0.28], 0.6, 0.16, 0.75, "#6f757e")
    legs.forEach(l => {
      const paw = box(0.2, 0.1, 0.24, "#565c66")
      paw.position.set(0, -0.72, 0.02)
      l.add(paw)
      addClaws(l, 3, 0.02, 0.08, "#e8e4da")
    })
  } else if (type === "bear") {
    const body = hsph(0.95, "#6d4c33")
    body.position.y = 1.35
    g.add(body)
    const back = hsph(0.75, "#5d3f2a")
    back.scale.set(1, 0.95, 1.2)
    back.position.set(0, 1.6, 0.15)
    g.add(back)
    const head = hsph(0.5, "#7d5a3d")
    head.position.set(0, 1.9, -0.95)
    g.add(head)
    const snout = hsph(0.22, "#c9a878")
    snout.position.set(0, 1.78, -1.35)
    g.add(snout)
    const nose = sph(0.09, "#1f1610")
    nose.position.set(0, 1.76, -1.52)
    g.add(nose)
    for (const sx of [-0.22, 0.22]) {
      const ear = sph(0.14, "#5d3f2a")
      ear.position.set(sx, 2.28, -0.85)
      g.add(ear)
      const inner = sph(0.08, "#c9a878")
      inner.position.set(sx, 2.28, -0.78)
      g.add(inner)
    }
    const eyeL = sph(0.06, "#2a1d12"); eyeL.position.set(-0.16, 2.0, -1.28); g.add(eyeL)
    const eyeR = eyeL.clone(); eyeR.position.x = 0.16; g.add(eyeR)
    shine(g, -0.12, 2.01, -1.32)
    shine(g, 0.12, 2.01, -1.32)
    const brow = box(0.5, 0.08, 0.12, "#4a3323")
    brow.position.set(0, 2.14, -1.26)
    g.add(brow)
    const patch = sph(0.5, "#c9a878")
    patch.scale.set(1, 1.15, 0.5)
    patch.position.set(0, 1.15, -0.78)
    g.add(patch)
    const hump = hsph(0.4, "#5d3f2a")
    hump.scale.set(1.2, 0.7, 0.9)
    hump.position.set(0, 2.15, 0.25)
    g.add(hump)
    for (let i = 0; i < 6; i++) {
      const spike = cn(0.05, 0.28, "#4a3323", 6)
      spike.position.set((i - 2.5) * 0.16, 2.2 + Math.abs(i - 2.5) * 0.08, 0.3)
      spike.rotation.z = (i - 2.5) * -0.15
      g.add(spike)
    }
    for (const sx of [-0.5, 0.5]) {
      for (let i = 0; i < 3; i++) {
        const furB = cn(0.04, 0.2, "#5d3f2a", 6)
        furB.position.set(sx, 1.2 + i * 0.12, 0.6 + i * 0.1)
        furB.rotation.x = 0.4
        g.add(furB)
      }
    }
    addLegs(g, legs, [-0.5, 0.5], -0.5, 0.3, 0.85, "#5d3f2a")
    addLegs(g, legs, [-0.5, 0.5], 0.6, 0.3, 0.85, "#5d3f2a")
    legs.forEach(l => {
      const pad = box(0.34, 0.05, 0.3, "#c9a878")
      pad.position.set(0, -0.72, 0)
      l.add(pad)
      addClaws(l, 3, 0.035, 0.14, "#e8dcc0")
    })
  } else if (type === "owl") {
    const body = hsph(0.7, "#8a6a48")
    body.position.y = 1.1
    g.add(body)
    const belly = sph(0.5, "#d9c4a0")
    belly.position.set(0, 0.95, -0.25)
    g.add(belly)
    for (const fy of [0.75, 1.05, 1.35]) {
      const layer = sph(0.62 - (fy - 0.75) * 0.1, "#7d5e3e")
      layer.scale.set(1, 0.35, 1)
      layer.position.set(0, fy, 0.15)
      g.add(layer)
    }
    for (let i = 0; i < 4; i++) {
      const flake = box(0.3, 0.02, 0.1, "#6d4f33")
      flake.position.set((i % 2 ? 0.1 : -0.1), 1.15 + i * 0.09, -0.05)
      flake.rotation.y = i * 0.5
      g.add(flake)
    }
    const head = hsph(0.45, "#8a6a48")
    head.position.y = 1.9
    g.add(head)
    const face = sph(0.3, "#e8dcc0")
    face.position.set(0, 1.88, -0.28)
    g.add(face)
    const discRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 20), lam("#6d4f33"))
    discRim.rotation.x = Math.PI / 2
    discRim.position.set(0, 1.88, -0.24)
    g.add(discRim)
    for (const sx of [-0.12, 0.12]) {
      const eye = sph(0.1, "#f5d76e"); eye.position.set(sx, 1.95, -0.5); g.add(eye)
      const pupil = sph(0.045, "#1a1208"); pupil.position.set(sx, 1.95, -0.58); g.add(pupil)
      shine(g, sx - 0.03, 1.97, -0.56, 0.025)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 6, 16), lam("#6d4f33"))
      ring.rotation.x = Math.PI / 2
      ring.position.set(sx, 1.94, -0.44)
      g.add(ring)
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), lam("#6d4f33"))
      tuft.position.set(sx * 1.6, 2.32, 0)
      g.add(tuft)
      const brow = box(0.24, 0.05, 0.08, "#6d4f33")
      brow.position.set(sx, 2.12, -0.42)
      brow.rotation.z = sx > 0 ? -0.25 : 0.25
      g.add(brow)
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6).rotateX(-Math.PI / 2), lam("#d9a03f"))
    beak.position.set(0, 1.82, -0.5)
    g.add(beak)
    for (const sx of [-0.22, 0.22]) {
      const foot = box(0.18, 0.1, 0.3, "#d9a03f")
      foot.position.set(sx, 0.42, -0.05)
      g.add(foot)
      for (let k = 0; k < 3; k++) {
        const talon1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 5), lam("#7a5322"))
        talon1.position.set(sx, 0.28, -0.14 + k * 0.12)
        talon1.rotation.x = Math.PI - 0.3
        g.add(talon1)
        const talon2 = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 5), lam("#7a5322"))
        talon2.position.set(sx, 0.2, -0.14 + k * 0.12)
        talon2.rotation.x = Math.PI - 0.1
        g.add(talon2)
      }
    }
    for (const vy of [0.62, 0.85, 1.08]) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 5).rotateZ(Math.PI), lam("#b89872"))
      v.position.set(0, vy, -0.3)
      g.add(v)
    }
    g.userData.wings = []
    for (const sx of [-0.72, 0.72]) {
      const wing = new THREE.Group()
      wing.position.set(sx, 1.55, 0)
      const wmain = box(0.16, 0.9, 0.5, "#6d4f33")
      wmain.geometry.translate(0, -0.45, 0)
      wing.add(wmain)
      for (let k = 0; k < 3; k++) {
        const ft = box(0.15, 0.3, 0.14, "#5d4530")
        ft.position.set(0, -0.85 - k * 0.02, -0.14 + k * 0.28)
        wing.add(ft)
      }
      for (let i = 0; i < 3; i++) {
        const flake = box(0.18, 0.02, 0.12, "#8a6a48")
        flake.position.set(0, -0.4 - i * 0.16, -0.1 + i * 0.14)
        flake.rotation.y = i * 0.3
        wing.add(flake)
      }
      g.add(wing)
      g.userData.wings.push(wing)
    }
  } else if (type === "elder") {
    const body = hsph(0.8, "#e8e2d4")
    body.scale.set(1, 1, 1.4)
    body.position.y = 1.3
    g.add(body)
    const neck = cyl2(0.22, 0.3, 0.7, "#e8e2d4")
    neck.position.set(0, 2.0, -0.7)
    neck.rotation.x = 0.5
    g.add(neck)
    const head = hsph(0.28, "#f2eee2")
    head.position.set(0, 2.35, -0.95)
    g.add(head)
    const eyeL = sph(0.05, "#2a2018"); eyeL.position.set(-0.11, 2.42, -1.15); g.add(eyeL)
    const eyeR = eyeL.clone(); eyeR.position.x = 0.11; g.add(eyeR)
    shine(g, -0.07, 2.43, -1.19)
    shine(g, 0.07, 2.43, -1.19)
    const nose = sph(0.06, "#4a4238")
    nose.position.set(0, 2.36, -1.22)
    g.add(nose)
    for (const [sx2, sz2] of [[-0.5, 0.3], [0.5, 0.3], [-0.55, -0.5], [0.55, -0.5]]) {
      const spot = sph(0.13, "#c9bfa8")
      spot.scale.set(1, 0.6, 1)
      spot.position.set(sx2, 1.5, sz2 + 0.4)
      g.add(spot)
    }
    for (const [mx, mz] of [[-0.3, 0.5], [0.3, 0.5], [0, -0.2]]) {
      const moss = sph(0.18, "#5f8a4a")
      moss.scale.set(1, 0.4, 1)
      moss.position.set(mx, 1.75, mz)
      g.add(moss)
    }
    g.userData.antlers = new THREE.Group()
    for (const sx of [-0.15, 0.15]) {
      const a1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7, 7), lam("#b8a888"))
      a1.position.set(sx, 2.75, -0.9)
      a1.rotation.z = sx > 0 ? -0.5 : 0.5
      g.userData.antlers.add(a1)
      for (let b = 0; b < 5; b++) {
        const br = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 5), lam("#b8a888"))
        br.position.set(sx + sx * (0.18 + b * 0.14), 2.85 + b * 0.16, -0.9)
        br.rotation.z = sx > 0 ? -1.1 : 1.1
        g.userData.antlers.add(br)
        const br2 = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 4), lam("#c9b898"))
        br2.position.set(sx + sx * (0.24 + b * 0.14), 2.92 + b * 0.16, -0.9)
        br2.rotation.z = sx > 0 ? -1.6 : 1.6
        g.userData.antlers.add(br2)
      }
    }
    g.add(g.userData.antlers)
    const tail = sph(0.1, "#d4ccb8")
    tail.position.set(0, 1.2, 1.25)
    g.add(tail)
    addLegs(g, legs, [-0.3, 0.3], -0.5, 0.14, 1.0, "#d4ccb8")
    addLegs(g, legs, [-0.3, 0.3], 0.55, 0.14, 1.0, "#d4ccb8")
    legs.forEach(l => {
      addHooves(l, 2, 0.08, 0.12, "#8a8070")
      const dew = box(0.04, 0.05, 0.1, "#8a8070")
      dew.position.set(0, -0.94, 0.14)
      l.add(dew)
    })
  } else if (type === "bull") {
    const body = hsph(1.35, "#2e2a28")
    body.scale.set(1.1, 1, 1.45)
    body.position.y = 1.9
    g.add(body)
    const hump = hsph(0.7, "#3a3532")
    hump.position.set(0, 2.9, -0.5)
    g.add(hump)
    const head = hsph(0.62, "#2e2a28")
    head.position.set(0, 2.2, -1.7)
    g.add(head)
    const snout = hsph(0.3, "#8a6a5a")
    snout.position.set(0, 1.95, -2.2)
    g.add(snout)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 14), std("#d9b45b", { emissive: "#8a6a1e", emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.25 }))
    ring.position.set(0, 1.88, -2.42)
    g.add(ring)
    for (const sx of [-0.35, 0.35]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.75, 10), std("#e8dcc0", { metalness: 0.7, roughness: 0.3 }))
      horn.position.set(sx * 1.7, 2.55, -1.65)
      horn.rotation.z = sx > 0 ? -0.9 : 0.9
      g.add(horn)
      const tipCap = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), std("#f2ead8", { metalness: 0.8, roughness: 0.2 }))
      tipCap.position.set(sx * 2.1, 2.98, -1.7)
      tipCap.rotation.z = sx > 0 ? -0.9 : 0.9
      g.add(tipCap)
      for (let k = 0; k < 2; k++) {
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.13 - k * 0.025, 0.028, 6, 12).rotateX(Math.PI / 2), std("#c9b898", { metalness: 0.6, roughness: 0.4 }))
        const wrap = new THREE.Group()
        wrap.position.set(sx * 1.7, 2.55 + k * 0.3, -1.65 - k * 0.06)
        wrap.rotation.z = sx > 0 ? -0.9 : 0.9
        wrap.add(ridge)
        g.add(wrap)
      }
    }
    const eyeL = sph(0.07, "#d94f2f", { emissive: "#8a2a12", emissiveIntensity: 0.9 }); eyeL.position.set(-0.3, 2.35, -2.05); g.add(eyeL)
    const eyeR = eyeL.clone(); eyeR.position.x = 0.3; g.add(eyeR)
    const plateF = sph(0.3, "#3a3532")
    plateF.scale.set(1.2, 0.7, 0.6)
    plateF.position.set(0, 2.6, -1.8)
    g.add(plateF)
    const trimF = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 20), std("#b98f3f", { metalness: 0.8, roughness: 0.3 }))
    trimF.rotation.x = Math.PI / 2
    trimF.position.set(0, 2.28, -1.78)
    g.add(trimF)
    for (const sx of [-0.95, 0.95]) {
      const plate = sph(0.45, "#3a3532")
      plate.scale.set(0.7, 0.8, 1)
      plate.position.set(sx, 2.7, -0.3)
      g.add(plate)
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 8, 20), std("#b98f3f", { metalness: 0.8, roughness: 0.3 }))
      trim.rotation.x = Math.PI / 2
      trim.position.set(sx * 1.02, 2.36, -0.3)
      g.add(trim)
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.5
        const rivet = sph(0.05, "#d9b45b", {}, 8, 6)
        rivet.position.set(sx * 0.96 + Math.cos(a) * 0.34, 2.5 + Math.sin(a) * 0.42, -0.3)
        g.add(rivet)
      }
    }
    for (let i = 0; i < 5; i++) {
      const spineP = box(0.14, 0.12, 0.5, "#3a3532")
      spineP.position.set(0, 3.4 + i * 0.22, -0.8 + i * 0.25)
      spineP.rotation.x = -0.2
      g.add(spineP)
    }
    for (const sx of [-0.6, 0.6]) {
      const skirt = box(0.5, 0.16, 0.3, "#3a3532")
      skirt.position.set(sx, 1.1, 0.4)
      skirt.rotation.x = 0.3
      g.add(skirt)
      for (let i = 0; i < 3; i++) {
        const mail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 10).rotateX(Math.PI / 2), std("#8a6a1e", { metalness: 0.7, roughness: 0.4 }))
        mail.position.set(sx, 0.95 - i * 0.1, 0.5 + i * 0.1)
        g.add(mail)
      }
    }
    const muzzle = sph(0.12, "#6a4a3e")
    muzzle.position.set(0, 1.86, -2.18)
    g.add(muzzle)
    for (const sx of [-0.12, 0.12]) {
      const nostril = sph(0.04, "#1a1210")
      nostril.position.set(sx, 1.88, -2.3)
      g.add(nostril)
    }
    addLegs(g, legs, [-0.7, 0.7], -0.8, 0.34, 1.2, "#241f1d")
    addLegs(g, legs, [-0.7, 0.7], 0.9, 0.34, 1.2, "#241f1d")
    legs.forEach(l => {
      addHooves(l, 2, 0.2, 0.14, "#161311")
    })
    const tail = new THREE.Group()
    const tbase = box(0.1, 0.9, 0.1, "#241f1d")
    tbase.position.set(0, 1.7, 1.9)
    tbase.rotation.x = 0.3
    tail.add(tbase)
    const tuft = sph(0.16, "#161311")
    tuft.position.set(0, 1.28, 2.03)
    tail.add(tuft)
    for (let i = 0; i < 3; i++) {
      const spike = cn(0.03, 0.18, "#161311", 6)
      spike.position.set(0, 1.2 - i * 0.08, 2.1 + i * 0.06)
      spike.rotation.x = 0.5
      tail.add(spike)
    }
    g.add(tail)
    g.userData.tail = tail
  }
  return g
}


function cyl2(rt, rb, h, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), lam(color))
  m.castShadow = true
  return m
}

function cn(r, h, color, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), lam(color))
  m.castShadow = true
  return m
}

function shine(g, x, y, z, r = 0.03) {
  const s = sph(r, "#ffffff", {}, 6, 5)
  s.position.set(x, y, z)
  g.add(s)
  return s
}

// --- GLTF enemy path (Phase 3): assets may provide skinned models per type ---
// Target heights match the procedural models' bounding heights so HP bars,
// telegraphs, knockdown poses and defeat cinematics keep working unchanged.
const PROC_H = { rat: 1.2, fox: 1.5, boar: 1.85, wolf: 1.85, bear: 2.6, owl: 2.4, elder: 3.0, bull: 4.0 }
const MODEL_YAW = { rat: Math.PI, fox: Math.PI, boar: Math.PI, wolf: Math.PI, bear: Math.PI, owl: Math.PI, elder: Math.PI, bull: Math.PI }

function buildModelGLTF(type, A) {
  const g = new THREE.Group()
  const clone = A.model(type)
  if (!clone) return buildModel(type)
  const bb = new THREE.Box3().setFromObject(clone)
  const h = Math.max(0.001, bb.max.y - bb.min.y)
  clone.scale.setScalar((PROC_H[type] || 1.8) / h)
  bb.setFromObject(clone)
  clone.position.y -= bb.min.y
  // SkinnedMesh bounding spheres don't follow posed bones — disable culling
  clone.traverse((o) => { if (o.isMesh) o.frustumCulled = false })
  const inner = new THREE.Group()
  inner.rotation.y = MODEL_YAW[type] ?? Math.PI
  inner.add(clone)
  g.add(inner)
  const clips = A.clips(type)
  let flyClip = null
  if (type === "owl") {
    const anims = A.gltf(type)?.animations || []
    flyClip = anims.find(c => /fly|flap|glide/i.test(c.name)) || null
  }
  g.userData.gltf = { mixer: new THREE.AnimationMixer(clone), clips, flyClip }
  return g
}

function makeTelegraph() {
  const g = new THREE.Group()
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 15, 1, 1),
    new THREE.MeshBasicMaterial({ color: "#ff5a33", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  )
  lane.rotation.x = -Math.PI / 2
  lane.position.z = 7.5
  const head = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.2, 1, 1),
    new THREE.MeshBasicMaterial({ color: "#ff7a4d", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  )
  head.rotation.x = -Math.PI / 2
  head.position.z = 15.4
  g.add(lane)
  g.add(head)
  g.position.y = 0.16
  g.visible = false
  return { group: g, mats: [lane.material, head.material] }
}

const HP = { rat: 2, fox: 2, boar: 3, wolf: 3, bear: 4, owl: 3, elder: 3, bull: 4 }
const BAR_Y = { rat: 1.7, fox: 2.0, boar: 2.4, wolf: 2.5, bear: 3.5, owl: 3.0, elder: 3.9, bull: 5.3 }
const BAR_W = { bull: 2.6 }

function makeHealthBar(barW) {
  const g = new THREE.Group()
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#1d1710", transparent: true, opacity: 0.85, depthWrite: false }))
  bg.scale.set(barW + 0.14, 0.24, 1)
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#4caf50", transparent: true, opacity: 0.95, depthWrite: false }))
  fg.center.set(0, 0.5)
  fg.scale.set(barW, 0.13, 1)
  fg.position.x = -barW / 2
  g.add(bg)
  g.add(fg)
  g.visible = false
  return { group: g, fg }
}

const SITE_OFFS = [
  [[-4, 2], [4, 3], [-3, -4], [3, 4], [-5, 0], [4, -3], [-2, 5]],
  [[-4, 2], [4, 3], [-3, -4], [3, 4], [-5, 0], [4, -3], [-2, 5]],
  [[-4, 2], [4, 3], [-3, -4], [3, 4], [-5, 0], [4, -3], [-2, 5]]
]

export class EnemyManager {
  constructor(scene, fx, opts = {}, A = null) {
    this.scene = scene
    this.fx = fx
    this.assets = A
    this.onPlayerHit = opts.onPlayerHit || null
    this.onPerfectBlock = opts.onPerfectBlock || null
    this.onKnockdown = opts.onKnockdown || null
    this.player = null
    this.enemies = []
    this.near = null
    this.shakeT = 0
    this.bossBlockCd = 0
    this.combo = 0
    this.comboT = 0
  }

  spawnAll() {
    const byZone = { woods: [], plains: [], highlands: [] }
    BATTLES.forEach((b, i) => byZone[b.zone].push({ battle: b, idx: i }))
    const siteCounters = { woods: [0, 0, 0], plains: [0, 0, 0], highlands: [0, 0, 0] }
    for (const zn of ["woods", "plains", "highlands"]) {
      byZone[zn].forEach(({ battle, idx }, k) => {
        const siteIdx = k < 3 ? k : (k % 3)
        const site = BATTLE_SPOTS[["woods", "plains", "highlands"].indexOf(zn) * 3 + siteIdx]
        const off = SITE_OFFS[["woods", "plains", "highlands"].indexOf(zn)][siteCounters[zn][siteIdx] % SITE_OFFS[["woods", "plains", "highlands"].indexOf(zn)].length]
        siteCounters[zn][siteIdx]++
        this.spawn(battle.enemy, site.x + off[0], site.z + off[1], battle, idx)
      })
    }
    this.spawn(BOSS.enemy, 0, 4, null, 20)
  }

  spawn(type, x, z, battle, idx) {
    const model = (this.assets && this.assets.model(type)) ? buildModelGLTF(type, this.assets) : buildModel(type)
    model.rotation.y = Math.PI
    const gr = new THREE.Group()
    gr.add(model)
    const y = heightAt(x, z)
    gr.position.set(x, y, z)
    this.scene.add(gr)
    const done = battle ? !!S.defeated[battle.id] : S.bossDone
    const maxHp = HP[type] || 3
    const barW = BAR_W[type] || 1.5
    const bar = makeHealthBar(barW)
    bar.group.position.y = BAR_Y[type] || 2
    gr.add(bar.group)
    const tg = makeTelegraph()
    gr.add(tg.group)
    const meshes = []
    model.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        meshes.push(o)
        o.userData.be = o.material.emissive.getHex()
      }
    })
    const gm = model.userData.gltf || null
    const e = {
      type, battle, idx, model, group: gr,
      name: battle ? battle.title : NAMES[type],
      fullName: NAMES[type],
      home: new THREE.Vector3(x, y, z),
      state: done ? "gone" : "idle",
      wanderT: Math.random() * 10,
      hopT: 0,
      defeatT: -1,
      defeated: false,
      hp: done ? 0 : maxHp,
      maxHp,
      bar,
      meshes,
      mixer: gm ? gm.mixer : null,
      clips: gm ? gm.clips : null,
      flyClip: gm ? gm.flyClip : null,
      actions: {},
      curAction: null,
      curAnim: null,
      flashT: 0,
      flinchT: -1,
      staggerT: -1,
      chargeState: "none",
      chargeCd: 3 + Math.random() * 4,
      chargeDir: new THREE.Vector3(),
      windDur: type === "owl" ? 0.95 : 1.35,
      tg: tg.group,
      tgMats: tg.mats,
      barShakeT: 0
    }
    if (e.state === "gone") { gr.visible = false; e.defeated = true }
    this.enemies.push(e)
    return e
  }

  get boss() { return this.enemies[this.enemies.length - 1] }

  engaged(playerPos) {
    for (const e of this.enemies) {
      if (e.state === "gone" || e.defeatT >= 0) continue
      if (e.chargeState !== "none") return true
      if (e.state === "alert" && e.group.position.distanceTo(playerPos) < 14) return true
    }
    return false
  }

  hideTelegraph(e) {
    if (!e.tg) return
    e.tg.visible = false
    for (const m of e.tgMats) m.opacity = 0
  }  update(dt, t, player, uiOpen) {
    this.player = player
    const playerPos = player.pos
    this.near = null
    let nd = 6.5
    this.bossBlockCd -= dt
    for (const e of this.enemies) {
      if (e.state === "gone") continue
      if (e.defeatT >= 0) { this.updateDefeat(e, dt); continue }

      const d = e.group.position.distanceTo(playerPos)
      const isBoss = !e.battle

      this.updateCommon(e, dt, t)

      if (isBoss) {
        e.group.lookAt(playerPos.x, e.group.position.y, playerPos.z)
        if (d < 9 && this.bossBlockCd <= 0 && !uiOpen) {
          const total = Object.keys(S.defeated).filter(k => S.defeated[k] && k !== "boss").length
          this.bossBlockCd = 6
          if (total >= 20) {
            this.near = e
          } else {
            window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83d\udc02 The Bull Market snorts: \u201cBring me twenty truths, then we talk.\u201d" }))
          }
        }
        this.bossAI(e, dt, t, d, uiOpen)
        e.group.position.y = heightAt(e.group.position.x, e.group.position.z)
        if (e.model.userData.legs) e.model.userData.legs.forEach((leg, i) => { leg.rotation.x = e.walking ? Math.sin(t * 8 + i * 1.3) * 0.5 : Math.sin(t * 1.2) * 0.06 })
        this.breathe(e, t)
        this.updateBar(e, d)
        continue
      }

      if (d < nd && e.state !== "defeat" && !uiOpen) { this.near = e; nd = d }

      if (e.down) {
        e.group.position.y = heightAt(e.group.position.x, e.group.position.z)
        this.updateBar(e, d)
        continue
      }

      if (e.staggerT >= 0) {
        this.stateStagger(e, dt)
      } else if (e.diving) {
        this.stateDive(e, dt, t, playerPos)
      } else if (e.fleeing) {
        this.stateFlee(e, dt, playerPos)
      } else if (e.chargeState === "windup") {
        this.stateWindup(e, dt, playerPos)
      } else if (e.chargeState === "charge") {
        this.stateCharge(e, dt, t, playerPos)
      } else if (d < 11 && !uiOpen) {
        e.state = "alert"
        e.group.lookAt(playerPos.x, e.group.position.y, playerPos.z)
        const lowHp = e.hp <= Math.max(1, Math.ceil(e.maxHp / 3))
        const coward = (e.type === "rat" || e.type === "fox") && lowHp && !e.hasFled
        if (coward && d > 2.5) {
          e.hasFled = true
          e.fleeing = true
          e.fleeT = 2.2
          e.chargeState = "none"
          this.hideTelegraph(e)
          window.dispatchEvent(new CustomEvent("toast", { detail: e.type === "fox" ? "\ud83e\udd8a The trickster turns tail — strike now!" : "\ud83d\udc00 The rat scurries — finish it!" }))
        } else if (e.type === "bear" && lowHp && !e.enraged) {
          e.enraged = true
          e.windDur = 0.8
          e.chargeCd = Math.min(e.chargeCd, 0.6)
          e.model.traverse(o => { if (o.isMesh && o.material.emissive) { o.material.emissive.setHex(0xa32a12); o.material.emissiveIntensity = 0.55; o.userData.be = 0xa32a12 } })
          window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83d\udc3b The bear is ENRAGED! Its charges come faster!" }))
          audio.growl()
        } else if (e.type === "owl" && lowHp && !e.diving && !e.usedDive && e.chargeCd <= 0 && d > 5) {
          e.usedDive = true
          e.diving = true
          e.chargeState = "none"
          e.diveDur = 1.5
          e.diveT = e.diveDur
          e.diveOrigin = e.group.position.clone()
          e.diveTarget = { x: playerPos.x, z: playerPos.z }
          this.hideTelegraph(e)
          audio.growl()
          window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83e\udd89 The Owl Sentinel takes flight — raise your shield!" }))
        } else {
        e.chargeCd -= dt
        if (e.chargeCd <= 0 && d > 2.6) {
          e.chargeState = "windup"
          e.windT = e.windDur
          e.model.rotation.x = 0
          audio.growl()
        } else {
          if (d > 3.2) {
            if (e.strafeDir === undefined) e.strafeDir = Math.random() < 0.5 ? 1 : -1
            if (!e.strafeSwapT) e.strafeSwapT = 1.5 + Math.random() * 2
            e.strafeSwapT -= dt
            if (e.strafeSwapT <= 0) { e.strafeDir *= -1; e.strafeSwapT = 1.5 + Math.random() * 2.5 }
            const dx = e.group.position.x - playerPos.x
            const dz = e.group.position.z - playerPos.z
            const dl = Math.hypot(dx, dz) || 1
            const px = (-dz / dl) * e.strafeDir, pz = (dx / dl) * e.strafeDir
            const pull = d > 8 ? -0.35 : d < 4.5 ? 0.4 : 0
            const mvx = px + (dx / dl) * pull, mvz = pz + (dz / dl) * pull
            const ml = Math.hypot(mvx, mvz) || 1
            const sspd = (e.type === "bear" ? 1.6 : 2.6) * (0.8 + Math.sin(t * 1.7 + e.home.x) * 0.2)
            e.group.position.x += (mvx / ml) * sspd * dt
            e.group.position.z += (mvz / ml) * sspd * dt
            e.group.lookAt(playerPos.x, e.group.position.y, playerPos.z)
            e.walking = true
          } else {
            e.walking = false
          }
          e.hopT -= dt
          if (e.hopT <= 0) { e.hopT = 1.2 + Math.random(); e.hop = 0.001 }
          if (e.hop) {
            e.hop += dt * 5
            e.model.position.y = Math.abs(Math.sin(e.hop * 4)) * 0.3
            if (e.hop > 1.5) e.hop = null
          }
          if (!e.growled) { e.growled = true; audio.growl() }
        }
        }
      } else {
        e.state = d < 11 ? "alert" : "idle"
        e.growled = false
        e.wanderT -= dt
        if (e.wanderT <= 0) {
          e.wanderT = 3 + Math.random() * 4
          const a = Math.random() * Math.PI * 2
          e.tx = e.home.x + Math.cos(a) * 4
          e.tz = e.home.z + Math.sin(a) * 4
        }
        if (e.tx !== undefined) {
          const dx = e.tx - e.group.position.x, dz = e.tz - e.group.position.z
          const dd = Math.hypot(dx, dz)
          if (dd > 0.3) {
            e.group.position.x += (dx / dd) * dt * 1.2
            e.group.position.z += (dz / dd) * dt * 1.2
            e.group.rotation.y = Math.atan2(dx, dz)
          }
        }
      }
      if (!e.diving) e.group.position.y = heightAt(e.group.position.x, e.group.position.z)
      this.breathe(e, t)
      const walk = e.chargeState === "charge" ? 0 : (e.state === "idle" ? Math.sin(t * 6 + e.home.x) : Math.sin(t * 10))
      const amp = (e.walking && e.state !== "idle") ? 0.55 : 0.4
      if (e.model.userData.legs) e.model.userData.legs.forEach((leg, i) => { leg.rotation.x = walk * amp * ((i === 0 || i === 3) ? 1 : -1) })
      if (e.model.userData.wings) e.model.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * 2.2) * 0.25) })
      this.updateBar(e, d)
    }
    if (this.shakeT > 0) this.shakeT -= dt
    if (this.comboT > 0) {
      this.comboT -= dt
      if (this.comboT <= 0) this.combo = 0
    }
  }

  updateCommon(e, dt, t) {
    if (e.kb) {
      e.group.position.x += e.kb.x * dt
      e.group.position.z += e.kb.z * dt
      e.kb.multiplyScalar(Math.exp(-6 * dt))
    }
    if (e.mixer) this.updateAnim(e, dt, t)
    if (e.model.userData.tail) e.model.userData.tail.rotation.y = Math.sin(t * 3.2 + e.home.x) * 0.35
    if (e.flashT > 0) {
      e.flashT -= dt
      const k = Math.max(0, e.flashT / 0.28)
      for (const m of e.meshes) m.material.emissive.setRGB(0.95 * k, 0.15 * k, 0.1 * k)
      if (e.flashT <= 0) for (const m of e.meshes) m.material.emissive.setHex(m.userData.be)
    }
    if (e.flinchT >= 0) {
      e.flinchT -= dt
      if (e.down) { e.flinchT = -1 }
      else {
        const k = Math.max(0, e.flinchT / 0.32)
        e.model.rotation.x = -Math.sin((1 - k) * Math.PI) * 0.4
        if (e.flinchT < 0) e.model.rotation.x = 0
      }
    }
    if (e.barShakeT > 0) e.barShakeT -= dt
  }

  updateAnim(e, dt, t) {
    const c = e.clips
    if (!c) return
    if (e.defeatT >= 0 || e.state === "defeat") {
      if (e.curAnim !== "defeat") { e.mixer.stopAllAction(); e.curAnim = "defeat" }
      return
    }
    if (e.down) {
      if (e.curAnim !== "down") { e.mixer.stopAllAction(); e.curAnim = "down" }
      return
    }
    let key, ts = 1
    if (e.staggerT >= 0) key = "stagger"
    else if (e.diving) key = "run"
    else if (e.fleeing) key = "run"
    else if (e.chargeState === "windup") { key = "idle"; ts = 0.6 }
    else if (e.chargeState === "charge") key = "run"
    else if (e.walking) key = "walk"
    else key = "idle"
    if (key === "stagger") {
      if (e.curAnim !== "stagger") { e.mixer.stopAllAction(); e.curAnim = "stagger" }
      return
    }
    let clip
    if (key === "run") clip = (e.type === "owl" && e.flyClip) ? e.flyClip : (c.run || c.walk)
    else if (key === "walk") clip = c.walk || c.run || (e.type === "owl" && e.flyClip)
    else clip = (e.type === "owl" && e.flyClip) ? e.flyClip : c.idle
    if (!clip) return
    let a = e.actions[key]
    if (!a) {
      a = e.mixer.clipAction(clip)
      a.setLoop(THREE.LoopRepeat)
      e.actions[key] = a
    }
    if (e.curAction !== a) {
      a.reset().setEffectiveTimeScale(ts).setEffectiveWeight(1)
      if (e.curAction) a.crossFadeFrom(e.curAction, 0.15, false)
      a.play()
      e.curAction = a
    } else {
      a.timeScale = ts
    }
    e.curAnim = key
    e.mixer.update(dt)
  }

  updateBar(e, d) {
    const bar = e.bar
    // Boss (Bull Market) has no floating bar over its head — reads cleaner.
    if (!e.battle) { bar.group.visible = false; return }
    if (e.hp >= e.maxHp && d > 15) { bar.group.visible = false; return }
    bar.group.visible = true
    const ratio = Math.max(0, e.hp / e.maxHp)
    bar.fg.scale.x = Math.max(0.001, (BAR_W[e.type] || 1.5) * ratio)
    bar.fg.material.color.setHex(ratio > 0.55 ? 0x4caf50 : ratio > 0.28 ? 0xe0a33c : 0xd9452f)
    bar.group.position.x = e.barShakeT > 0 ? (Math.random() - 0.5) * 0.5 * e.barShakeT : 0
  }

  bossAI(e, dt, t, d, uiOpen) {
    if (e.staggerT >= 0) { this.stateStagger(e, dt); return }
    const pp = this.player.pos
    e.walking = false
    if (!uiOpen && d > 5 && d < 24) {
      const dx = pp.x - e.group.position.x
      const dz = pp.z - e.group.position.z
      const dl = Math.hypot(dx, dz) || 1
      e.group.position.x += (dx / dl) * 2.3 * dt
      e.group.position.z += (dz / dl) * 2.3 * dt
      e.walking = true
      if (Math.random() < dt * 2) this.fx.burst("dust", e.group.position.x, e.group.position.y + 0.2, e.group.position.z, 1)
    }
    e.group.lookAt(pp.x, e.group.position.y, pp.z)
    if (e.walking) e.model.position.y = Math.abs(Math.sin(t * 4)) * 0.12
  }

  stateWindup(e, dt, playerPos) {
    e.windT -= dt
    const prog = 1 - Math.max(0, e.windT / e.windDur)
    if (prog < 0.4) e.group.lookAt(playerPos.x, e.group.position.y, playerPos.z)
    const k = Math.max(0, e.windT / e.windDur)
    e.model.rotation.x = 0.35 * (1 - k)
    e.model.position.y = -0.12 * (1 - k)
    const dx = playerPos.x - e.group.position.x
    const dz = playerPos.z - e.group.position.z
    e.lastAim = { x: dx, z: dz }
    if (e.tg) {
      e.tg.rotation.y = Math.atan2(dx, dz)
      e.tg.visible = true
      const o = (1 - k) * 0.4
      for (const m of e.tgMats) m.opacity = o
    }
    if (Math.random() < dt * 8) this.fx.burst("dust", e.group.position.x, e.group.position.y + 0.1, e.group.position.z, 1)
    if (e.windT <= 0) {
      e.model.rotation.x = 0
      e.chargeState = "charge"
      e.chargeT = 0
      e.chargeDist = 0
      e.chargeDir.set(dx, 0, dz).normalize()
      this.hideTelegraph(e)
      audio.growl()
    }
  }

  stateFlee(e, dt, playerPos) {
    e.fleeT -= dt
    const dx = e.group.position.x - playerPos.x
    const dz = e.group.position.z - playerPos.z
    const dl = Math.hypot(dx, dz) || 1
    const spd = e.type === "fox" ? 5.2 : 4.4
    e.group.position.x += (dx / dl) * spd * dt
    e.group.position.z += (dz / dl) * spd * dt
    e.group.rotation.y = Math.atan2(dx, dz)
    e.model.position.y = Math.abs(Math.sin(e.fleeT * 12)) * 0.2
    if (Math.random() < dt * 6) this.fx.burst("dust", e.group.position.x, e.group.position.y + 0.1, e.group.position.z, 1)
    if (e.fleeT <= 0) {
      e.fleeing = false
      e.chargeCd = 2.5 + Math.random() * 2
    }
  }

  stateDive(e, dt, t, playerPos) {
    e.diveT -= dt
    const total = e.diveDur
    const k = 1 - Math.max(0, e.diveT) / total
    const ox = e.diveOrigin.x, oz = e.diveOrigin.z
    const tx = e.diveTarget.x, tz = e.diveTarget.z
    const gx = ox + (tx - ox) * k, gz = oz + (tz - oz) * k
    const arc = Math.sin(k * Math.PI)
    e.group.position.x = gx
    e.group.position.z = gz
    e.group.position.y = heightAt(gx, gz) + arc * 6.5
    e.group.lookAt(tx, e.group.position.y, tz)
    if (Math.random() < dt * 10) this.fx.burst("spark", gx, e.group.position.y + 0.5, gz, 1)
    const d = Math.hypot(playerPos.x - gx, playerPos.z - gz)
    if (d < 2.4 && k > 0.35) {
      e.diveT = -1
      this.resolveDiveImpact(e, playerPos)
    } else if (e.diveT <= 0 || k >= 1) {
      e.diveT = -1
      e.chargeState = "none"
      e.chargeCd = 4 + Math.random() * 2
      e.diving = false
    }
  }

  resolveDiveImpact(e, playerPos) {
    e.chargeState = "none"
    e.diving = false
    e.chargeCd = 4 + Math.random() * 2
    if (this.player && this.player.blocking) {
      const perfect = this.player.blockT < 0.3
      const mx = (e.group.position.x + playerPos.x) / 2
      const mz = (e.group.position.z + playerPos.z) / 2
      const my = e.group.position.y + 1
      this.fx.burst("spark", mx, my, mz, perfect ? 26 : 12)
      this.fx.ring(mx, e.group.position.y + 0.3, mz, perfect ? "#ffe9a3" : "#cfe0f0", 3, 0.5)
      if (perfect) { this.fx.text(mx, my + 0.8, mz, "PARRY!", "#ffe9a3", 1.4); audio.parry(); this.onPerfectBlock?.(e) }
      else audio.clang()
      e.staggerT = perfect ? 1.7 : 0.9
      this.shakeT = Math.max(this.shakeT, 0.3)
    } else {
      this.onPlayerHit?.(e)
    }
  }

  stateCharge(e, dt, t, playerPos) {
    const isBoss = !e.battle
    const spd = isBoss ? 13 : ({ boar: 10, wolf: 9.5, bear: e.enraged ? 11.5 : 8 }[e.type] || 8)
    const reach = isBoss ? 2.8 : 2.1
    e.chargeT += dt
    e.chargeDist += spd * dt
    e.group.position.x += e.chargeDir.x * spd * dt
    e.group.position.z += e.chargeDir.z * spd * dt
    e.group.lookAt(e.group.position.x + e.chargeDir.x, e.group.position.y, e.group.position.z + e.chargeDir.z)
    if (e.model.userData.legs) e.model.userData.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 20 + i * 1.7) * 0.8 })
    if (Math.random() < dt * 16) this.fx.burst("dust", e.group.position.x, e.group.position.y + 0.15, e.group.position.z, 1)
    const d = Math.hypot(playerPos.x - e.group.position.x, playerPos.z - e.group.position.z)
    if (d < reach) {
      this.resolveChargeImpact(e, playerPos)
    } else if (e.chargeT > 2.8 || e.chargeDist > 17) {
      e.chargeState = "none"
      e.chargeCd = 3.5 + Math.random() * 2.5
      this.hideTelegraph(e)
    }
  }

  resolveChargeImpact(e, playerPos) {
    const isBoss = !e.battle
    const mx = (e.group.position.x + playerPos.x) / 2
    const mz = (e.group.position.z + playerPos.z) / 2
    const my = e.group.position.y + (isBoss ? 2.2 : 1.2)
    e.chargeState = "none"
    e.chargeCd = (isBoss ? 5 : 4) + Math.random() * 3
    this.hideTelegraph(e)
    if (this.player && this.player.blocking) {
      const perfect = this.player.blockT < 0.3
      this.fx.burst("spark", mx, my, mz, perfect ? 28 : 12)
      this.fx.ring(mx, e.group.position.y + 0.3, mz, perfect ? "#ffe9a3" : "#cfe0f0", perfect ? 3.2 : 2.2, 0.5)
      if (perfect) {
        this.fx.text(mx, my + 0.8, mz, "PARRY!", "#ffe9a3", 1.4)
        audio.parry()
        this.onPerfectBlock?.(e)
      } else {
        audio.clang()
      }
      this.shakeT = Math.max(this.shakeT, perfect ? 0.32 : 0.14)
      e.staggerT = perfect ? 1.7 : 0.9
      const dx = e.group.position.x - playerPos.x, dz = e.group.position.z - playerPos.z
      const dl = Math.hypot(dx, dz) || 1
      e.kb = e.kb || new THREE.Vector3()
      e.kb.set(dx / dl, 0, dz / dl).multiplyScalar(perfect ? 9 : 5)
      if (perfect) window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83d\udee1 Perfect block! The beast reels." }))
    } else if (this.player && this.player.rollT >= 0) {
      this.fx.text(mx, my + 0.8, mz, "DODGE!", "#cfe0f0", 1.2)
      this.fx.ring(mx, e.group.position.y + 0.3, mz, "#cfe0f0", 2.4, 0.45)
      audio.parry()
      this.shakeT = Math.max(this.shakeT, 0.18)
      this.onPlayerDodge?.(e)
    } else {
      this.fx.burst("dust", mx, my, mz, 8)
      this.onPlayerHit?.(e)
    }
  }

  stateStagger(e, dt) {
    e.staggerT -= dt
    e.model.rotation.z = Math.sin(e.staggerT * 24) * 0.12
    if (e.staggerT < 0) {
      e.model.rotation.z = 0
      e.chargeState = "none"
    }
  }

  hitByPlayer(e, dmg = 1) {
    if (!e || e.state === "gone" || e.defeatT >= 0 || e.defeated || e.down) return false
    const pp = this.player ? this.player.pos : e.group.position
    e.hp = Math.max(e.battle ? 0 : 1, e.hp - dmg)
    e.flashT = 0.28
    e.flinchT = 0.32
    e.barShakeT = 0.35
    const dx = e.group.position.x - pp.x, dz = e.group.position.z - pp.z
    const dl = Math.hypot(dx, dz) || 1
    e.kb = e.kb || new THREE.Vector3()
    e.kb.set(dx / dl, 0, dz / dl).multiplyScalar(dmg > 1 ? 6.5 : 4.5)
    if (e.chargeState !== "none") {
      e.chargeState = "none"
      e.staggerT = 0.75
      this.hideTelegraph(e)
    }
    const hx = e.group.position.x - (dx / dl) * 0.8
    const hz = e.group.position.z - (dz / dl) * 0.8
    const hy = e.group.position.y + (e.type === "bull" ? 2.6 : e.type === "bear" ? 2.0 : 1.2)
    this.fx.burst("spark", hx, hy, hz, dmg > 1 ? 16 : 10)
    this.fx.ring(hx, e.group.position.y + 0.12, hz, "#fff3d0", dmg > 1 ? 2.6 : 1.9, 0.42)
    if (dmg > 1) this.fx.text(hx, hy + 0.7, hz, "2", "#ffd98a", 1.25)
    else this.fx.text(hx, hy + 0.6, hz, "1", "#fff3d0", 1)
    this.combo++
    this.comboT = 4
    if (this.combo >= 2) {
      this.fx.text(hx + (Math.random() - 0.5) * 0.6, hy + 1.15, hz, `x${this.combo}`, "#ffe9a3", 0.85)
      if (this.combo % 3 === 0) { S.gold += this.combo / 3 | 0; saveGame() }
    }
    this.shakeT = Math.max(this.shakeT, dmg > 1 ? 0.22 : 0.14)
    audio.clang()
    if (e.hp === 1 && !e.floorTip) {
      e.floorTip = true
      window.dispatchEvent(new CustomEvent("toast", { detail: "\u2694 It staggers \u2014 one more strike will knock it down!" }))
    }
    if (e.hp === 0 && e.battle && !e.down) {
      e.down = true
      e.state = "down"
      e.chargeState = "none"
      e.fleeing = false
      e.diving = false
      e.staggerT = -1
      e.flinchT = -1
      this.hideTelegraph(e)
      if (e.model.userData.legs) e.model.userData.legs.forEach((l) => { l.rotation.x = 0 })
      e.model.rotation.x = -1.35
      e.model.rotation.z = (Math.random() - 0.5) * 0.2
      e.model.position.y = 0.2
      const P = e.group.position
      this.fx.burst("dust", P.x, P.y + 0.5, P.z, 14)
      this.fx.text(P.x, P.y + 2.4, P.z, "DOWN!", "#ffd98a", 1.3)
      audio.hit()
      this.onKnockdown?.(e)
    }
    return true
  }

  executeKill(e) {
    if (!e || e.state === "gone") return
    const P = e.group.position
    this.fx.burst("spark", P.x, P.y + 1.6, P.z, 30)
    this.fx.burst("poof", P.x, P.y + 1.2, P.z, 16)
    this.shakeT = 0.45
    audio.hit()
    this.startDefeat(e)
  }

  breathe(e, t) {
    const s = 1 + Math.sin(t * 2 + e.home.z) * 0.015
    e.model.scale.x = s
    e.model.scale.z = s
  }

  startDefeat(e) {
    e.defeatT = 0
    e.state = "defeat"
    e.chargeState = "none"
    e.staggerT = -1
    if (e.mixer) e.mixer.stopAllAction()
    e.bar.group.visible = false
    this.hideTelegraph(e)
    e.defeatDir = Math.random() * Math.PI * 2
    audio.clang()
  }

  updateDefeat(e, dt) {
    e.defeatT += dt
    const T = e.defeatT
    const m = e.model
    const g = e.group
    const fx = this.fx
    const finish = () => {
      e.state = "gone"
      e.defeated = true
      g.visible = false
    }
    const P = g.position
    switch (e.type) {
      case "rat": {
        g.rotation.y += dt * 22
        m.scale.setScalar(Math.max(0.01, 1 - T / 1.6))
        m.position.y = Math.abs(Math.sin(T * 20)) * 0.5 * (1 - T / 1.6)
        if (T > 0.4 && Math.random() < 0.4) fx.burst("spark", P.x, P.y + 0.5, P.z, 2)
        if (T >= 1.5) { fx.burst("poof", P.x, P.y + 0.4, P.z, 20); finish() }
        break
      }
      case "fox": {
        if (T < 0.35) { m.position.z = -T * 2; m.scale.y = 1 - T * 0.5 }
        else if (!e.poofed) {
          e.poofed = true
          fx.burst("poof", P.x, P.y + 0.6, P.z, 34)
          audio.magic()
        }
        m.scale.multiplyScalar(1 - dt * 5)
        if (T > 0.8) finish()
        break
      }
      case "boar": {
        m.rotation.x = -Math.min(Math.PI, T * 5.2)
        m.position.y = Math.sin(Math.min(Math.PI, T * 5.2)) * 1.4
        if (T > 1.05 && T < 1.9) {
          if (!e.legsKick) e.legsKick = true
          if (m.userData.legs) m.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(T * 25 + i) * 0.5 })
        }
        if (T > 1.9) { fx.burst("dust", P.x, P.y, P.z, 14); finish() }
        break
      }
      case "wolf": {
        const d = T * 7
        g.position.x = e.home.x + Math.cos(e.defeatDir) * d
        g.position.z = e.home.z + Math.sin(e.defeatDir) * d
        g.position.y = heightAt(g.position.x, g.position.z) + Math.abs(Math.sin(T * 8)) * 0.7
        m.rotation.x -= dt * 9
        if (Math.random() < 0.3) fx.burst("dust", g.position.x, g.position.y, g.position.z, 2)
        if (T > 2.2) finish()
        break
      }
      case "bear": {
        if (T < 0.5) { m.rotation.x = -(T / 0.5) * Math.PI / 2; m.position.y = Math.sin((T / 0.5) * Math.PI) * 1.2 }
        if (T >= 0.5 && !e.slammed) {
          e.slammed = true
          this.shakeT = 0.5
          audio.hit()
          fx.burst("dust", P.x, P.y, P.z, 30)
        }
        if (T > 1.8) { fx.burst("dust", P.x, P.y, P.z, 10); finish() }
        break
      }
      case "owl": {
        g.position.y += dt * 2.4
        m.children.forEach(c => { if (c.material) c.material.emissive = new THREE.Color("#ffe9a3"), c.material.emissiveIntensity = Math.min(1.2, T) })
        if (Math.random() < 0.6) fx.burst("spark", P.x, P.y + 1, P.z, 3)
        if (!e.owlSound) { e.owlSound = true; audio.magic() }
        if (T > 2) finish()
        break
      }
      case "elder": {
        if (T < 0.6) { m.rotation.x = -0.5 * (T / 0.6); }
        if (!e.mote) { e.mote = true; audio.magic() }
        m.position.y += dt * 1.2
        m.scale.multiplyScalar(1 - dt * 0.55)
        if (Math.random() < 0.7) fx.burst("spark", P.x, P.y + 1.5, P.z, 4)
        if (T > 1.8) finish()
        break
      }
      case "bull": {
        if (T < 0.8) {
          m.rotation.z = -(T / 0.8) * Math.PI / 2
          m.position.y = Math.sin((T / 0.8) * Math.PI) * 0.8
        }
        if (T >= 0.8 && !e.slammed) {
          e.slammed = true
          this.shakeT = 0.8
          audio.bigFanfare()
          fx.burst("confetti", P.x, P.y + 2, P.z, 60)
          fx.burst("dust", P.x, P.y, P.z, 24)
        }
        if (T > 1.2 && T < 2.6 && Math.random() < 0.2) fx.burst("confetti", P.x, P.y + 3, P.z, 6)
        if (T > 2.8) finish()
        break
      }
    }
  }
}
