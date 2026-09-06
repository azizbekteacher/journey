#!/usr/bin/env node
// fetch-assets.mjs — Journey game asset pipeline: acquire CC0 assets and place them
// into the exact MANIFEST layout under public/assets/ (see src/assets.js).
//
// Sources (all CC0):
//   - Poly Haven API (hdris + textures) — https://polyhaven.com
//   - Quaternius packs mirrored as loose GLBs: github.com/trebeljahr/quaternius-showcase
//     (mirror of Quaternius Ultimate Animated Animals / Ultimate Nature / Medieval Village /
//     Easy Enemies / Survival / Single Knight / Modular packs)
//   - Quaternius "Cute Monsters" pack via the official quaternius.com Google Drive folder
//     (stand-ins: Pig->boar, Panda->bear, Bat->owl, Chicken->chicken)
//
// Downloaded originals are kept in public/assets/raw/ (gitignored); final outputs go to
// public/assets/hdri, public/assets/textures/terrain, public/assets/models/*.
// Usage: node scripts/fetch-assets.mjs [--only hdri|terrain|models] [--force]
//
// Every lookup that fails is reported; the game falls back to procedural builders.

import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import fsp from "node:fs/promises"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const RAW = path.join(ROOT, "public", "assets", "raw")
const OUT = path.join(ROOT, "public", "assets")
const FORCE = process.argv.includes("--force")
const ONLY = (() => {
  const i = process.argv.indexOf("--only")
  return i >= 0 ? process.argv[i + 1] : null
})()

const SHOWCASE = "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb"
const SHOWCASE_PAGE = "https://github.com/trebeljahr/quaternius-showcase"
const CUTE_MONSTERS_PAGE = "https://quaternius.com/packs/cutemonsters.html"
const LICENSE = "CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/)"

const want = (section) => !ONLY || ONLY === section

// ---------------------------------------------------------------- small utils
let nDownloaded = 0
const credits = [] // { file, source, url, license, note }
const missing = [] // { file, reason }

async function fetchRetry(url, opts = {}, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs || 120000),
        headers: { "User-Agent": "journey-game-assets/1.0 (+local pipeline)", ...(opts.headers || {}) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return res
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw lastErr
}

async function downloadTo(url, dest, opts) {
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  cache  ${path.relative(ROOT, dest)}`)
    return dest
  }
  const res = await fetchRetry(url, opts)
  const buf = Buffer.from(await res.arrayBuffer())
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await fsp.writeFile(dest, buf)
  nDownloaded++
  console.log(`  got    ${path.relative(ROOT, dest)} (${(buf.length / 1024).toFixed(0)} KB)`)
  return dest
}

const j = async (url) => (await fetchRetry(url, { headers: { Accept: "application/json" } })).json()

// Google Drive single-file download (handles the virus-scan confirm hop).
async function driveDownload(fileId, dest) {
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  cache  ${path.relative(ROOT, dest)}`)
    return dest
  }
  // Preferred: usercontent endpoint with confirm=t (no interstitial for public files).
  try {
    const res = await fetchRetry(`https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`, { timeoutMs: 180000 })
    let buf = Buffer.from(await res.arrayBuffer())
    if (looksLikeHtml(buf)) buf = await driveViaConfirm(fileId)
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.writeFile(dest, buf)
    nDownloaded++
    console.log(`  got    ${path.relative(ROOT, dest)} (${(buf.length / 1024).toFixed(0)} KB)`)
    return dest
  } catch (e) {
    throw new Error(`drive download ${fileId}: ${e.message}`)
  }
}

async function driveViaConfirm(fileId) {
  const res = await fetchRetry(`https://drive.google.com/uc?export=download&id=${fileId}`, { timeoutMs: 180000 })
  const buf = Buffer.from(await res.arrayBuffer())
  if (!looksLikeHtml(buf)) return buf
  const html = buf.toString("utf8")
  const action = html.match(/action="([^"]+)"/)?.[1]
  if (!action) throw new Error("drive confirm page without form action")
  const params = new URLSearchParams()
  for (const m of html.matchAll(/name="([^"]+)" value="([^"]*)"/g)) params.set(m[1], m[2])
  const url = action.startsWith("https:") ? action : `https://drive.google.com${action}`
  const res2 = await fetchRetry(`${url}?${params.toString()}`, { timeoutMs: 180000 })
  const buf2 = Buffer.from(await res2.arrayBuffer())
  if (looksLikeHtml(buf2)) throw new Error("drive download still returns HTML after confirm")
  return buf2
}

const looksLikeHtml = (buf) => {
  const head = buf.subarray(0, 256).toString("utf8").trim().toLowerCase()
  return head.startsWith("<!doctype") || head.startsWith("<html")
}

// Convert a single-buffer, data-URI-embedded .gltf (Quaternius Drive exports) to .glb.
function gltfToGlb(jsonBuf, srcLabel) {
  const text = jsonBuf.toString("utf8")
  const gltf = JSON.parse(text)
  const buffers = gltf.buffers || []
  if (buffers.length !== 1) throw new Error(`${srcLabel}: expected 1 buffer, found ${buffers.length}`)
  const uri = buffers[0].uri
  if (!uri || !uri.startsWith("data:")) {
    throw new Error(`${srcLabel}: buffer is not an embedded data URI (external .bin unsupported)`)
  }
  const b64 = uri.slice(uri.indexOf(",") + 1)
  const bin = Buffer.from(b64, "base64")
  delete buffers[0].uri
  buffers[0].byteLength = bin.length

  const jsonOut = Buffer.from(JSON.stringify(gltf), "utf8")
  const jsonPad = (4 - (jsonOut.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4
  const total = 12 + 8 + jsonOut.length + jsonPad + 8 + bin.length + binPad
  const glb = Buffer.alloc(total)
  let o = 0
  glb.writeUInt32LE(0x46546c67, o); o += 4 // "glTF"
  glb.writeUInt32LE(2, o); o += 4
  glb.writeUInt32LE(total, o); o += 4
  glb.writeUInt32LE(jsonOut.length + jsonPad, o); o += 4
  glb.writeUInt32LE(0x4e4f534a, o); o += 4 // "JSON"
  jsonOut.copy(glb, o); o += jsonOut.length
  // GLB spec: JSON chunk must be padded with 0x20 (space), BIN with 0x00 (Buffer.alloc already zeros)
  if (jsonPad) glb.fill(0x20, o, o + jsonPad)
  o += jsonPad
  glb.writeUInt32LE(bin.length + binPad, o); o += 4
  glb.writeUInt32LE(0x004e4942, o); o += 4 // "BIN\0"
  bin.copy(glb, o); o += bin.length + binPad
  return glb
}

const kb = (f) => (fs.existsSync(f) ? (fs.statSync(f).size / 1024).toFixed(0) : "-")

// ---------------------------------------------------------------- Poly Haven
async function polyhavenAssets(type) {
  return j(`https://api.polyhaven.com/assets?t=${type}`)
}

async function fetchPolyhavenMap(phId, wantKeys, res = "2k") {
  // wantKeys: ordered map-key preferences e.g. ["Diffuse","Color"]; returns url or null
  const files = await j(`https://api.polyhaven.com/files/${phId}`)
  for (const key of wantKeys) {
    const entry = files[key]
    if (!entry) continue
    const r = entry[res] || entry["1k"] || entry["4k"]
    if (!r) continue
    const fmt = r.jpg ? "jpg" : r.png ? "png" : null
    if (fmt) return r[fmt].url
  }
  return null
}

async function doHdri() {
  console.log("\n== HDRI (Poly Haven) ==")
  const finalPath = path.join(OUT, "hdri", "env_2k.hdr")
  const prefs = ["kloofendal_48d_partly_cloudy_puresky", "qwantani", "sunflowers_puresky", "kloppenheim_02_puresky"]
  try {
    const all = await polyhavenAssets("hdris")
    const ids = Object.keys(all)
    let id = prefs.find((p) => ids.includes(p))
    if (!id) id = ids.find((i) => i.endsWith("_puresky")) || ids.find((i) => /sky|cloud/.test(i)) || ids[0]
    const files = await j(`https://api.polyhaven.com/files/${id}`)
    const url = files?.hdri?.["2k"]?.hdr?.url || files?.hdri?.["1k"]?.hdr?.url
    if (!url) throw new Error(`no 2k hdr url for ${id}`)
    await downloadTo(url, path.join(RAW, "hdri", `${id}_2k.hdr`))
    await fsp.mkdir(path.dirname(finalPath), { recursive: true })
    await fsp.copyFile(path.join(RAW, "hdri", `${id}_2k.hdr`), finalPath)
    credits.push({ file: "assets/hdri/env_2k.hdr", source: `Poly Haven HDRI "${id}"`, url: `https://polyhaven.com/a/${id}`, license: LICENSE, note: "2k .hdr" })
    console.log(`  -> env_2k.hdr  (hdri: ${id})`)
  } catch (e) {
    console.error(`  FAILED hdri: ${e.message}`)
    missing.push({ file: "assets/hdri/env_2k.hdr", reason: e.message })
  }
}

const TERRAIN_LAYERS = [
  { layer: "grass", prefs: ["aerial_grass_rock", "leafy_grass", "sparse_grass", "grass_path_2"] },
  { layer: "forest", prefs: ["forest_ground_04", "forrest_ground_01", "forest_floor", "leaves_forest_ground", "forest_leaves_02"] },
  { layer: "dry", prefs: ["withered_grass", "dry_decay_leaves", "brown_mud_leaves_01", "dry_ground_01"] },
  { layer: "rock", prefs: ["rock_face", "dark_rock", "dark_rock_02", "rock_boulder", "rocky_terrain_02", "aerial_rocks_01"] },
  { layer: "snow", prefs: ["snow_02", "snow_01", "snow_03", "snow_floor"] },
  { layer: "path", prefs: ["stony_dirt_path", "muddy_tracks", "grass_path_2", "dirt", "raked_dirt"] },
]

async function doTerrain() {
  console.log("\n== Terrain textures (Poly Haven) ==")
  let catalog
  try {
    catalog = Object.keys(await polyhavenAssets("textures"))
  } catch (e) {
    console.error(`  FAILED to list polyhaven textures: ${e.message}`)
    for (const { layer } of TERRAIN_LAYERS) missing.push({ file: `assets/textures/terrain/${layer}_{color,normal}.jpg`, reason: "polyhaven list failed" })
    return
  }
  for (const { layer, prefs } of TERRAIN_LAYERS) {
    let id = prefs.find((p) => catalog.includes(p))
    if (!id) id = catalog.find((i) => i.includes(layer) && /rock|ground|grass|dirt/.test(i))
    if (!id) {
      console.error(`  FAILED ${layer}: no suitable polyhaven id`)
      missing.push({ file: `assets/textures/terrain/${layer}_*.jpg`, reason: "no source id" })
      continue
    }
    try {
      const colorUrl = await fetchPolyhavenMap(id, ["Diffuse", "Color", "diffuse"])
      const normalUrl = await fetchPolyhavenMap(id, ["nor_gl", "Normal", "nor_dx"])
      if (!colorUrl || !normalUrl) throw new Error(`missing maps (color=${!!colorUrl} normal=${!!normalUrl})`)
      const rawC = path.join(RAW, "textures", `${id}_color.jpg`)
      const rawN = path.join(RAW, "textures", `${id}_normal.jpg`)
      await downloadTo(colorUrl, rawC)
      await downloadTo(normalUrl, rawN)
      const dir = path.join(OUT, "textures", "terrain")
      await fsp.mkdir(dir, { recursive: true })
      await fsp.copyFile(rawC, path.join(dir, `${layer}_color.jpg`))
      await fsp.copyFile(rawN, path.join(dir, `${layer}_normal.jpg`))
      credits.push({ file: `assets/textures/terrain/${layer}_color.jpg`, source: `Poly Haven texture "${id}" (Diffuse)`, url: `https://polyhaven.com/a/${id}`, license: LICENSE, note: "2k jpg" })
      credits.push({ file: `assets/textures/terrain/${layer}_normal.jpg`, source: `Poly Haven texture "${id}" (nor_gl)`, url: `https://polyhaven.com/a/${id}`, license: LICENSE, note: "2k jpg" })
      console.log(`  -> ${layer}_{color,normal}.jpg  (texture: ${id})`)
    } catch (e) {
      console.error(`  FAILED ${layer} (${id}): ${e.message}`)
      missing.push({ file: `assets/textures/terrain/${layer}_*.jpg`, reason: e.message })
    }
  }
}

// ---------------------------------------------------------------- Models
const SHOWCASE_FILES = [
  // characters
  { name: "knight", pack: "single_knight_pack", file: "KnightCharacter.glb" },
  { name: "horse", pack: "animals_pack", file: "Horse.glb" },
  { name: "rat", pack: "easy_enemies_pack", file: "Rat.glb" },
  { name: "fox", pack: "animals_pack", file: "Fox.glb" },
  { name: "wolf", pack: "animals_pack", file: "Wolf.glb" },
  { name: "bull", pack: "animals_pack", file: "Bull.glb" },
  { name: "deer", pack: "animals_pack", file: "Deer.glb" },
  // nature
  { name: "oak", pack: "nature_pack", file: "CommonTree_1.glb" },
  { name: "pine", pack: "nature_pack", file: "PineTree_1.glb" },
  { name: "bush", pack: "nature_pack", file: "Bush_1.glb" },
  { name: "rock", pack: "nature_pack", file: "Rock_1.glb" },
  { name: "stump", pack: "nature_pack", file: "TreeStump.glb" },
  { name: "tuft", pack: "nature_pack", file: "Grass.glb" },
  { name: "flower", pack: "crops_pack", file: "Flower_1.glb" },
  { name: "mushroom", pack: "crops_pack", file: "Mushroom_1.glb" },
  { name: "log", pack: "nature_pack", file: "WoodLog.glb" },
  // village
  { name: "house_a", pack: "medieval_village_pack", file: "House_1.glb" },
  { name: "house_b", pack: "medieval_village_pack", file: "House_2.glb" },
  { name: "keep", pack: "medieval_village_pack", file: "Bell_Tower.glb" },
  { name: "well", pack: "medieval_village_pack", file: "Well.glb" },
  { name: "stable", pack: "medieval_village_pack", file: "Stable.glb" },
  { name: "tent", pack: "survival_pack", file: "Tent.glb" },
  { name: "crate", pack: "medieval_village_pack", file: "Crate.glb" },
  { name: "barrel", pack: "medieval_village_pack", file: "Barrel.glb" },
  { name: "fence", pack: "medieval_village_pack", file: "Fence.glb" },
  { name: "lantern", pack: "survival_pack", file: "WoodenTorch.glb", note: "torch model stands in for village lantern" },
]

const DRIVE_FILES = [
  { name: "boar", file: "Pig.gltf", id: "1lcOKA98VPl3ZrqhLREXgdlPWI_0rVa5f", note: "Quaternius Cute Monsters Pig stands in for boar" },
  { name: "bear", file: "Panda.gltf", id: "1G9rIrxPRvTOhHeaOr4Dv6An5xhHiLuaz", note: "Quaternius Cute Monsters Panda stands in for bear" },
  { name: "owl", file: "Bat.gltf", id: "1TlSZUCcfEH3s8ebE6a-bK2Nd3GHd96f9", note: "Quaternius Cute Monsters Bat (winged flyer) stands in for owl" },
  { name: "chicken", file: "Chicken.gltf", id: "1YM3mIxS9FpEKH_mqU5SjjfqCE4-DReO6" },
  { name: "elder", file: "Demon.gltf", id: "1FL00H4WRNrBQpIatRpxD2D1lLWqDTEG8", note: "animated robed Demon stands in for the elder caster (Witch.glb was unrigged)" },
]

async function doModels() {
  console.log("\n== Models (Quaternius CC0, GitHub mirror) ==")
  for (const item of SHOWCASE_FILES) {
    const finalPath = path.join(OUT, "models", dirFor(item.name), `${item.name}.glb`)
    try {
      const url = `${SHOWCASE}/${item.pack}/${item.file}`
      const rawPath = path.join(RAW, "models", `${item.name}_src.glb`)
      await downloadTo(url, rawPath)
      await fsp.mkdir(path.dirname(finalPath), { recursive: true })
      await fsp.copyFile(rawPath, finalPath)
      credits.push({ file: relAssets(finalPath), source: `Quaternius "${prettyPack(item.pack)}" — ${item.file} (GitHub mirror)`, url, license: LICENSE, note: item.note || "" })
    } catch (e) {
      console.error(`  FAILED ${item.name}: ${e.message}`)
      missing.push({ file: relAssets(finalPath), reason: e.message })
    }
  }

  console.log("\n== Models (Quaternius Cute Monsters via Google Drive) ==")
  for (const item of DRIVE_FILES) {
    const finalPath = path.join(OUT, "models", dirFor(item.name), `${item.name}.glb`)
    try {
      const rawGltf = path.join(RAW, "models", `${item.name}_src.gltf`)
      await driveDownload(item.id, rawGltf)
      if (looksLikeHtml(fs.readFileSync(rawGltf))) throw new Error("drive returned HTML page instead of gltf")
      const glb = gltfToGlb(fs.readFileSync(rawGltf), item.file)
      const rawGlb = rawGltf.replace(/\.gltf$/, ".glb")
      await fsp.writeFile(rawGlb, glb)
      await fsp.mkdir(path.dirname(finalPath), { recursive: true })
      await fsp.writeFile(finalPath, glb)
      credits.push({ file: relAssets(finalPath), source: `Quaternius "Cute Monsters" pack — ${item.file} (official Drive folder)`, url: CUTE_MONSTERS_PAGE, license: LICENSE, note: item.note || "converted .gltf -> .glb" })
      console.log(`  -> models/${dirFor(item.name)}/${item.name}.glb`)
    } catch (e) {
      console.error(`  FAILED ${item.name}: ${e.message}`)
      missing.push({ file: relAssets(finalPath), reason: e.message })
    }
  }
}

const dirFor = (name) => (["knight", "horse", "rat", "fox", "boar", "wolf", "bear", "owl", "elder", "bull", "deer", "chicken"].includes(name) ? "characters" : ["oak", "pine", "blossom", "bush", "rock", "stump", "tuft", "flower", "mushroom", "log"].includes(name) ? "nature" : "village")
const prettyPack = (p) => p.replace(/_/g, " ").replace(/pack$/, "Pack").replace(/\b\w/g, (c) => c.toUpperCase())
const relAssets = (f) => `assets/${path.relative(OUT, f).split(path.sep).join("/")}`

// ---------------------------------------------------------------- main
async function main() {
  await fsp.mkdir(RAW, { recursive: true })
  console.log(`fetch-assets: root=${ROOT} raw=${path.relative(ROOT, RAW)} force=${FORCE} only=${ONLY || "all"}`)

  const jobs = []
  if (want("hdri")) jobs.push(doHdri())
  if (want("terrain")) jobs.push(doTerrain())
  if (want("models")) jobs.push(doModels())
  await Promise.all(jobs)

  // elder.glb has no direct CC0 match yet; a robed Witch from Quaternius modular packs
  // would be ideal but the modular_women pack is only available as an unmirrored Drive set.
  // The game falls back to its procedural elder; reported below.

  await fsp.writeFile(
    path.join(RAW, "sources.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), credits, missing }, null, 2)
  )
  writeCredits()

  console.log(`\n== Summary ==`)
  console.log(`downloads this run: ${nDownloaded}`)
  console.log(`credits written: public/assets/CREDITS.md (${credits.length} files)`)
  if (missing.length) {
    console.log(`MISSING (${missing.length}):`)
    for (const m of missing) console.log(`  - ${m.file}: ${m.reason}`)
  }
}

function writeCredits() {
  const lines = [
    "# Asset credits — Journey: The CMO's Quest",
    "",
    "All assets below are CC0 1.0 (public domain). No attribution required by license,",
    "given as courtesy. Generated by scripts/fetch-assets.mjs — do not edit by hand.",
    "",
    "| File | Source | URL | License |",
    "|---|---|---|---|",
  ]
  for (const c of credits) {
    lines.push(`| ${c.file} | ${c.source}${c.note ? ` (${c.note})` : ""} | ${c.url} | ${c.license} |`)
  }
  const blossom = [
    "",
    "## Derived assets",
    "",
    "- `assets/models/nature/blossom.glb` — derived in `scripts/optimize-assets.mjs` from",
    "  Quaternius Ultimate Nature `CommonTree_1` (same license: CC0) by tinting foliage",
    "  materials pink; no other changes.",
  ]
  if (fs.existsSync(path.join(OUT, "models", "nature", "blossom.glb"))) lines.push(...blossom)
  fs.writeFileSync(path.join(OUT, "CREDITS.md"), lines.join("\n") + "\n")
}

main().catch((e) => {
  console.error("fatal:", e)
  process.exit(1)
})
