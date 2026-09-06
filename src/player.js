import * as THREE from "three"
import { heightAt } from "./world.js"
import { audio } from "./audio.js"
import { S } from "./state.js"

function lam(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}
function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.55, ...opts })
}
function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color, opts))
  m.castShadow = true
  return m
}
function sph(r, color, opts = {}, w = 22, h = 16) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), lam(color, opts))
  m.castShadow = true
  return m
}

function isTyping() {
  const tag = document.activeElement?.tagName
  return tag === "TEXTAREA" || tag === "INPUT"
}

function uiBlocking() {
  const $ = (id) => document.getElementById(id)
  return !$("battle").classList.contains("hidden") ||
    !$("notebook").classList.contains("hidden") ||
    !$("plan").classList.contains("hidden") ||
    !$("win").classList.contains("hidden") ||
    !$("title").classList.contains("hidden")
}

function buildHorse() {
  const g = new THREE.Group()
  const fur = "#7a4f2c", furD = "#6b4425", furX = "#5d3a20", dark = "#2e211a", maneC = "#3a2a1a", tack = "#5d4630", gold = "#d9b45b", cloth = "#b03a30"

  const chest = sph(0.6, fur, {}, 22, 15)
  chest.scale.set(1.05, 0.98, 0.9)
  chest.position.set(0, 1.68, -1.05)
  g.add(chest)

  const barrel = sph(0.68, fur, {}, 24, 16)
  barrel.scale.set(1.02, 1, 1.5)
  barrel.position.y = 1.58
  g.add(barrel)

  const rump = sph(0.58, furD, {}, 22, 15)
  rump.scale.set(0.95, 1.05, 0.9)
  rump.position.set(0, 1.6, 1.05)
  g.add(rump)

  const belly = sph(0.72, "#8a5c36", {}, 18, 12)
  belly.scale.set(0.88, 0.52, 1.45)
  belly.position.set(0, 1.08, 0.1)
  g.add(belly)

  for (const bx of [-1, 1]) {
    const girthStripe = box(0.05, 0.9, 0.08, tack)
    girthStripe.position.set(bx * 0.6, 1.42, 0)
    girthStripe.rotation.z = bx > 0 ? -0.12 : 0.12
    g.add(girthStripe)
  }

  const withers = sph(0.28, furD, {}, 14, 10)
  withers.scale.set(1, 0.7, 0.9)
  withers.position.set(0, 2.0, -0.6)
  g.add(withers)

  const loin = sph(0.26, furD, {}, 14, 10)
  loin.scale.set(1, 0.6, 1.3)
  loin.position.set(0, 1.78, 0.55)
  g.add(loin)

  for (let i = 0; i < 4; i++) {
    const seg = box(0.42 - i * 0.05, 0.7 - i * 0.1, 0.52 - i * 0.04, i % 2 ? furD : fur)
    seg.position.set(0, 2.1 + i * 0.36, -1.1 - i * 0.17)
    seg.rotation.x = -0.26 - i * 0.1
    g.add(seg)
  }

  const maneBase = box(0.16, 0.14, 1.2, maneC)
  maneBase.position.set(0, 2.72, -0.62)
  maneBase.rotation.x = -0.5
  g.add(maneBase)
  for (let i = 0; i < 9; i++) {
    const strand = box(0.05, 0.92 - i * 0.06, 0.32, i % 2 ? dark : maneC)
    strand.position.set(i % 2 ? 0.09 : -0.09, 2.6 + i * 0.14, -0.24 - i * 0.16)
    strand.rotation.x = -0.55 - i * 0.05
    strand.rotation.z = i % 2 ? -0.16 : 0.16
    g.add(strand)
  }
  for (let i = 0; i < 5; i++) {
    const forelock = box(0.05, 0.4, 0.05, dark)
    forelock.position.set(i % 2 ? 0.08 : -0.08, 3.28 + i * 0.07, -1.62 - i * 0.03)
    forelock.rotation.x = 0.55
    g.add(forelock)
  }

  const head = sph(0.3, furD, {}, 18, 13)
  head.scale.set(0.9, 0.95, 1.25)
  head.position.set(0, 3.15, -1.8)
  g.add(head)

  const muzzle = sph(0.16, furX, {}, 14, 10)
  muzzle.scale.set(0.95, 0.85, 1.5)
  muzzle.position.set(0, 3.02, -2.16)
  g.add(muzzle)

  for (const sx of [-0.09, 0.09]) {
    const nostril = sph(0.035, dark, {}, 6, 5)
    nostril.position.set(sx, 2.98, -2.34)
    g.add(nostril)
  }

  const jawL = box(0.3, 0.1, 0.42, furX)
  jawL.position.set(0, 2.9, -1.98)
  g.add(jawL)

  const browL = box(0.14, 0.04, 0.24, furD)
  browL.position.set(0, 3.4, -1.78)
  g.add(browL)

  const throat = box(0.12, 0.5, 0.14, furD)
  throat.position.set(0, 2.68, -1.5)
  throat.rotation.x = 0.5
  g.add(throat)

  for (const sx of [-0.16, 0.16]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 7), lam(furD))
    ear.position.set(sx, 3.5, -1.72)
    g.add(ear)
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), lam("#c98a7a"))
    inner.position.set(sx, 3.52, -1.7)
    g.add(inner)
    const eye = sph(0.055, "#1a120a", {}, 10, 8)
    eye.position.set(sx, 3.3, -1.98)
    g.add(eye)
    const lid = sph(0.06, furD, {}, 10, 8)
    lid.scale.set(1.15, 0.5, 1.15)
    lid.position.set(sx, 3.32, -1.94)
    g.add(lid)
    const gleam = sph(0.02, "#ffffff", {}, 6, 5)
    gleam.position.set(sx * 0.68, 3.32, -2.03)
    g.add(gleam)
  }

  const bridle = box(0.32, 0.07, 0.07, tack)
  bridle.position.set(0, 3.05, -2.32)
  g.add(bridle)
  const noseband = box(0.36, 0.06, 0.06, gold)
  noseband.position.set(0, 3.14, -2.3)
  g.add(noseband)
  const browband = box(0.4, 0.035, 0.035, gold)
  browband.position.set(0, 3.34, -1.94)
  g.add(browband)
  const bit = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 14), std(gold, { metalness: 0.8, roughness: 0.25 }))
  bit.position.set(0, 2.96, -2.42)
  g.add(bit)
  for (const sx of [-0.18, 0.18]) {
    const cheek = box(0.03, 0.34, 0.03, tack)
    cheek.position.set(sx, 2.9, -2.26)
    cheek.rotation.z = sx > 0 ? -0.15 : 0.15
    g.add(cheek)
    const headstall = box(0.03, 0.42, 0.03, tack)
    headstall.position.set(sx, 3.2, -2.14)
    headstall.rotation.z = sx > 0 ? -0.2 : 0.2
    g.add(headstall)
  }
  for (const sx of [-0.14, 0.14]) {
    const rein = box(0.03, 0.03, 1.6, tack)
    rein.position.set(sx, 2.7, -1.05)
    rein.rotation.x = 0.35
    g.add(rein)
  }
  for (let i = 0; i < 5; i++) {
    for (const sx of [-0.13, 0.13]) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 8), std(gold, { metalness: 0.75, roughness: 0.3 }))
      link.position.set(sx + (i % 2 ? 0.03 : -0.03), 2.62 - i * 0.05, -0.3 - i * 0.12)
      g.add(link)
    }
  }

  const tail = new THREE.Group()
  const tbase = sph(0.14, furD, {}, 10, 8)
  tbase.scale.set(0.8, 1, 1)
  tbase.position.set(0, 1.55, 1.5)
  tail.add(tbase)
  for (let i = 0; i < 6; i++) {
    const strand = box(0.05, 1.1, 0.05, i % 2 ? dark : maneC)
    strand.position.set(i % 2 ? 0.05 : -0.05, 1.3 - i * 0.07, 1.6 + i * 0.08)
    strand.rotation.x = 0.25 + i * 0.07
    tail.add(strand)
  }
  const tuft = sph(0.1, dark, {}, 8, 6)
  tuft.position.set(0, 0.95, 1.88)
  tail.add(tuft)
  g.add(tail)

  const blanket = box(1.06, 0.07, 1.3, cloth)
  blanket.position.y = 2.24
  g.add(blanket)
  const trim = box(1.1, 0.04, 1.34, gold)
  trim.position.y = 2.2
  g.add(trim)
  for (const bz of [-0.4, 0, 0.4]) {
    const pat = box(0.18, 0.02, 0.18, gold)
    pat.position.set(0, 2.29, bz)
    g.add(pat)
  }
  for (const bz of [-1.15, 1.02]) {
    const strapB = box(1.08, 0.09, 0.09, tack)
    strapB.position.set(0, 2.06, bz)
    g.add(strapB)
  }
  const caparison = box(1.0, 0.34, 0.9, cloth)
  caparison.position.set(0, 1.7, 0.82)
  caparison.rotation.x = 0.18
  g.add(caparison)
  const ctrim = box(1.04, 0.1, 0.94, gold)
  ctrim.position.set(0, 1.48, 0.9)
  g.add(ctrim)

  const saddle = box(0.92, 0.2, 1.05, tack)
  saddle.position.y = 2.36
  g.add(saddle)
  const seat = box(0.8, 0.1, 0.9, "#3d2920")
  seat.position.y = 2.52
  g.add(seat)
  const cantle = box(0.5, 0.36, 0.14, tack)
  cantle.position.set(0, 2.64, 0.48)
  cantle.rotation.x = -0.55
  g.add(cantle)
  const pom = box(0.42, 0.3, 0.12, tack)
  pom.position.set(0, 2.6, -0.48)
  pom.rotation.x = 0.55
  g.add(pom)
  for (const bx of [-0.48, 0.48]) {
    const flap = box(0.09, 0.5, 0.7, cloth)
    flap.position.set(bx, 2.14, 0.12)
    flap.rotation.z = bx > 0 ? -0.18 : 0.18
    g.add(flap)
    const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 10), std("#6b6f76", { metalness: 0.85, roughness: 0.3 }))
    stirrup.position.set(bx, 1.6, 0.12)
    g.add(stirrup)
    const sstrap = box(0.03, 0.72, 0.03, tack)
    sstrap.position.set(bx, 2.02, 0.12)
    g.add(sstrap)
  }
  for (const bz of [-0.75, 0.72]) {
    const girth = box(0.03, 0.5, 0.1, tack)
    girth.position.set(0, 1.72, bz)
    g.add(girth)
  }
  const breast = box(0.04, 0.5, 0.9, tack)
  breast.position.set(0, 1.98, -1.05)
  breast.rotation.x = 0.35
  g.add(breast)
  for (const bx of [-0.18, 0.18]) {
    const medal = sph(0.03, gold, {}, 8, 6)
    medal.position.set(bx, 1.9, -1.12)
    g.add(medal)
  }
  const crupper = box(0.04, 0.4, 0.9, tack)
  crupper.position.set(0, 1.98, 1.32)
  crupper.rotation.x = -0.35
  g.add(crupper)
  const glz = sph(0.03, gold, {}, 8, 6)
  glz.position.set(0, 2.0, 1.5)
  g.add(glz)

  g.userData.legs = []
  for (const [lx, lz, hind] of [[-0.42, -0.95, 0], [0.42, -0.95, 0], [-0.42, 0.95, 1], [0.42, 0.95, 1]]) {
    const leg = new THREE.Group()
    leg.position.set(lx, 1.45, lz)
    const upper = box(0.24, 0.7, 0.28, furD)
    upper.position.y = -0.35
    leg.add(upper)
    const joint = sph(0.13, furD, {}, 10, 8)
    joint.position.set(0, -0.55, 0)
    leg.add(joint)
    const lower = box(0.18, 0.5, 0.2, furD)
    lower.position.y = -0.95
    leg.add(lower)
    const pastern = box(0.14, 0.26, 0.16, furX)
    pastern.position.y = -1.26
    pastern.rotation.x = 0.12
    leg.add(pastern)
    const fuff = sph(0.06, furD, {}, 8, 6)
    fuff.position.set(0, -0.24, 0.07)
    pastern.add(fuff)
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.28), lam(dark))
    hoof.position.y = -1.42
    hoof.castShadow = true
    leg.add(hoof)
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 10).rotateX(Math.PI / 2), std("#8a8f96", { metalness: 0.8, roughness: 0.35 }))
    shoe.position.y = -1.5
    leg.add(shoe)
    g.add(leg)
    g.userData.legs.push(leg)
  }

  g.visible = false
  return g
}


function buildKnight() {
  const g = new THREE.Group()
  const armor = "#98a2ad", dark = "#5c6670", steel = "#a8b2bd", gold = "#c9a53f", goldB = "#d9b45b", red = "#b03a30", fur = "#3a2f26"

  const mkLeg = (side) => {
    const leg = box(0.26, 0.78, 0.26, armor)
    leg.geometry.translate(0, -0.39, 0)
    leg.position.set(side * 0.24, 1.2, 0)
    const thigh = box(0.24, 0.4, 0.24, steel)
    thigh.position.set(0, -0.2, 0)
    leg.add(thigh)
    const knee = sph(0.14, goldB, {}, 12, 9)
    knee.scale.set(1.15, 0.7, 1)
    knee.position.set(0, -0.36, 0.03)
    leg.add(knee)
    const greave = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.3), std(armor, { roughness: 0.35, metalness: 0.55 }))
    greave.position.set(0, -0.42, 0)
    leg.add(greave)
    const ankle = box(0.26, 0.06, 0.28, gold)
    ankle.position.set(0, -0.6, 0)
    leg.add(ankle)
    const boot = box(0.28, 0.18, 0.4, "#3a2f26")
    boot.position.set(0, -0.74, -0.05)
    leg.add(boot)
    const sab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.42), std(dark, { roughness: 0.4, metalness: 0.6 }))
    sab.position.set(0, -0.8, 0)
    leg.add(sab)
    g.add(leg)
    return leg
  }
  const legL = mkLeg(-1)
  const legR = mkLeg(1)

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.55), std(armor, { roughness: 0.35, metalness: 0.55 }))
  torso.position.y = 1.75
  g.add(torso)
  const ridgeF = box(0.05, 0.98, 0.16, steel)
  ridgeF.position.set(0, 1.76, 0.285)
  g.add(ridgeF)
  const ridgeB = box(0.05, 0.98, 0.16, steel)
  ridgeB.position.set(0, 1.76, -0.285)
  g.add(ridgeB)
  const plateL = box(0.4, 0.5, 0.06, steel)
  plateL.position.set(-0.24, 1.85, 0.3)
  g.add(plateL)
  const plateR = plateL.clone()
  plateR.position.x = 0.24
  g.add(plateR)
  const waist = box(0.98, 0.1, 0.58, gold)
  waist.position.y = 1.32
  g.add(waist)
  const hem = box(0.92, 0.06, 0.52, dark)
  hem.position.y = 1.24
  g.add(hem)
  for (let i = 0; i < 3; i++) {
    const lame = box(0.9 - i * 0.1, 0.1, 0.5, i % 2 ? armor : steel)
    lame.position.set(0, 1.06 - i * 0.13, 0)
    lame.rotation.x = 0.06 * (i + 1)
    g.add(lame)
  }
  const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.24, 18), std(armor, { roughness: 0.35, metalness: 0.55 }))
  gorget.position.y = 2.32
  g.add(gorget)
  const gorgetTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.05, 18), std(goldB, { roughness: 0.3, metalness: 0.7 }))
  gorgetTrim.position.y = 2.44
  g.add(gorgetTrim)
  const belt = box(0.97, 0.18, 0.57, "#6d4a2f")
  belt.position.y = 1.44
  g.add(belt)
  const buckle = box(0.18, 0.14, 0.06, goldB, { emissive: "#5d431a", emissiveIntensity: 0.4 })
  buckle.position.set(0, 1.44, 0.3)
  g.add(buckle)
  for (let i = 0; i < 4; i++) {
    const pouch = box(0.09, 0.12, 0.05, i % 2 ? "#7a5634" : "#8a6a44")
    pouch.position.set(-0.3 + i * 0.2, 1.36, 0.3)
    pouch.rotation.z = i % 2 ? -0.2 : 0.2
    g.add(pouch)
  }
  const tassetL = box(0.28, 0.44, 0.16, armor)
  tassetL.position.set(-0.26, 0.98, -0.02)
  tassetL.rotation.x = 0.35
  g.add(tassetL)
  const tassetR = tassetL.clone()
  tassetR.position.x = 0.26
  g.add(tassetR)
  for (const sx of [-0.26, 0.26]) {
    for (let i = 0; i < 3; i++) {
      const tl = box(0.3, 0.07, 0.12, i % 2 ? armor : steel)
      tl.position.set(sx, 0.9 - i * 0.12, -0.02)
      tl.rotation.x = 0.2
      g.add(tl)
    }
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), lam("#e8b98a"))
  head.position.y = 2.68
  head.castShadow = true
  g.add(head)
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), lam(armor))
  helm.position.y = 2.82
  helm.castShadow = true
  g.add(helm)
  const helmRim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 18), lam(dark))
  helmRim.position.y = 2.72
  g.add(helmRim)
  const nasal = box(0.05, 0.42, 0.04, dark)
  nasal.position.set(0, 2.84, -0.35)
  g.add(nasal)
  const nasalTip = box(0.06, 0.12, 0.05, goldB)
  nasalTip.position.set(0, 2.9, -0.36)
  g.add(nasalTip)
  for (const sx of [-1, 1]) {
    const cheekG = box(0.1, 0.26, 0.34, armor)
    cheekG.position.set(sx * 0.27, 2.68, -0.05)
    cheekG.rotation.z = sx > 0 ? -0.12 : 0.12
    g.add(cheekG)
  }
  const aventail = box(0.4, 0.3, 0.4, dark)
  aventail.position.set(0, 2.48, 0)
  g.add(aventail)
  const browBar = box(0.2, 0.04, 0.3, steel)
  browBar.position.set(0, 2.96, -0.26)
  g.add(browBar)
  const plumeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.16, 12), lam(goldB, { emissive: "#5d431a", emissiveIntensity: 0.25 }))
  plumeBase.position.y = 3.12
  g.add(plumeBase)
  const plumeGroup = new THREE.Group()
  plumeGroup.position.set(0, 3.18, 0)
  for (let i = 0; i < 4; i++) {
    const pf = new THREE.Mesh(new THREE.ConeGeometry(0.1 - i * 0.015, 0.4, 8), lam(i === 3 ? "#c94a3e" : red))
    pf.position.set(i * 0.05, i * 0.3, 0)
    pf.rotation.z = -0.35 - i * 0.2
    plumeGroup.add(pf)
  }
  g.add(plumeGroup)

  for (const sx of [-0.58, 0.58]) {
    const pauldron = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const lam2 = new THREE.Mesh(new THREE.SphereGeometry(0.24 - i * 0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(i % 2 ? armor : steel))
      lam2.position.y = i * 0.06
      lam2.scale.z = 1.3
      lam2.castShadow = true
      pauldron.add(lam2)
    }
    pauldron.position.set(sx, 2.18, 0)
    g.add(pauldron)
    const trim2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 16).rotateX(Math.PI / 2), lam(goldB))
    trim2.position.set(0, 0.08, 0)
    pauldron.add(trim2)
    const riv = sph(0.025, goldB, {}, 8, 6)
    riv.position.set(0, 0.02, 0.18)
    pauldron.add(riv)
  }

  const armL = box(0.22, 0.42, 0.22, armor)
  armL.geometry.translate(0, -0.21, 0)
  armL.position.set(-0.58, 2.06, 0)
  const vambL = box(0.2, 0.34, 0.2, steel)
  vambL.position.set(0, -0.5, 0)
  armL.add(vambL)
  const couterL = sph(0.13, goldB, {}, 12, 9)
  couterL.scale.set(1.2, 0.6, 1)
  couterL.position.set(0, -0.42, 0.03)
  armL.add(couterL)
  const cuffL = box(0.24, 0.07, 0.26, gold)
  cuffL.position.set(0, -0.68, 0)
  armL.add(cuffL)
  const gauntL = box(0.24, 0.14, 0.26, armor)
  gauntL.position.set(0, -0.76, 0)
  armL.add(gauntL)
  g.add(armL)
  const armR = armL.clone()
  armR.position.x = 0.58
  g.add(armR)
  const gloveR = box(0.24, 0.16, 0.24, fur)
  gloveR.position.set(0, -0.84, 0)
  armR.add(gloveR)

  const sword = new THREE.Group()
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.03), std("#e6ebf0", { emissive: "#5a6a78", emissiveIntensity: 0.22, roughness: 0.18, metalness: 0.9 }))
  blade.geometry.translate(0, 0.66, 0)
  sword.add(blade)
  const edgeL = box(0.02, 1.15, 0.005, "#f5f8fb")
  edgeL.position.set(-0.05, 0.66, 0)
  sword.add(edgeL)
  const edgeR = box(0.02, 1.15, 0.005, "#f5f8fb")
  edgeR.position.set(0.05, 0.66, 0)
  sword.add(edgeR)
  const fuller = box(0.02, 1.05, 0.034, "#b6c0ca")
  fuller.geometry.translate(0, 0.62, 0)
  sword.add(fuller)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 8), std("#e6ebf0", { emissive: "#5a6a78", emissiveIntensity: 0.22, roughness: 0.18, metalness: 0.9 }))
  tip.position.y = 1.35
  tip.castShadow = true
  sword.add(tip)
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.09), std(goldB, { roughness: 0.25, metalness: 0.8 }))
  sword.add(guard)
  for (const gx of [-1, 1]) {
    const gTip = sph(0.05, goldB, {}, 8, 6)
    gTip.position.set(gx * 0.2, 0, 0)
    sword.add(gTip)
    const gFang = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 6), std(gold, { roughness: 0.3, metalness: 0.7 }))
    gFang.position.set(gx * 0.19, 0, 0)
    gFang.rotation.z = gx * 0.9
    sword.add(gFang)
  }
  const grip = box(0.06, 0.24, 0.06, "#5d3a20")
  grip.geometry.translate(0, -0.14, 0)
  sword.add(grip)
  for (let i = 0; i < 4; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 8), std(gold, { roughness: 0.35, metalness: 0.75 }))
    coil.rotation.x = Math.PI / 2
    coil.position.set(0, -0.05 - i * 0.06, 0)
    sword.add(coil)
  }
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.09, 10), std(goldB, { roughness: 0.25, metalness: 0.85 }))
  pommel.position.y = -0.28
  sword.add(pommel)
  const gem = sph(0.035, "#e0483a", { emissive: "#8a1a12", emissiveIntensity: 0.8 }, 8, 6)
  gem.position.y = -0.31
  sword.add(gem)
  sword.position.set(0, -0.78, 0.05)
  armR.add(sword)
  g.userData.sword = sword

  const shield = new THREE.Group()
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20).rotateX(Math.PI / 2), std("#3f5f8a", { roughness: 0.45, metalness: 0.5 }))
  shield.add(face)
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 18).rotateX(Math.PI / 2), std(goldB, { roughness: 0.3, metalness: 0.75 }))
  shield.add(boss)
  const umbo = sph(0.08, "#e8d9a0", {}, 12, 9)
  umbo.position.z = 0.07
  shield.add(umbo)
  const crossV = box(0.07, 0.32, 0.02, "#f2e6c8")
  crossV.position.set(0, 0, 0.07)
  shield.add(crossV)
  const crossH = box(0.32, 0.07, 0.02, "#f2e6c8")
  crossH.position.set(0, 0, 0.07)
  shield.add(crossH)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const riv = sph(0.03, goldB, {}, 8, 6)
    riv.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.045)
    shield.add(riv)
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 10, 24), std(goldB, { emissive: "#5d431a", emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.75 }))
  shield.add(rim)
  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.015, 6, 20), std(dark, { roughness: 0.4, metalness: 0.6 }))
  shield.add(innerRim)
  const enarm = box(0.05, 0.24, 0.2, "#6d4a2f")
  enarm.position.set(0, 0.05, -0.1)
  shield.add(enarm)
  const strapS = box(0.05, 0.05, 0.4, "#5d4630")
  strapS.position.set(0, -0.1, -0.08)
  shield.add(strapS)
  shield.position.set(0, -0.62, 0.1)
  armL.add(shield)
  g.userData.shield = shield

  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.15, 6, 8), lam(red, { side: THREE.DoubleSide }))
  cape.position.set(0, 1.75, 0.31)
  g.add(cape)
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lam(goldB, { side: THREE.DoubleSide, emissive: "#5d431a", emissiveIntensity: 0.3 }))
  crest.position.set(0, 0.25, 0.02)
  cape.add(crest)
  const hemT = box(0.86, 0.07, 0.02, gold)
  hemT.position.set(0, -0.55, 0.01)
  cape.add(hemT)
  const mantle = box(0.7, 0.12, 0.1, "#8a2f28")
  mantle.position.set(0, 2.0, 0.28)
  g.add(mantle)
  const mantleTrim = box(0.74, 0.05, 0.12, gold)
  mantleTrim.position.set(0, 1.93, 0.29)
  g.add(mantleTrim)
  cape.userData.base = cape.geometry.attributes.position.array.slice()
  g.userData.cape = cape

  g.userData.parts = { legL, legR, armL, armR, head }
  return g
}


function buildArcTrail() {
  const geo = new THREE.RingGeometry(1.1, 2.5, 24, 1, 0, 2.1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: "#fff3d0", transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
  const m = new THREE.Mesh(geo, mat)
  m.visible = false
  m.frustumCulled = false
  return m
}

export class Player {
  constructor(scene, camera, fx) {
    this.camera = camera
    this.fx = fx
    this.group = new THREE.Group()
    this.knight = buildKnight()
    this.horse = buildHorse()
    this.group.add(this.knight)
    this.group.add(this.horse)
    this.arc = buildArcTrail()
    this.group.add(this.arc)
    this.group.position.set(0, 0, 18)
    scene.add(this.group)

    this.yaw = 0
    this.camYaw = 0
    this.camPitch = 0.32
    this.mounted = false
    this.walkT = 0
    this.attackT = -1
    this.swingDur = 0.38
    this.comboIdx = 0
    this.attackQueued = false
    this.attackHitDone = false
    this.execT = -1
    this.hurtT = -1
    this.victoryT = -1
    this.blockHeld = false
    this.blocking = false
    this.blockT = 99
    this.rollT = -1
    this.rollDur = 0.42
    this.rollCd = 0
    this.rollDir = new THREE.Vector3()
    this.kb = new THREE.Vector3()
    this.enemies = []
    this.onSwingHit = null
    this.onSlashFx = null
    this.keys = {}
    this.mouse = { down: false, lx: 0, ly: 0 }
    this.camDist = 9
    this.stamina = 1
    this.exhausted = false
    this.staminaEl = null
    this.staminaFillEl = null

    window.addEventListener("keydown", (e) => {
      if (isTyping()) { this.keys[e.code] = false; return }
      this.keys[e.code] = true
      if (e.code === "KeyH") this.toggleHorse()
      if (e.code === "KeyC") this.tryRoll()
      if (e.code === "Space") { e.preventDefault(); this.tryAttack() }
    })
    window.addEventListener("keyup", (e) => { this.keys[e.code] = false })
    const canvas = document.getElementById("game")
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) { this.blockHeld = true; return }
      if (e.button !== 0) return
      this.mouse.down = true
      this.mouse.lx = e.clientX
      this.mouse.ly = e.clientY
      canvas.requestPointerLock?.()
      if (!isTyping() && !uiBlocking()) this.tryAttack()
    })
    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) this.blockHeld = false
      if (e.button === 0) this.mouse.down = false
    })
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas || this.mouse.down) {
        this.camYaw -= e.movementX * 0.0032
        this.camPitch = Math.min(1.1, Math.max(0.06, this.camPitch + e.movementY * 0.0026))
      }
    })
    canvas.addEventListener("wheel", (e) => {
      this.camDist = Math.min(16, Math.max(4.5, this.camDist + e.deltaY * 0.01))
    })
    window.addEventListener("contextmenu", (e) => e.preventDefault())
  }

  get pos() { return this.group.position }

  toggleHorse() {
    if (!S.horseUnlocked) {
      window.dispatchEvent(new CustomEvent("toast", { detail: "The stable keeper shakes his head: \u201cReturn at 7/20 truths, and Thunder is yours.\u201d" }))
      return
    }
    this.mounted = !this.mounted
    this.horse.visible = this.mounted
    this.knight.position.y = this.mounted ? 1.15 : 0
    if (this.mounted) { audio.gallop(); window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83d\udc0e You mount Thunder! Ride, founder!" })) }
  }

  tryRoll() {
    if (this.mounted || this.rollCd > 0 || this.rollT >= 0 || this.execT >= 0) return
    if (this.stamina < 0.12) {
      window.dispatchEvent(new CustomEvent("toast", { detail: "\ud83d\udca8 Too winded to roll — let your stamina recover." }))
      return
    }
    this.stamina = Math.max(0, this.stamina - 0.12)
    if (document.getElementById("battle").classList.contains("hidden") === false) return
    let dx = 0, dz = 0
    if (this.keys.KeyW || this.keys.ArrowUp) dz -= 1
    if (this.keys.KeyS || this.keys.ArrowDown) dz += 1
    if (this.keys.KeyA || this.keys.ArrowLeft) dx -= 1
    if (this.keys.KeyD || this.keys.ArrowRight) dx += 1
    if (!dx && !dz) { dz = 1 }
    const fy = this.camYaw
    const fx2 = -Math.sin(fy), fz2 = -Math.cos(fy)
    const rx = -fz2, rz = fx2
    let wx = fx2 * -dz + rx * dx, wz = fz2 * -dz + rz * dx
    const l = Math.hypot(wx, wz) || 1
    this.rollDir.set(wx / l, 0, wz / l)
    this.yaw = Math.atan2(-this.rollDir.x, -this.rollDir.z)
    this.rollT = 0
    this.rollCd = 0.75
    this.attackT = -1
    audio.dash()
    this.fx.burst("dust", this.group.position.x, this.group.position.y + 0.1, this.group.position.z, 6)
  }

  tryAttack() {
    if (document.getElementById("battle").classList.contains("hidden") === false) return
    if (this.execT >= 0 || this.rollT >= 0) return
    if (this.attackT >= 0) {
      if (this.attackT / this.swingDur > 0.45) this.attackQueued = true
      return
    }
    this.startSwing()
  }

  startSwing() {
    this.attackT = 0
    this.attackHitDone = false
    this.swingDur = this.comboIdx === 2 ? 0.46 : 0.38
    audio.swing()
  }

  applySwingPose(t) {
    const p = this.knight.userData.parts
    if (this.comboIdx === 0) {
      p.armR.rotation.x = -1.5 * Math.sin(t * Math.PI) - 0.3
      p.armR.rotation.z = 0.9 - 2.0 * t
      this.knight.rotation.y = -0.28 * Math.sin(t * Math.PI)
    } else if (this.comboIdx === 1) {
      p.armR.rotation.x = -1.5 * Math.sin(t * Math.PI) - 0.3
      p.armR.rotation.z = -1.1 + 2.0 * t
      this.knight.rotation.y = 0.28 * Math.sin(t * Math.PI)
    } else {
      if (t < 0.35) { p.armR.rotation.x = -3.0 * (t / 0.35) }
      else { p.armR.rotation.x = -3.0 + 3.7 * ((t - 0.35) / 0.65) }
      p.armR.rotation.z = 0
      this.knight.rotation.y = 0
    }
  }

  doHitCheck() {
    const reach = this.mounted ? 4.4 : 3.6
    const fwx = -Math.sin(this.yaw), fwz = -Math.cos(this.yaw)
    let best = null, bestD = 1e9
    for (const e of this.enemies) {
      if (!e || e.state === "gone" || e.defeatT >= 0 || e.defeated || e.down) continue
      const dx = e.group.position.x - this.group.position.x
      const dz = e.group.position.z - this.group.position.z
      const d = Math.hypot(dx, dz)
      if (d > reach) continue
      const dot = (dx / (d || 1)) * fwx + (dz / (d || 1)) * fwz
      if (dot < 0.45) continue
      if (d < bestD) { bestD = d; best = e }
    }
    if (best) this.onSwingHit?.(best, this.comboIdx === 2 ? 2 : 1)
  }

  faceTowards(x, z) {
    const dx = x - this.group.position.x, dz = z - this.group.position.z
    if (Math.hypot(dx, dz) < 0.01) return
    this.yaw = Math.atan2(-dx, -dz)
  }

  applyKnockback(dirX, dirZ, strength = 6) {
    this.kb.set(dirX, 0, dirZ).normalize().multiplyScalar(strength)
  }

  playExecute() {
    this.execT = 0
    this.attackT = -1
    this.blocking = false
    audio.swing()
  }

  playVictory() { this.victoryT = 0 }
  playHurt() { this.hurtT = 0 }

  update(dt) {
    const battleOpen = !document.getElementById("battle").classList.contains("hidden")
    const nbOpen = !document.getElementById("notebook").classList.contains("hidden")
    const planOpen = !document.getElementById("plan").classList.contains("hidden")
    const winOpen = !document.getElementById("win").classList.contains("hidden")
    const anyUI = battleOpen || nbOpen || planOpen || winOpen || !document.getElementById("title").classList.contains("hidden")

    let mx = 0, mz = 0
    if (!anyUI && this.execT < 0) {
      if (this.keys.KeyW || this.keys.ArrowUp) mz += 1
      if (this.keys.KeyS || this.keys.ArrowDown) mz -= 1
      if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1
      if (this.keys.KeyD || this.keys.ArrowRight) mx += 1
    }
    const sprintHeld = this.keys.ShiftLeft || this.keys.ShiftRight
    let speed = (this.mounted ? 26 : 11) * 1
    const moving = (mx !== 0 || mz !== 0) && this.rollT < 0
    const sprint = sprintHeld && moving && !this.exhausted && this.rollT < 0
    if (sprint) speed *= this.mounted ? 1.7 : 2
    if (sprint) {
      this.stamina -= dt * (this.mounted ? 0.22 : 0.3)
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true }
    } else {
      this.stamina = Math.min(1, this.stamina + dt * 0.18)
      if (this.exhausted && this.stamina >= 0.35) this.exhausted = false
    }
    if (!this.staminaEl) {
      this.staminaEl = document.getElementById("hud-stamina")
      this.staminaFillEl = document.getElementById("hud-stamina-fill")
    }
    if (this.staminaEl) {
      const show = this.stamina < 0.995 || sprintHeld
      this.staminaEl.classList.toggle("show", show && !anyUI)
      this.staminaEl.classList.toggle("exhausted", this.exhausted)
      if (this.staminaFillEl) this.staminaFillEl.style.width = (this.stamina * 100).toFixed(1) + "%"
    }
    if (this.blocking) speed *= 0.45

    this.rollCd = Math.max(0, this.rollCd - dt)

    if (this.rollT >= 0) {
      this.rollT += dt
      const rt = this.rollT / this.rollDur
      if (rt >= 1) {
        this.rollT = -1
        this.knight.rotation.x = 0
        this.knight.position.y = this.mounted ? 1.15 : 0
      } else {
        const k = 1 - Math.pow(1 - rt, 2)
        const rspd = 15 * (1 - rt * 0.55)
        this.group.position.x += this.rollDir.x * rspd * dt
        this.group.position.z += this.rollDir.z * rspd * dt
        this.knight.rotation.x = -rt * Math.PI * 2
        this.knight.position.y = this.mounted ? 1.15 : Math.sin(rt * Math.PI) * 0.35
        if (Math.random() < dt * 24) this.fx.burst("dust", this.group.position.x, this.group.position.y + 0.05, this.group.position.z, 1)
      }
    }

    if (moving) {
      const fx2 = -Math.sin(this.camYaw), fz2 = -Math.cos(this.camYaw)
      const rx = -fz2, rz = fx2
      let dx = fx2 * mz + rx * mx
      let dz = fz2 * mz + rz * mx
      const len = Math.hypot(dx, dz) || 1
      dx /= len; dz /= len
      this.yaw = Math.atan2(-dx, -dz)
      this.group.position.x += dx * speed * dt
      this.group.position.z += dz * speed * dt
      this.walkT += dt * (this.mounted ? 9 : 10) * (sprint ? 1.4 : 1)
      if (this.mounted && Math.random() < dt * 3) audio.gallop()
      if (sprint && Math.random() < dt * (this.mounted ? 18 : 9)) {
        this.fx.burst("dust", this.group.position.x, this.group.position.y + 0.08, this.group.position.z, 1)
      }
    } else {
      this.walkT += 0
    }

    if (this.execT >= 0) {
      const et = this.execT / 0.85
      if (et > 0.25 && et < 0.6) {
        const fwx = -Math.sin(this.yaw), fwz = -Math.cos(this.yaw)
        this.group.position.x += fwx * 5.5 * dt
        this.group.position.z += fwz * 5.5 * dt
      }
    }

    if (this.kb.lengthSq() > 0.02) {
      this.group.position.x += this.kb.x * dt
      this.group.position.z += this.kb.z * dt
      this.kb.multiplyScalar(Math.exp(-7 * dt))
    }

    this.group.position.x = Math.max(-195, Math.min(195, this.group.position.x))
    this.group.position.z = Math.max(-195, Math.min(195, this.group.position.z))
    this.group.position.y = heightAt(this.group.position.x, this.group.position.z)
    if (this.mounted && moving) this.group.position.y += Math.abs(Math.sin(this.walkT)) * 0.18
    this.group.rotation.y = this.yaw

    const wasBlocking = this.blocking
    this.blocking = this.blockHeld && this.attackT < 0 && this.execT < 0 && this.victoryT < 0 && this.rollT < 0 && !anyUI
    if (this.blocking) {
      if (!wasBlocking) this.blockT = 0
      this.blockT += dt
    } else {
      this.blockT = 99
    }

    const p = this.knight.userData.parts
    const w = Math.sin(this.walkT)
    this.idleT = (this.idleT || 0) + dt
    this.knight.scale.y = this.rollT >= 0 ? 1 : (moving ? 1 : 1 + Math.sin(this.idleT * 2.2) * 0.008)
    p.legL.rotation.x = this.rollT >= 0 ? 0.5 : (moving ? w * 0.7 : 0)
    p.legR.rotation.x = this.rollT >= 0 ? -0.5 : (moving ? -w * 0.7 : 0)
    if (this.blocking) {
      p.armL.rotation.x = -1.25
      p.armL.rotation.y = 0.3
      p.armL.rotation.z = 0.55
    } else {
      p.armL.rotation.y = 0
      p.armL.rotation.z = 0
      p.armL.rotation.x = moving ? -w * 0.5 : 0
    }

    if (this.attackT >= 0) {
      this.attackT += dt
      const t = this.attackT / this.swingDur
      const hitAt = this.comboIdx === 2 ? 0.5 : 0.45
      if (!this.attackHitDone && t >= hitAt) {
        this.attackHitDone = true
        this.onSlashFx?.(this.comboIdx === 2)
        this.doHitCheck()
      }
      if (t >= 1) {
        this.attackT = -1
        p.armR.rotation.x = 0
        p.armR.rotation.z = 0
        this.knight.rotation.y = 0
        if (this.attackQueued) {
          this.attackQueued = false
          this.comboIdx = (this.comboIdx + 1) % 3
          this.startSwing()
        } else {
          this.comboIdx = 0
        }
      } else {
        this.applySwingPose(t)
      }
    } else if (this.execT >= 0) {
      this.execT += dt
      const t = this.execT / 0.85
      if (t >= 1) {
        this.execT = -1
        p.armR.rotation.x = 0
        p.armR.rotation.z = 0
      } else if (t < 0.3) {
        p.armR.rotation.x = -3.1 * (t / 0.3)
        p.armR.rotation.z = 0
      } else if (t < 0.55) {
        p.armR.rotation.x = -3.1 + 4.0 * ((t - 0.3) / 0.25)
      } else {
        p.armR.rotation.x = 0.9 - 0.9 * ((t - 0.55) / 0.45)
      }
    } else if (this.victoryT >= 0) {
      this.victoryT += dt
      p.armR.rotation.x = -2.6
      if (this.victoryT > 1.6) { this.victoryT = -1 }
    } else if (this.rollT >= 0) {
      p.armR.rotation.x = -0.9
      p.armR.rotation.z = 0.4
    } else {
      p.armR.rotation.x = moving ? w * 0.5 : 0
      p.armR.rotation.z = 0
    }
    if (this.hurtT >= 0) {
      this.hurtT += dt
      this.knight.rotation.z = Math.sin(this.hurtT * 30) * 0.1
      if (this.hurtT > 0.45) { this.hurtT = -1; this.knight.rotation.z = 0 }
    }
    const cape = this.knight.userData.cape
    cape.rotation.x = 0.15 + Math.sin(this.walkT * 0.9) * 0.1 + (moving ? 0.25 : 0)
    const capeGeo = cape.geometry
    const cp = capeGeo.attributes.position
    const base = cape.userData.base
    const windAmt = (moving ? 0.09 : 0.035) + (sprint ? 0.05 : 0)
    for (let i = 0; i < cp.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1]
      const hang = Math.max(0, (0.575 - by) / 1.15)
      cp.setZ(i,
        Math.sin(this.idleT * 3.1 + bx * 4.2 + by * 2.4) * windAmt * hang
        + Math.sin(this.walkT * 1.8 + bx * 3) * (moving ? 0.05 : 0.015) * hang)
    }
    cp.needsUpdate = true
    capeGeo.computeVertexNormals()

    if (this.arc) {
      if (this.attackT >= 0) {
        const t = this.attackT / this.swingDur
        const vis = t > 0.12 && t < 0.78
        this.arc.visible = vis
        if (vis) {
          const y = this.mounted ? 1.15 : 0
          this.arc.position.set(0, y + 2.05, 0)
          this.arc.rotation.y = this.comboIdx === 1 ? Math.PI - 0.35 : -0.35
          const k = (t - 0.12) / 0.66
          const sc = (this.mounted ? 1.35 : 1) * (0.75 + 0.35 * k)
          this.arc.scale.set(this.comboIdx === 1 ? -sc : sc, 1, sc)
          this.arc.rotation.z = 0.35 * Math.sin(k * Math.PI)
          this.arc.material.opacity = 0.5 * Math.sin(k * Math.PI)
          this.arc.material.color.setHex(this.comboIdx === 2 ? 0xffd98a : 0xfff3d0)
        }
      } else if (this.arc.visible) {
        this.arc.visible = false
      }
    }

    if (this.mounted) {
      this.horse.userData.legs.forEach((leg, i) => {
        const ph = (i === 0 || i === 3) ? 0 : Math.PI
        leg.rotation.x = this.rollT >= 0 ? 0 : (moving ? Math.sin(this.walkT + ph) * 0.6 : 0)
      })
      this.horse.rotation.y = 0
      this.horse.position.y = moving ? Math.abs(Math.sin(this.walkT * 0.5)) * 0.06 : 0
    }

    const baseFov = 55
    const targetFov = baseFov + (moving && sprint && !this.mounted ? 5 : this.mounted && moving ? 4 : 0)
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5)
      this.camera.updateProjectionMatrix()
    }

    const cx = this.group.position.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist
    const cz = this.group.position.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist
    const cyRaw = this.group.position.y + 2 + Math.sin(this.camPitch) * this.camDist
    const cy = Math.max(cyRaw, heightAt(cx, cz) + 1.2)
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.pow(0.0001, dt))
    this.camera.lookAt(this.group.position.x, this.group.position.y + 2.4, this.group.position.z)
  }
}
