let ctx = null
let master = null
let enabled = true
let ambientNodes = null

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch (e) { return null }
  }
  if (ctx.state === "suspended") ctx.resume()
  return ctx
}

function tone(freq, dur, type = "sine", vol = 0.2, when = 0, slide = 0) {
  const c = ensure()
  if (!c || !enabled) return
  const t0 = c.currentTime + when
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noise(dur, vol = 0.2, filterFreq = 1200, when = 0) {
  const c = ensure()
  if (!c || !enabled) return
  const t0 = c.currentTime + when
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = "lowpass"
  f.frequency.value = filterFreq
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t0)
}

export const audio = {
  setEnabled(v) {
    enabled = v
    if (!v) this.stopAmbient()
    else this.startAmbient()
  },
  isEnabled() { return enabled },

  coin() {
    tone(1046, 0.12, "triangle", 0.18)
    tone(1568, 0.22, "triangle", 0.16, 0.08)
  },
  page() {
    noise(0.18, 0.12, 2600)
  },
  swing() {
    noise(0.16, 0.14, 3800)
    tone(220, 0.1, "sawtooth", 0.05, 0, -120)
  },
  clang() {
    tone(1244, 0.18, "square", 0.1)
    tone(1864, 0.28, "triangle", 0.12, 0.02)
    noise(0.12, 0.1, 5000)
  },
  hit() {
    noise(0.12, 0.25, 700)
    tone(90, 0.15, "sine", 0.25, 0, -40)
  },
  fanfare() {
    const seq = [523, 659, 784, 1046]
    seq.forEach((f, i) => tone(f, 0.28, "triangle", 0.16, i * 0.12))
    tone(1568, 0.5, "triangle", 0.14, 0.48)
    tone(784, 0.5, "sine", 0.1, 0.48)
  },
  bigFanfare() {
    const seq = [392, 523, 659, 784, 1046, 1318]
    seq.forEach((f, i) => { tone(f, 0.34, "triangle", 0.17, i * 0.14); tone(f / 2, 0.34, "sine", 0.1, i * 0.14) })
    tone(1568, 0.9, "triangle", 0.16, 0.84)
    tone(1046, 0.9, "sine", 0.12, 0.84)
  },
  growl() {
    tone(70, 0.4, "sawtooth", 0.14, 0, -20)
    noise(0.3, 0.1, 300)
  },
  timeout() {
    tone(330, 0.2, "square", 0.1)
    tone(233, 0.35, "square", 0.1, 0.18)
  },
  magic() {
    tone(880, 0.3, "sine", 0.1, 0, 400)
    tone(1320, 0.4, "sine", 0.08, 0.12, 500)
  },
  gallop() {
    noise(0.08, 0.16, 400)
    noise(0.08, 0.12, 350, 0.16)
  },
  dash() {
    noise(0.14, 0.1, 2200)
    tone(340, 0.12, "sine", 0.06, 0, -180)
  },
  parry() {
    tone(1568, 0.2, "triangle", 0.14)
    tone(2093, 0.3, "triangle", 0.12, 0.04)
    noise(0.1, 0.08, 6000)
  },
  thud() {
    tone(70, 0.2, "sine", 0.22, 0, -30)
    noise(0.1, 0.16, 500)
  },

  startAmbient() {
    const c = ensure()
    if (!c || !enabled || ambientNodes) return
    const g = c.createGain()
    g.gain.value = 0.055
    const f = c.createBiquadFilter()
    f.type = "lowpass"
    f.frequency.value = 900
    g.connect(f)
    f.connect(master)
    const oscs = []
    const chordLoop = () => {
      if (!ambientNodes) return
      const chords = [
        [196, 247, 294],
        [174.6, 220, 261.6],
        [164.8, 207.6, 246.9],
        [196, 247, 294]
      ]
      chords.forEach((chord, ci) => {
        if (!ambientNodes) return
        const when = ci * 8
        chord.forEach((freq) => {
          const o = c.createOscillator()
          const og = c.createGain()
          o.type = "sine"
          o.frequency.value = freq
          og.gain.setValueAtTime(0.0001, c.currentTime + when)
          og.gain.linearRampToValueAtTime(0.33, c.currentTime + when + 3)
          og.gain.linearRampToValueAtTime(0.0001, c.currentTime + when + 8)
          o.connect(og)
          og.connect(g)
          o.start(c.currentTime + when)
          o.stop(c.currentTime + when + 8.2)
          oscs.push(o)
        })
      })
      ambientNodes.timer = setTimeout(chordLoop, 32000)
    }
    ambientNodes = { gain: g, timer: null, oscs }
    chordLoop()
  },

  stopAmbient() {
    if (!ambientNodes) return
    clearTimeout(ambientNodes.timer)
    try { ambientNodes.gain.disconnect() } catch (e) {}
    ambientNodes = null
  }
}
