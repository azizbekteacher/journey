// Obsidian vault sync — writes answers to "Journey questions.md" and tips to
// "Tips.md" inside the vault at C:\Users\bluep\Azizbek (sibling of the game dir).
//
// Transport: the /api/vault/* endpoints — served by the Vite dev plugin on
// localhost (vite.config.js) and by the loopback bridge (npm run bridge) from
// the deployed Cloudflare page. See src/net.js. Writes that can't reach either
// are queued in localStorage and flushed later.

import { BATTLES, BOSS, MODULE_NAMES } from "./data/curriculum.js"
import { VAULT_BASE } from "./net.js"

export const VAULT_FILES = {
  questions: "Journey questions.md",
  tips: "Tips.md",
}

const QUEUE_KEY = "journey_vault_queue"
const FETCH_TIMEOUT_MS = 3000

function announce(msg) {
  window.dispatchEvent(new CustomEvent("toast", { detail: msg }))
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const q = raw ? JSON.parse(raw) : []
    return Array.isArray(q) ? q : []
  } catch (e) {
    return []
  }
}

function storeQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch (e) {}
}

function queuedCount() {
  return loadQueue().length
}

export function updateVaultPill(state, extra = "") {
  const el = document.getElementById("obsidian-status")
  if (!el) return
  const map = {
    saving: "◌ Obsidian: saving…",
    synced: "● Obsidian: synced",
    queued: `○ Obsidian: saved locally${extra ? ` (${extra} queued)` : ""} — syncs on next local run`,
    error: "⚠ Obsidian: sync error",
  }
  el.textContent = map[state] || state
  el.dataset.state = state
}

function withTimeout() {
  try {
    return { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  } catch (e) {
    return {}
  }
}

async function postUpsert(file, key, markdown) {
  const r = await fetch(VAULT_BASE + "/api/vault/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, key, markdown }),
    ...withTimeout(),
  })
  if (!r.ok) throw new Error("vault upsert " + r.status)
  return r.json().catch(() => ({}))
}

function enqueue(file, key, markdown) {
  const q = loadQueue().filter((e) => !(e.file === file && e.key === key))
  q.push({ file, key, markdown, ts: Date.now() })
  storeQueue(q)
  updateVaultPill("queued", String(q.length))
}

async function upsert(file, key, markdown) {
  updateVaultPill("saving")
  try {
    await postUpsert(file, key, markdown)
    // success — drop any queued entry for same section
    storeQueue(loadQueue().filter((e) => !(e.file === file && e.key === key)))
    if (queuedCount() === 0) updateVaultPill("synced")
    else updateVaultPill("queued", String(queuedCount()))
    return true
  } catch (e) {
    enqueue(file, key, markdown)
    return false
  }
}

export async function flushVaultQueue() {
  const q = loadQueue()
  if (!q.length) {
    updateVaultPill("synced")
    return true
  }
  updateVaultPill("saving")
  const rest = []
  for (const e of q) {
    try {
      await postUpsert(e.file, e.key, e.markdown)
    } catch (err) {
      rest.push(e)
      break // stop on first failure; likely the endpoint is unavailable
    }
  }
  storeQueue(rest)
  updateVaultPill(rest.length ? "queued" : "synced", rest.length ? String(rest.length) : "")
  return rest.length === 0
}

export async function probeVault() {
  try {
    const r = await fetch(VAULT_BASE + "/api/vault/status", { ...withTimeout() })
    if (!r.ok) throw new Error("status " + r.status)
    await r.json().catch(() => ({}))
    return flushVaultQueue()
  } catch (e) {
    if (queuedCount() > 0) updateVaultPill("queued", String(queuedCount()))
    else updateVaultPill("queued")
    return false
  }
}

function todayStamp() {
  try {
    return new Date().toLocaleDateString()
  } catch (e) {
    return ""
  }
}

function battleMeta(battleId) {
  const i = BATTLES.findIndex((b) => b.id === battleId)
  const b = BATTLES[i]
  if (!b) return null
  return { battle: b, index: i + 1 }
}

function bossMeta(bossKey) {
  const i = BOSS.challenges.findIndex((c) => c.key === bossKey)
  if (i < 0) return null
  return { challenge: BOSS.challenges[i], index: i + 1 }
}

export function buildQuestionSection(key, title, question, answer, metaLine) {
  const safe = String(answer ?? "").trim()
  return [
    `<!-- journey:q:${key} -->`,
    `## ${title}`,
    metaLine ? `*${metaLine}*` : null,
    question ? `> ${String(question).trim()}` : null,
    ``,
    `**Answer (${todayStamp()}):**`,
    ``,
    safe || "_(empty)_",
    `<!-- /journey:q:${key} -->`,
  ]
    .filter((l) => l !== null)
    .join("\n")
}

/** Save a battle or boss-challenge answer into "Journey questions.md". */
export async function saveAnswer(key, title, answer, question = "") {
  const bm = battleMeta(key)
  const boss = bossMeta(key)
  let metaLine = ""
  let heading = title
  if (bm) {
    metaLine = `Module ${bm.battle.module} · ${MODULE_NAMES[bm.battle.module]} · ${bm.index}/20`
    heading = `${bm.index}. ${title}`
  } else if (boss) {
    metaLine = `Final Trial ${boss.index}/5 · The Bull Market`
    heading = `Final Trial ${boss.index}. ${title}`
  }
  const md = buildQuestionSection(key, heading, question, answer, metaLine)
  const ok = await upsert(VAULT_FILES.questions, `q:${key}`, md)
  if (ok) announce("📓 Answer saved to Obsidian vault ✓")
  return ok
}

/** Save a collected coin tip into "Tips.md" (skipped silently when offline). */
export async function saveTip(key, title, tip) {
  const md = [
    `<!-- journey:tip:${key} -->`,
    `## ${title}`,
    ``,
    String(tip ?? "").trim() || "_(empty)_",
    `<!-- /journey:tip:${key} -->`,
  ].join("\n")
  return upsert(VAULT_FILES.tips, `tip:${key}`, md)
}

/** Save the forged quarterly plan into "Journey questions.md". */
export async function savePlan(planText) {
  const md = [
    `<!-- journey:plan -->`,
    `## Quarterly Marketing Plan`,
    ``,
    String(planText ?? "").trim() || "_(empty)_",
    `<!-- /journey:plan -->`,
  ].join("\n")
  const ok = await upsert(VAULT_FILES.questions, "plan", md)
  if (ok) announce("📓 Plan saved to Obsidian vault ✓")
  return ok
}

export function initVaultSync() {
  probeVault()
  window.addEventListener("online", () => flushVaultQueue())
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) flushVaultQueue()
  })
}
