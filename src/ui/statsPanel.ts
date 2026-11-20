import type { Game } from '../game'
import { sound } from './sound'

interface Pt {
  x: number
  y: number
  label: string
}
interface Opts {
  kind: 'line' | 'bar'
  color: string
  fmt: (n: number) => string
  yMin?: number
  yMax?: number
  xLabel: (p: Pt) => string
}

const W = 380,
  H = 170,
  L = 48,
  R = 12,
  T = 12,
  B = 26

const compact = (n: number) => {
  const a = Math.abs(n)
  const s =
    a >= 1e6
      ? (a / 1e6).toFixed(1) + 'M'
      : a >= 1e3
        ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k'
        : String(Math.round(a))
  return (n < 0 ? '-' : '') + s.replace('.0', '')
}
/** A tick step of 1, 2 or 5 times a power of ten, so axis labels are round numbers. */
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

/**
 * One single-series chart (the card title names the series, so no legend box). Lines get a crosshair that snaps
 * to the nearest point; bars get a per-bar readout. Values reach the tooltip through textContent only.
 */
function drawChart(host: HTMLElement, pts: Pt[], o: Opts) {
  host.innerHTML = ''
  if (pts.length < 2) {
    host.innerHTML = '<div class="empty">Not enough data yet. Check back after a day or two.</div>'
    return
  }
  const ys = pts.map((p) => p.y)
  let lo = o.yMin ?? Math.min(0, ...ys)
  let hi = o.yMax ?? Math.max(...ys, lo + 1)
  const step = niceStep((hi - lo) / 4)
  lo = o.yMin ?? Math.floor(lo / step) * step
  hi = o.yMax ?? Math.ceil(hi / step) * step
  if (hi <= lo) hi = lo + step
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)
  const pw = W - L - R,
    ph = H - T - B
  const Y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph
  const bar = o.kind === 'bar'
  const slot = pw / pts.length
  const x0 = pts[0].x,
    x1 = pts[pts.length - 1].x
  const Xv = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * pw
  const X = (i: number) => (bar ? L + slot * (i + 0.5) : Xv(pts[i].x))

  let g = ticks
    .map(
      (v) =>
        `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tk" x="${L - 7}" y="${Y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`,
    )
    .join('')
  // a few x labels, never crowded: bars label some of their days, lines label whole days along the axis
  if (bar) {
    const every = Math.max(1, Math.ceil(pts.length / 6))
    g += pts
      .map((p, i) =>
        i % every === 0 || i === pts.length - 1
          ? `<text class="tk" x="${X(i)}" y="${H - 8}" text-anchor="middle">${o.xLabel(p)}</text>`
          : '',
      )
      .join('')
  } else {
    const first = Math.ceil(x0),
      last = Math.floor(x1)
    const stepD = Math.max(1, Math.ceil((last - first + 1) / 6))
    for (let d = first; d <= last; d += stepD)
      g += `<text class="tk" x="${Xv(d)}" y="${H - 8}" text-anchor="middle">${o.xLabel({ x: d, y: 0, label: '' })}</text>`
  }
  const base = Y(Math.max(lo, 0))
  if (bar) {
    const bw = Math.max(4, Math.min(26, slot * 0.62))
    g += pts
      .map((p, i) => {
        const top = Y(p.y),
          h = Math.max(1, base - top),
          x = X(i) - bw / 2,
          r = Math.min(3, h)
        return `<path class="bar" data-i="${i}" fill="${o.color}" d="M${x} ${base}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${base}Z"/>`
      })
      .join('')
  } else {
    const line = pts.map((_, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(pts[i].y).toFixed(1)}`).join('')
    g += `<path d="${line}L${X(pts.length - 1)} ${base}L${X(0)} ${base}Z" fill="${o.color}" opacity="0.16"/>`
    g += `<path d="${line}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    g += `<circle cx="${X(pts.length - 1)}" cy="${Y(pts[pts.length - 1].y)}" r="4" fill="${o.color}" class="ring"/>`
  }
  g += `<line class="ch" y1="${T}" y2="${T + ph}"/><circle class="hd ring" r="4.5" fill="${o.color}"/>`
  g += `<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg><div class="tt"><b></b><span></span></div>`

  const svg = host.querySelector('svg')!
  const tt = host.querySelector<HTMLElement>('.tt')!
  const ch = svg.querySelector<SVGLineElement>('.ch')!
  const hd = svg.querySelector<SVGCircleElement>('.hd')!
  const bars = [...svg.querySelectorAll<SVGPathElement>('.bar')]
  const show = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W
    let best = 0
    if (bar) best = Math.min(pts.length - 1, Math.max(0, Math.floor((sx - L) / slot)))
    else for (let i = 1; i < pts.length; i++) if (Math.abs(X(i) - sx) < Math.abs(X(best) - sx)) best = i
    const p = pts[best]
    tt.querySelector('b')!.textContent = o.fmt(p.y)
    tt.querySelector('span')!.textContent = p.label
    tt.classList.add('on')
    const px = (X(best) / W) * r.width
    tt.style.left = Math.min(r.width - 90, Math.max(0, px - 40)) + 'px'
    tt.style.top = (Y(p.y) / H) * r.height - 46 + 'px'
    if (bar) bars.forEach((b, i) => b.classList.toggle('hot', i === best))
    else {
      ch.setAttribute('x1', String(X(best)))
      ch.setAttribute('x2', String(X(best)))
      hd.setAttribute('cx', String(X(best)))
      hd.setAttribute('cy', String(Y(p.y)))
      ch.style.opacity = hd.style.opacity = '1'
    }
  }
  const hide = () => {
    tt.classList.remove('on')
    ch.style.opacity = hd.style.opacity = '0'
    bars.forEach((b) => b.classList.remove('hot'))
  }
  svg.querySelector('.hit')!.addEventListener('pointermove', show as EventListener)
  svg.querySelector('.hit')!.addEventListener('pointerleave', hide)
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

/** The Stats screen: four charts of how the zoo is doing, summary tiles, and a table view of the same days. */
export function createStatsPanel(root: HTMLElement, game: Game) {
  const el = document.createElement('div')
  el.className = 'smodal'
  el.innerHTML = `
    <div class="panel spanel" role="dialog" aria-label="Zoo statistics">
      <button class="close" title="Close (Esc)">×</button>
      <div class="shead"><h2>Zoo statistics</h2><button class="tbtn">Table view</button></div>
      <div class="tiles">
        <div class="tile"><span class="lbl">Funds</span><b data-t="money"></b></div>
        <div class="tile"><span class="lbl">Income today</span><b data-t="income"></b></div>
        <div class="tile"><span class="lbl">Guests today</span><b data-t="guests"></b></div>
        <div class="tile"><span class="lbl">Best day</span><b data-t="best"></b></div>
      </div>
      <div class="charts">
        <section class="card2"><header><h3>Funds</h3><span>over time</span></header><div class="plot" data-c="money"></div></section>
        <section class="card2"><header><h3>Zoo rating</h3><span>out of 100</span></header><div class="plot" data-c="rating"></div></section>
        <section class="card2"><header><h3>Guests per day</h3><span>last 14 days</span></header><div class="plot" data-c="guests"></div></section>
        <section class="card2"><header><h3>Income per day</h3><span>last 14 days</span></header><div class="plot" data-c="income"></div></section>
      </div>
      <div class="table" hidden></div>
    </div>`
  root.append(el)
  const panel = el.querySelector<HTMLElement>('.spanel')!
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!
  const tile = (k: string) => q(`[data-t="${k}"]`)
  const plot = (k: string) => q(`[data-c="${k}"]`)
  const table = q('.table')
  const charts = q('.charts')
  let open = false,
    key = '',
    showTable = false

  const setText = (e: HTMLElement, t: string) => {
    if (e.textContent !== t) e.textContent = t
  }
  function close() {
    open = false
    el.classList.remove('on')
  }
  function toggle(on = !open) {
    open = on
    el.classList.toggle('on', on)
    key = ''
    if (on) sound.click()
  }
  q('.close').onclick = close
  el.onpointerdown = (e) => {
    if (e.target === el) close()
  }
  q<HTMLButtonElement>('.tbtn').onclick = () => {
    showTable = !showTable
    q('.tbtn').textContent = showTable ? 'Chart view' : 'Table view'
    table.hidden = !showTable
    charts.hidden = showTable
    sound.click()
  }
  void panel

  function render() {
    const st = game.stats
    const days = st.days.slice(-14)
    const dayLabel = (p: Pt) => 'D' + p.x
    drawChart(
      plot('money'),
      st.samples.map((s) => ({ x: s.t, y: s.money, label: `Day ${Math.floor(s.t)}` })),
      { kind: 'line', color: '#3987e5', fmt: money, xLabel: (p) => 'D' + Math.round(p.x) },
    )
    drawChart(
      plot('rating'),
      st.samples.map((s) => ({ x: s.t, y: s.rating, label: `Day ${Math.floor(s.t)}` })),
      {
        kind: 'line',
        color: '#199e70',
        fmt: (n) => n + ' / 100',
        yMin: 0,
        yMax: 100,
        xLabel: (p) => 'D' + Math.floor(p.x),
      },
    )
    drawChart(
      plot('guests'),
      days.map((d) => ({ x: d.day, y: d.guests, label: `Day ${d.day}` })),
      { kind: 'bar', color: '#c98500', fmt: (n) => n + ' guests', xLabel: dayLabel },
    )
    drawChart(
      plot('income'),
      days.map((d) => ({ x: d.day, y: d.income, label: `Day ${d.day}` })),
      { kind: 'bar', color: '#d95926', fmt: money, xLabel: dayLabel },
    )
    // table view: the same days as text, so nothing depends on hovering
    const rows = [...st.days]
      .reverse()
      .map(
        (d) =>
          `<tr><td>Day ${d.day}</td><td>${d.guests}</td><td>${money(d.income)}</td><td>${money(d.money)}</td><td>${d.rating}</td></tr>`,
      )
      .join('')
    table.innerHTML = rows
      ? `<table><thead><tr><th>Day</th><th>Guests</th><th>Income</th><th>Funds at close</th><th>Rating</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<div class="empty">No finished days yet.</div>'
  }

  return {
    toggle,
    close,
    get open() {
      return open
    },
    update() {
      if (!open) return
      const st = game.stats
      setText(tile('money'), money(game.money))
      setText(tile('income'), money(st.todayIncome))
      setText(tile('guests'), String(st.todayGuests))
      const best = st.days.reduce((b, d) => (d.income > b.income ? d : b), { day: 0, income: 0 })
      setText(tile('best'), best.day ? `${money(best.income)} (D${best.day})` : 'n/a')
      const k = `${st.samples.length}:${st.samples[st.samples.length - 1]?.t}:${st.days.length}`
      if (k !== key) {
        key = k
        render()
      }
    },
  }
}
