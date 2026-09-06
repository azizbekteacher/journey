import { FACTS, BATTLES, COIN_LESSONS, MODULE_NAMES } from "./data/curriculum.js"
import { S, saveGame, resetGame } from "./state.js"
import { audio } from "./audio.js"

const $ = (id) => document.getElementById(id)

export class Notebook {
  constructor() {
    this.selectedKey = null
    this.saveTimer = null
    $("nb-close").addEventListener("click", () => this.toggle())
    $("nb-export").addEventListener("click", () => this.export())
    $("nb-reset").addEventListener("click", () => {
      if (confirm("Erase all progress and start the quest anew?")) {
        resetGame()
        location.reload()
      }
    })
    $("nb-entry-title").addEventListener("input", () => this.autosave())
    $("nb-entry-text").addEventListener("input", () => this.autosave())
  }

  toggle(force) {
    const el = $("notebook")
    const willShow = force !== undefined ? force : el.classList.contains("hidden")
    el.classList.toggle("hidden", !willShow)
    if (willShow) {
      audio.page()
      this.renderList()
      if (!this.selectedKey) this.selectFirst()
    } else {
      document.getElementById("game").requestPointerLock?.()
    }
  }

  isOpen() { return !$("notebook").classList.contains("hidden") }

  entries() {
    const out = []
    for (const f of FACTS) out.push({ key: f.id, cat: f.cat, title: f.title })
    for (const b of BATTLES) {
      const done = !!S.defeated[b.id]
      out.push({ key: b.id, cat: `Module ${b.module} · ${MODULE_NAMES[b.module]}`, title: b.title, locked: !done })
    }
    for (let i = 0; i < COIN_LESSONS.length; i++) {
      if (S.notes[`coin${i}`]) out.push({ key: `coin${i}`, cat: "Coin Lessons", title: COIN_LESSONS[i].title })
    }
    if (S.notes["plan"]) out.push({ key: "plan", cat: "The CMO", title: "Quarterly Marketing Plan" })
    return out
  }

  renderList() {
    const list = $("nb-list")
    list.innerHTML = ""
    for (const e of this.entries()) {
      const div = document.createElement("div")
      div.className = "nb-item" + (e.key === this.selectedKey ? " active" : "")
      const note = S.notes[e.key]
      const preview = e.locked ? "\ud83d\udd12 Defeat the guardian to inscribe" : (note?.text || "").slice(0, 60) || "..."
      div.innerHTML = `<span class="nb-cat">${e.cat}</span><span class="nb-preview">${e.title} — ${preview}</span>`
      div.addEventListener("click", () => { this.selectedKey = e.key; this.renderList(); this.renderEntry() })
      list.appendChild(div)
    }
  }

  selectFirst() {
    const e = this.entries().find(x => !x.locked)
    if (e) { this.selectedKey = e.key; this.renderEntry() }
  }

  renderEntry() {
    const e = this.entries().find(x => x.key === this.selectedKey)
    if (!e) return
    if (e.locked) {
      $("nb-entry-title").value = "\ud83d\udd12 " + e.title
      $("nb-entry-text").value = "Defeat the guardian of this knowledge to inscribe your answer here."
      $("nb-entry-title").disabled = true
      $("nb-entry-text").disabled = true
      return
    }
    $("nb-entry-title").disabled = false
    $("nb-entry-text").disabled = false
    const note = S.notes[e.key] || {}
    $("nb-entry-title").value = note.title || e.title
    $("nb-entry-text").value = note.text || ""
  }

  autosave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      if (!this.selectedKey) return
      const e = this.entries().find(x => x.key === this.selectedKey)
      if (!e || e.locked) return
      S.notes[this.selectedKey] = {
        title: $("nb-entry-title").value,
        text: $("nb-entry-text").value
      }
      saveGame()
      const s = $("nb-saved")
      s.classList.add("show")
      setTimeout(() => s.classList.remove("show"), 900)
      this.renderList()
    }, 450)
  }

  export() {
    const lines = ["# Founder's Notebook — The CMO's Quest", ""]
    for (const e of this.entries()) {
      if (e.locked) continue
      const n = S.notes[e.key]
      lines.push(`## [${e.cat}] ${n?.title || e.title}`)
      lines.push(n?.text || "")
      lines.push("")
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "founders-notebook.md"
    a.click()
    URL.revokeObjectURL(a.href)
    audio.page()
  }
}
