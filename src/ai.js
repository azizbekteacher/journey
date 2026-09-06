// The AI Coach — a business coach that lives in your Obsidian vault.
//
//   - reads the whole vault (About me, Extra details, Journey questions, Tips)
//     so it coaches against your CURRENT state
//   - streams replies live through the local Vite proxy (vite.config.js),
//     which calls the OpenAI-compatible API using .env (never exposed here)
//   - the model is told to emit NEW facts about you / your business inside an
//     [EXTRA_FACTS] block; we strip that block from the chat and append the
//     facts to "Extra details.md" automatically (deduped)
//   - right-click a selection inside any message → small "📌 Create a task"
//     button floats above it; clicking appends "- [ ] …" to "Tasks.md"
//
// Local dev only: the Cloudflare Worker has no /api/ai route, so on production
// the panel reports itself offline.

import { FACTS, BATTLES, BOSS, MODULE_NAMES } from "./data/curriculum.js"

const $ = (id) => document.getElementById(id)
const CHAT_KEY = "journey_ai_chat_v1"
const CONTEXT_FILES = ["About me.md", "Extra details.md", "Journey questions.md", "Tips.md"]
const MAX_HISTORY = 30
const CONTEXT_BUDGET = 16000

function toast(msg) {
  window.dispatchEvent(new CustomEvent("toast", { detail: msg }))
}

function todayStamp() {
  const d = new Date()
  const m = d.toLocaleDateString(undefined, { month: "short" })
  const y = d.getFullYear()
  return `${m} ${d.getDate()}, ${y}`
}

// ---------------------------------------------------------------- api -------

function withTimeout(ms = 12000) {
  try {
    return { signal: AbortSignal.timeout(ms) }
  } catch (e) {
    return {}
  }
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, ...withTimeout() })
  if (!r.ok) throw new Error(path + " " + r.status)
  return r.json().catch(() => ({}))
}

async function readVaultFile(file) {
  try {
    const r = await api("/api/vault/file?file=" + encodeURIComponent(file))
    return { text: typeof r.content === "string" ? r.content : "", ok: true }
  } catch (e) {
    return { text: "", ok: false }
  }
}

async function appendToFile(file, block) {
  const { text, ok } = await readVaultFile(file)
  if (!ok) return false
  const body = text.endsWith("\n") ? text + block : text ? text + "\n" + block : block
  await api("/api/vault/file?file=" + encodeURIComponent(file), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, content: body })
  })
  return true
}

// ----------------------------------------------------------- vault context --

function gateArc() {
  const out = []
  for (const b of BATTLES) {
    const name = MODULE_NAMES[b.module]
    out.push(`${b.id} (${name}): ${b.title}`)
  }
  return out.join("\n")
}

async function buildContext() {
  const parts = []
  let used = 0
  const budget = (txt) => (used += txt.length) <= CONTEXT_BUDGET
  for (const f of CONTEXT_FILES) {
    const { text, ok } = await readVaultFile(f)
    if (!ok) continue
    const t = String(text || "").trim()
    if (!t) continue
    if (!budget("\n\n--- " + f + " ---\n\n" + t)) break
    parts.push(`### File: ${f}\n\n${t}`)
  }
  return parts.join("\n\n")
}

function buildSystemPrompt(digest) {
  const facts = FACTS.map((f) => `- ${f.title}: ${f.text}`).join("\n")
  return [
    "You are the AI Business Coach of the game 'Journey — The CMO's Quest', speaking in the spirit of the Chief Marketing Owl.",
    "The player is Azizbek Zubaydullayev (b. 2000, lives in Bukhara, IELTS 7.5): online General English teacher since 2019, founder of the course 'Fast English' and the app 'Tilsevar', running an online English school for Uzbek learners.",
    "",
    "## Your role",
    "- Coach him about HIS business using ONLY his real, current state (the vault files below) plus the business facts. Never invent numbers, students, channels or metrics that are not in the vault.",
    "- If important context is missing (e.g. goals, channels, offers, numbers), ask for it — do not assume.",
    "- Be concrete, warm and direct, in the voice of a demanding but friendly coach. Short paragraphs, lists, minimal fluff.",
    "- Relate advice to the game's 20-gate plan where useful (customer, offer, machine, strategy) and to the $200 quarterly budget.",
    "",
    "## Known business facts",
    facts,
    "",
    "## The game's quarterly-plan gates (topics)",
    gateArc(),
    "",
    "## The player's current state (read fresh from his Obsidian vault)",
    digest.trim() ? digest : "(The vault files are empty so far — he has not inscribed answers yet. Steer him toward the first gates.)",
    "",
    "## Extra-details contract (IMPORTANT)",
    "Whenever this conversation surfaces a concrete, durable NEW fact about the player or his business (a number, decision, channel, price, student detail, plan, preference…) that is NOT already visible in the 'Extra details.md' file above, you MUST end your reply with a machine-readable block exactly like this:",
    "[EXTRA_FACTS]",
    "- one fact per line, each on its own '- ' bullet",
    "- only genuinely new facts; never repeat anything already stored in Extra details.md",
    "- never invent facts; only record what he actually said",
    "[/EXTRA_FACTS]",
    "The block is stripped before he sees it — do not write 'I saved a note' inside the visible text; the app handles storage silently.",
    "If nothing new surfaced, output no block at all."
  ].join("\n")
}

// -------------------------------------------------------------- mini-md -----

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inlineMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

// Very small, safe markdown-lite (escaping first, only our tags emitted).
function fmtMarkdown(text) {
  const lines = String(text).split(/\r?\n/)
  const html = []
  let list = null
  const closeList = () => {
    if (list) { html.push("</ul>"); list = null }
  }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "")
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    const b = line.match(/^\s*[-*•]\s+(.*)$/)
    const n = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (h) { closeList(); html.push(`<h${Math.min(4, h[1].length + 1)}>${inlineMd(escapeHtml(h[2]))}</h${Math.min(4, h[1].length + 1)}>`) }
    else if (b) {
      if (!list) { list = true; html.push("<ul>") }
      html.push(`<li>${inlineMd(escapeHtml(b[1]))}</li>`)
    } else if (n) {
      if (!list) { list = true; html.push("<ul class='ol'>") }
      html.push(`<li>${inlineMd(escapeHtml(n[2]))}</li>`)
    } else if (!line.trim()) {
      closeList()
    } else {
      closeList()
      html.push(`<p>${inlineMd(escapeHtml(line))}</p>`)
    }
  }
  closeList()
  return html.join("")
}

// ---------------------------------------------------------------- state -----

function loadChat() {
  try {
    const raw = localStorage.getItem(CHAT_KEY)
    const a = raw ? JSON.parse(raw) : []
    return Array.isArray(a) ? a.filter((m) => m && m.role && typeof m.content === "string") : []
  } catch (e) {
    return []
  }
}

function saveChat(msgs) {
  try {
    const slim = msgs.slice(-MAX_HISTORY)
    localStorage.setItem(CHAT_KEY, JSON.stringify(slim))
  } catch (e) {}
}

// ---------------------------------------------------------------- sse -------

async function streamChat(messages, onToken) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    ...withTimeout(60000)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(t ? t.slice(0, 300) : "AI request failed (" + res.status + ")")
  }
  const ct = res.headers.get("content-type") || ""
  if (!ct.includes("text/event-stream")) {
    const t = await res.text().catch(() => "")
    let j = {}
    try { j = JSON.parse(t) } catch (e) {}
    throw new Error(j.error || t || "AI returned no stream")
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  const feed = (line) => {
    const l = line.trim()
    if (!l) return
    if (l.startsWith("data:")) {
      const data = l.slice(5).trim()
      if (data === "[DONE]") return
      try {
        const j = JSON.parse(data)
        const d = j.choices && j.choices[0] && j.choices[0].delta
        if (d && typeof d.content === "string" && d.content) onToken(d.content)
      } catch (e) {}
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf("\n")) !== -1) {
      feed(buf.slice(0, i))
      buf = buf.slice(i + 1)
    }
  }
  if (buf.trim()) feed(buf)
}

// ---------------------------------------------------------- fact capture ----

function stripFactBlock(text) {
  const m = String(text).match(/\[EXTRA_FACTS\]([\s\S]*?)\[\/EXTRA_FACTS\]/i)
  if (!m) return { visible: text, facts: [] }
  const visible = text.replace(/\[EXTRA_FACTS\]([\s\S]*?)\[\/EXTRA_FACTS\]/gi, "").trim()
  const facts = m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l && !l.startsWith("[") && !l.startsWith("]"))
  return { visible, facts }
}

async function saveFacts(facts) {
  if (!facts.length) return 0
  const { text: existing } = await readVaultFile("Extra details.md")
  const hay = existing.toLowerCase()
  const fresh = facts.filter((f) => !hay.includes(f.toLowerCase()))
  if (!fresh.length) return 0
  const heading = existing.trim() ? `\n## Coach notes — ${todayStamp()}\n` : `# Extra details\n\n> New facts stored automatically by the Journey AI Coach.\n\n## Coach notes — ${todayStamp()}\n`
  const block = heading + fresh.map((f) => `- ${f}`).join("\n") + "\n"
  const ok = await appendToFile("Extra details.md", block)
  return ok ? fresh.length : 0
}

// ------------------------------------------------------------- tasks --------

async function createTask(text) {
  const clean = String(text).replace(/\s+/g, " ").trim()
  if (!clean) return false
  const line = `- [ ] ${clean}`
  const block = line + "\n"
  const ok = await appendToFile("Tasks.md", block)
  return ok
}

// ---------------------------------------------------------------- dom -------

function init() {
  const panel = $("ai")
  const toggle = $("ai-toggle")
  const closeBtn = $("ai-close")
  const sendBtn = $("ai-send")
  const input = $("ai-input")
  const status = $("ai-status")
  const msgsEl = $("ai-messages")
  if (!panel || !toggle) return null

  const coach = {
    msgs: loadChat(),
    streaming: false,
    configured: null,
    get isOpen() { return !panel.classList.contains("hidden") }
  }

  const setStatus = (state, txt) => {
    if (!status) return
    status.textContent = txt
    status.dataset.state = state
  }

  const scrollBottom = () => {
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight
  }

  const addBubble = (role, html, { streaming = false } = {}) => {
    const row = document.createElement("div")
    row.className = "ai-msg " + (role === "user" ? "ai-user" : "ai-coach") + (streaming ? " streaming" : "")
    const avatar = role === "user" ? "🧑‍💼" : "🦉"
    row.innerHTML = `<div class="ai-avatar">${avatar}</div><div class="ai-bubble">${html}</div>`
    msgsEl.appendChild(row)
    scrollBottom()
    return row
  }

  const renderHistory = () => {
    msgsEl.innerHTML = ""
    for (const m of coach.msgs) {
      if (m.role === "system") continue
      addBubble(m.role, fmtMarkdown(m.content))
    }
    if (!coach.msgs.length) renderWelcome()
  }

  const renderWelcome = () => {
    const chips = [
      "Review my current state — what should I fix first?",
      "Coach me through my quarterly plan",
      "What is the sharpest move for my English school this week?"
    ]
    const row = addBubble("assistant", "")
    const bub = row.querySelector(".ai-bubble")
    bub.innerHTML = `<p><b>The AI Coach</b> is standing by, Azizbek. It has read <i>About me</i>, <i>Extra details</i>, <i>Journey questions</i> and <i>Tips</i> in your Obsidian vault — ask it anything about your business.</p>
      <div class="ai-chips">${chips.map((c) => `<button type="button" data-chip="1">${escapeHtml(c)}</button>`).join("")}</div>`
    row.querySelectorAll("[data-chip]").forEach((b) =>
      b.addEventListener("click", () => send(String(b.textContent).trim()))
    )
  }

  const open = () => {
    if (coach.streaming) return
    document.exitPointerLock?.()
    panel.classList.remove("hidden")
    toggle.classList.add("on")
    renderHistory()
    if (coach.configured === false) {
      setStatus("error", "⚠ not configured")
    } else if (coach.configured === true) {
      setStatus("ready", "● ready")
    } else {
      setStatus("queued", "◌ probing…")
      fetchAIStatus()
    }
    if (coach.msgs.length) setTimeout(() => input.focus(), 60)
    coach.onOpen?.()
  }

  const close = () => {
    panel.classList.add("hidden")
    toggle.classList.remove("on")
    hideTaskPop()
    try { $("game").requestPointerLock?.() } catch (e) {}
    coach.onClose?.()
  }

  toggle.addEventListener("click", () => (coach.isOpen ? close() : open()))
  closeBtn.addEventListener("click", close)
  window.addEventListener("ai-toggle", () => (coach.isOpen ? close() : open()))

  // typing: Enter sends, Shift+Enter newline
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendBtn.click()
    }
  }
  input.addEventListener("keydown", onKey)
  sendBtn.addEventListener("click", () => {
    const v = input.value.trim()
    if (!v) return
    input.value = ""
    send(v)
  })

  // ------------------------------------------------------------- sending ----

  const send = async (text) => {
    if (coach.streaming) return
    if (coach.configured === false) {
      toast("⚠ The AI Coach is not configured — set AI_API_KEY / AI_MODEL in the project .env and restart.")
      return
    }
    coach.msgs.push({ role: "user", content: String(text).trim() })
    addBubble("user", fmtMarkdown(String(text).trim()))
    saveChat(coach.msgs)

    coach.streaming = true
    sendBtn.disabled = true
    setStatus("saving", "◌ thinking…")
    const coachRow = addBubble("assistant", "", { streaming: true })
    const bubbleEl = coachRow.querySelector(".ai-bubble")
    bubbleEl.innerHTML = '<span class="ai-think">…</span>'

    let acc = ""
    try {
      const digest = await buildContext()
      const system = buildSystemPrompt(digest)
      const messages = [{ role: "system", content: system }, ...coach.msgs.slice(-MAX_HISTORY)]
      await streamChat(messages, (tok) => {
        acc += tok
        bubbleEl.innerHTML = fmtMarkdown(acc) + '<span class="ai-caret">▍</span>'
        scrollBottom()
      })
    } catch (e) {
      acc = acc || ""
      bubbleEl.innerHTML = fmtMarkdown(acc + (acc ? "\n\n" : "") + "_⚠ " + escapeHtml(String(e.message || e)) + "_")
      coach.msgs.push({ role: "assistant", content: acc || "(error)" })
      setStatus("error", "⚠ error")
      saveChat(coach.msgs)
      coach.streaming = false
      sendBtn.disabled = false
      return
    }

    const { visible, facts } = stripFactBlock(acc)
    bubbleEl.innerHTML = fmtMarkdown(visible || "_(no reply)_")
    coach.msgs.push({ role: "assistant", content: visible || "" })
    saveChat(coach.msgs)

    let factN = 0
    if (facts.length) {
      try { factN = await saveFacts(facts) } catch (e) {}
    }
    setStatus(factN ? "ready" : "ready", factN ? `● ${factN} fact${factN > 1 ? "s" : ""} saved` : "● ready")
    if (factN) toast(`📓 ${factN} new detail${factN > 1 ? "s" : ""} saved to Extra details`)
    coach.streaming = false
    sendBtn.disabled = false
    setTimeout(() => input.focus(), 60)
  }

  // ------------------------------------------------------- create a task ----

  const taskPop = document.createElement("button")
  taskPop.type = "button"
  taskPop.className = "ai-task-pop hidden"
  taskPop.innerHTML = "📌 Create a task"
  document.body.appendChild(taskPop)

  function hideTaskPop() {
    taskPop.classList.add("hidden")
    taskPop.onclick = null
  }

  msgsEl.addEventListener("contextmenu", (e) => {
    if (coach.streaming) return
    const sel = window.getSelection()
    const selText = sel ? sel.toString().trim() : ""
    if (!selText) return
    e.preventDefault()
    hideTaskPop()
    taskPop.textContent = "📌 Create a task"
    taskPop.classList.remove("hidden")
    const x = Math.min(e.clientX, innerWidth - 170)
    const y = Math.max(6, e.clientY - 40)
    taskPop.style.left = x + "px"
    taskPop.style.top = y + "px"
    taskPop.onclick = async () => {
      hideTaskPop()
      try {
        const ok = await createTask(selText)
        if (ok) toast("📌 Deed written to Tasks.md")
        else toast("⚠ Could not reach the vault to write the task.")
      } catch (err) {
        toast("⚠ Task failed: " + String(err.message || err))
      }
    }
  })
  window.addEventListener("mousedown", (e) => {
    if (e.target !== taskPop) hideTaskPop()
  })
  window.addEventListener("scroll", hideTaskPop, true)
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTaskPop() })

  // -------------------------------------------------------------- status ----

  async function fetchAIStatus() {
    try {
      const r = await fetch("/api/ai/status", { ...withTimeout(4000) })
      const j = await r.json().catch(() => ({}))
      coach.configured = !!j.configured
      setStatus(coach.configured ? "ready" : "error", coach.configured ? "● ready" : "⚠ not configured")
    } catch (e) {
      coach.configured = false
      setStatus("offline", "○ offline (local mode)")
    }
  }

  renderHistory()

  coach.api = { open, close, get isOpen() { return coach.isOpen } }
  coach.fetchAIStatus = fetchAIStatus
  coach.setOpenHandlers = (h = {}) => { coach.onOpen = h.onOpen; coach.onClose = h.onClose }
  return coach
}

export function initAI(handlers) {
  try {
    const coach = init()
    if (!coach) return { isOpen: () => false, open() {}, close() {}, status: "off" }
    coach.setOpenHandlers(handlers)
    coach.fetchAIStatus()
    return {
      isOpen: () => coach.isOpen,
      open: coach.api.open,
      close: coach.api.close
    }
  } catch (e) {
    return { isOpen: () => false, open() {}, close() {}, status: "off" }
  }
}
