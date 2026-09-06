/* Journey static site worker — serves ./dist assets and proxies the AI coach.
 * The old notebook KV sync was removed; answers/tips sync to the local Obsidian
 * vault at C:\Users\bluep\Azizbek via the Vite dev-server plugin.
 *
 * AI env vars (set in the Cloudflare dashboard / wrangler):
 *   AI_BASE_URL — OpenAI-compatible base URL (e.g. https://api.openai.com/v1)
 *   AI_API_KEY  — API key (store as a secret)
 *   AI_MODEL    — model name (e.g. gpt-4o-mini)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function aiConfigured(env) {
  return !!(env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL)
}

function aiEndpoint(base) {
  return `${String(base).replace(/\/+$/, "")}/chat/completions`
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const p = url.pathname

    try {
      // GET /api/ai/status — { ok, configured, model }
      if (req.method === "GET" && p === "/api/ai/status") {
        return json({ ok: true, configured: aiConfigured(env), model: env.AI_MODEL || null })
      }

      // POST /api/ai/chat — body { messages:[{role,content}], model?, temperature? } → SSE stream
      if (req.method === "POST" && p === "/api/ai/chat") {
        if (!aiConfigured(env)) {
          return json({ error: "AI not configured. Set AI_BASE_URL, AI_API_KEY and AI_MODEL in the Cloudflare Worker, then redeploy." }, 200)
        }
        let parsed = {}
        try { parsed = await req.json() } catch (e) { return json({ error: "invalid JSON" }, 400) }
        const messages = parsed.messages
        if (!Array.isArray(messages) || !messages.length) return json({ error: "missing messages" }, 400)
        for (const m of messages) {
          if (!m || typeof m.role !== "string" || typeof m.content !== "string") return json({ error: "bad message shape" }, 400)
        }
        const payload = { model: parsed.model || env.AI_MODEL, stream: true, messages }
        if (typeof parsed.temperature === "number") payload.temperature = parsed.temperature

        let up
        try {
          up = await fetch(aiEndpoint(env.AI_BASE_URL), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.AI_API_KEY}`
            },
            body: JSON.stringify(payload)
          })
        } catch (e) {
          return json({ error: "AI upstream unreachable: " + String(e.message || e) }, 502)
        }
        if (!up.ok) {
          const detail = await up.text().catch(() => "")
          return json({ error: `AI upstream ${up.status}: ${String(detail).slice(0, 600)}` }, 502)
        }
        if (!up.body) return json({ error: "AI upstream returned no body" }, 502)

        const headers = new Headers()
        headers.set("Content-Type", "text/event-stream; charset=utf-8")
        headers.set("Cache-Control", "no-cache, no-transform")
        headers.set("Connection", "keep-alive")
        headers.set("X-Accel-Buffering", "no")
        return new Response(up.body, { status: 200, headers })
      }
    } catch (e) {
      return json({ error: String(e.message || e) }, 400)
    }

    try {
      if (env.ASSETS) return await env.ASSETS.fetch(req)
    } catch (e) {}
    return new Response("Not found", { status: 404 })
  },
}
