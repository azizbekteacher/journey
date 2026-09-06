import * as THREE from "three"

const MAX = 1600
const RINGS = 8
const TEXTS = 12

export class FX {
  constructor(scene) {
    this.scene = scene
    this.pos = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 3)
    this.vel = new Float32Array(MAX * 3)
    this.life = new Float32Array(MAX)
    this.grav = new Float32Array(MAX)
    this.cursor = 0
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3))
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3))
    const m = new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999
    scene.add(this.points)

    this.rings = []
    this.ringCur = 0
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.05, 6, 40).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: "#ffd98a", transparent: true, opacity: 0, depthWrite: false })
      )
      mesh.visible = false
      scene.add(mesh)
      this.rings.push({ mesh, t: -1, dur: 0.5, from: 0.5, to: 3.4 })
    }

    this.texts = []
    this.textCur = 0
    for (let i = 0; i < TEXTS; i++) {
      const cv = document.createElement("canvas")
      cv.width = 128; cv.height = 64
      const tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }))
      spr.visible = false
      spr.renderOrder = 30
      scene.add(spr)
      this.texts.push({ spr, cv, tex, t: -1, dur: 0.9, vy: 0 })
    }
  }

  emit(x, y, z, vx, vy, vz, r, g2, b, life, grav) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.col[i * 3] = r; this.col[i * 3 + 1] = g2; this.col[i * 3 + 2] = b
    this.life[i] = life
    this.grav[i] = grav
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
    c.clearRect(0, 0, 128, 64)
    c.font = "bold 44px Georgia, serif"
    c.textAlign = "center"
    c.textBaseline = "middle"
    c.lineWidth = 8
    c.strokeStyle = "rgba(30,20,8,0.9)"
    c.strokeText(str, 64, 34)
    c.fillStyle = color
    c.fillText(str, 64, 34)
    it.tex.needsUpdate = true
    it.spr.position.set(x, y, z)
    it.spr.scale.set(1.7 * size, 0.85 * size, 1)
    it.t = 0
    it.vy = 1.6
    it.spr.visible = true
    it.spr.material.opacity = 1
  }

  slash(x, y, z, yaw, big = false) {
    const n = big ? 26 : 14
    const spread = big ? 2.4 : 1.7
    const rad = big ? 2.4 : 1.7
    for (let i = 0; i < n; i++) {
      const a = yaw + (i / (n - 1) - 0.5) * spread
      const dx = -Math.sin(a), dz = -Math.cos(a)
      this.emit(x + dx * rad, y + (Math.random() - 0.5) * 0.9, z + dz * rad, dx * (big ? 5 : 3), (Math.random() - 0.3) * 1.5, dz * (big ? 5 : 3), 1, 0.97, 0.85, 0.28, -0.5)
    }
  }

  burst(kind, x, y, z, count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 1.5 + Math.random() * 3.5
      const up = 1.5 + Math.random() * 4
      if (kind === "poof") this.emit(x, y + 0.6, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.95, 0.55, 0.2, 0.9, -1.5)
      else if (kind === "dust") this.emit(x, y + 0.25, z, Math.cos(a) * sp * 0.7, up * 0.4, Math.sin(a) * sp * 0.7, 0.75, 0.66, 0.5, 1.1, -0.8)
      else if (kind === "spark") this.emit(x, y + 0.8, z, Math.cos(a) * sp * 0.5, up * 1.2, Math.sin(a) * sp * 0.5, 1, 0.85, 0.35, 1.2, -1.2)
      else if (kind === "smoke") this.emit(x + (Math.random() - 0.5), y, z, (Math.random() - 0.5) * 0.3, 1 + Math.random(), (Math.random() - 0.5) * 0.3, 0.8, 0.8, 0.8, 2.4, 0.15)
      else if (kind === "water") this.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0.65, 0.85, 0.95, 1.1, -6)
      else if (kind === "confetti") {
        const cs = [[1, 0.8, 0.2], [0.9, 0.3, 0.25], [0.3, 0.7, 0.4], [0.4, 0.6, 0.95], [0.95, 0.95, 0.9]]
        const c = cs[Math.floor(Math.random() * cs.length)]
        this.emit(x, y + 1.5, z, Math.cos(a) * sp, up * 1.6, Math.sin(a) * sp, c[0], c[1], c[2], 2.2, -2.2)
      } else if (kind === "petal") this.emit(x, y + 1, z, Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8, 1, 0.72, 0.8, 2.8, -0.25)
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue }
      this.vel[i * 3 + 1] += this.grav[i] * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true

    for (const r of this.rings) {
      if (r.t < 0) continue
      r.t += dt
      const k = r.t / r.dur
      if (k >= 1) { r.t = -1; r.mesh.visible = false; continue }
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2.2))
      r.mesh.scale.set(s, 1, s)
      r.mesh.material.opacity = 0.75 * (1 - k)
    }

    for (const it of this.texts) {
      if (it.t < 0) continue
      it.t += dt
      const k = it.t / it.dur
      if (k >= 1) { it.t = -1; it.spr.visible = false; continue }
      it.spr.position.y += it.vy * dt
      it.vy *= Math.exp(-2.4 * dt)
      const pop = k < 0.18 ? 1 + (0.18 - k) * 2.4 : 1
      it.spr.scale.set(1.7 * pop, 0.85 * pop, 1)
      it.spr.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
    }
  }
}
