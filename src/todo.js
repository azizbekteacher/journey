// The Ledger of Deeds — a TickTick-style task manager whose single source of
// truth is Tasks.md inside the local Obsidian vault (C:\Users\bluep\Azizbek).
//
//   - parses Obsidian Markdown (## headings = sections/lists, - [ ] tasks,
//     indented subtasks, indented description lines, 📅 due date + priority
//     flag emoji on the title line, verbatim prose preserved)
//   - edits serialize straight back to Tasks.md (debounced full-file PUT)
//   - two UI hosts share ONE live DOM node: the full-screen ledger overlay and
//     the battle "Deeds" tab. Both always reflect the same model.
//   - polls the vault while visible so edits made in Obsidian appear live.
//   - offline / production fallback mirrors to localStorage and re-syncs later.

const FILE = "Tasks.md"
const BACKUP_KEY = "journey_tasks_v1"
const POLL_MS = 2200
const WRITE_DEBOUNCE = 650
const PRI_FLAG = { p1: "🔺", p2: "⏫", p3: "🔼", p4: "🔽" }
const FLAG_PRI = { "🔺": "p1", "⏫": "p2", "🔼": "p3", "🔽": "p4" }

function toast(msg) {
  window.dispatchEvent(new CustomEvent("toast", { detail: msg }))
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
function aesc(s) {
  return esc(s).replace(/"/g, "&quot;")
}
function todayStr() {
  const d = new Date()
  const o = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return o.toISOString().slice(0, 10)
}
function uid() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
function indentOf(line) {
  let n = 0
  for (const ch of line) {
    if (ch === " ") n += 1
    else if (ch === "\t") n += 2
    else break
  }
  return n
}
function isBlank(s) {
  return !String(s).trim()
}
const BULLET_RE = /^(\s*)([-*])\s+\[( |x|X)\]\s+(.*)$/
const HEAD_RE = /^(#{1,6})\s+(.*)$/

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fmtDate(d) {
  const m = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return String(d)
  return `${MONTHS[Math.max(0, +m[2] - 1)]} ${+m[3]}, ${m[1]}`
}

// ---------------------------------------------------------------- model -----

// doc model:
//   sections: [{ id, level, title, children: [...] }]  children hold root
//             tasks ({kind:'task'}) and prose ({kind:'prose', lines:[]})
//   a task: { kind:'task', id, root:true|false, depth, done, title, due, pri,
//             desc: string (raw description text, '' when none), subs:[task] }
// The very first "section" may be a virtual pre-heading section (title=null).

function stripMeta(title) {
  let p = null
  const pm = String(title).match(/[🔺⏫🔼🔽]/)
  if (pm) p = FLAG_PRI[pm[0]]
  const due = String(title).match(/📅\s*(\d{4}-\d{1,2}-\d{1,2})/)
  const dueDate = due ? due[1] : null
  const clean = String(title)
    .replace(/📅\s*(\d{4}-\d{1,2}-\d{1,2})/g, "")
    .replace(/[🔺⏫🔼🔽]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return { title: clean, due: dueDate, pri: p }
}

function parseMarkdown(text) {
  const sections = []
  let cur = null // current real section
  const addProse = (sec, line) => {
    const last = sec.children[sec.children.length - 1]
    if (last && last.kind === "prose") last.lines.push(line)
    else sec.children.push({ kind: "prose", lines: [line] })
  }
  const pre = { id: "pre", level: 0, title: null, children: [] }
  sections.push(pre)
  cur = pre

  let stack = [] // { indent, node } for nested task bullets within a section
  for (const raw of String(text).split(/\r?\n/)) {
    const hm = raw.match(HEAD_RE)
    if (hm) {
      stack = []
      const sec = { id: uid(), level: hm[1].length, title: hm[2].trim(), children: [] }
      sections.push(sec)
      cur = sec
      continue
    }
    const bm = raw.match(BULLET_RE)
    if (bm) {
      const indent = bm[1].length > 0 ? indentOf(raw) : 0
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      const meta = stripMeta(bm[4])
      const node = {
        kind: "task", id: uid(), root: stack.length === 0, depth: stack.length,
        done: bm[3].toLowerCase() === "x", title: meta.title, due: meta.due,
        pri: meta.pri, desc: "", subs: []
      }
      if (stack.length) stack[stack.length - 1].node.subs.push(node)
      else cur.children.push(node)
      stack.push({ indent, node })
      continue
    }
    // prose
    if (isBlank(raw)) {
      if (stack.length) continue // ignore blanks inside a task tree
      if (cur.children.length) {
        const last = cur.children[cur.children.length - 1]
        if (last && last.kind !== "prose") continue // drop stray leading blank
      }
      if (!cur.children.length) continue
      addProse(cur, "")
      continue
    }
    if (stack.length && indentOf(raw) >= stack[stack.length - 1].indent + 2) {
      // indented paragraph inside an open task tree → description of that task
      const top = stack[stack.length - 1].node
      const content = raw.trim()
      if (content) top.desc = top.desc ? top.desc + "\n" + content : content
      continue
    }
    // an unindented paragraph ends any open task tree
    stack = []
    addProse(cur, raw)
  }
  // trim empty prose at boundaries
  for (const sec of sections) {
    while (sec.children.length && sec.children[0].kind === "prose" && sec.children[0].lines.every(isBlank)) sec.children.shift()
    while (sec.children.length && sec.children[sec.children.length - 1].kind === "prose" && sec.children[sec.children.length - 1].lines.every(isBlank)) sec.children.pop()
  }
  return sections
}

function taskLine(node, depth) {
  let title = node.title || ""
  if (node.pri && PRI_FLAG[node.pri]) title += " " + PRI_FLAG[node.pri]
  if (node.due) title += " 📅 " + node.due
  return `${"  ".repeat(depth)}- [${node.done ? "x" : " "}] ${title}`
}

function serializeTask(node, depth, out) {
  out.push(taskLine(node, depth))
  const body = (node.desc || "").split("\n")
  for (const l of body) if (String(l).trim()) out.push(`${"  ".repeat(depth)}  ${l}`)
  for (const c of node.subs) serializeTask(c, depth + 1, out)
}

function serializeMarkdown(sections) {
  const out = []
  const lastIsTaskish = () => {
    if (!out.length) return true
    const last = String(out[out.length - 1])
    return last === "" || /^(#{1,6}\s|- )/.test(last) || /^  /.test(last)
  }
  for (const sec of sections) {
    const isHeading = sec.title !== null
    if (isHeading) {
      if (out.length && out[out.length - 1] !== "") out.push("")
      out.push(`${"#".repeat(sec.level)} ${sec.title}`)
    }
    for (const child of sec.children) {
      if (!lastIsTaskish()) out.push("")
      if (child.kind === "prose") {
        for (const l of child.lines) out.push(l)
      } else {
        serializeTask(child, 0, out)
      }
    }
  }
  let text = out.join("\n")
  text = text.replace(/\n{3,}/g, "\n\n")
  text = text.replace(/[ \t]+\n/g, "\n")
  text = text.trimEnd()
  return text ? text + "\n" : ""
}

// ---------------------------------------------------------------- sync -----

function loadBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    return { text: typeof d.text === "string" ? d.text : "", mtime: d.mtime ?? null }
  } catch (e) { return null }
}
function storeBackup(text, mtime) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ text, mtime })) } catch (e) {}
}
async function api(path, opts = {}) {
  const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout
    ? { signal: AbortSignal.timeout(4000) } : {}
  const r = await fetch(path, { ...opts, ...ctrl })
  if (!r.ok) throw new Error(path + " " + r.status)
  return r.json().catch(() => ({}))
}

function syncDot(state, extra = "") {
  const texts = {
    synced: "● Tasks.md synced",
    saving: "◌ Tasks.md saving…",
    queued: extra ? `○ Tasks.md saved locally (${extra} queued)` : "○ Tasks.md saved locally — syncs next local run",
    error: "⚠ Tasks.md sync error",
    offline: "○ Tasks.md (no vault here)"
  }
  for (const id of ["todo-pill", "todo-pill-inline"]) {
    const el = document.getElementById(id)
    if (!el) continue
    el.textContent = texts[state] || state
    el.dataset.state = state
  }
}

const led = {
  sections: [],
  view: "list",                 // 'list' | 'board'
  active: "none",               // 'none' | 'overlay' | 'battle'
  collapsed: new Set(),
  editingId: null,
  addingSecId: null,
  busy: false,
  _serverMtime: null,
  _pendingWrite: false,
  _writeTimer: null,
  _pollTimer: null,
  dirty: false,
  app: null,
  onTick: null,                 // (taskNode, done) — main uses to kill enemies
  onChanged: null,              // after model edits (badge refresh)
  initialized: false
}

// ------------------------------------------------------------- data ops ----

function allTasks(sections = led.sections) {
  const out = []
  const walk = (n) => { out.push(n); for (const s of n.subs) walk(s) }
  for (const sec of sections) for (const c of sec.children) if (c.kind === "task") walk(c)
  return out
}
function taskById(id) {
  return allTasks().find((t) => t.id === id) || null
}
function rootInfoOf(id) {
  for (const sec of led.sections) {
    const i = sec.children.findIndex((c) => c.id === id)
    if (i !== -1 && sec.children[i].kind === "task") return { sec, node: sec.children[i], index: i }
  }
  return null
}
function counts() {
  let total = 0, done = 0, overdue = 0
  for (const t of allTasks()) {
    total++
    if (t.done) done++
    else if (t.due && t.due < todayStr()) overdue++
  }
  return { total, done, overdue }
}
function secCounts(sec) {
  let total = 0, done = 0
  const walk = (n) => { total++; if (n.done) done++; for (const s of n.subs) walk(s) }
  for (const c of sec.children) if (c.kind === "task") walk(c)
  return { total, done }
}

function ensureInbox() {
  const real = led.sections.filter((s) => s.title !== null)
  if (real.length) return real[0]
  const inbox = { id: uid(), level: 2, title: "Inbox", children: [] }
  led.sections.push(inbox)
  return inbox
}

function markChanged(immediate = false) {
  led.dirty = true
  scheduleSave(immediate)
  refreshBadges()
  led.onChanged?.()
}

function scheduleSave(immediate = false) {
  if (led._writeTimer) clearTimeout(led._writeTimer)
  const doWrite = () => {
    led._writeTimer = null
    writeNow()
  }
  led._writeTimer = setTimeout(doWrite, immediate ? 0 : WRITE_DEBOUNCE)
}

async function writeNow() {
  if (led._pendingWrite) {
    // a write is in flight; capture latest model & retry right after it settles
    led._writeTimer = setTimeout(writeNow, 120)
    return
  }
  const text = serializeMarkdown(led.sections)
  led._pendingWrite = true
  syncDot("saving")
  try {
    const r = await api("/api/vault/file?file=" + FILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: FILE, content: text })
    })
    led._serverMtime = r.mtime ?? null
    led._pendingWrite = false
    led.dirty = false
    storeBackup(text, r.mtime ?? null)
    syncDot("synced")
  } catch (e) {
    led._pendingWrite = false
    storeBackup(text, null)
    const b = loadBackup()
    syncDot("queued", b ? "1" : "")
    // retry soon / on next visibility
    led._writeTimer = setTimeout(writeNow, 5000)
  }
}

async function reloadFromServer(silent = true) {
  if (led.dirty || led._pendingWrite) {
    // local edits are newer — flush them to disk instead of discarding
    writeNow()
    return
  }
  try {
    const r = await api("/api/vault/file?file=" + FILE)
    const text = typeof r.content === "string" ? r.content : ""
    const wasEditing = led.editingId
    const openEditing = led.editingId && taskById(led.editingId)
    led.sections = parseMarkdown(text)
    led._serverMtime = r.mtime ?? null
    led.dirty = false
    led.editingId = openEditing ? openEditing.id : null
    storeBackup(text, r.mtime ?? null)
    refreshBadges()
    render()
    if (!silent && wasEditing && !openEditing) toast("The ledger was updated from Tasks.md")
  } catch (e) {
    const b = loadBackup()
    if (b && !led.sections.length) {
      led.sections = parseMarkdown(b.text)
      led._serverMtime = b.mtime
      render()
    }
    syncDot(led.sections.length && !b ? "queued" : "offline")
  }
}

async function init() {
  if (led.initialized) return
  led.initialized = true
  buildDom()
  // Try vault first; fall back to local mirror if unreachable
  let loaded = false
  try {
    const r = await api("/api/vault/file?file=" + FILE)
    const text = typeof r.content === "string" ? r.content : ""
    led.sections = parseMarkdown(text)
    led._serverMtime = r.mtime ?? null
    storeBackup(text, r.mtime ?? null)
    loaded = true
    syncDot("synced")
  } catch (e) {
    const b = loadBackup()
    if (b) { led.sections = parseMarkdown(b.text); led._serverMtime = b.mtime }
    else led.sections = parseMarkdown("")
    syncDot("queued")
  }
  refreshBadges()
  render()
  window.addEventListener("online", () => { if (!loaded) reloadFromServer() })
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (led.active !== "none") reloadFromServer()
      else if (led.dirty) scheduleSave(true)
    }
  })
}

function startPolling() {
  stopPolling()
  led._pollTimer = setInterval(async () => {
    try {
      const r = await api("/api/vault/file/head?file=" + FILE)
      const remote = r.mtime ?? null
      if (remote !== null && led._serverMtime !== null && remote !== led._serverMtime && !led._pendingWrite) {
        await reloadFromServer()
      }
    } catch (e) { /* offline */ }
  }, POLL_MS)
}
function stopPolling() {
  if (led._pollTimer) { clearInterval(led._pollTimer); led._pollTimer = null }
}

// ------------------------------------------------------------- DOM / UI ----

const CHECK_HTML = '<svg viewBox="0 0 16 16"><path d="M3 8.5 L6.5 12 L13 4.5" fill="none"/></svg>'

function buildDom() {
  const app = document.createElement("div")
  app.id = "todo-app"
  app.innerHTML = `
    <div class="ta-bar">
      <button class="ta-new btn-gold" data-act="add">＋ New deed</button>
      <div class="ta-view" role="tablist">
        <button class="ta-vb" data-view="list">☰ List</button>
        <button class="ta-vb" data-view="board">▦ Board</button>
      </div>
      <div class="ta-hint"></div>
    </div>
    <div class="ta-addbox" id="ta-addbox"></div>
    <div class="ta-editor" id="ta-editor"></div>
    <div class="ta-scroll"><div class="ta-body" id="ta-body"></div></div>
    <div class="ta-footer"><span id="todo-pill-inline" data-state="synced">● Tasks.md</span>
      <span class="ta-footnote">source of truth: C:\\Users\\bluep\\Azizbek\\Tasks.md</span></div>
  `
  document.getElementById("todo-slot").appendChild(app)
  led.app = app
  bindAppEvents()
}

function openOverlay() {
  if (led.active === "battle") return
  if (led.active === "overlay") { render(); return }
  led.active = "overlay"
  const host = document.getElementById("todo-slot")
  if (host && led.app.parentElement !== host) host.appendChild(led.app)
  led.app.classList.remove("embed")
  document.getElementById("todo").classList.remove("hidden")
  document.exitPointerLock?.()
  render()
  startPolling()
}
function openInBattle(slot) {
  if (led.active === "overlay") closeOverlay(false, false)
  led.active = "battle"
  if (slot && led.app.parentElement !== slot) slot.appendChild(led.app)
  led.app.classList.add("embed")
  document.getElementById("todo").classList.add("hidden")
  render()
  startPolling()
}
function closeAll() {
  led.active = "none"
  stopPolling()
  document.getElementById("todo").classList.add("hidden")
  render()
}
function closeOverlay(toRender = true, relock = true) {
  if (led.active === "overlay") {
    led.active = "none"
    stopPolling()
    document.getElementById("todo").classList.add("hidden")
    if (relock) document.getElementById("game")?.requestPointerLock?.()
    if (toRender) render()
  }
}

function ensureVisibleHostRender() {
  render()
}

function refreshBadges() {
  const c = counts()
  for (const el of document.querySelectorAll(".todo-count-badge")) {
    el.textContent = c.total - c.done > 99 ? "99+" : String(c.total - c.done)
    el.classList.toggle("zero", c.total - c.done === 0)
    el.classList.toggle("has-overdue", c.overdue > 0)
  }
  const sub = document.getElementById("todo-sub")
  if (sub) {
    sub.innerHTML = `${c.total - c.done} open · ${c.done} done` +
      (c.overdue ? ` · <b class="warn">${c.overdue} overdue</b>` : "")
  }
}

// ---- render helpers -------------------------------------------------------

function metaChipsHtml(t, showDue = true) {
  let chips = ""
  if (t.pri) chips += `<span class="chip pri p${t.pri}">${PRI_FLAG[t.pri]} P${t.pri[1]}</span>`
  if (showDue && t.due) {
    const over = !t.done && t.due < todayStr()
    chips += `<span class="chip due ${over ? "overdue" : ""}">📅 ${fmtDate(t.due)}${over ? " · overdue" : ""}</span>`
  }
  if (t.subs.length) {
    const d = t.subs.filter((s) => s.done).length
    chips += `<span class="chip cnt">${d}/${t.subs.length} steps</span>`
  }
  return chips
}

function taskRowHtml(t, depth) {
  const subRow = t.subs.length
    ? `<div class="tl-nest">${t.subs.map((s) => taskRowHtml(s, depth + 1)).join("")}</div>` : ""
  const dueMeta = t.due ? `<div class="tl-duerow">${metaChipsHtml(t)}</div>` : ""
  const descShown = t.desc && !t.done
  const dots = t.done ? " tl-done" : ""
  return `
  <div class="tl-row${dots}" data-id="${t.id}" data-depth="${depth}" data-root="${t.root ? 1 : 0}" ${t.root ? 'draggable="true"' : ""}>
    <button class="tl-check ${t.done ? "on" : ""}" data-act="toggle" data-id="${t.id}" title="${t.done ? "Mark as open" : "Complete"}" aria-label="toggle">${CHECK_HTML}</button>
    <div class="tl-main" data-act="edit" data-id="${t.id}" title="Edit">
      <div class="tl-titlewrap">
        <span class="tl-title">${esc(t.title) || '<i class="untitled">untitled deed…</i>'}</span>
        <span class="tl-editdot" data-act="edit" data-id="${t.id}">✎</span>
      </div>
      ${dueMeta}
      ${t.desc && !t.done ? `<div class="tl-desc">${esc(t.desc)}</div>` : ""}
    </div>
    <button class="tl-del" data-act="del" data-id="${t.id}" title="Delete">🗑</button>
  </div>${subRow}`
}

function sectionTitleHtml(sec) {
  if (sec.title !== null) return esc(sec.title)
  const first = sec.children.find((c) => c.kind !== "prose")
  return esc(first && first.kind === "task" ? first.title : "Notes")
}
function sectionSubtitle(sec) {
  const proseLines = sec.children.filter((c) => c.kind === "prose").length
  const tasks = sec.children.filter((c) => c.kind === "task")
  return `${tasks.length} deed${tasks.length === 1 ? "" : "s"}${proseLines ? ` · ${proseLines} note${proseLines === 1 ? "" : "s"}` : ""}`
}

function renderList(body) {
  let html = ""
  const showAll = led.sections.every((s) => s.children.length === 0)
  const sections = showAll ? [{ id: "pre", level: 0, title: "Inbox", children: [] }] : led.sections
  for (const sec of sections) {
    const cc = secCounts(sec)
    const collapsed = led.collapsed.has(sec.id)
    html += `<section class="tl-sec${collapsed ? " is-collapsed" : ""}" data-secid="${sec.id}">
      <div class="tl-sec-head" data-secid="${sec.id}">
        <button class="tl-caret" data-act="collapse" data-secid="${sec.id}">${collapsed ? "▸" : "▾"}</button>
        <span class="tl-sec-title" data-act="secadd" data-secid="${sec.id}">${sectionTitleHtml(sec)}</span>
        <span class="tl-sec-sub">${sectionSubtitle(sec)}</span>
        <span class="tl-sec-prog">${cc.total ? `${cc.done}/${cc.total}` : ""}</span>
        <button class="tl-sec-plus" data-act="secadd" data-secid="${sec.id}" title="Add deed">＋</button>
      </div>
      ${collapsed ? "" : `<div class="tl-sec-body" data-secid="${sec.id}">${sec.children.map((c) =>
        c.kind === "prose"
          ? (c.lines.some((l) => !isBlank(l)) ? `<div class="tl-prose">${esc(c.lines.join("\n"))}</div>` : "")
          : taskRowHtml(c, 0)).join("")}</div>`}
    </section>`
  }
  body.innerHTML = html
}

function renderBoard(body) {
  let html = ""
  const showAll = led.sections.every((s) => s.children.length === 0)
  const sections = showAll ? [{ id: "pre", level: 0, title: "Inbox", children: [] }] : led.sections
  html = `<div class="bd-wrap" style="--cols:${Math.max(2, sections.length)}">
    <div class="bd-rail">`
  for (const sec of sections) {
    const cc = secCounts(sec)
    const colsTasks = sec.children.filter((c) => c.kind === "task")
    html += `<div class="bd-col" data-secid="${sec.id}">
      <div class="bd-col-head" data-secid="${sec.id}">
        <span class="bd-col-title">${sectionTitleHtml(sec)}</span>
        <span class="bd-col-prog">${cc.done}/${cc.total}</span>
        <button class="bd-col-add" data-act="secadd" data-secid="${sec.id}" title="Add deed">＋</button>
      </div>
      <div class="bd-col-body" data-secid="${sec.id}">
        ${sec.children.map((c) => c.kind === "prose" && c.lines.some((l) => !isBlank(l))
          ? `<div class="bd-prose">${esc(c.lines.join("\n"))}</div>` : "").join("")}
        ${colsTasks.map((t) => cardHtml(t)).join("")}
      </div>
    </div>`
  }
  html += `</div></div>`
  body.innerHTML = html
}

function cardHtml(t) {
  const cc = secCounts({ children: t.subs })
  const subRows = t.subs.length
    ? `<div class="bd-subcard">${t.subs.map((s) => `
        <div class="bd-sub ${s.done ? "done" : ""}" data-id="${s.id}" data-sub="1">
          <button class="tl-check ${s.done ? "on" : ""}" data-act="toggle" data-id="${s.id}">${CHECK_HTML}</button>
          <span class="bd-sub-title" data-act="edit" data-id="${s.id}">${esc(s.title) || '<i class="untitled">…</i>'}</span>
          <button class="bd-sub-del" data-act="del" data-id="${s.id}">✕</button>
        </div>`).join("")}
        <div class="bd-addsub"><button data-act="subadd" data-id="${t.id}">＋ add step</button></div>
      </div>` : ""
  return `
  <div class="bd-card ${t.done ? "done" : ""}" data-id="${t.id}" data-root="1" draggable="true">
    <div class="bd-card-top">
      <button class="tl-check ${t.done ? "on" : ""}" data-act="toggle" data-id="${t.id}">${CHECK_HTML}</button>
      <div class="bd-card-main" data-act="edit" data-id="${t.id}">
        <div class="bd-card-title">${esc(t.title) || '<i class="untitled">untitled deed…</i>'}</div>
        <div class="bd-card-meta">${metaChipsHtml(t, false)}${t.due && !t.done && t.due < todayStr() ? `<span class="chip due overdue">📅 overdue</span>` : ""}
          ${t.subs.length ? `<span class="chip cnt">${cc.done}/${cc.total}</span>` : ""}</div>
      </div>
      <button class="tl-del" data-act="del" data-id="${t.id}">🗑</button>
    </div>
    ${t.desc && !t.done ? `<div class="bd-card-desc">${esc(t.desc)}</div>` : ""}
    ${subRows}
  </div>`
}

function renderAddBox() {
  const box = document.getElementById("ta-addbox")
  if (!box) return
  if (!led.addingSecId) { box.innerHTML = ""; return }
  const sec = led.sections.find((s) => s.id === led.addingSecId && s.title !== null) || ensureInbox()
  box.innerHTML = `
    <div class="ta-addform">
      <input id="qa-title" class="qa-title" placeholder="New deed — write it down, founder…" autocomplete="off" />
      <textarea id="qa-desc" rows="2" placeholder="Details (optional)"></textarea>
      <div class="qa-opts">
        <input id="qa-due" type="date" />
        <select id="qa-pri"><option value="">priority…</option><option value="p1">🔺 P1</option><option value="p2">⏫ P2</option><option value="p3">🔼 P3</option><option value="p4">🔽 P4</option></select>
      </div>
      <div class="qa-actions">
        <button class="btn-soft" data-act="add-cancel">Cancel</button>
        <button class="btn-gold" data-act="add-ok">＋ Inscribe deed</button>
      </div>
    </div>`
  const title = box.querySelector("#qa-title")
  if (title) { title.focus(); title.select?.() }
}

function renderEditor() {
  const host = document.getElementById("ta-editor")
  if (!host) return
  if (!led.editingId) { host.innerHTML = ""; return }
  const t = taskById(led.editingId)
  if (!t) { led.editingId = null; host.innerHTML = ""; return }
  const sec = t.root ? (rootInfoOf(t.id)?.sec || null) : null
  host.innerHTML = `
    <div class="ta-editcard">
      <div class="ta-edit-head"><span class="ta-edit-icon">${t.done ? "✓" : "✎"}</span>
        <span>Edit deed</span><button class="ta-edit-x" data-act="edit-close">✕</button></div>
      <label class="ta-field"><span>Deed</span>
        <input id="ed-title" class="ed-title" value="${aesc(t.title)}" /></label>
      <label class="ta-field"><span>Details</span>
        <textarea id="ed-desc" rows="3">${esc(t.desc || "")}</textarea></label>
      <div class="ta-edit-row">
        <label class="ta-field"><span>Due</span><input id="ed-due" type="date" value="${aesc(t.due || "")}" /></label>
        <label class="ta-field"><span>Priority</span><select id="ed-pri">
          <option value="">— none —</option>
          ${["p1", "p2", "p3", "p4"].map((p) => `<option value="${p}" ${t.pri === p ? "selected" : ""}>${PRI_FLAG[p]} P${p[1]}</option>`).join("")}
        </select></label>
        ${sec && led.sections.filter((s) => s.title !== null).length > 1 ? `
        <label class="ta-field"><span>List</span><select id="ed-sec">
          ${led.sections.filter((s) => s.title !== null).map((s) => `<option value="${s.id}" ${sec.id === s.id ? "selected" : ""}>${aesc(s.title)}</option>`).join("")}
        </select></label>` : ""}
      </div>
      <div class="ta-edit-subs">
        <div class="ta-subs-title">Steps ${t.subs.length ? `(${t.subs.filter((s) => s.done).length}/${t.subs.length})` : ""}</div>
        <div class="ta-subs-list">
          ${t.subs.length ? t.subs.map((s) => `
            <div class="ta-sub ${s.done ? "done" : ""}" data-id="${s.id}">
              <button class="tl-check ${s.done ? "on" : ""}" data-act="toggle" data-id="${s.id}">${CHECK_HTML}</button>
              <input class="ta-sub-title" data-id="${s.id}" value="${aesc(s.title)}" placeholder="subtask" />
              <button class="tl-del" data-act="del" data-id="${s.id}">🗑</button>
            </div>`).join("") : `<div class="ta-subs-empty">No steps yet.</div>`}
        </div>
        <div class="ta-addsub-row"><input id="ed-newsub" placeholder="＋ add a step…" /><button class="btn-soft" data-act="subadd-ok" data-id="${t.id}">Add</button></div>
      </div>
      <div class="ta-edit-foot">
        <button class="btn-soft danger" data-act="del" data-id="${t.id}">Delete deed</button>
        <button class="btn-gold" data-act="edit-close">Done</button>
      </div>
    </div>`
  // bind live edit fields (no re-render while typing → keeps focus)
  host.querySelector("#ed-title").addEventListener("input", (e) => { t.title = e.target.value; markChanged() })
  host.querySelector("#ed-desc").addEventListener("input", (e) => { t.desc = e.target.value; markChanged() })
  const dueEl = host.querySelector("#ed-due")
  dueEl.addEventListener("change", (e) => { t.due = e.target.value || null; markChanged() })
  const priEl = host.querySelector("#ed-pri")
  priEl.addEventListener("change", (e) => { t.pri = e.target.value || null; markChanged() })
  const secEl = host.querySelector("#ed-sec")
  if (secEl && sec) secEl.addEventListener("change", (e) => { moveRootTo(secEl.value, t.id, true); })
  for (const inp of host.querySelectorAll(".ta-sub-title")) {
    inp.addEventListener("change", (e) => {
      const st = taskById(e.target.dataset.id)
      if (st) st.title = e.target.value
      markChanged()
    })
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur() })
  }
  const newSub = host.querySelector("#ed-newsub")
  if (newSub) newSub.addEventListener("keydown", (e) => { if (e.key === "Enter") addSubtask(t.id, e.target.value) })
}

function addSubtask(parentId, rawTitle) {
  const title = String(rawTitle || "").trim()
  if (!title) return
  const parent = taskById(parentId)
  if (!parent) return
  parent.subs.push({
    kind: "task", id: uid(), root: false, depth: parent.depth + 1, done: false,
    title, due: null, pri: null, desc: "", subs: []
  })
  const input = document.getElementById("ed-newsub")
  if (input) input.value = ""
  markChanged()
  render()
}

function deleteTask(id) {
  // find & remove anywhere (section root or parent.subs)
  for (const sec of led.sections) {
    const i = sec.children.findIndex((c) => c.id === id)
    if (i !== -1) { sec.children.splice(i, 1); finishDelete(id); return }
  }
  const parent = allTasks().find((t) => t.subs.some((s) => s.id === id))
  if (parent) {
    parent.subs = parent.subs.filter((s) => s.id !== id)
    finishDelete(id)
  }
}
function finishDelete(id) {
  if (led.editingId === id) led.editingId = null
  markChanged()
  render()
}

function createTask(secId, { title = "", desc = "", due = null, pri = null } = {}) {
  const sec = led.sections.find((s) => s.id === secId && s.title !== null) || ensureInbox()
  const node = {
    kind: "task", id: uid(), root: true, depth: 0, done: false,
    title: String(title || "").trim(), due, pri, desc: String(desc || "").trim(), subs: []
  }
  sec.children.push(node)
  markChanged()
  return node
}

function toggleTask(id) {
  const t = taskById(id)
  if (!t) return
  const nowDone = !t.done
  t.done = nowDone
  if (nowDone) {
    // completing a parent with remaining steps → reflect children as done too
    const rec = (n, val) => { n.done = val; for (const s of n.subs) rec(s, val) }
    rec(t, true)
  }
  markChanged()
  led.onTick?.(t, nowDone)
  return t
}

function moveRootTo(secId, taskId, toEnd = true, beforeId = null) {
  const src = rootInfoOf(taskId)
  const dstSec = led.sections.find((s) => s.id === secId)
  if (!src || !dstSec) return false
  if (src.sec.id === dstSec.id && !beforeId) return false
  src.sec.children.splice(src.index, 1)
  if (dstSec.id === src.sec.id && beforeId) {
    const ti = dstSec.children.findIndex((c) => c.id === beforeId)
    dstSec.children.splice(ti, 0, src.node)
  } else if (beforeId) {
    const ti = dstSec.children.findIndex((c) => c.id === beforeId)
    dstSec.children.splice(ti, 0, src.node)
  } else {
    dstSec.children.push(src.node)
  }
  markChanged()
  return true
}

function reorderInSection(secId, taskId, beforeId) {
  return moveRootTo(secId, taskId, false, beforeId)
}

function render() {
  if (!led.app) return
  const body = document.getElementById("ta-body")
  if (!body) return
  // view toggle active state
  led.app.querySelectorAll(".ta-vb").forEach((b) => b.classList.toggle("active", b.dataset.view === led.view))
  if (led.view === "board") renderBoard(body)
  else renderList(body)
  refreshBadges()
  renderAddBox()
  renderEditor()
  // embed hint text
  const hint = led.app.querySelector(".ta-hint")
  if (hint) {
    hint.innerHTML = led.active === "battle"
      ? "Tick any deed or step to slay the guardian — the deed becomes your inscribed answer."
      : ""
    hint.classList.toggle("show", led.active === "battle")
  }
  const addBtn = led.app.querySelector(".ta-new")
  if (addBtn) addBtn.textContent = led.view === "board" ? "＋ New deed" : "＋ New deed"
  // column header extra new button labels handled by renderers
  bindDnD(body)
}

// ---- events -----------------------------------------------------------------

function bindAppEvents() {
  const app = led.app
  app.addEventListener("click", (e) => {
    const actEl = e.target.closest("[data-act]")
    if (!actEl) return
    const act = actEl.dataset.act
    const id = actEl.dataset.id
    const secId = actEl.dataset.secid
    switch (act) {
      case "toggle": toggleTask(id); render(); break
      case "edit": led.editingId = id; render(); break
      case "del": deleteTask(id); break
      case "collapse": {
        const s = led.sections.find((x) => x.id === secId)
        if (!s && led.sections.length === 0) break
        if (led.collapsed.has(secId)) led.collapsed.delete(secId); else led.collapsed.add(secId)
        render(); break
      }
      case "secadd": {
        // add to specific section (or create Inbox)
        if (secId) { led.addingSecId = secId } else { ensureInbox(); led.addingSecId = led.sections[0].id }
        led.view = "list"; render(); break
      }
      case "add": ensureInbox(); led.addingSecId = (led.sections.find((s) => s.title !== null) || led.sections[0]).id; render(); break
      case "subadd": addSubtask(id, ""); render(); break
      case "add-cancel": led.addingSecId = null; render(); break
      case "add-ok": {
        const box = document.getElementById("ta-addbox")
        const title = box?.querySelector("#qa-title")?.value || ""
        const desc = box?.querySelector("#qa-desc")?.value || ""
        const due = box?.querySelector("#qa-due")?.value || null
        const pri = box?.querySelector("#qa-pri")?.value || null
        const sec = led.sections.find((s) => s.id === led.addingSecId) || ensureInbox()
        const t = createTask(sec.id, { title, desc, due, pri })
        led.addingSecId = null
        render()
        if (t) toast(`✒ "${esc(t.title)}" written to Tasks.md`)
        break
      }
      case "edit-close": led.editingId = null; render(); break
      case "subadd-ok": addSubtask(id, document.getElementById("ed-newsub")?.value || ""); break
      default: break
    }
  })
  app.addEventListener("dblclick", (e) => {
    const row = e.target.closest("[data-act='edit']")
    if (!row) return
  })
  // view toggle
  app.querySelectorAll(".ta-vb").forEach((b) => {
    b.addEventListener("click", () => { led.view = b.dataset.view; led.editingId = null; render() })
  })
}

function bindDnD(body) {
  if (!body) return
  let dragId = null
  const isRootEl = (el) => el?.dataset?.root === "1" && el?.dataset?.id
  body.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[draggable='true'][data-id]")
    if (!el) return
    dragId = el.dataset.id
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", dragId)
    el.classList.add("dragging")
  })
  body.addEventListener("dragend", (e) => {
    const el = e.target.closest("[data-id]")
    if (el) el.classList.remove("dragging")
    dragId = null
  })
  body.addEventListener("dragover", (e) => {
    const row = e.target.closest("[data-root='1'][data-id]")
    const colBody = e.target.closest(".bd-col-body, .tl-sec-body")
    if (row) { e.preventDefault(); row.classList.add("drop-over") }
    else if (colBody) { e.preventDefault(); colBody.classList.add("drop-tail") }
  })
  body.addEventListener("dragleave", (e) => {
    const row = e.target.closest("[data-root='1'][data-id]")
    const colBody = e.target.closest(".bd-col-body, .tl-sec-body")
    if (row) row.classList.remove("drop-over")
    if (colBody) colBody.classList.remove("drop-tail")
  })
  body.addEventListener("drop", (e) => {
    const row = e.target.closest("[data-root='1'][data-id]")
    const colBody = e.target.closest(".bd-col-body, .tl-sec-body")
    if (!dragId) return
    e.preventDefault()
    let moved = false
    if (row && row.dataset.id !== dragId) {
      const secId = row.closest("[data-secid]")?.dataset.secid
      if (secId) moved = reorderInSection(secId, dragId, row.dataset.id)
    } else if (colBody) {
      const secId = colBody.dataset.secid
      if (secId) moved = moveRootTo(secId, dragId, true)
    }
    if (moved) { render(); toast("Deed reordered") }
    dragId = null
  })
}

// public wrapper used by the deed popup
function addQuickDeed({ title, desc = "", due = null, pri = null, section = null } = {}) {
  let sec = null
  if (section) sec = led.sections.find((s) => s.title === section)
  if (!sec) sec = led.sections.find((s) => s.title !== null)
  if (!sec) sec = ensureInbox()
  const node = createTask(sec.id, { title, desc, due, pri })
  return node
}

export const todo = {
  init,
  openOverlay,
  openInBattle,
  closeAll,
  closeOverlay,
  get visible() { return led.active !== "none" },
  get active() { return led.active },
  render,
  counts,
  taskById,
  allTasks: () => allTasks(),
  toggleTask,
  createTask,
  deleteTask,
  addSubtask,
  addQuickDeed,
  ensureInbox,
  onTick: (fn) => { led.onTick = fn },
  onChange: (fn) => { led.onChanged = fn },
  setView(v) { led.view = v === "board" ? "board" : "list"; if (led.app) render() },
  get view() { return led.view },
  serialize: () => serializeMarkdown(led.sections),
  parseMarkdown,
  serializeMarkdown,
  syncDot
}
