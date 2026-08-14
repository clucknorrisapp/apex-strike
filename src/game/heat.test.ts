import { describe, it, expect } from 'vitest'
import { MAX_HEAT, heatMods, loadHeatUnlocked, noteCampaignClear, noteHeatClear } from './heat'

describe('heat: heatMods', () => {
  it('tier 0 is a neutral identity (the normal campaign)', () => {
    expect(heatMods(0)).toEqual({ tier: 0, name: '', hp: 1, spd: 1, elite: 1, pods: 1 })
  })
  it('clamps out-of-range tiers', () => {
    expect(heatMods(-5).tier).toBe(0)
    expect(heatMods(999).tier).toBe(MAX_HEAT)
    expect(heatMods(3.9).tier).toBe(3)   // floored
  })
  it('escalates HP/speed/elite and thins pods, never below the 0.5 floor', () => {
    const h8 = heatMods(MAX_HEAT)   // tier 8
    expect(h8.hp).toBeCloseTo(2.76)     // 1 + 8*0.22
    expect(h8.spd).toBeCloseTo(1.40)    // 1 + 8*0.05
    expect(h8.elite).toBeCloseTo(3.80)  // 1 + 8*0.35
    for (let t = 0; t <= MAX_HEAT; t++) expect(heatMods(t).pods).toBeGreaterThanOrEqual(0.5)
    // difficulty rises monotonically with tier
    for (let t = 1; t <= MAX_HEAT; t++) {
      expect(heatMods(t).hp).toBeGreaterThan(heatMods(t - 1).hp)
      expect(heatMods(t).pods).toBeLessThan(heatMods(t - 1).pods)
    }
  })
  it('names each active tier from the HEAT band', () => {
    expect(heatMods(1).name).toBe('HARDENED')
    expect(heatMods(MAX_HEAT).name).toBe('ASCENDANT')
  })
})

describe('heat: unlock ceiling', () => {
  it('starts locked at 0', () => {
    expect(loadHeatUnlocked()).toBe(0)
  })
  it('clearing tier N unlocks N+1 and never lowers', () => {
    expect(noteCampaignClear(0)).toEqual({ unlocked: 1, raised: true })    // base campaign → Heat 1
    expect(loadHeatUnlocked()).toBe(1)
    expect(noteCampaignClear(0)).toEqual({ unlocked: 1, raised: false })   // re-clear base, no raise
    expect(noteCampaignClear(2)).toEqual({ unlocked: 3, raised: true })    // clear Heat 2 → unlock 3
    expect(loadHeatUnlocked()).toBe(3)
    expect(noteCampaignClear(0)).toEqual({ unlocked: 3, raised: false })   // a lower clear never lowers it
  })
  it('caps at MAX_HEAT', () => {
    localStorage.setItem('apex_heat_unlocked', String(MAX_HEAT))
    expect(noteCampaignClear(MAX_HEAT)).toEqual({ unlocked: MAX_HEAT, raised: false })
    expect(loadHeatUnlocked()).toBe(MAX_HEAT)
  })
})

describe('heat: first-clear tracking (bitmask)', () => {
  it('returns true only on the first-ever clear of a tier', () => {
    localStorage.setItem('apex_heat_unlocked', '1')  // only the base campaign cleared so far
    expect(noteHeatClear(1)).toBe(true)   // first clear of Heat 1
    expect(noteHeatClear(1)).toBe(false)  // already cleared
  })
  it('ignores tier < 1', () => {
    expect(noteHeatClear(0)).toBe(false)
  })
  it('back-fills tiers below the unlock ceiling as already-cleared', () => {
    // The player has unlocked up to tier 5, so tiers 1..4 were necessarily cleared en route.
    localStorage.setItem('apex_heat_unlocked', '5')
    expect(noteHeatClear(3)).toBe(false)  // below the ceiling → back-filled, no double-pay
    expect(noteHeatClear(5)).toBe(true)   // the frontier tier pays once
    expect(noteHeatClear(5)).toBe(false)
  })
})
