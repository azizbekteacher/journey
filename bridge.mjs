/* Journey local vault bridge — lets the deployed Cloudflare site (any page on
 * this laptop) read/write the Obsidian vault at C:\Users\bluep\Azizbek.
 *
 * The Worker runs in a Cloudflare datacenter and can never touch local files,
 * so the frontend (src/net.js) points all /api/vault/* calls at THIS server on
 * loopback, which is a faithful port of the Vite dev plugin's vaultMiddleware
 * (vite.config.js) with the same endpoints, caps and section markers.
 *
 *   npm run bridge            → http://127.0.0.1:8790/api/vault/*
 *   $env:OBSIDIAN_VAULT       → override vault dir (used by tests)
 *   $env:BRIDGE_PORT          → override port (default 8790, keep in sync with src/net.js)
 *
 * AI (/api/ai/*) is intentionally NOT here — in prod it runs on the Worker.
 */

import { createServer } from "node:http"
import { readFile, writeFile, stat, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PORT = Number(process.env.BRIDGE_PORT || 8790)
const HOST = process.env.BRIDGE_HOST || "127.0.0.1"
const here = path.dirname(fileURLToPath(import.meta.url))
const VAULT_DIR = process.env.OBSIDIAN_VAULT || path.resolve(here, "../Azizbek")
const ALLOWED_FILES = new Set([
  "Journey questions.md",
  "Tips.md",
  "Tasks.md",
  "Extra details.md",
  "About me.md",
])

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function sendJson(res, code, obj, cors = true) {
  if (res.writableEnded) return
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...(cors ? CORS : {}),
  })
  res.end(JSON.stringify(obj))
}

function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (c) => {
      body += c
      if (body.length > limit) {
        reject(new Error("body too large"))
        req.destroy()
      }
    })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

function queryMap(url) {
  const out = {}
  const q = url.indexOf("?")
  if (q === -1) return out
  for (const kv of url.slice(q + 1).split("&")) {
    const [k, v] = kv.split("=")
    try { out[decodeURIComponent(k)] = decodeURIComponent(v || "") } catch (e) {}
  }
  return out
}

// Idempotent upsert: replace the marked section for `key`, else append it.
function upsertSection(content, key, markdown) {
  const open = `<!-- journey:${key} -->`
  const close = `<!-- /journey:${key} -->`
  const block = `${markdown.trim()}\n`
  const start = content.indexOf(open)
  const end = content.indexOf(close)
  if (start !== -1 && end !== -1 && end > start) {
    const before = content.slice(0, start)
    const after = content.slice(end + close.length)
    return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n")
  }
  const sep = content.length && !content.endsWith("\n") ? "\n" : ""
  const gap = content.trim().length ? "\n" : ""
  return `${content}${sep}${gap}${block}`.replace(/\n{3,}/g, "\n\n")
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const p = url.pathname
  const method = req.method

  try {
    // GET /api/vault/status — { ok, vault, files, mtimes }
    if (method === "GET" && p === "/api/vault/status") {
      const mtimes = {}
      for (const f of ALLOWED_FILES) {
        try { mtimes[f] = (await stat(path.join(VAULT_DIR, f))).mtimeMs } catch (e) { mtimes[f] = null }
      }
      sendJson(res, 200, { ok: true, vault: VAULT_DIR, files: [...ALLOWED_FILES], mtimes })
      return
    }

    // POST /api/vault/upsert — section-level upsert (answers / tips / plans)
    if (method === "POST" && p === "/api/vault/upsert") {
      let body = ""
      try { body = await readBody(req) } catch (e) { return sendJson(res, 413, { error: String(e.message || e) }) }
      let parsed = {}
      try { parsed = JSON.parse(body || "{}") } catch (e) { return sendJson(res, 400, { error: "invalid JSON" }) }
      const { file, key, markdown } = parsed
      if (!ALLOWED_FILES.has(file)) return sendJson(res, 400, { error: "file not allowed" })
      if (typeof key !== "string" || !key) return sendJson(res, 400, { error: "missing key" })
      if (typeof markdown !== "string") return sendJson(res, 400, { error: "missing markdown" })
      if (markdown.length > 200000) return sendJson(res, 413, { error: "section too large" })
      const target = path.join(VAULT_DIR, file)
      if (path.relative(VAULT_DIR, target).startsWith("..")) return sendJson(res, 400, { error: "bad path" })
      await mkdir(VAULT_DIR, { recursive: true })
      let content = ""
      try { content = await readFile(target, "utf8") } catch (e) { if (e.code !== "ENOENT") throw e }
      const next = upsertSection(content, key, markdown)
      await writeFile(target, next, "utf8")
      const mtime = (await stat(target)).mtimeMs
      sendJson(res, 200, { ok: true, file, mtime })
      return
    }

    // GET /api/vault/file/head?file=… — cheap mtime probe for external-change polling
    if (method === "GET" && p === "/api/vault/file/head") {
      const file = queryMap(req.url).file
      if (!ALLOWED_FILES.has(file)) return sendJson(res, 400, { error: "file not allowed" })
      const target = path.join(VAULT_DIR, file)
      try {
        const st = await stat(target)
        sendJson(res, 200, { ok: true, file, mtime: st.mtimeMs, exists: true })
      } catch (e) {
        sendJson(res, 200, { ok: true, file, mtime: null, exists: false })
      }
      return
    }

    // GET/PUT/POST /api/vault/file?file=… — read whole file / write whole file (Tasks.md)
    if (p === "/api/vault/file") {
      if (method === "GET") {
        const file = queryMap(req.url).file
        if (!ALLOWED_FILES.has(file)) return sendJson(res, 400, { error: "file not allowed" })
        const target = path.join(VAULT_DIR, file)
        try {
          const [content, st] = await Promise.all([readFile(target, "utf8"), stat(target)])
          sendJson(res, 200, { ok: true, file, content, mtime: st.mtimeMs })
        } catch (e) {
          if (e.code === "ENOENT") sendJson(res, 200, { ok: true, file, content: "", mtime: null })
          else throw e
        }
        return
      }
      if (method === "PUT" || method === "POST") {
        let body = ""
        try { body = await readBody(req) } catch (e) { return sendJson(res, 413, { error: String(e.message || e) }) }
        let parsed = {}
        try { parsed = JSON.parse(body || "{}") } catch (e) { return sendJson(res, 400, { error: "invalid JSON" }) }
        const { file, content } = parsed
        if (!ALLOWED_FILES.has(file)) return sendJson(res, 400, { error: "file not allowed" })
        if (typeof content !== "string") return sendJson(res, 400, { error: "missing content" })
        if (content.length > 500000) return sendJson(res, 413, { error: "file too large" })
        const target = path.join(VAULT_DIR, file)
        if (path.relative(VAULT_DIR, target).startsWith("..")) return sendJson(res, 400, { error: "bad path" })
        await mkdir(VAULT_DIR, { recursive: true })
        await writeFile(target, content, "utf8")
        const mtime = (await stat(target)).mtimeMs
        sendJson(res, 200, { ok: true, file, mtime })
        return
      }
    }
  } catch (e) {
    sendJson(res, 400, { error: String(e.message || e) })
    return
  }

  sendJson(res, 404, { error: "not found" })
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  handle(req, res)
}).listen(PORT, HOST, () => {
  console.log(`Journey vault bridge → http://${HOST}:${PORT}`)
  console.log(`  vault dir: ${VAULT_DIR}`)
  console.log(`  (keep this running while you play the deployed Cloudflare site)`)
})
