import type { Game } from '../game'
import type { Visitor } from '../entities/people'

/** What a guest tells the zoo on their way out. `tags` name the complaints, so the panel can tally them. */
export interface Review {
  day: number
  score: number // 0..100
  text: string
  tags: string[]
}

interface Remark {
  text: string
  weight: number
  tag?: string // set on complaints
}

export function moodFace(score: number) {
  return score >= 80 ? '😍' : score >= 60 ? '🙂' : score >= 40 ? '😐' : score >= 20 ? '🙁' : '😠'
}

/**
 * Turn what a guest experienced into a short review. Happy guests lead with what they liked, unhappy ones
 * with what went wrong. Add new remarks here when new features (rides, shows...) should be reflected.
 */
export function writeReview(g: Game, v: Visitor): Review {
  const good: Remark[] = []
  const bad: Remark[] = []
  const fav = v.favorite
  const favName = g.animals.find((a) => a.species.id === fav)?.species.name

  if (v.waited > 25)
    bad.push({ text: 'Waited ages to get in', weight: v.waited / 10, tag: 'Long entrance queue' })
  if (v.complained.has('food')) bad.push({ text: 'Nowhere to buy food', weight: 4, tag: 'No food stand' })
  if (v.complained.has('restroom')) bad.push({ text: 'No restrooms!', weight: 4, tag: 'No restroom' })
  if (v.sawSad > 0)
    bad.push({ text: 'Some animals looked miserable', weight: 3 + v.sawSad, tag: 'Unhappy animals' })
  if (v.visited.size <= 1 && v.satisfaction < 70)
    bad.push({ text: 'Not much to see', weight: 3, tag: 'Too few animals' })
  if (v.visited.size >= 2 && v.scenery / v.visited.size < 1)
    bad.push({ text: 'Needs more trees and decorations', weight: 2, tag: 'Bare surroundings' })
  if (!favName && v.stops <= 0) bad.push({ text: `Wished there were ${favSpecies(v)}s`, weight: 1.5 })
  if (!v.shopped && !g.countProps('gift'))
    bad.push({ text: 'Wanted a gift shop', weight: 1.5, tag: 'No gift shop' })

  if (v.sawHappy > 0) good.push({ text: 'The animals looked so happy', weight: 3 + v.sawHappy })
  if ([...v.visited].some((a) => a.species.id === fav))
    good.push({ text: `Loved the ${favSpecies(v)}s`, weight: 4 })
  if (v.ateFood) good.push({ text: 'Tasty snacks', weight: 2 })
  if (v.shopped) good.push({ text: 'Great gift shop', weight: 2 })
  if (v.visited.size >= 4) good.push({ text: 'So much to see', weight: 2.5 })
  if (v.scenery / Math.max(1, v.visited.size) >= 2) good.push({ text: 'Beautiful grounds', weight: 2 })

  const pick = (list: Remark[]) => list.sort((a, b) => b.weight - a.weight).slice(0, 2)
  const score = Math.round(Math.max(0, Math.min(100, v.satisfaction)))
  const lead = score >= 55 ? good : bad
  const rest = score >= 55 ? bad : good
  // very happy or very unhappy guests stick to one side; everyone else gives one good point and one gripe
  let chosen = score >= 85 || score < 25 ? pick(lead) : [...pick(lead).slice(0, 1), ...pick(rest).slice(0, 1)]
  if (!chosen.length) chosen = pick(rest).slice(0, 1)
  const text = chosen.length ? chosen.map((r) => r.text).join('. ') : score >= 55 ? 'Nice day out' : 'Meh'
  return { day: g.day, score, text, tags: bad.filter((r) => r.tag).map((r) => r.tag!) }
}

function favSpecies(v: Visitor) {
  const id = v.favorite
  return id[0].toUpperCase() + id.slice(1)
}
