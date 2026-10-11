/** Leise Hintergrundmusik in der Szenen-Vorschau (Web Audio, keine Datei). */

const MASTER_GAIN = 0.028

type PadVoice = {
  freq: number
  type: OscillatorType
  gain: number
  detune: number
}

const PAD: PadVoice[] = [
  { freq: 130.81, type: 'triangle', gain: 0.5, detune: -7 },
  { freq: 130.81, type: 'sine', gain: 0.38, detune: 9 },
  { freq: 196.0, type: 'sine', gain: 0.32, detune: -5 },
  { freq: 164.81, type: 'sine', gain: 0.16, detune: 4 },
  { freq: 261.63, type: 'triangle', gain: 0.1, detune: 0 },
  { freq: 392.0, type: 'sine', gain: 0.05, detune: 2 },
]

const BELL_HZ = [523.25, 587.33, 659.25, 783.99, 880.0]

function audioContextCtor(): (new () => AudioContext) | null {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export type SceneBedMusic = {
  start: (opts?: { crackle?: boolean; city?: boolean }) => Promise<void>
  pause: () => void
  stop: () => void
  dispose: () => void
}

export function createSceneBedMusic(): SceneBedMusic {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let padOn = false
  let audible = false
  const padNodes: OscillatorNode[] = []
  const bellNodes: OscillatorNode[] = []
  const foleyNodes: AudioNode[] = []
  let bellTimer: number | null = null
  let crackleTimer: number | null = null
  let wantCrackle = false
  let wantCity = false
  let cityOn = false

  function ensure(): boolean {
    if (ctx && ctx.state !== 'closed') return true
    const Ctor = audioContextCtor()
    if (!Ctor) return false
    try {
      ctx = new Ctor()
    } catch {
      ctx = null
      return false
    }
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    return true
  }

  function clearBellTimer() {
    if (bellTimer != null) {
      window.clearTimeout(bellTimer)
      bellTimer = null
    }
  }

  function clearCrackleTimer() {
    if (crackleTimer != null) {
      window.clearTimeout(crackleTimer)
      crackleTimer = null
    }
  }

  function noiseBuffer(seconds: number): AudioBuffer | null {
    if (!ctx) return null
    const n = Math.max(1, Math.floor(ctx.sampleRate * seconds))
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  function playCrackle() {
    if (!ctx || !master || !audible || !wantCrackle) return
    const buf = noiseBuffer(0.08)
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const g = ctx.createGain()
    const now = ctx.currentTime
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.045, now + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
    src.connect(hp)
    hp.connect(g)
    g.connect(master)
    src.start(now)
    src.stop(now + 0.09)
    foleyNodes.push(src, hp, g)
    src.onended = () => {
      for (const n of [src, hp, g]) {
        const i = foleyNodes.indexOf(n)
        if (i >= 0) foleyNodes.splice(i, 1)
      }
    }
  }

  function scheduleCrackle() {
    if (!audible || !wantCrackle) return
    playCrackle()
    if (Math.random() < 0.45) playCrackle()
    crackleTimer = window.setTimeout(scheduleCrackle, 280 + Math.random() * 900)
  }

  function spawnCity() {
    if (!ctx || !master || cityOn || !wantCity) return
    const buf = noiseBuffer(2)
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    const g = ctx.createGain()
    g.gain.value = 0.018
    src.connect(lp)
    lp.connect(g)
    g.connect(master)
    src.start()
    foleyNodes.push(src, lp, g)
    cityOn = true
  }

  function stopList(list: OscillatorNode[], when?: number) {
    const t = when ?? ctx?.currentTime ?? 0
    for (const n of list) {
      try {
        n.stop(t)
      } catch {
        /* already stopped */
      }
    }
    list.length = 0
  }

  function playBell() {
    if (!ctx || !master || !audible) return
    const freq = BELL_HZ[Math.floor(Math.random() * BELL_HZ.length)] ?? 659.25
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.035, now + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8)
    osc.connect(g)
    g.connect(master)
    osc.start(now)
    osc.stop(now + 2)
    bellNodes.push(osc)
    osc.onended = () => {
      const i = bellNodes.indexOf(osc)
      if (i >= 0) bellNodes.splice(i, 1)
    }

    const harm = ctx.createOscillator()
    harm.type = 'sine'
    harm.frequency.value = freq * 2.005
    const hg = ctx.createGain()
    hg.gain.setValueAtTime(0.0001, now)
    hg.gain.linearRampToValueAtTime(0.01, now + 0.015)
    hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
    harm.connect(hg)
    hg.connect(master)
    harm.start(now)
    harm.stop(now + 0.85)
    bellNodes.push(harm)
    harm.onended = () => {
      const i = bellNodes.indexOf(harm)
      if (i >= 0) bellNodes.splice(i, 1)
    }
  }

  function scheduleBells() {
    if (!audible) return
    playBell()
    bellTimer = window.setTimeout(scheduleBells, 2600 + Math.random() * 2000)
  }

  function spawnPad() {
    if (!ctx || !master || padOn) return
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    filter.Q.value = 0.65
    filter.connect(master)

    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.06
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 80
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()
    padNodes.push(lfo)

    for (const voice of PAD) {
      const osc = ctx.createOscillator()
      osc.type = voice.type
      osc.frequency.value = voice.freq
      osc.detune.value = voice.detune
      const g = ctx.createGain()
      g.gain.value = voice.gain
      osc.connect(g)
      g.connect(filter)
      osc.start()
      padNodes.push(osc)
    }
    padOn = true
  }

  function fadeTo(value: number, seconds: number) {
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
    if (value <= 0) master.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
    else master.gain.linearRampToValueAtTime(value, now + seconds)
  }

  async function start(opts?: { crackle?: boolean; city?: boolean }) {
    wantCrackle = Boolean(opts?.crackle)
    wantCity = Boolean(opts?.city)
    if (!ensure() || !ctx || !master) return
    try {
      await ctx.resume()
    } catch {
      return
    }
    spawnPad()
    spawnCity()
    audible = true
    clearBellTimer()
    clearCrackleTimer()
    scheduleBells()
    if (wantCrackle) scheduleCrackle()
    fadeTo(MASTER_GAIN, 0.7)
  }

  function pause() {
    audible = false
    fadeTo(0, 0.28)
    clearBellTimer()
    clearCrackleTimer()
    stopList(bellNodes, ctx ? ctx.currentTime + 0.3 : undefined)
  }

  function stop() {
    pause()
  }

  function dispose() {
    audible = false
    padOn = false
    cityOn = false
    clearBellTimer()
    clearCrackleTimer()
    stopList(bellNodes)
    stopList(padNodes)
    for (const n of foleyNodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          ;(n as OscillatorNode).stop()
        }
      } catch {
        /* already stopped */
      }
    }
    foleyNodes.length = 0
    if (ctx && ctx.state !== 'closed') {
      void ctx.close()
    }
    ctx = null
    master = null
  }

  return { start, pause, stop, dispose }
}
