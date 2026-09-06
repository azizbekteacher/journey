import { BATTLES, BOSS, NUDGES, TIMEOUT_NUDGES, PRAISES, MODULE_NAMES, ZONES } from "./data/curriculum.js"
import { S, saveGame, progressCount, MAX_HEARTS } from "./state.js"
import { audio } from "./audio.js"

const $ = (id) => document.getElementById(id)

export class Combat {
  constructor({ onVictory, onDefeatDamage, onRespawn }) {
    this.onVictory = onVictory
    this.onDefeatDamage = onDefeatDamage
    this.onRespawn = onRespawn
    this.current = null
    this.timeLeft = 0
    this.timerId = null
    this.nudgeIdx = 0
    this.open = false

    $("b-submit").addEventListener("click", () => this.submit())
    $("b-example").addEventListener("click", () => {
      const ex = this.current?.example
      if (!ex) return
      const el = $("b-lesson")
      const note = document.createElement("div")
      note.className = "example-note"
      note.style.cssText = "margin-top:8px;padding:8px 10px;background:rgba(184,137,46,0.14);border-left:3px solid #b8892e;font-size:14px;font-style:italic;color:#6b5a3e;"
      note.innerHTML = `<b style="font-style:normal">Example for an English school:</b> ${ex}`
      const old = el.querySelector(".example-note")
      if (old) old.remove()
      el.appendChild(note)
      audio.page()
    })
    $("b-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.submit()
      }
    })
  }

  startTimer(seconds) {
    clearInterval(this.timerId)
    this.timeLeft = seconds
    this.total = seconds
    this.updateRing()
    this.timerId = setInterval(() => {
      this.timeLeft--
      this.updateRing()
      if (this.timeLeft <= 0) this.timeout()
    }, 1000)
  }

  updateRing() {
    const frac = Math.max(0, this.timeLeft / this.total)
    const ring = $("b-ring")
    ring.style.strokeDasharray = `${(frac * 100.5).toFixed(1)}`
    ring.style.stroke = frac > 0.5 ? "#3f6f4f" : frac > 0.2 ? "#c98a3f" : "#a63a2e"
    const m = Math.floor(this.timeLeft / 60)
    const s = this.timeLeft % 60
    $("b-clock").textContent = `${m}:${String(s).padStart(2, "0")}`
  }

  timeout() {
    clearInterval(this.timerId)
    audio.timeout()
    S.hearts--
    saveGame()
    this.onDefeatDamage?.()
    if (S.hearts <= 0) {
      this.close()
      this.onRespawn?.()
      return
    }
    const n = TIMEOUT_NUDGES[Math.floor(Math.random() * TIMEOUT_NUDGES.length)]
    $("b-nudge").textContent = n
    $("b-nudge").style.color = "#a63a2e"
    $("battle").querySelector(".battle-panel").classList.add("shake")
    setTimeout(() => $("battle").querySelector(".battle-panel").classList.remove("shake"), 450)
    this.startTimer(this.total)
  }

  show(enemy, challenge = null, bossIntro = false) {
    document.exitPointerLock?.()
    this.current = { enemy, challenge }
    this.bossIntro = bossIntro
    $("battle").querySelector(".battle-panel").classList.remove("success")
    const b = challenge
    const battle = enemy.battle
    const icon = challenge ? "\ud83d\udc02" : ({ rat: "\ud83d\udc00", fox: "\ud83e\udd8a", boar: "\ud83d\udc17", wolf: "\ud83d\udc3a", bear: "\ud83d\udc3b", owl: "\ud83e\udd89", elder: "\ud83e\udd8c", bull: "\ud83d\udc02" }[battle.enemy])
    $("b-icon").textContent = icon
    $("b-name").textContent = challenge ? challenge.title : battle.title
    if (challenge) {
      $("b-meta").textContent = `Final Trial ${progressCountBoss() + 1}/5 · The Bull Market`
    } else {
      const bi = BATTLES.indexOf(battle) + 1
      $("b-meta").textContent = `${MODULE_NAMES[battle.module]} · ${ZONES[battle.zone]} · ${bi}/20`
    }
    const lessonHtml = bossIntro ? `<b style="font-style:normal">${BOSS.name}:</b> <i>${BOSS.intro}</i>` : (challenge ? challenge.lesson : battle.lesson)
    $("b-lesson").innerHTML = lessonHtml
    const oldNote = $("b-lesson").querySelector(".example-note")
    if (oldNote) oldNote.remove()
    $("b-question").textContent = b ? b.question : battle.question
    $("b-input").value = S.notes[battle ? battle.id : challenge.key]?.draft || ""
    $("b-nudge").textContent = ""
    $("b-hearts").textContent = "\u2764".repeat(Math.max(0, S.hearts)) + "\u2661".repeat(MAX_HEARTS - Math.max(0, S.hearts))
    const secs = challenge ? 180 : ((battle || {}).hard ? 180 : 60)
    this.open = true
    $("battle").classList.remove("hidden")
    $("b-input").focus()
    this.startTimer(secs)
    audio.page()
  }

  submit() {
    if (!this.current) return
    const val = $("b-input").value.trim()
    const b = this.current.challenge
    const battle = this.current.enemy.battle
    const minLen = (b || battle).minLen || 20
    if (val.length < minLen) {
      const n = NUDGES[this.nudgeIdx++ % NUDGES.length]
      $("b-nudge").textContent = `${n} (${val.length}/${minLen} characters)`
      $("b-nudge").style.color = "#a63a2e"
      $("b-input").classList.add("shake")
      setTimeout(() => $("b-input").classList.remove("shake"), 420)
      audio.hit()
      return
    }
    clearInterval(this.timerId)
    const key = battle ? battle.id : b.key
    S.notes[key] = { ...(S.notes[key] || {}), title: battle ? battle.title : b.title, text: val, draft: val }
    saveGame()
    const praise = PRAISES[Math.floor(Math.random() * PRAISES.length)]
    $("b-nudge").textContent = `\u2713 ${praise}`
    $("b-nudge").style.color = "#3f6f4f"
    $("b-submit").disabled = true
    $("battle").querySelector(".battle-panel").classList.add("success")
    audio.clang()
    const cur = this.current
    setTimeout(() => {
      $("b-submit").disabled = false
      this.close()
      this.onVictory(cur.enemy, cur.challenge, val)
    }, 900)
  }

  close() {
    clearInterval(this.timerId)
    this.open = false
    this.current = null
    $("battle").classList.add("hidden")
  }
}

function progressCountBoss() {
  return BOSS.challenges.filter(c => S.defeated[c.key]).length
}
