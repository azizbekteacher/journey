// Task AI — helpers for the Ledger of Deeds' AI Subtask + Explore features.
//
//   - leaf module (imports net.js only) so todo.js can use it without cycles
//   - reads the Obsidian vault (About me / Extra details / Journey questions /
//     Tips + the focused task) to ground subtask generation + explore coaching
//   - talks to POST /api/ai/chat (dev proxy / Worker); non-stream for subtasks,
//     SSE stream for Explore. All vault/AI failures throw — callers toast.

import { VAULT_BASE } from "./net.js"

const CONTEXT_FILES = ["About me.md", "Extra details.md", "Journey questions.md", "Tips.md"]
const CONTEXT_BUDGET = 12000

function withTimeout(ms = 30000) {
  try {
    return { signal: AbortSignal.timeout(ms) }
  } catch (e) {
    return {}
  }
}

async function readVaultFile(file) {
  const r = await fetch(VAULT_BASE + "/api/vault/file?file=" + encodeURIComponent(file), { ...withTimeout(8000) })
  if (!r.ok) throw new Error("vault " + r.status)
  const j = await r.json().catch(() => ({}))
  return typeof j.content === "string" ? j.content : ""
}

/** Vault digest (best-effort — missing/offline files are skipped silently). */
export async function buildVaultDigest() {
  const parts = []
  let used = 0
  for (const f of CONTEXT_FILES) {
    let text = ""
    try {
      text = String(await readVaultFile(f) || "").trim()
    } catch (e) {
      continue
    }
    if (!text) continue
    const chunk = `\n\n--- ${f} ---\n\n${text}`
    if (used + chunk.length > CONTEXT_BUDGET) break
    used += chunk.length
    parts.push(`### File: ${f}\n\n${text}`)
  }
  return parts.join("\n\n")
}

export async function fetchAIConfigured() {
  try {
    const r = await fetch("/api/ai/status", { ...withTimeout(4000) })
    const j = await r.json().catch(() => ({}))
    return !!j.configured
  } catch (e) {
    return false
  }
}

function taskBlock(task, sectionTitle) {
  const t = task || {}
  const subs = Array.isArray(t.subs) ? t.subs.map((s) => `- ${s.title || ""}`).join("\n") : ""
  return [
    `Section: ${sectionTitle || "(no section)"}`,
    `Task: ${t.title || "(untitled)"}`,
    t.desc ? `Details: ${t.desc}` : null,
    subs ? `Existing steps:\n${subs}` : "Existing steps: (none)",
  ].filter(Boolean).join("\n")
}

function parseStepsArray(text) {
  const raw = String(text || "").trim()
  if (!raw) return []
  // Try fenced or bare JSON first
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fence ? fence[1] : raw).trim()
  if (/^\s*\[/.test(candidate)) {
    try {
      const end = candidate.lastIndexOf("]")
      const arr = JSON.parse(candidate.slice(0, end + 1))
      if (Array.isArray(arr)) {
        return arr.map((s) => String(s ?? "").replace(/\s+/g, " ").trim()).filter(Boolean)
      }
    } catch (e) { /* fall through to bullet parse */ }
  }
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l && l.length > 3 && !/^(here[\s':]|sure\b|steps?\b|of course\b)/i.test(l))
    .filter((l) => l && !l.startsWith("[") && !l.startsWith("{"))
    .slice(0, 8)
}

/**
 * Generate 3–5 concrete first-steps for a task, grounded in vault context.
 * Returns string[]. Throws when AI is unavailable.
 */
export async function generateSubtasks(task, sectionTitle) {
  const digest = await buildVaultDigest().catch(() => "")
  const system = [
    "You break ONE to-do task into small first steps for Azizbek, founder of an online English school for Uzbek learners (course 'Fast English', app 'Tilsevar').",
    "Use his vault context below when it helps (his business, offers, channels). Never invent private numbers; keep steps generic when context is thin.",
    "Rules: 3 to 5 steps, each ONE short line (max ~60 chars), concrete and doable in under 15 minutes, ordered. No numbering prose, no explanations.",
    "Reply with a JSON array of strings ONLY, e.g. [\"Step one\", \"Step two\"].",
    "",
    "Vault context:",
    digest.trim() ? digest.slice(0, CONTEXT_BUDGET) : "(vault empty)",
  ].join("\n")
  const user = taskBlock(task, sectionTitle) + "\n\nBreak this task into 3-5 first steps. JSON array only."
  const r = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: user }], stream: false }),
    ...withTimeout(45000),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => "")
    throw new Error(t ? t.slice(0, 200) : "AI request failed (" + r.status + ")")
  }
  const j = await r.json().catch(() => ({}))
  if (j.error) throw new Error(String(j.error).slice(0, 200))
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ""
  const steps = parseStepsArray(text).map((s) => s.slice(0, 140)).filter(Boolean).slice(0, 5)
  if (!steps.length) throw new Error("AI returned no usable steps")
  return steps
}

/** System prompt for the Explore sidebar — Socratic unblocking coach. */
export function buildExploreSystem(task, sectionTitle, digest) {
  return [
    "You are a warm, direct unblocking coach inside a to-do app. The user pressed 'Explore' on a task because they feel unsure, lazy, or afraid to do it.",
    "Your job: find the REAL blocker with SHORT one-liner questions — exactly ONE question per reply until you understand. Never lecture, never dump a plan, never write more than 2 short sentences plus your one question.",
    "Ladder: 1) is it unclear? 2) is it too big/heavy? 3) is it fear/boredom/avoidance? Converge within 3-5 turns, then propose ONE concrete next action in one sentence and ask if they want it added as a subtask.",
    "Ground yourself in the task and the vault context below. Be concrete about HIS English-school business when relevant; do not invent numbers.",
    "",
    taskBlock(task, sectionTitle),
    "",
    "Vault context:",
    digest && digest.trim() ? String(digest).slice(0, CONTEXT_BUDGET) : "(vault empty)",
  ].join("\n")
}

/** SSE stream helper (same contract as ai.js streamChat, duplicated to stay cycle-free). */
export async function streamExploreChat(messages, onToken) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    ...withTimeout(60000),
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
    if (!l || !l.startsWith("data:")) return
    const data = l.slice(5).trim()
    if (data === "[DONE]") return
    try {
      const j = JSON.parse(data)
      const d = j.choices && j.choices[0] && j.choices[0].delta
      if (d && typeof d.content === "string" && d.content) onToken(d.content)
    } catch (e) {}
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
