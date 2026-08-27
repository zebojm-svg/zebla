/** Original, royalty-free bed: a quiet warm pad synthesized in Web Audio (no samples). */

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
  start: () => Promise<void>
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
  let bellTimer: number | null = null

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

  async function start() {
    if (!ensure() || !ctx || !master) return
    try {
      await ctx.resume()
    } catch {
      return
    }
    spawnPad()
    audible = true
    clearBellTimer()
    scheduleBells()
    fadeTo(MASTER_GAIN, 0.7)
  }

  function pause() {
    audible = false
    fadeTo(0, 0.28)
    clearBellTimer()
    stopList(bellNodes, ctx ? ctx.currentTime + 0.3 : undefined)
  }

  function stop() {
    pause()
  }

  function dispose() {
    audible = false
    padOn = false
    clearBellTimer()
    stopList(bellNodes)
    stopList(padNodes)
    if (ctx && ctx.state !== 'closed') {
      void ctx.close()
    }
    ctx = null
    master = null
  }

  return { start, pause, stop, dispose }
}
