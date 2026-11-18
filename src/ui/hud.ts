import { COSTS, KEEPER_COST, KEEPER_WAGE } from '../config'
import type { Game } from '../game'
import type { Animal } from '../entities/animal'
import { SPECIES } from '../data/species'

const svg = (b: string) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`
const ICON = {
  path: svg(
    '<rect x="5" y="8" width="17" height="12" rx="3"/><rect x="26" y="14" width="17" height="12" rx="3"/><rect x="9" y="29" width="17" height="12" rx="3"/>',
  ),
  pen: svg('<path d="M7 38V14M19 38V14M31 38V14M43 38V14M4 21h40M4 31h40"/>'),
  clear: svg('<path d="M9 13h30M18 13V8h12v5M13 13l2 27h18l2-27M20 21v13M28 21v13"/>'),
  feed: svg(
    '<path d="M24 17c-8-6-17 2-13 12 3 8 10 12 13 10 3 2 10-2 13-10 4-10-5-18-13-12z"/><path d="M24 17c0-5 3-8 7-9"/>',
  ),
  pause: svg('<path d="M17 11v26M31 11v26"/>'),
  paw: '<svg viewBox="0 0 48 48" fill="currentColor"><ellipse cx="24" cy="31" rx="10" ry="8"/><ellipse cx="11" cy="22" rx="4" ry="5.5"/><ellipse cx="20" cy="13" rx="4" ry="5.5"/><ellipse cx="30" cy="13" rx="4" ry="5.5"/><ellipse cx="38" cy="22" rx="4" ry="5.5"/></svg>',
}
const STAR =
  '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>'

const fmt = (n: number) => '$' + Math.floor(n).toLocaleString('en-US')
const set = (e: HTMLElement, t: string) => {
  if (e.textContent !== t) e.textContent = t
}

interface Item {
  id: string
  name: string
  price: number
  icon: string
  tip: string
  action?: () => void
}

export function createHud(
  game: Game,
  thumbs: Record<string, string>,
  act: { speed(n: number): void; save(): void; reset(): void },
) {
  const root = document.getElementById('ui')!
  root.innerHTML = `
    <div class="vignette"></div>
    <header class="topbar">
      <div class="panel brand"><div class="logo">${ICON.paw}</div><div><div class="title">Zoo Keeper</div><div class="sub" id="clock"></div></div></div>
      <div class="panel stats">
        <div class="stat"><span class="lbl">Funds</span><span class="val money" id="s-money"></span></div>
        <div class="stat"><span class="lbl">Guests</span><span class="val" id="s-guests"></span></div>
        <div class="stat"><span class="lbl">Animals</span><span class="val" id="s-animals"></span></div>
        <div class="stat"><span class="lbl">Keepers</span><span class="val" id="s-staff"></span></div>
        <div class="stat"><span class="lbl">Rating</span><span class="val stars" id="s-stars">${STAR.repeat(5)}</span></div>
      </div>
      <div class="panel controls">
        <button class="ico" data-speed="0" title="Pause (Space)">${ICON.pause}</button>
        <button data-speed="1" title="Normal speed (1)">1×</button>
        <button data-speed="2" title="Fast (2)">2×</button>
        <button data-speed="3" title="Faster (3)">3×</button>
        <span class="divider"></span>
        <button id="b-save">Save</button><button id="b-reset" class="danger">New game</button>
      </div>
    </header>
    <div id="toast"></div><div id="tip"></div><div id="hover"></div>
    <footer class="dock panel"><nav class="tabs"></nav><div class="items"></div></footer>
    <div class="hint" id="hint">Right-drag to orbit &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; WASD to pan &nbsp;·&nbsp; Space to pause</div>`
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!
  const clock = $('#clock'),
    money = $('#s-money'),
    guests = $('#s-guests'),
    animals = $('#s-animals'),
    staff = $('#s-staff')
  const stars = [...$('#s-stars').querySelectorAll('svg')]
  const toastEl = $('#toast'),
    tip = $('#tip'),
    hoverEl = $('#hover'),
    tabsEl = $('.tabs'),
    itemsEl = $('.items')

  let tool = 'path',
    tab = 'Build',
    speed = 1,
    lastMoney = Math.floor(game.money)

  const tabsDef: [string, Item[]][] = [
    [
      'Build',
      [
        {
          id: 'path',
          name: 'Path',
          price: COSTS.path,
          icon: ICON.path,
          tip: 'Guests walk on paths. Connect them to the gate. Click or drag to place.',
        },
        {
          id: 'pen',
          name: 'Enclosure',
          price: COSTS.pen,
          icon: ICON.pen,
          tip: 'Fenced ground for animals. Bigger pens keep animals happier.',
        },
        {
          id: 'clear',
          name: 'Clear',
          price: 0,
          icon: ICON.clear,
          tip: 'Remove paths and enclosures. Animals in a removed pen are sold at half price.',
        },
      ],
    ],
    [
      'Animals',
      SPECIES.map((s) => ({
        id: 'a:' + s.id,
        name: s.name,
        price: s.cost,
        icon: `<img src="${thumbs[s.id]}" alt="">`,
        tip: `Place inside an enclosure. Meals cost ${fmt(s.feedCost)}. Wants about ${s.space} tiles of space.`,
      })),
    ],
    [
      'Staff',
      [
        {
          id: 'feed',
          name: 'Feed',
          price: 0,
          icon: ICON.feed,
          tip: 'Click an animal to feed it by hand. Costs one meal.',
        },
        {
          id: 'hire',
          name: 'Keeper',
          price: KEEPER_COST,
          icon: `<img src="${thumbs.keeper}" alt="">`,
          tip: `Feeds the hungriest animals automatically. Wage ${fmt(KEEPER_WAGE)} per day.`,
          action: () => game.hireKeeper(),
        },
      ],
    ],
  ]

  function renderItems() {
    itemsEl.innerHTML = ''
    const items = tabsDef.find((t) => t[0] === tab)![1]
    for (const it of items) {
      const b = document.createElement('button')
      b.className = 'card'
      b.dataset.id = it.id
      b.innerHTML = `<div class="pic">${it.icon}</div><div class="nm">${it.name}</div><div class="pr">${it.price ? fmt(it.price) : 'Free'}</div>`
      b.onclick = () => {
        if (it.action) it.action()
        else {
          tool = it.id
          syncActive()
        }
      }
      b.onmouseenter = () => {
        const r = b.getBoundingClientRect()
        tip.innerHTML = `<b>${it.name}</b>${it.tip}`
        tip.style.left = r.left + r.width / 2 + 'px'
        tip.style.bottom = innerHeight - r.top + 10 + 'px'
        tip.classList.add('on')
      }
      b.onmouseleave = () => tip.classList.remove('on')
      itemsEl.append(b)
    }
    syncActive()
  }
  function syncActive() {
    itemsEl
      .querySelectorAll<HTMLElement>('.card')
      .forEach((c) => c.classList.toggle('active', c.dataset.id === tool))
    tabsEl.querySelectorAll('button').forEach((t) => t.classList.toggle('active', t.textContent === tab))
  }
  for (const [name] of tabsDef) {
    const b = document.createElement('button')
    b.textContent = name
    b.onclick = () => {
      tab = name
      renderItems()
    }
    tabsEl.append(b)
  }
  renderItems()

  root
    .querySelectorAll<HTMLElement>('[data-speed]')
    .forEach((b) => (b.onclick = () => act.speed(+b.dataset.speed!)))
  $('#b-save').onclick = () => {
    act.save()
    toast('Game saved')
  }
  $('#b-reset').onclick = () => {
    if (confirm('Start over? This deletes your save.')) act.reset()
  }

  let toastTimer = 0
  function toast(m: string) {
    toastEl.textContent = m
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 2800)
  }
  setTimeout(() => $('#hint').classList.add('fade'), 20000)

  const bar = (label: string, v: number, cls: string) =>
    `<div class="row"><span>${label}</span><div class="meter"><i class="${cls}" style="width:${Math.round(v)}%"></i></div></div>`

  return {
    get tool() {
      return tool
    },
    set tool(t: string) {
      tool = t
      syncActive()
    },
    toast,
    showAnimal(a: Animal | null, x: number, y: number) {
      if (!a) {
        hoverEl.classList.remove('on')
        return
      }
      hoverEl.innerHTML = `<b>${a.species.name}</b>${bar('Hunger', a.hunger, a.hunger > 60 ? 'bad' : 'warn')}${bar('Happiness', a.happiness, a.happiness < 40 ? 'bad' : 'good')}`
      hoverEl.style.left = x + 16 + 'px'
      hoverEl.style.top = y + 16 + 'px'
      hoverEl.classList.add('on')
    },
    update(spd: number) {
      speed = spd
      const hrs = Math.floor((game.time * 24 + 6) % 24),
        mins = Math.floor((game.time * 24 * 60) % 60)
      set(clock, `Day ${game.day}  ·  ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`)
      clock.dataset.night = game.isDay ? '0' : '1'
      const m = Math.floor(game.money)
      set(money, fmt(m))
      if (m !== lastMoney) {
        money.classList.remove('up', 'down')
        void money.offsetWidth
        money.classList.add(m > lastMoney ? 'up' : 'down')
        lastMoney = m
      }
      set(guests, String(game.visitors.length))
      set(animals, String(game.animals.length))
      set(staff, String(game.keepers.length))
      const r = game.rating / 20
      stars.forEach((s, i) => s.setAttribute('class', r >= i + 1 ? 'full' : r >= i + 0.5 ? 'half' : ''))
      root
        .querySelectorAll<HTMLElement>('[data-speed]')
        .forEach((b) => b.classList.toggle('active', +b.dataset.speed! === speed))
      itemsEl.querySelectorAll<HTMLElement>('.card').forEach((c) => {
        const it = tabsDef.flatMap((t) => t[1]).find((i) => i.id === c.dataset.id)!
        c.classList.toggle('poor', it.price > game.money)
      })
    },
  }
}
