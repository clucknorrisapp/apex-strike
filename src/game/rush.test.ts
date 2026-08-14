import { describe, it, expect } from 'vitest'
import { RUSH_BOSSES, weekKey, bossOrderForWeek, loadTrialsBest, saveTrialsBest } from './rush'

describe('rush: weekKey (ISO week, UTC)', () => {
  it('formats YYYY-Www', () => {
    expect(weekKey(new Date(Date.UTC(2026, 7, 14)))).toMatch(/^\d{4}-W\d{2}$/)
  })
  it('is stable across days within one ISO week and differs across weeks', () => {
    const monday = weekKey(new Date(Date.UTC(2026, 0, 5)))   // Mon 2026-01-05
    const sunday = weekKey(new Date(Date.UTC(2026, 0, 11)))  // Sun 2026-01-11 (same ISO week)
    const nextWk = weekKey(new Date(Date.UTC(2026, 0, 12)))  // Mon 2026-01-12 (next ISO week)
    expect(monday).toBe(sunday)
    expect(nextWk).not.toBe(monday)
  })
})

describe('rush: bossOrderForWeek', () => {
  it('is a full permutation of the 7 bosses', () => {
    const order = bossOrderForWeek('2026-W20')
    expect(order).toHaveLength(RUSH_BOSSES.length)
    expect([...order].sort()).toEqual([...RUSH_BOSSES].sort())   // same set, no drops/dupes
  })
  it('is deterministic for a given week key', () => {
    expect(bossOrderForWeek('2026-W20')).toEqual(bossOrderForWeek('2026-W20'))
  })
  it('varies the order across weeks', () => {
    const a = bossOrderForWeek('2026-W01').join(',')
    const others = ['2026-W02', '2026-W03', '2026-W04', '2026-W05'].map((k) => bossOrderForWeek(k).join(','))
    expect(others.some((o) => o !== a)).toBe(true)
  })
})

describe('rush: local best', () => {
  it('keeps only a strictly greater score', () => {
    expect(saveTrialsBest(1000)).toEqual({ best: 1000, record: true, prevBest: 0 })
    expect(saveTrialsBest(800)).toEqual({ best: 1000, record: false, prevBest: 1000 })
    expect(saveTrialsBest(1000)).toEqual({ best: 1000, record: false, prevBest: 1000 })  // tie is not a record
    expect(saveTrialsBest(1500)).toEqual({ best: 1500, record: true, prevBest: 1000 })
    expect(loadTrialsBest()).toBe(1500)
  })
})
