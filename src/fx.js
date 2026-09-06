import * as THREE from "three"

// Phase 5 visual upgrade — pooled FX. Public API unchanged:
// emit(x,y,z,vx,vy,vz,r,g,b,life,grav[,add]) / ring / text / slash /
// burst(kind,x,y,z,count) / update(dt). Two preallocated Points pools
// (normal + additive blending) totalling MAX = 1600 particles, with a
// canvas radial-gradient sprite, per-particle size/alpha and per-kind motion.

const RINGS = 8
const TEXTS = 12
const NRM_MAX = 1000 // dust, smoke, poof, water, confetti, leaves
const ADD_MAX = 600  // sparks, petals, slash streaks, glints — total 1600

// Behavior modes: 0 plain, 1 confetti flutter, 2 petal spiral, 3 air drag.
const CONFETTI_COLORS = [
  [0.95, 0.25, 0.3], [1, 0.55, 0.1], [1, 0.85, 0.15], [0.2, 0.75, 0.35],
  [0.25, 0.5, 0.95], [0.6, 0.3, 0.9], [1, 0.45, 0.7], [0.98, 0.98, 0.95],
]

// Reused spawn-options scratch — keeps emit/burst/slash allocation-free.
const OPT = { size: 1, grow: 0, mode: 0, amp: 0, a0: 1 }

const SOFT_STOPS = [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,0.7)"], [0.65, "rgba(255,255,255,0.22)"], [1, "rgba(255,255,255,0)"]]
const HOT_STOPS = [[0, "rgba(255,255,255,1)"], [0.2, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]

function gradientSprite(stops) {
  const cv = document.createElement("canvas")
  cv.width = 128; cv.height = 128
  const c = cv.getContext("2d")
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1])
  c.fillStyle = g
  c.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class FX {
  constructor(scene) {
    this.scene = scene
    this.pools = [
      this._mkPool(NRM_MAX, THREE.NormalBlending, gradientSprite(SOFT_STOPS), 0.34),
      this._mkPool(ADD_MAX, THREE.AdditiveBlending, gradientSprite(HOT_STOPS), 0.26),
    ]

    this.rings = []
    this.ringCur = 0
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.05, 6, 40).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: "#ffd98a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      )
      mesh.visible = false
      scene.add(mesh)
      this.rings.push({ mesh, t: -1, dur: 0.5, from: 0.5, to: 3.4 })
    }

    this.texts = []
    this.textCur = 0
    for (let i = 0; i < TEXTS; i++) {
      const cv = document.createElement("canvas")
      cv.width = 256; cv.height = 128
      const tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }))
      spr.visible = false
      spr.renderOrder = 30
      scene.add(spr)
      this.texts.push({ spr, cv, tex, t: -1, dur: 0.9, vy: 0 })
    }
  }

  _mkPool(n, blending, map, base) {
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 4)
    const vel = new Float32Array(n * 3)
    const life = new Float32Array(n)
    const maxLife = new Float32Array(n)
    const grav = new Float32Array(n)
    const size = new Float32Array(n)
    const grow = new Float32Array(n)
    const phase = new Float32Array(n)
    const amp = new Float32Array(n)
    const a0 = new Float32Array(n)
    const mode = new Uint8Array(n)
    const sarr = new Float32Array(n)
    for (let i = 0; i < n; i++) { pos[i * 3 + 1] = -9999; col[i * 4 + 3] = 0 }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("color", new THREE.BufferAttribute(col, 4)) // RGBA → per-particle alpha
    const sizeAttr = new THREE.BufferAttribute(sarr, 1)
    g.setAttribute("aSize", sizeAttr)
    const m = new THREE.PointsMaterial({ size: base, map, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, blending })
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = "attribute float aSize;\n" + sh.vertexShader.replace("gl_PointSize = size;", "gl_PointSize = size * aSize;")
    }
    const points = new THREE.Points(g, m)
    points.frustumCulled = false
    points.renderOrder = blending === THREE.AdditiveBlending ? 21 : 20
    this.scene.add(points)
    return { n, cursor: 0, pos, col, vel, life, maxLife, grav, size, grow, phase, amp, a0, mode, sarr, sizeAttr, geo: g }
  }

  _spawn(p, x, y, z, vx, vy, vz, r, g2, b, lifeT, grav, o) {
    const i = p.cursor
    p.cursor = (p.cursor + 1) % p.n
    const i3 = i * 3, i4 = i * 4
    p.pos[i3] = x; p.pos[i3 + 1] = y; p.pos[i3 + 2] = z
    p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz
    p.col[i4] = r; p.col[i4 + 1] = g2; p.col[i4 + 2] = b; p.col[i4 + 3] = o.a0
    p.life[i] = lifeT
    p.maxLife[i] = lifeT
    p.grav[i] = grav
    p.size[i] = o.size
    p.grow[i] = o.grow
    p.mode[i] = o.mode
    p.amp[i] = o.amp
    p.a0[i] = o.a0
    p.phase[i] = Math.random() * Math.PI * 2
  }

  emit(x, y, z, vx, vy, vz, r, g2, b, life, grav, add) {
    let p
    if (add !== undefined) {
      p = add ? 1 : 0
      OPT.size = 1; OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = p ? 0.95 : 1
    } else if (r >= 0.9 && g2 < 0.9 && (b < 0.5 || (b >= 0.6 && b < 0.92))) {
      // Legacy 11-arg callers: route glowy colors to the additive pool —
      // warm glints (fireflies/coins) and petal pink read as emissive.
      p = 1
      OPT.a0 = 0.95; OPT.grow = 0; OPT.amp = 0
      if (b >= 0.6) { OPT.size = 1.35; OPT.mode = 2 } // petal → glow + spiral
      else { OPT.size = 1.1; OPT.mode = 0 }
    } else {
      p = 0
      OPT.size = 1; OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = 1
    }
    this._spawn(this.pools[p], x, y, z, vx, vy, vz, r, g2, b, life, grav, OPT)
  }

  ring(x, y, z, color = "#ffd98a", to = 3.4, dur = 0.5) {
    const r = this.rings[this.ringCur]
    this.ringCur = (this.ringCur + 1) % RINGS
    r.mesh.position.set(x, y, z)
    r.mesh.material.color.set(color)
    r.t = 0
    r.dur = dur
    r.to = to
    r.mesh.visible = true
  }

  text(x, y, z, str, color = "#ffe9a3", size = 1) {
    const it = this.texts[this.textCur]
    this.textCur = (this.textCur + 1) % TEXTS
    const c = it.cv.getContext("2d")
    c.clearRect(0, 0, 256, 128)
    c.font = "bold 88px Georgia, serif"
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.shadowColor = color
    c.shadowBlur = 26
    c.fillStyle = color
    c.fillText(str, 128, 68)
    c.fillText(str, 128, 68)
    c.shadowBlur = 0
    c.lineWidth = 14
    c.strokeStyle = "rgba(30,20,8,0.9)"
    c.strokeText(str, 128, 68)
    c.fillStyle = color
    c.fillText(str, 128, 68)
    it.tex.needsUpdate = true
    it.spr.position.set(x, y, z)
    it.spr.scale.set(1.7 * size, 0.85 * size, 1)
    it.t = 0
    it.vy = 2
    it.spr.visible = true
    it.spr.material.opacity = 1
  }

  slash(x, y, z, yaw, big = false) {
    const add = this.pools[1]
    const n = big ? 30 : 16
    const spread = big ? 2.5 : 1.8
    const rad = big ? 2.5 : 1.8
    for (let i = 0; i < n; i++) {
      // Curved streak: crescent along the horizontal swing plane.
      const t = i / (n - 1) - 0.5
      const a = yaw + t * spread
      const r = rad * (0.8 + 0.35 * Math.cos(t * Math.PI))
      const dx = -Math.sin(a), dz = -Math.cos(a)
      const edge = 1 - Math.abs(t) * 2
      const hot = edge > 0.6
      OPT.size = (0.7 + Math.random() * 0.6) * (big ? 1.35 : 1)
      OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = 0.7 + edge * 0.3
      this._spawn(add, x + dx * r, y + (Math.random() - 0.5) * 0.5, z + dz * r,
        dx * (1.2 + Math.random() * 1.4), (Math.random() - 0.3) * 0.8, dz * (1.2 + Math.random() * 1.4),
        1, hot ? 1 : 0.92, hot ? 0.85 : 0.55, 0.14 + Math.random() * 0.14, -0.5, OPT)
    }
    const m = big ? 14 : 8
    for (let i = 0; i < m; i++) {
      const a = yaw + (Math.random() - 0.5) * spread
      const dx = -Math.sin(a), dz = -Math.cos(a)
      const rr = rad * (0.5 + Math.random() * 0.5)
      const sp = (3 + Math.random() * 2.5) * (big ? 1.4 : 1)
      OPT.size = 0.45 + Math.random() * 0.3; OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = 1
      this._spawn(add, x + dx * rr, y + (Math.random() - 0.5) * 0.8, z + dz * rr,
        dx * sp, (Math.random() - 0.2) * 1.5, dz * sp,
        1, 0.95, 0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.25, -6, OPT)
    }
  }

  burst(kind, x, y, z, count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      if (kind === "poof") {
        const j = 0.9 + Math.random() * 0.2
        OPT.size = 1.6 + Math.random() * 0.5; OPT.grow = 1.1; OPT.mode = 3; OPT.amp = 2; OPT.a0 = 0.65
        this._spawn(this.pools[0], x + ca * 0.25, y + 0.5 + Math.random() * 0.4, z + sa * 0.25,
          ca * (0.5 + Math.random() * 1.1), 0.3 + Math.random() * 0.6, sa * (0.5 + Math.random() * 1.1),
          0.62 * j, 0.55 * j, 0.47 * j, 0.45 + Math.random() * 0.3, 0.3, OPT)
      } else if (kind === "dust") {
        OPT.size = 0.9 + Math.random() * 0.45; OPT.grow = 0.6; OPT.mode = 3; OPT.amp = 1.5; OPT.a0 = 0.8
        this._spawn(this.pools[0], x + ca * 0.3, y + 0.1 + Math.random() * 0.15, z + sa * 0.3,
          ca * (0.8 + Math.random() * 2.2), 0.25 + Math.random() * 0.7, sa * (0.8 + Math.random() * 2.2),
          0.78 + Math.random() * 0.08, 0.66 + Math.random() * 0.06, 0.48 + Math.random() * 0.06,
          0.7 + Math.random() * 0.45, -2.2, OPT)
      } else if (kind === "spark") {
        const hot = Math.random() < 0.5
        OPT.size = 0.5 + Math.random() * 0.35; OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = 1
        this._spawn(this.pools[1], x, y + 0.6 + Math.random() * 0.4, z,
          ca * (1.5 + Math.random() * 3.5), 1.5 + Math.random() * 4, sa * (1.5 + Math.random() * 3.5),
          1, hot ? 1 : 0.82, hot ? 0.75 : 0.3, 0.25 + Math.random() * 0.3, -9, OPT)
      } else if (kind === "smoke") {
        const j = 0.92 + Math.random() * 0.16
        OPT.size = 1.7 + Math.random() * 0.5; OPT.grow = 0.55; OPT.mode = 3; OPT.amp = 0.8; OPT.a0 = 0.5
        this._spawn(this.pools[0], x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5,
          0.58 * j, 0.61 * j, 0.68 * j, 2.2 + Math.random() * 0.9, 0.18, OPT)
      } else if (kind === "water") {
        const white = Math.random() < 0.4
        OPT.size = 0.55 + Math.random() * 0.95; OPT.grow = 0; OPT.mode = 0; OPT.amp = 0; OPT.a0 = 0.9
        this._spawn(this.pools[0], x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 1.4, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.4,
          white ? 0.92 : 0.55, white ? 0.96 : 0.8, white ? 1 : 0.96, 0.9 + Math.random() * 0.4, -7.5, OPT)
      } else if (kind === "confetti") {
        const c = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]
        OPT.size = 0.7 + Math.random() * 0.3; OPT.grow = 0; OPT.mode = 1; OPT.amp = 1.3; OPT.a0 = 1
        this._spawn(this.pools[0], x, y + 1.5, z,
          ca * (1.5 + Math.random() * 2.5), 2 + Math.random() * 3.5, sa * (1.5 + Math.random() * 2.5),
          c[0], c[1], c[2], 2 + Math.random() * 0.9, -1.9, OPT)
      } else if (kind === "petal") {
        OPT.size = 1.15 + Math.random() * 0.35; OPT.grow = 0; OPT.mode = 2; OPT.amp = 0; OPT.a0 = 0.95
        this._spawn(this.pools[1], x + (Math.random() - 0.5) * 0.8, y + 0.8 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.8,
          ca * 0.8, 0.4 + Math.random() * 0.4, sa * 0.8,
          1, 0.6 + Math.random() * 0.12, 0.72 + Math.random() * 0.1, 2.6 + Math.random() * 0.9, -0.22, OPT)
      }
    }
  }

  update(dt) {
    const c2 = Math.cos(2.4 * dt), s2 = Math.sin(2.4 * dt)
    for (const p of this.pools) {
      const { n, pos, col, vel, life, maxLife, grav, size, grow, phase, amp, a0, mode, sarr, sizeAttr } = p
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue
        life[i] -= dt
        const i3 = i * 3, i4 = i * 4
        if (life[i] <= 0) { pos[i3 + 1] = -9999; col[i4 + 3] = 0; continue }
        const age = maxLife[i] - life[i]
        vel[i3 + 1] += grav[i] * dt
        const md = mode[i]
        if (md === 1) { // confetti flutter
          pos[i3] += Math.sin(age * 7 + phase[i]) * amp[i] * dt
          pos[i3 + 2] += Math.cos(age * 5.3 + phase[i] * 1.7) * amp[i] * dt
        } else if (md === 2) { // petal spiral: rotate horizontal velocity + terminal fall
          const vx = vel[i3], vz = vel[i3 + 2]
          vel[i3] = vx * c2 - vz * s2
          vel[i3 + 2] = vx * s2 + vz * c2
          vel[i3 + 1] += (-0.75 - vel[i3 + 1]) * (dt * 2.2 > 1 ? 1 : dt * 2.2)
        } else if (md === 3) { // air drag
          const f = 1 / (1 + amp[i] * dt)
          vel[i3] *= f; vel[i3 + 1] *= f; vel[i3 + 2] *= f
        }
        pos[i3] += vel[i3] * dt
        pos[i3 + 1] += vel[i3 + 1] * dt
        pos[i3 + 2] += vel[i3 + 2] * dt
        let s = size[i] * (1 + grow[i] * age)
        if (md === 1) s *= 0.8 + 0.35 * Math.sin(age * 9 + phase[i])
        sarr[i] = s
        let fo = life[i] / maxLife[i] // eased fade-out, quick fade-in
        fo = fo * fo * (3 - 2 * fo)
        const fi = age * 8
        col[i4 + 3] = a0[i] * fo * (fi >= 1 ? 1 : fi)
      }
      p.geo.attributes.position.needsUpdate = true
      p.geo.attributes.color.needsUpdate = true
      sizeAttr.needsUpdate = true
    }

    for (const r of this.rings) {
      if (r.t < 0) continue
      r.t += dt
      const k = r.t / r.dur
      if (k >= 1) { r.t = -1; r.mesh.visible = false; continue }
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2.2))
      r.mesh.scale.set(s, 1, s)
      r.mesh.material.opacity = 0.62 * Math.pow(1 - k, 1.6)
    }

    for (const it of this.texts) {
      if (it.t < 0) continue
      it.t += dt
      const k = it.t / it.dur
      if (k >= 1) { it.t = -1; it.spr.visible = false; continue }
      it.spr.position.y += it.vy * dt
      it.vy *= Math.exp(-2.6 * dt)
      const pop = k < 0.18 ? 1 + (0.18 - k) * 2.4 : 1
      it.spr.scale.set(1.7 * pop, 0.85 * pop, 1)
      it.spr.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
    }
  }
}
