#!/usr/bin/env node
// optimize-assets.mjs â€” Journey game asset pipeline (step 2).
//
// For every .glb under public/assets/models/**:
//   1. strip root motion (translation tracks on scene-root nodes) so animations play
//      in-place â€” gameplay AI drives positions (see CODEBASE-MAP.md Â§9/Â§26);
//   2. dedup + weld + resample + prune;
//   3. resize/re-encode textures to <=1024px webp (falls back to jpeg);
//   4. Draco mesh compression (KHR_draco_mesh_compression);
//   5. re-parse the output with @gltf-transform/core to verify integrity, log triangle
//      counts + AnimationClip names (consumed by the remap layer).
//
// Also synthesizes assets/models/nature/blossom.glb from the raw oak source by tinting
// foliage materials pink (both CC0; see CREDITS.md).
//
// Files that fail are left untouched (game falls back to procedural builders).
// Usage: node scripts/optimize-assets.mjs [--models-root public/assets/models] [--dry-run]

import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import fsp from "node:fs/promises"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const MODELS = path.join(ROOT, (() => {
  const i = process.argv.indexOf("--models-root")
  return i >= 0 ? process.argv[i + 1] : "public/assets/models"
})())
const DRY = process.argv.includes("--dry-run")

// ---------------------------------------------------------------- imports (optional sharp)
const { NodeIO } = await import("@gltf-transform/core")
const { ALL_EXTENSIONS, KHRDracoMeshCompression } = await import("@gltf-transform/extensions")
const { dedup, weld, resample, prune, textureCompress } = await import("@gltf-transform/functions")

let draco3dgltf
try {
  draco3dgltf = await import("draco3dgltf")
  if (draco3dgltf.default) draco3dgltf = draco3dgltf.default
} catch (e) {
  console.error("fatal: draco3dgltf not available â€” install @gltf-transform/cli first")
  process.exit(1)
}

let sharp = null
try {
  sharp = (await import("sharp")).default
} catch {
  console.warn("[optimize] sharp unavailable â€” textures will be left as-is")
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.encoder": await draco3dgltf.createEncoderModule(),
    "draco3d.decoder": await draco3dgltf.createDecoderModule(),
  })

const kb = (f) => fs.existsSync(f) ? (fs.statSync(f).size / 1024).toFixed(1) : "-"

// ---------------------------------------------------------------- helpers
function stripRootMotion(doc) {
  let stripped = 0
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode()
      if (node && !node.getParentNode() && ch.getTargetPath() === "translation") {
        ch.dispose()
        stripped++
      }
    }
  }
  // drop animations that became empty
  for (const anim of doc.getRoot().listAnimations()) {
    if (anim.listChannels().length === 0) anim.dispose()
  }
  return stripped
}

function countTris(doc) {
  let tris = 0, prims = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      const pos = prim.getAttribute("POSITION")
      const n = idx ? idx.getCount() : pos ? pos.getCount() : 0
      tris += n / 3
      prims++
    }
  }
  return { tris: Math.round(tris), prims }
}

const clipNames = (doc) => doc.getRoot().listAnimations().map((a) => a.getName() || "(unnamed)")

async function compressTextures(doc, file) {
  if (!sharp) return "skipped(no sharp)"
  if (doc.getRoot().listTextures().length === 0) return "none"
  for (const fmt of ["webp", "jpeg"]) {
    try {
      await textureCompress({ encoder: sharp, targetFormat: fmt, resize: [2048, 2048] })(doc)
      return fmt
    } catch (e) {
      console.warn(`  [optimize] texture ${fmt} failed for ${path.basename(file)}: ${e.message}`)
    }
  }
  return "failed"
}

// ---------------------------------------------------------------- blossom synth
async function synthesizeBlossom() {
  const out = path.join(MODELS, "nature", "blossom.glb")
  if (fs.existsSync(out)) return true
  const src = path.join(ROOT, "public/assets/raw/models/oak_src.glb")
  if (!fs.existsSync(src)) {
    console.warn("[optimize] blossom: no raw oak source found, leaving blossom.glb absent")
    return false
  }
  try {
    const doc = await io.read(src)
    const leafRe = /leaf|leave|foliage|crown|tree_top/i
    const woodRe = /trunk|bark|wood|branch|log|stem/i
    const mats = doc.getRoot().listMaterials()
    const names = mats.map((m) => m.getName() || "(unnamed)")
    let targets = mats.filter((m) => leafRe.test(m.getName() || "") && !woodRe.test(m.getName() || ""))
    if (targets.length === 0) targets = mats.filter((m) => !woodRe.test(m.getName() || ""))
    if (targets.length === 0) throw new Error(`no tintable material (have: ${names.join(", ")})`)
    for (const m of targets) {
      m.setBaseColorFactor([0.988, 0.722, 0.788, 1.0]) // soft blossom pink
    }
    await fsp.mkdir(path.dirname(out), { recursive: true })
    await io.write(out, doc)
    console.log(`[optimize] blossom synthesized from oak raw (tinted: ${targets.map((m) => m.getName()).join(", ")}; materials were: ${names.join(", ")})`)
    return true
  } catch (e) {
    console.error(`[optimize] blossom synthesis failed: ${e.message}`)
    return false
  }
}

// ---------------------------------------------------------------- optimize one file
async function optimizeFile(file) {
  const label = path.relative(MODELS, file)
  const before = { size: +kb(file) }
  let doc
  try {
    doc = await io.read(file)
  } catch (e) {
    return { file: label, ok: false, error: `read: ${e.message}` }
  }
  const beforeTris = countTris(doc)
  const clipsBefore = clipNames(doc)
  const stripped = stripRootMotion(doc)

  dedup(doc)
  weld(doc)
  resample(doc)
  prune(doc)
  const tex = await compressTextures(doc, file)

  doc.createExtension(KHRDracoMeshCompression).setRequired(true)

  if (DRY) {
    return { file: label, ok: true, dry: true, stripped, tris: beforeTris.tris, clips: clipsBefore }
  }

  const tmp = file + ".tmp.glb"
  try {
    await io.write(tmp, doc)
    // verify the written artifact parses cleanly
    const check = await io.read(tmp)
    const afterTris = countTris(check)
    const clips = clipNames(check)
    const materials = check.getRoot().listMaterials().length
    const after = { size: +kb(tmp) }
    await fsp.rename(tmp, file)
    return {
      file: label, ok: true, stripped,
      tris: [beforeTris.tris, afterTris.tris],
      prims: afterTris.prims,
      size: [before.size, after.size],
      textures: tex,
      materials,
      clips,
    }
  } catch (e) {
    try { fs.existsSync(tmp) && (await fsp.unlink(tmp)) } catch {}
    return { file: label, ok: false, error: `write/verify: ${e.message}` }
  }
}

// ---------------------------------------------------------------- main
async function main() {
  if (!fs.existsSync(MODELS)) {
    console.error(`[optimize] models root missing: ${MODELS} â€” run scripts/fetch-assets.mjs first`)
    process.exit(1)
  }

  await synthesizeBlossom()

  const files = []
  for (const dir of ["characters", "nature", "village"]) {
    const d = path.join(MODELS, dir)
    if (!fs.existsSync(d)) continue
    for (const f of await fsp.readdir(d)) {
      if (f.toLowerCase().endsWith(".glb") && !f.endsWith(".tmp.glb")) files.push(path.join(d, f))
    }
  }
  console.log(`[optimize] ${files.length} model(s) in ${path.relative(ROOT, MODELS)}`)

  const results = []
  for (const f of files) {
    process.stdout.write(`[optimize] ${path.relative(MODELS, f)} ... `)
    const r = await optimizeFile(f)
    results.push(r)
    if (r.ok) console.log(r.dry ? `dry-run ok (${r.tris} tris, ${r.clips.length} clips)` : `${r.tris[0]}->${r.tris[1]} tris, ${r.size[0]}->${r.size[1]} KB, tex:${r.textures}, root-motion:${r.stripped}`)
    else console.log(`FAILED (${r.error})`)
  }

  console.log("\n[optimize] ==== verification report ====")
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ${r.file}: ERROR ${r.error}`)
      continue
    }
    const clips = r.clips && r.clips.length ? r.clips.join(" | ") : "(none)"
    console.log(`  ${r.file}`)
    if (!r.dry) console.log(`      tris ${r.tris[0]}->${r.tris[1]}  size ${r.size[0]}->${r.size[1]}KB  prims ${r.prims}  materials ${r.materials}  textures ${r.textures}  rootMotionStripped ${r.stripped}`)
    console.log(`      clips: ${clips}`)
  }

  const bad = results.filter((r) => !r.ok)
  console.log(`\n[optimize] done: ${results.length - bad.length}/${results.length} optimized${bad.length ? `, ${bad.length} FAILED` : ""}`)
  if (bad.length) process.exitCode = 2
}

main().catch((e) => {
  console.error("fatal:", e)
  process.exit(1)
})
