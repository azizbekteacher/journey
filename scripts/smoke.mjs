#!/usr/bin/env node
// smoke.mjs — Journey game visual smoke test (Playwright, chromium headless).
//
// Boots the game at --url, clicks Begin, pans the camera slowly and takes screenshots;
// optionally measures average FPS over 3s. Does NOT start a server — run the game
// yourself (npm run dev) or point --url at any host.
//
// Usage:
//   node scripts/smoke.mjs [--url http://localhost:3000] [--shots 5] [--out smoke_new] [--fps]
//
// Screenshots: <out>_1.png ... <out>_N.png (PNG, 1600x900). Exit code 0 on success,
// 1 on navigation/boot failure or if chromium is not installed (npx playwright install chromium).

import path from "node:path"
import fs from "node:fs"

// --- args
const args = process.argv.slice(2)
const argOf = (name, def) => {
  const i = args.indexOf(name)
  if (i < 0) return def
  const v = args[i + 1]
  return v && !v.startsWith("--") ? v : def
}
const URL = argOf("--url", "http://localhost:3000")
const SHOTS = Math.max(1, parseInt(argOf("--shots", "5"), 10) || 5)
const OUT_PREFIX = argOf("--out", "smoke_new")
const MEASURE_FPS = args.includes("--fps")
const OUT_DIR = path.dirname(path.resolve(OUT_PREFIX))

let chromium
try {
  ;({ chromium } = await import("playwright"))
} catch (e) {
  console.error("[smoke] playwright not installed:", e.message)
  process.exit(1)
}

const errors = []
const warnings = []

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log(`[smoke] url=${URL} shots=${SHOTS} out=${OUT_PREFIX}_N.png fps=${MEASURE_FPS}`)

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    console.error("[smoke] chromium launch failed:", e.message)
    console.error("[smoke] hint: run `npx playwright install chromium` once.")
    process.exit(1)
  }

  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  })

  page.on("console", (msg) => {
    const text = msg.text()
    if (msg.type() === "error") {
      errors.push(text)
      console.log(`[console.error] ${text}`)
    } else if (msg.type() === "warning") {
      warnings.push(text)
    }
  })
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`)
    console.log(`[pageerror] ${err.message}`)
  })

  // --- load
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 })
  } catch (e) {
    console.error(`[smoke] navigation failed: ${e.message}`)
    await browser.close()
    process.exit(1)
  }

  try {
    await page.waitForSelector("#title", { state: "visible", timeout: 30000 })
  } catch {
    console.log("[smoke] #title not visible within 30s (continuing anyway)")
  }

  // --- begin (button must be enabled; it enables after assets/prologue settle)
  try {
    await page.waitForFunction(
      () => {
        const b = document.getElementById("btn-begin")
        return !!b && !b.disabled && b.offsetParent !== null
      },
      { timeout: 30000 }
    )
    await page.click("#btn-begin")
    console.log("[smoke] clicked #btn-begin")
  } catch {
    console.log("[smoke] #btn-begin never enabled within 30s — attempting click anyway")
    try { await page.click("#btn-begin", { timeout: 5000, force: true }) } catch {}
  }
  await page.waitForTimeout(2000)

  // --- screenshots with slow camera pan (mouse move nudges pointer-follow cameras)
  const pan = async (fromX, toX, steps = 12) => {
    const y = 480
    for (let s = 0; s < steps; s++) {
      const x = fromX + ((toX - fromX) * s) / steps
      await page.mouse.move(x, y)
      await page.waitForTimeout(125) // 12 * 125ms = 1.5s
    }
  }
  let x = 600
  for (let i = 1; i <= SHOTS; i++) {
    const file = `${OUT_PREFIX}_${i}.png`
    await page.screenshot({ path: file })
    console.log(`[smoke] shot ${i}/${SHOTS} -> ${file}`)
    if (i < SHOTS) {
      const to = x + 240
      await pan(x, to)
      x = to > 1100 ? 500 : to
    }
  }

  // --- fps
  if (MEASURE_FPS) {
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0
          const t0 = performance.now()
          const tick = () => {
            frames++
            const dt = performance.now() - t0
            if (dt < 3000) requestAnimationFrame(tick)
            else resolve((frames / dt) * 1000)
          }
          requestAnimationFrame(tick)
        })
    )
    console.log(`[smoke] avg FPS (3s): ${fps.toFixed(1)}`)
  }

  await browser.close()

  console.log(`\n[smoke] done: ${SHOTS} shots, ${errors.length} console/page error(s), ${warnings.length} console warning(s)`)
  if (errors.length) process.exitCode = 0 // errors are reported, not fatal — visual artifacts are judged from shots
}

main().catch((e) => {
  console.error("[smoke] fatal:", e)
  process.exit(1)
})
