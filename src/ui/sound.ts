// Tiny synthesized sound effects (no audio files). Browsers only allow audio after a click or key press.
let ctx: AudioContext | null = null
let muted = false
try {
  muted = localStorage.getItem('zoo-muted') === '1'
} catch {
  /* storage unavailable */
}
let lastCoin = 0

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  if (muted) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const t = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sound = {
  get muted() {
    return muted
  },
  toggle() {
    muted = !muted
    try {
      localStorage.setItem('zoo-muted', muted ? '1' : '0')
    } catch {
      /* ignore */
    }
    return muted
  },
  click: () => tone(520, 0.06, 'triangle', 0.08),
  build: () => {
    tone(240, 0.09, 'square', 0.05, 0, 160)
    tone(360, 0.07, 'triangle', 0.05, 0.05)
  },
  coin: () => {
    const now = performance.now()
    if (now - lastCoin < 140) return
    lastCoin = now
    tone(880, 0.07, 'square', 0.035)
    tone(1320, 0.12, 'square', 0.035, 0.06)
  },
  error: () => tone(180, 0.18, 'sawtooth', 0.06, 0, 110),
  goal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, i * 0.09)),
}
