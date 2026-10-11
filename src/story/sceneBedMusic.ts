/** Leise Hintergrundmusik, Foley und Dialogstimme in der Szenen-Vorschau (Web Audio). */

import {
  SCENE_FOLEY_GAIN,
  SCENE_PAD_GAIN,
  SCENE_VOICE_GAIN,
} from '../../shared/film-scene-foley'

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
  prepare: () => Promise<boolean>
  start: (opts?: { crackle?: boolean; city?: boolean }) => Promise<void>
  decodeVoice: (data: ArrayBuffer) => Promise<AudioBuffer>
  playVoice: (buffer: AudioBuffer, rate?: number) => Promise<void>
  stopVoice: () => void
  pauseBed: () => void
  pause: () => void
  stop: () => void
  dispose: () => void
}

export function createSceneBedMusic(): SceneBedMusic {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let foleyBus: GainNode | null = null
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
  let voiceGen = 0
  let voiceSrc: AudioBufferSourceNode | null = null

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
    foleyBus = ctx.createGain()
    foleyBus.gain.value = 0
    foleyBus.connect(ctx.destination)
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
    if (!ctx || !foleyBus || !audible || !wantCrackle) return
    const dur = 0.05 + Math.random() * 0.07
    const buf = noiseBuffer(dur)
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800 + Math.random() * 1400
    bp.Q.value = 1.1
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 700
    const g = ctx.createGain()
    const now = ctx.currentTime
    const peak = 0.45 + Math.random() * 0.25
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(peak, now + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    src.connect(hp)
    hp.connect(bp)
    bp.connect(g)
    g.connect(foleyBus)
    src.start(now)
    src.stop(now + dur + 0.02)
    foleyNodes.push(src, hp, bp, g)
    src.onended = () => {
      for (const n of [src, hp, bp, g]) {
        const i = foleyNodes.indexOf(n)
        if (i >= 0) foleyNodes.splice(i, 1)
      }
    }
  }

  function scheduleCrackle() {
    if (!audible || !wantCrackle) return
    const pops = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < pops; i++) {
      window.setTimeout(playCrackle, i * (35 + Math.random() * 55))
    }
    crackleTimer = window.setTimeout(scheduleCrackle, 380 + Math.random() * 1100)
  }

  function spawnCity() {
    if (!ctx || !foleyBus || cityOn || !wantCity) return
    const buf = noiseBuffer(2)
    if (!buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 240
    const g = ctx.createGain()
    g.gain.value = 0.55
    src.connect(lp)
    lp.connect(g)
    g.connect(foleyBus)
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

  function fadeGain(node: GainNode | null, value: number, seconds: number) {
    if (!ctx || !node) return
    const now = ctx.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now)
    if (value <= 0) node.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
    else node.gain.linearRampToValueAtTime(value, now + seconds)
  }

  async function prepare(): Promise<boolean> {
    if (!ensure() || !ctx) return false
    try {
      await ctx.resume()
    } catch {
      return false
    }
    return ctx.state !== 'closed'
  }

  async function start(opts?: { crackle?: boolean; city?: boolean }) {
    wantCrackle = Boolean(opts?.crackle)
    wantCity = Boolean(opts?.city)
    if (!(await prepare()) || !ctx || !master || !foleyBus) return
    spawnPad()
    spawnCity()
    audible = true
    clearBellTimer()
    clearCrackleTimer()
    scheduleBells()
    if (wantCrackle) scheduleCrackle()
    fadeGain(master, SCENE_PAD_GAIN, 0.7)
    fadeGain(foleyBus, SCENE_FOLEY_GAIN, 0.35)
  }

  async function decodeVoice(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!(await prepare()) || !ctx) throw new Error('Kein Audio im Browser.')
    const copy = data.slice(0)
    return ctx.decodeAudioData(copy)
  }

  function stopVoice() {
    voiceGen += 1
    if (voiceSrc) {
      try {
        voiceSrc.stop()
      } catch {
        /* already stopped */
      }
      voiceSrc = null
    }
  }

  function playVoice(buffer: AudioBuffer, rate = 1): Promise<void> {
    const gen = ++voiceGen
    if (voiceSrc) {
      try {
        voiceSrc.stop()
      } catch {
        /* already stopped */
      }
      voiceSrc = null
    }
    return new Promise((resolve) => {
      if (!ctx || gen !== voiceGen) {
        resolve()
        return
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = Math.min(1.3, Math.max(0.4, rate))
      const g = ctx.createGain()
      g.gain.value = SCENE_VOICE_GAIN
      src.connect(g)
      g.connect(ctx.destination)
      voiceSrc = src
      src.onended = () => {
        if (voiceSrc === src) voiceSrc = null
        resolve()
      }
      try {
        src.start()
      } catch {
        resolve()
      }
    })
  }

  function pauseBed() {
    audible = false
    fadeGain(master, 0, 0.28)
    fadeGain(foleyBus, 0, 0.28)
    clearBellTimer()
    clearCrackleTimer()
    stopList(bellNodes, ctx ? ctx.currentTime + 0.3 : undefined)
  }

  function pause() {
    pauseBed()
    stopVoice()
  }

  function stop() {
    pause()
  }

  function dispose() {
    audible = false
    padOn = false
    cityOn = false
    stopVoice()
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
    foleyBus = null
  }

  return { prepare, start, decodeVoice, playVoice, stopVoice, pauseBed, pause, stop, dispose }
}
