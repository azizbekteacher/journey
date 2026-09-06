import { BATTLES, BOSS } from "./data/curriculum.js"
import { S } from "./state.js"
import { audio } from "./audio.js"

const $ = (id) => document.getElementById(id)
const keyOf = (i) => BATTLES[i].id
const note = (key) => S.notes[key]?.text

export function buildPlanHtml() {
  const g = (i) => {
    const t = note(keyOf(i))
    return t && t.trim() ? t : null
  }
  const sec = (title, items) => {
    const rows = items.map(([label, val]) => {
      const v = val || null
      return `<p><b>${label}:</b> ${v ? escapeHtml(v) : `<span class="plan-missing">— awaiting your answer —</span>`}</p>`
    }).join("")
    return `<div class="plan-section"><h3>${title}</h3>${rows}</div>`
  }
  return [
    sec("I. The North Star", [
      ["Quarter goal", g(16)],
      ["Victory metric", g(19)]
    ]),
    sec("II. The One Student", [
      ["Best student", g(0)],
      ["Why they buy", g(1)],
      ["Level journey", g(2)]
    ]),
    sec("III. Message & Proof", [
      ["The promise", g(8)],
      ["Why we win (USP)", g(9)],
      ["Proof — three victories", g(6)],
      ["Their old pains", g(3)]
    ]),
    sec("IV. The Offer", [
      ["What is inside", g(7)],
      ["Value boost", g(10)],
      ["Price levers", g(11)]
    ]),
    sec("V. Reach — the $200 Bet", [
      ["Where the truth says students came from", g(12)],
      ["Telegram reality", g(13)],
      ["Website's one job", g(14)],
      ["The $200 bet", g(17)],
      ["Month-one test", g(18)]
    ]),
    sec("VI. Battle Rhythm (generated)", [
      ["Every Monday", g(19) ? "Scoreboard check — metric, target, owner. 15 minutes, no excuses." : null],
      ["3\u00d7 per week", g(13) ? "Telegram posts: one student win, one useful mini-lesson, one offer with the promise on top." : null],
      ["Every trial lesson", g(12) ? "Salesman follows up within 5 minutes; coordinator schedules; teacher delivers a taste of victory." : null],
      ["Every month", g(18) ? "Review the test: keep what won, kill what lost, place the next bet." : null]
    ]),
    sec("VII. The Ranks", [
      ["Team capacity", g(15)],
      ["The funnel", S.notes["boss3"]?.text || null]
    ]),
    sec("VIII. Risks & Second Move", [
      ["If the bet fails", S.notes["boss2"]?.text || null],
      ["Final vow", S.notes["boss5"]?.text || null]
    ])
  ].join("")
}

export function buildPlanText() {
  const d = document.createElement("div")
  d.innerHTML = buildPlanHtml()
  return d.innerText.replace(/\n{3,}/g, "\n\n")
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function showPlan() {
  $("plan-body").innerHTML = buildPlanHtml()
  $("plan").classList.remove("hidden")
  audio.fanfare()
}

export function savePlanToNotebook() {
  S.notes["plan"] = { title: "Quarterly Marketing Plan", text: buildPlanText() }
  audio.page()
  return true
}
