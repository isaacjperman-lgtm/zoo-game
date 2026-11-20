import { moodFace } from '../ai/reviews'
import { ADULT_AGE, COSTS, KEEPER_COST, KEEPER_WAGE, TREAT_COST, type PriceKind } from '../config'
import type { Game } from '../game'
import type { Animal } from '../entities/animal'
import { SPECIES } from '../data/species'
import { BUILDINGS } from '../data/buildings'
import { sound } from './sound'
import { Keeper } from '../entities/people'
import { createStatsPanel } from './statsPanel'
import { createKeeperCard } from './keeperCard'

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const fmt = (n: number) => '$' + Math.floor(n).toLocaleString('en-US')
const set0 = (e: HTMLInputElement, v: string) => {
  if (e.value !== v) e.value = v
}
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
  act: {
    speed(n: number): void
    save(): void
    reset(): void
    rename(name: string): void
    photo(): void
  },
) {
  const root = document.getElementById('ui')!
  root.innerHTML = `
    <div class="vignette"></div>
    <header class="topbar">
      <div class="panel brand"><div class="logo">${ICON.paw}</div><div><input class="title zname" id="zname" maxlength="28" spellcheck="false" title="Click to rename your zoo" /><div class="sub" id="clock"></div></div></div>
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
        <button id="b-sound" title="Sound effects"></button>
        <button id="b-photo" title="Save a photo of your zoo (P)">Photo</button>
        <button id="b-stats" title="Charts of funds, rating, guests and income">Stats</button>
        <button id="b-prices" title="Set ticket, food and gift shop prices">Prices</button>
        <button id="b-reviews" title="What guests think of the zoo">Reviews</button>
        <button id="b-save">Save</button><button id="b-reset" class="danger">New game</button>
      </div>
    </header>
    <div class="panel goal" id="goal"><div class="lbl">Goal</div><div class="g-text" id="g-text"></div><div class="meter"><i id="g-bar"></i></div><div class="g-rw" id="g-rw"></div></div>
    <div id="toast"></div><div id="tip"></div><div id="hover"></div>
    <footer class="dock panel"><nav class="tabs"></nav><div class="items"></div></footer>
    <div class="hint" id="hint">Right-drag to orbit &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; WASD to pan &nbsp;·&nbsp; Space to pause &nbsp;·&nbsp; Right-click an animal to inspect it</div>`
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

  const card = document.createElement('aside')
  card.className = 'panel acard'
  card.id = 'acard'
  card.innerHTML = `
    <button class="close" title="Close (Esc)">×</button>
    <input class="name" maxlength="20" spellcheck="false" aria-label="Animal name" />
    <div class="status"><span class="sp"></span> · <span class="st"></span></div>
    <div class="bars"></div>
    <dl class="facts"></dl>
    <div class="issues"></div>
    <div class="breed"><div class="lbl">Breeding</div><div class="bmsg"></div><button class="feedbtn breedbtn"></button></div>
    <button class="feedbtn"></button>
    <button class="feedbtn treatbtn"></button>
    <button class="sellbtn"></button>`
  root.append(card)
  const cardName = card.querySelector<HTMLInputElement>('.name')!
  const cardBars = card.querySelector<HTMLElement>('.bars')!
  const cardFacts = card.querySelector<HTMLElement>('.facts')!
  const cardIssues = card.querySelector<HTMLElement>('.issues')!
  const cardFeed = card.querySelector<HTMLButtonElement>('.feedbtn:not(.treatbtn):not(.breedbtn)')!
  const cardBreed = card.querySelector<HTMLButtonElement>('.breedbtn')!
  const cardBreedMsg = card.querySelector<HTMLElement>('.bmsg')!
  const cardTreat = card.querySelector<HTMLButtonElement>('.treatbtn')!
  const cardSell = card.querySelector<HTMLButtonElement>('.sellbtn')!
  // ---- guest feedback panel ----
  const rpanel = document.createElement('aside')
  rpanel.className = 'panel rpanel'
  rpanel.innerHTML = `<button class="close" title="Close">×</button><div class="rhead"></div><div class="tags"></div><div class="rlist"></div>`
  root.append(rpanel)
  const rHead = rpanel.querySelector<HTMLElement>('.rhead')!
  const rTags = rpanel.querySelector<HTMLElement>('.tags')!
  const rList = rpanel.querySelector<HTMLElement>('.rlist')!
  let shownKey = ''
  const toggleReviews = (on = !rpanel.classList.contains('on')) => {
    rpanel.classList.toggle('on', on)
    shownKey = ''
  }
  rpanel.querySelector<HTMLElement>('.close')!.onclick = () => toggleReviews(false)
  function renderReviews() {
    const rs = game.reviews
    const last = rs[rs.length - 1]
    const key = rs.length + ':' + (last?.text ?? '') + ':' + Math.round(game.guestMood)
    if (!rpanel.classList.contains('on') || key === shownKey) return
    shownKey = key
    const mood = Math.round(game.guestMood)
    rHead.innerHTML = `<span class="face">${moodFace(mood)}</span><div><b>Guest opinion: ${mood}%</b><div class="status">${rs.length ? `Based on the last ${rs.length} guest${rs.length === 1 ? '' : 's'}` : 'No guests have left yet'}</div></div>`
    const tally = new Map<string, number>()
    for (const r of rs) for (const t of r.tags) tally.set(t, (tally.get(t) ?? 0) + 1)
    const top = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4)
    rTags.innerHTML = top.length
      ? `<div class="lbl">Top complaints</div>` +
        top.map(([t, n]) => `<span class="chip">${esc(t)} <b>×${n}</b></span>`).join('')
      : rs.length
        ? '<div class="lbl">No common complaints. Nice work!</div>'
        : ''
    rList.innerHTML = [...rs]
      .reverse()
      .slice(0, 14)
      .map(
        (r) =>
          `<div class="rev"><span class="face">${moodFace(r.score)}</span><div><div class="rtext">“${esc(r.text)}”</div><div class="status">Day ${r.day} · ${r.score}% happy${r.who === 'school' ? ' · 🎒 School trip' : r.who === 'critic' ? ' · 🧐 Critic' : ''}</div></div></div>`,
      )
      .join('')
  }
  $('#b-reviews').onclick = () => {
    sound.click()
    togglePrices(false)
    toggleReviews()
  }

  // ---- prices panel ----
  const ppanel = document.createElement('aside')
  ppanel.className = 'panel rpanel ppanel'
  const kinds = [
    ['ticket', 'Ticket', 'Charged when a guest reaches the booth'],
    ['food', 'Food stand', 'Charged per snack'],
    ['gift', 'Gift shop', 'Charged per souvenir'],
    ['icecream', 'Ice cream', 'Charged per cone'],
    ['show', 'Show ticket', 'Charged per guest at each show'],
  ] as const
  ppanel.innerHTML =
    `<button class="close" title="Close">×</button><div class="rhead"><span class="face">💰</span><div><b>Prices</b><div class="status">Click − / + (Shift for ±5)</div></div></div>` +
    kinds
      .map(
        ([k, n, tip]) =>
          `<div class="prow" data-k="${k}" title="${tip}"><span class="pn">${n}</span><button data-d="-1">−</button><b class="pv"></b><button data-d="1">+</button><div class="pf"></div></div>`,
      )
      .join('')
  root.append(ppanel)
  const togglePrices = (on = !ppanel.classList.contains('on')) => ppanel.classList.toggle('on', on)
  ppanel.querySelector<HTMLElement>('.close')!.onclick = () => togglePrices(false)
  ppanel.querySelectorAll<HTMLButtonElement>('.prow button').forEach((b) => {
    b.onclick = (e) => {
      const k = (b.parentElement as HTMLElement).dataset.k as PriceKind
      game.setPrice(k, game.price[k] + +b.dataset.d! * (e.shiftKey ? 5 : 1))
      sound.click()
    }
  })
  function updatePrices() {
    if (!ppanel.classList.contains('on')) return
    const fair = game.fair
    for (const row of ppanel.querySelectorAll<HTMLElement>('.prow')) {
      const k = row.dataset.k as PriceKind
      const price = game.price[k]
      set(row.querySelector<HTMLElement>('.pv')!, fmt(price))
      const f = fair[k]
      const verdict = price > f * 1.4 ? 'Too dear' : price < f * 0.75 ? 'Bargain' : 'Fair'
      const pf = row.querySelector<HTMLElement>('.pf')!
      set(pf, `Guests expect about ${fmt(f)} · ${verdict}`)
      pf.dataset.v = verdict
    }
    const dem = Math.round(game.demand * 100)
    set(ppanel.querySelector<HTMLElement>('.pdemand')!, `Visitor turnout at this ticket price: ${dem}%`)
  }
  ppanel.insertAdjacentHTML('beforeend', '<div class="status pdemand"></div>')
  $('#b-prices').onclick = () => {
    sound.click()
    toggleReviews(false)
    togglePrices()
  }

  // ---- zoo name ----
  const zname = $<HTMLInputElement>('#zname')
  zname.value = game.zooName
  zname.onchange = () => {
    game.zooName = zname.value.trim() || 'Zoo Keeper'
    zname.value = game.zooName
    act.rename(game.zooName)
  }
  zname.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Escape') zname.blur()
  }
  const NAME_A = [
    'Sunny',
    'Maple',
    'Riverbend',
    'Willow',
    'Golden',
    'Little',
    'Clover',
    'Evergreen',
    'Bramble',
    'Harbor',
  ]
  const NAME_B = ['Acres', 'Hollow', 'Valley', 'Meadow', 'Ridge', 'Park', 'Grove', 'Bay']
  const randomName = () =>
    `${NAME_A[(Math.random() * NAME_A.length) | 0]} ${NAME_B[(Math.random() * NAME_B.length) | 0]} Zoo`
  /** The opening screen of a new game: name the zoo, then open the gates. The simulation waits until then. */
  function showTitle() {
    act.speed(0)
    const t = document.createElement('div')
    t.className = 'title-screen'
    t.innerHTML = `<div class="tcard panel"><div class="logo big">${ICON.paw}</div><h1>Zoo Keeper</h1><p>Build paths and enclosures, welcome animals and guests, and keep everyone happy.</p><label for="tname">Name your zoo</label><div class="trow"><input id="tname" maxlength="28" spellcheck="false" /><button class="dice" title="Suggest a name">🎲</button></div><button class="start">Open the gates</button></div>`
    root.append(t)
    const input = t.querySelector<HTMLInputElement>('#tname')!
    input.value = randomName()
    t.querySelector<HTMLElement>('.dice')!.onclick = () => {
      input.value = randomName()
      sound.click()
    }
    const start = () => {
      game.zooName = input.value.trim() || randomName()
      zname.value = game.zooName
      act.rename(game.zooName)
      sound.click()
      t.classList.add('out')
      setTimeout(() => t.remove(), 500)
      act.speed(1)
    }
    t.querySelector<HTMLElement>('.start')!.onclick = start
    input.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') start()
    }
    input.focus()
    input.select()
  }

  const stats = createStatsPanel(root, game)
  $('#b-photo').onclick = () => act.photo()
  $('#b-stats').onclick = () => {
    togglePrices(false)
    toggleReviews(false)
    stats.toggle()
  }
  const kcard = createKeeperCard(root, game, fmt)

  let selected: Animal | null = null
  let sellArmed = 0 // timestamp until which the next click on Sell confirms
  /** Select an animal or keeper (right-click), or pass null to let go. Only one card shows at a time. */
  function select(e: Animal | Keeper | null) {
    if (e instanceof Keeper) {
      selectAnimal(null, true)
      kcard.show(e)
      return
    }
    kcard.hide()
    selectAnimal(e)
  }
  function selectAnimal(a: Animal | null, quiet = false) {
    selected = a
    sellArmed = 0
    card.classList.toggle('on', !!a)
    if (!a) return
    cardName.value = a.name
    card.querySelector('.sp')!.textContent = a.species.name
    cardBars.innerHTML = bar('Hunger', 0, 'warn') + bar('Happiness', 0, 'good')
    cardFacts.innerHTML = ['Pen', 'Herd', 'With us', 'Life stage', 'Meal cost']
      .map((l) => `<dt>${l}</dt><dd></dd>`)
      .join('')
    if (!quiet) sound.click()
  }
  cardName.oninput = () => selected && (selected.name = cardName.value)
  cardName.onblur = () => {
    if (!selected) return
    selected.name = cardName.value.trim() || selected.species.name
    cardName.value = selected.name
  }
  cardName.onkeydown = (e) => {
    e.stopPropagation() // typing a name must not trigger camera or speed hotkeys
    if (e.key === 'Enter' || e.key === 'Escape') cardName.blur()
  }
  card.querySelector<HTMLElement>('.close')!.onclick = () => select(null)
  cardFeed.onclick = () => selected && game.feed(selected)
  cardTreat.onclick = () => selected && game.treat(selected, true)
  cardBreed.onclick = () => {
    if (!selected) return
    if (selected.breedOrder) game.cancelBreeding(selected)
    else game.orderBreeding(selected)
  }
  cardSell.onclick = () => {
    if (!selected) return
    if (Date.now() < sellArmed) {
      game.sellAnimal(selected) // the card closes itself on the next update
      sellArmed = 0
    } else sellArmed = Date.now() + 3000
  }
  function updateCard(a: Animal) {
    const reg = game.region(a.tx, a.ty)
    const mates = game.animals.filter((o) => reg.some((r) => r[0] === o.tx && r[1] === o.ty))
    const same = mates.filter((o) => o.species === a.species).length
    set(
      card.querySelector<HTMLElement>('.st')!,
      a.status[0].toUpperCase() + a.status.slice(1) + (a.isBaby ? ' · Baby' : '') + (a.sick ? ' · Sick' : ''),
    )
    const fills = cardBars.querySelectorAll<HTMLElement>('i')
    const setBar = (i: HTMLElement, v: number, cls: string) => {
      i.className = cls
      i.style.width = Math.round(v) + '%'
    }
    setBar(fills[0], a.hunger, a.hunger > 60 ? 'bad' : 'warn')
    setBar(fills[1], a.happiness, a.happiness < 40 ? 'bad' : 'good')
    const dd = cardFacts.querySelectorAll('dd')
    const days = Math.max(0, game.day - a.arrived)
    set(dd[0] as HTMLElement, `${reg.length} tiles (wants ${a.species.space * same})`)
    set(
      dd[1] as HTMLElement,
      `${same} ${a.species.name.toLowerCase()}${same === 1 ? '' : 's'}, ${mates.length} in pen`,
    )
    set(dd[2] as HTMLElement, days === 0 ? 'Arrived today' : `${days} day${days === 1 ? '' : 's'}`)
    set(
      dd[3] as HTMLElement,
      a.isBaby ? `Baby (grows up in ${Math.ceil(((ADULT_AGE - a.age) / 150) * 10) / 10} days)` : 'Adult',
    )
    set(dd[4] as HTMLElement, fmt(a.species.feedCost))
    // breeding: the player orders it, and a keeper on Breeding duty carries it out
    const why = game.breedBlocker(a)
    const fee = fmt(game.breedFee(a))
    cardBreed.style.display = a.pregnantT > 0 || a.isBaby ? 'none' : ''
    if (a.pregnantT > 0)
      set(cardBreedMsg, `Expecting a baby. Due in about ${Math.ceil(a.pregnantT)} seconds.`)
    else if (a.breedOrder)
      set(
        cardBreedMsg,
        game.hasBreeder
          ? 'A keeper on Breeding duty will pair them up soon.'
          : 'No keeper is on Breeding duty. Right-click a keeper and set their duty.',
      )
    else if (why) set(cardBreedMsg, why + '.')
    else set(cardBreedMsg, `Ready. Fee ${fee}, due about ${game.gestationTime(a)} seconds after pairing.`)
    set(cardBreed, a.breedOrder ? 'Cancel breeding order' : `Breed ${a.name} (${fee})`)
    cardBreed.disabled = !a.breedOrder && !!why
    cardTreat.style.display = a.sick ? '' : 'none'
    set(cardTreat, `Treat ${a.name} (${fmt(TREAT_COST)})`)
    set(cardIssues, a.issues.join(' · '))
    cardIssues.style.display = a.issues.length ? '' : 'none'
    set(cardFeed, a.hunger > 5 ? `Feed ${a.name} (${fmt(a.species.feedCost)})` : `${a.name} is full`)
    cardFeed.disabled = a.hunger <= 5
    const sale = fmt(game.sellValue(a))
    const armed = Date.now() < sellArmed
    set(cardSell, armed ? `Click again to sell for ${sale}` : `Sell for ${sale}`)
    cardSell.classList.toggle('armed', armed)
  }

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
          tip: 'Fenced ground for animals. Bigger pens keep animals happier. A gate appears where it meets a path.',
        },
        {
          id: 'clear',
          name: 'Clear',
          price: 0,
          icon: ICON.clear,
          tip: 'Remove paths, enclosures and buildings (half refund). Animals in a removed pen are sold at half price.',
        },
      ],
    ],
    ...(['service', 'decor'] as const).map((kind): [string, Item[]] => [
      kind === 'service' ? 'Facilities' : 'Decor',
      BUILDINGS.filter((b) => b.kind === kind).map((b) => ({
        id: 'b:' + b.id,
        name: b.name,
        price: b.cost,
        icon: `<img src="${thumbs[b.id]}" alt="">`,
        tip: b.tip,
      })),
    ]),
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
        sound.click()
        // Buttons that act immediately (like hiring) also deselect the current tool,
        // so the next click on the map doesn't accidentally build something.
        if (it.action) it.action()
        tool = it.action ? '' : it.id
        syncActive()
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
  const soundBtn = $('#b-sound')
  const syncSound = () => (soundBtn.textContent = sound.muted ? 'Sound off' : 'Sound on')
  syncSound()
  soundBtn.onclick = () => {
    sound.toggle()
    syncSound()
    sound.click()
  }
  const goalText = $('#g-text'),
    goalBar = $('#g-bar'),
    goalRw = $('#g-rw'),
    goalEl = $('#goal')
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
    showTitle,
    get selected() {
      return selected
    },
    select,
    /** What the camera should follow: the selected animal or keeper. */
    get focus() {
      if (selected) return { group: selected.group, size: selected.species.size, neck: selected.species.neck }
      if (kcard.current) return { group: kcard.current.group, size: 0.4, neck: 0 }
      return null
    },
    /** Esc: close the stats screen if it's open, otherwise let go of the selection. */
    escape() {
      if (stats.open) stats.close()
      else select(null)
    },
    /** A "+$" that rises from a screen position and fades out. */
    floatText(x: number, y: number, text: string) {
      const f = document.createElement('div')
      f.className = 'float'
      f.textContent = text
      f.style.left = x + 'px'
      f.style.top = y + 'px'
      f.onanimationend = () => f.remove()
      root.append(f)
    },
    showAnimal(a: Animal | null, x: number, y: number) {
      if (!a) {
        hoverEl.classList.remove('on')
        return
      }
      hoverEl.innerHTML = `<b>${esc(a.name)}</b><div class="status">${a.species.name} · ${a.status[0].toUpperCase() + a.status.slice(1)}</div>${bar('Hunger', a.hunger, a.hunger > 60 ? 'bad' : 'warn')}${bar('Happiness', a.happiness, a.happiness < 40 ? 'bad' : 'good')}${a.issues.length ? `<div class="issues">${a.issues.join(' · ')}</div>` : ''}`
      hoverEl.style.left = x + 16 + 'px'
      hoverEl.style.top = y + 16 + 'px'
      hoverEl.classList.add('on')
    },
    update(spd: number) {
      speed = spd
      if (selected && !game.animals.includes(selected)) select(null) // sold or lost its pen
      if (selected) updateCard(selected)
      renderReviews()
      stats.update()
      kcard.update()
      updatePrices()
      if (document.activeElement !== zname) set0(zname, game.zooName)
      const cg = game.currentGoal
      goalEl.style.display = cg ? '' : 'none'
      if (cg) {
        set(goalText, cg.goal.text)
        const pct = Math.min(100, (cg.value / cg.target) * 100) + '%'
        if (goalBar.style.width !== pct) goalBar.style.width = pct
        set(goalRw, `${Math.min(cg.value, cg.target)} / ${cg.target}  ·  Reward ${fmt(cg.goal.reward)}`)
      }
      const hrs = Math.floor((game.time * 24 + 6) % 24),
        mins = Math.floor((game.time * 24 * 60) % 60)
      const wIcon = { sunny: '☀️', cloudy: '⛅', rain: '🌧️' }[game.weather]
      set(
        clock,
        `Day ${game.day}  ·  ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}  ·  ${wIcon}`,
      )
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
