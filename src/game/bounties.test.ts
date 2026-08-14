import { describe, it, expect } from 'vitest'
import { todayBounties, evalBounties, bountyDoneCount, isBountyDone } from './bounties'

const DAYS = ['2026-08-14', '2026-01-01', '2026-12-31', '2026-06-15']

describe('bounties: daily selection', () => {
  it('returns exactly 3 bounties', () => {
    for (const d of DAYS) expect(todayBounties(d)).toHaveLength(3)
  })
  it('covers 3 distinct metrics', () => {
    for (const d of DAYS) {
      const metrics = todayBounties(d).map((b) => b.metric)
      expect(new Set(metrics).size).toBe(3)
    }
  })
  it('is deterministic for a given day', () => {
    expect(todayBounties('2026-08-14').map((b) => b.id)).toEqual(todayBounties('2026-08-14').map((b) => b.id))
  })
})

describe('bounties: evalBounties payout', () => {
  const day = '2026-08-14'

  it('pays every met bounty once, then nothing on re-eval', () => {
    const bs = todayBounties(day)
    const maxStat = { kills: 999, bosses: 99, maxCombo: 999, sector: 12 }
    const first = evalBounties(day, maxStat)
    expect(first.newly).toHaveLength(3)
    expect(first.reward).toBe(bs.reduce((s, b) => s + b.reward, 0))
    expect(bountyDoneCount(day)).toBe(3)
    expect(bs.every((b) => isBountyDone(day, b.id))).toBe(true)

    const second = evalBounties(day, maxStat)   // idempotent — already claimed
    expect(second.newly).toHaveLength(0)
    expect(second.reward).toBe(0)
  })

  it('pays nothing for a run that meets no threshold', () => {
    const r = evalBounties(day, { kills: 0, bosses: 0, maxCombo: 0, sector: 1 })
    expect(r.newly).toHaveLength(0)   // pool minimums are k40/b2/c12/s3 — none met
  })

  it('maps a metric to the right run stat (only the matching bounty fires)', () => {
    const b0 = todayBounties(day)[0]
    const stat = { kills: 0, bosses: 0, maxCombo: 0, sector: 1 }
    if (b0.metric === 'kills') stat.kills = b0.need
    else if (b0.metric === 'bosses') stat.bosses = b0.need
    else if (b0.metric === 'combo') stat.maxCombo = b0.need
    else stat.sector = b0.need
    const r = evalBounties(day, stat)
    expect(r.newly.map((b) => b.id)).toEqual([b0.id])   // distinct metrics → only b0 qualifies
  })
})
