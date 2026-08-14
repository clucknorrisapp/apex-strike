import { describe, it, expect } from 'vitest'
import { weekContracts, foldRun } from './contracts'

const WEEKS = ['2026-W01', '2026-W15', '2026-W33', '2026-W52']

describe('contracts: weekly selection', () => {
  it('always returns exactly 4 contracts', () => {
    for (const wk of WEEKS) expect(weekContracts(wk)).toHaveLength(4)
  })
  it('covers 4 distinct metrics', () => {
    for (const wk of WEEKS) {
      const metrics = weekContracts(wk).map((c) => c.metric)
      expect(new Set(metrics).size).toBe(4)
    }
  })
  it('is deterministic for a given week key', () => {
    expect(weekContracts('2026-W20').map((c) => c.id)).toEqual(weekContracts('2026-W20').map((c) => c.id))
  })
})

describe('contracts: foldRun payout', () => {
  it('pays each contract exactly once and the capstone once', () => {
    const wk = '2026-W10'
    const big = { kills: 5000, bosses: 100, win: 50, grazes: 5000 }
    const first = foldRun(wk, big)
    expect(first.completed).toHaveLength(4)   // all four cross their thresholds
    expect(first.capstone).toBe(true)         // capstone fires with the fourth
    expect(first.reward).toBeGreaterThan(0)

    const second = foldRun(wk, big)           // nothing left to pay
    expect(second.completed).toHaveLength(0)
    expect(second.reward).toBe(0)
    expect(second.capstone).toBe(false)
  })
  it('accumulates across runs (cumulative, not one run\'s peak)', () => {
    const wk = '2026-W11'
    const kc = weekContracts(wk).find((c) => c.metric === 'kills')!
    const half = Math.floor(kc.need / 2)
    const r1 = foldRun(wk, { kills: half, bosses: 0, win: 0, grazes: 0 })
    expect(r1.completed.find((c) => c.id === kc.id)).toBeUndefined()   // half is not enough yet
    const r2 = foldRun(wk, { kills: kc.need - half, bosses: 0, win: 0, grazes: 0 })
    expect(r2.completed.find((c) => c.id === kc.id)).toBeDefined()     // the two runs together cross it
  })
})
