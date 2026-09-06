const SAVE_KEY = "journey_cmo_save_v1"

export const MAX_HEARTS = 5

export const S = {
  defeated: {},
  coinsTaken: {},
  notes: {},
  gold: 0,
  hearts: MAX_HEARTS,
  horseUnlocked: false,
  bossDone: false,
  soundOn: true
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      defeated: S.defeated,
      coinsTaken: S.coinsTaken,
      notes: S.notes,
      gold: S.gold,
      hearts: S.hearts,
      horseUnlocked: S.horseUnlocked,
      bossDone: S.bossDone,
      soundOn: S.soundOn
    }))
  } catch (e) {}
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return false
    const d = JSON.parse(raw)
    Object.assign(S, {
      defeated: d.defeated || {},
      coinsTaken: d.coinsTaken || {},
      notes: d.notes || {},
      gold: d.gold || 0,
      hearts: d.hearts ?? MAX_HEARTS,
      horseUnlocked: !!d.horseUnlocked,
      bossDone: !!d.bossDone,
      soundOn: d.soundOn !== false
    })
    return true
  } catch (e) {
    return false
  }
}

export function resetGame() {
  try { localStorage.removeItem(SAVE_KEY) } catch (e) {}
  S.defeated = {}
  S.coinsTaken = {}
  S.notes = {}
  S.gold = 0
  S.hearts = MAX_HEARTS
  S.horseUnlocked = false
  S.bossDone = false
}

export function progressCount() {
  return Object.values(S.defeated).filter(Boolean).length
}
