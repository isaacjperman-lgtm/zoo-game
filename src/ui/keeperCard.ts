import type { Game } from '../game'
import type { Keeper } from '../entities/people'
import { KEEPER_UPGRADES, type UpgradeKind } from '../config'
import { sound } from './sound'

const PHASE: Record<Keeper['phase'], string> = {
  idle: 'Waiting for a hungry animal',
  walk: 'Heading to a pen',
  enter: 'Going in through the gate',
  feed: 'Feeding',
  exit: 'Heading back out',
}

/** The card shown when you right-click a keeper: stats, upgrades to buy, and dismissal. */
export function createKeeperCard(root: HTMLElement, game: Game, fmt: (n: number) => string) {
  const kinds = Object.keys(KEEPER_UPGRADES) as UpgradeKind[]
  const card = document.createElement('aside')
  card.className = 'panel acard kcard'
  card.innerHTML = `
    <button class="close" title="Close (Esc)">×</button>
    <input class="name" maxlength="20" spellcheck="false" aria-label="Keeper name" />
    <div class="status"><span class="st"></span></div>
    <dl class="facts"><dt>Wage per day</dt><dd data-f="wage"></dd><dt>Animals fed</dt><dd data-f="fed"></dd><dt>Walking speed</dt><dd data-f="speed"></dd><dt>Feeds at hunger</dt><dd data-f="at"></dd></dl>
    <div class="lbl ups-title">Upgrades</div>
    ${kinds
      .map(
        (k) =>
          `<div class="up" data-k="${k}"><div><b>${KEEPER_UPGRADES[k].name}</b><div class="status">${KEEPER_UPGRADES[k].blurb}</div><div class="pips"></div></div><button class="upbtn"></button></div>`,
      )
      .join('')}
    <button class="sellbtn dismiss"></button>`
  root.append(card)
  const q = <T extends HTMLElement>(s: string) => card.querySelector<T>(s)!
  const name = q<HTMLInputElement>('.name')
  const dismiss = q<HTMLButtonElement>('.dismiss')
  let current: Keeper | null = null
  let armed = 0
  const setText = (e: HTMLElement, t: string) => {
    if (e.textContent !== t) e.textContent = t
  }

  function hide() {
    current = null
    card.classList.remove('on')
  }
  name.oninput = () => current && (current.name = name.value)
  name.onblur = () => {
    if (!current) return
    current.name = name.value.trim() || 'Keeper'
    name.value = current.name
  }
  name.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Escape') name.blur()
  }
  q('.close').onclick = hide
  card.querySelectorAll<HTMLButtonElement>('.upbtn').forEach((b) => {
    b.onclick = () =>
      current && game.upgradeKeeper(current, (b.closest('.up') as HTMLElement).dataset.k as UpgradeKind)
  })
  dismiss.onclick = () => {
    if (!current) return
    if (Date.now() < armed) {
      game.dismissKeeper(current)
      hide()
    } else armed = Date.now() + 3000
  }

  return {
    get current() {
      return current
    },
    show(k: Keeper) {
      current = k
      armed = 0
      name.value = k.name
      card.classList.add('on')
      sound.click()
    },
    hide,
    update() {
      const k = current
      if (!k) return
      if (!game.keepers.includes(k)) return hide() // dismissed or otherwise gone
      setText(q('.st'), `Keeper · ${PHASE[k.phase]}`)
      setText(q('[data-f="wage"]'), fmt(k.wage))
      setText(q('[data-f="fed"]'), String(k.fed))
      setText(q('[data-f="speed"]'), `${Math.round((k.speed / 2.2) * 100)}%`)
      setText(q('[data-f="at"]'), `${k.feedAt}%`)
      for (const kind of kinds) {
        const row = q(`.up[data-k="${kind}"]`)
        const lvl = k.levels[kind],
          max = KEEPER_UPGRADES[kind].max
        setText(row.querySelector<HTMLElement>('.pips')!, '●'.repeat(lvl) + '○'.repeat(max - lvl))
        const cost = game.upgradeCost(k, kind)
        const b = row.querySelector<HTMLButtonElement>('.upbtn')!
        setText(b, cost === null ? 'Maxed' : fmt(cost))
        b.disabled = cost === null
        b.classList.toggle('poor', cost !== null && cost > game.money)
      }
      const on = Date.now() < armed
      setText(dismiss, on ? `Click again to dismiss ${k.name}` : `Dismiss ${k.name}`)
      dismiss.classList.toggle('armed', on)
    },
  }
}
