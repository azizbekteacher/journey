import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'

const here = path.dirname(fileURLToPath(import.meta.url))
// Obsidian vault (sibling folder). Override with OBSIDIAN_VAULT env var (used by tests).
const VAULT_DIR = process.env.OBSIDIAN_VAULT || path.resolve(here, '../Azizbek')
const ALLOWED_FILES = new Set(['Journey questions.md', 'Tips.md', 'Tasks.md', 'Extra details.md', 'About me.md', 'Coach instructions.md'])

function sendJson(res, code, obj) {
  if (res.headersSent) return
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 2e6) { reject(new Error('body too large')) } })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sectionBlock(key, markdown) {
  return `${markdown.trim()}\n`
}

// Idempotent upsert: replace the marked section for `key`, else append it.
function upsertSection(content, key, markdown) {
  const open = `<!-- journey:${key} -->`
  const close = `<!-- /journey:${key} -->`
  const block = sectionBlock(key, markdown)
  const start = content.indexOf(open)
  const end = content.indexOf(close)
  if (start !== -1 && end !== -1 && end > start) {
    const before = content.slice(0, start)
    const after = content.slice(end + close.length)
    return `${before}${block}${after}`.replace(/\n{3,}/g, '\n\n')
  }
  const sep = content.length && !content.endsWith('\n') ? '\n' : ''
  const gap = content.trim().length ? '\n' : ''
  return `${content}${sep}${gap}${block}`.replace(/\n{3,}/g, '\n\n')
}

function queryMap(url) {
  const q = url.indexOf('?')
  const out = {}
  if (q === -1) return out
  for (const kv of url.slice(q + 1).split('&')) {
    const [k, v] = kv.split('=')
    out[decodeURIComponent(k)] = decodeURIComponent(v || '')
  }
  return out
}

async function vaultMiddleware(req, res, next) {
  const p = req.url.split('?')[0]
  try {
    // GET /api/vault/status — { ok, vault, files, mtimes }
    if (req.method === 'GET' && p === '/api/vault/status') {
      const mtimes = {}
      for (const f of ALLOWED_FILES) {
        try { mtimes[f] = (await stat(path.join(VAULT_DIR, f))).mtimeMs } catch (e) { mtimes[f] = null }
      }
      sendJson(res, 200, { ok: true, vault: VAULT_DIR, files: [...ALLOWED_FILES], mtimes })
      return
    }

    // POST /api/vault/upsert — section-level upsert (answers / tips / plans)
    if (req.method === 'POST' && p === '/api/vault/upsert') {
      let body = ''
      try { body = await readBody(req) } catch (e) { return sendJson(res, 413, { error: String(e.message || e) }) }
      const { file, key, markdown } = JSON.parse(body || '{}')
      if (!ALLOWED_FILES.has(file)) throw new Error('file not allowed')
      if (typeof key !== 'string' || !key) throw new Error('missing key')
      if (typeof markdown !== 'string') throw new Error('missing markdown')
      if (markdown.length > 200000) throw new Error('section too large')
      const target = path.join(VAULT_DIR, file)
      if (path.relative(VAULT_DIR, target).startsWith('..')) throw new Error('bad path')
      await mkdir(VAULT_DIR, { recursive: true })
      let content = ''
      try { content = await readFile(target, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
      const next = upsertSection(content, key, markdown)
      await writeFile(target, next, 'utf8')
      const mtime = (await stat(target)).mtimeMs
      sendJson(res, 200, { ok: true, file, mtime })
      return
    }

    // GET /api/vault/file/head?file=… — cheap mtime probe for external-change polling
    if (req.method === 'GET' && p === '/api/vault/file/head') {
      const file = queryMap(req.url).file
      if (!ALLOWED_FILES.has(file)) throw new Error('file not allowed')
      const target = path.join(VAULT_DIR, file)
      try {
        const st = await stat(target)
        sendJson(res, 200, { ok: true, file, mtime: st.mtimeMs, exists: true })
      } catch (e) {
        sendJson(res, 200, { ok: true, file, mtime: null, exists: false })
      }
      return
    }

    // GET/PUT /api/vault/file?file=… — read whole file / write whole file (Tasks.md)
    if (p === '/api/vault/file') {
      if (req.method === 'GET') {
        const file = queryMap(req.url).file
        if (!ALLOWED_FILES.has(file)) throw new Error('file not allowed')
        const target = path.join(VAULT_DIR, file)
        try {
          const [content, st] = await Promise.all([readFile(target, 'utf8'), stat(target)])
          sendJson(res, 200, { ok: true, file, content, mtime: st.mtimeMs })
        } catch (e) {
          if (e.code === 'ENOENT') sendJson(res, 200, { ok: true, file, content: '', mtime: null })
          else throw e
        }
        return
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        let body = ''
        try { body = await readBody(req) } catch (e) { return sendJson(res, 413, { error: String(e.message || e) }) }
        const { file, content } = JSON.parse(body || '{}')
        if (!ALLOWED_FILES.has(file)) throw new Error('file not allowed')
        if (typeof content !== 'string') throw new Error('missing content')
        if (content.length > 500000) throw new Error('file too large')
        const target = path.join(VAULT_DIR, file)
        if (path.relative(VAULT_DIR, target).startsWith('..')) throw new Error('bad path')
        await mkdir(VAULT_DIR, { recursive: true })
        await writeFile(target, content, 'utf8')
        const mtime = (await stat(target)).mtimeMs
        sendJson(res, 200, { ok: true, file, mtime })
        return
      }
    }

    next()
  } catch (e) {
    sendJson(res, 400, { error: String(e.message || e) })
  }
}

function vaultPlugin() {
  return {
    name: 'obsidian-vault-sync',
    configureServer(server) {
      server.middlewares.use(vaultMiddleware)
    }
  }
}

// ---- AI coach proxy (local dev only; the Cloudflare Worker has no such route) ----
// Reads AI_BASE_URL / AI_API_KEY / AI_MODEL from .env (never shipped to the browser).

function aiEndpoint(base) {
  return `${String(base).replace(/\/+$/, '')}/chat/completions`
}

function aiMiddleware(AI) {
  return async function (req, res, next) {
    const p = req.url.split('?')[0]
    try {
      // GET /api/ai/status — { ok, configured, model }
      if (req.method === 'GET' && p === '/api/ai/status') {
        sendJson(res, 200, { ok: true, configured: !!(AI.key && AI.base && AI.model), model: AI.model || null })
        return
      }

      // POST /api/ai/chat — body { messages:[{role,content}], model? } → OpenAI-compatible SSE stream
      if (req.method === 'POST' && p === '/api/ai/chat') {
        if (!AI.key || !AI.base || !AI.model) {
          return sendJson(res, 200, { error: 'AI not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in .env, then restart the dev server.' })
        }
        let body = ''
        try { body = await readBody(req) } catch (e) { return sendJson(res, 413, { error: String(e.message || e) }) }
        let parsed = {}
        try { parsed = JSON.parse(body || '{}') } catch (e) { return sendJson(res, 400, { error: 'invalid JSON' }) }
        const messages = parsed.messages
        if (!Array.isArray(messages) || !messages.length) throw new Error('missing messages')
        for (const m of messages) {
          if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') throw new Error('bad message shape')
        }
        const wantStream = parsed.stream !== false
        const payload = { model: parsed.model || AI.model, stream: wantStream, messages }
        if (typeof parsed.temperature === 'number') payload.temperature = parsed.temperature

        let up
        try {
          up = await fetch(aiEndpoint(AI.base), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AI.key}`
            },
            body: JSON.stringify(payload)
          })
        } catch (e) {
          return sendJson(res, 502, { error: 'AI upstream unreachable: ' + String(e.message || e) })
        }
        if (!up.ok) {
          let detail = ''
          try { detail = await up.text() } catch (e) {}
          return sendJson(res, 502, { error: `AI upstream ${up.status}: ${String(detail).slice(0, 600)}` })
        }
        if (!up.body) return sendJson(res, 502, { error: 'AI upstream returned no body' })

        // Non-streamed request → pass through the upstream JSON response.
        if (!wantStream) {
          const raw = await up.text()
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(raw)
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        if (typeof res.flushHeaders === 'function') res.flushHeaders()

        const reader = up.body.getReader()
        const dec = new TextDecoder()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(dec.decode(value, { stream: true }))
          }
        } catch (e) {
          // Client likely disconnected; nothing to send back safely.
        } finally {
          try { reader.releaseLock() } catch (e) {}
        }
        res.end()
        return
      }

      next()
    } catch (e) {
      sendJson(res, 400, { error: String(e.message || e) })
    }
  }
}

function aiPlugin(AI) {
  return {
    name: 'ai-coach-proxy',
    configureServer(server) {
      server.middlewares.use(aiMiddleware(AI))
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '')
  const AI = {
    base: env.AI_BASE_URL || '',
    key: env.AI_API_KEY || '',
    model: env.AI_MODEL || ''
  }
  return {
    server: {
      port: 3000,
      strictPort: true,
      host: 'localhost'
    },
    build: {
      chunkSizeWarningLimit: 1200
    },
    plugins: [vaultPlugin(), aiPlugin(AI)]
  }
})
