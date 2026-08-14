import { describe, it, expect } from 'vitest'
import {
  DAILY_MODS, modForDay, dividendFor, noteDailyPlayed, getDailyStreak,
  claimDailyDividend, pendingDividend, claimCampaignDaily, DEPLOY_BONUS,
} from './daily'

describe('daily: modForDay is deterministic + in-pool', () => {
  it('gives the same modifier for the same day (shared by everyone)', () => {
    expect(modForDay('2026-08-14')).toBe(modForDay('2026-08-14'))
  })
  it('always returns a modifier from the pool', () => {
    for (let d = 1; d <= 31; d++) {
      const key = '2026-08-' + String(d).padStart(2, '0')
      expect(DAILY_MODS).toContain(modForDay(key))
    }
  })
  it('spreads across more than one modifier over time', () => {
    const seen = new Set<string>()
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= 28; d++)
        seen.add(modForDay('2026-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')).id)
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('daily: dividendFor', () => {
  it('is 2 + streak, floored at 2 and capped at 12', () => {
    expect(dividendFor(0)).toBe(2)
    expect(dividendFor(-3)).toBe(2)
    expect(dividendFor(1)).toBe(3)
    expect(dividendFor(10)).toBe(12)
    expect(dividendFor(999)).toBe(12)
  })
})

describe('daily: streak state machine', () => {
  it('first play sets the streak to 1', () => {
    expect(noteDailyPlayed().streak).toBe(1)
    expect(getDailyStreak()).toEqual({ streak: 1, playedToday: true })
  })
  it('is idempotent within the same UTC day', () => {
    noteDailyPlayed()
    expect(noteDailyPlayed().streak).toBe(1)   // still 1, not double-counted
  })
})

describe('daily: dividend + deployment idempotency', () => {
  it('pays the RESUPPLY dividend once per day', () => {
    noteDailyPlayed()
    expect(claimDailyDividend()).toBeGreaterThan(0)
    expect(claimDailyDividend()).toBe(0)   // already claimed today
  })
  it('pendingDividend reads 0 after the day is claimed', () => {
    noteDailyPlayed()
    claimDailyDividend()
    expect(pendingDividend()).toBe(0)
  })
  it('campaign DEPLOYMENT pays its flat bonus once per day', () => {
    expect(claimCampaignDaily()).toBe(DEPLOY_BONUS)
    expect(claimCampaignDaily()).toBe(0)
  })
})
