import { describe, it, expect } from 'vitest'
import {
  STEP, cumulativeCost, rankForEnlisted, toNextRank, rankTitle, rankBadge,
  prestigeGlyph, rankBandColor, loadRank, saveRank, enlist,
} from './rank'
import { loadMeta, saveMeta } from './meta'

const noUp = { vitality: 0, reserves: 0, firepower: 0, boots: 0, dash: 0 }

describe('rank: cumulativeCost (triangular curve)', () => {
  it('is 0 at or below rank 0', () => {
    expect(cumulativeCost(0)).toBe(0)
    expect(cumulativeCost(-3)).toBe(0)
  })
  it('matches STEP * R*(R+1)/2', () => {
    expect(cumulativeCost(1)).toBe(STEP)          // 25
    expect(cumulativeCost(2)).toBe(STEP * 3)      // 75
    expect(cumulativeCost(3)).toBe(STEP * 6)      // 150
    expect(cumulativeCost(10)).toBe(STEP * 55)    // 1375
  })
  it('is strictly increasing', () => {
    for (let r = 1; r <= 500; r++) expect(cumulativeCost(r)).toBeGreaterThan(cumulativeCost(r - 1))
  })
})

describe('rank: rankForEnlisted is the exact inverse of cumulativeCost', () => {
  it('is 0 below the first rank cost', () => {
    expect(rankForEnlisted(0)).toBe(0)
    expect(rankForEnlisted(STEP - 1)).toBe(0)   // 24 → 0
  })
  it('lands exactly on each rank boundary (no float off-by-one)', () => {
    for (let r = 0; r <= 400; r++) {
      const cost = cumulativeCost(r)
      expect(rankForEnlisted(cost)).toBe(r)                 // exactly at boundary
      expect(rankForEnlisted(cost + 1)).toBe(r)             // just above → still r
      if (r > 0) expect(rankForEnlisted(cost - 1)).toBe(r - 1)  // just below → previous
    }
  })
  it('agrees with a brute-force reference across a dense range', () => {
    const ref = (e: number) => { let r = 0; while (cumulativeCost(r + 1) <= e) r++; return r }
    for (let e = 0; e <= 20000; e += 7) expect(rankForEnlisted(e)).toBe(ref(e))
  })
})

describe('rank: toNextRank', () => {
  it('is the gap to the next boundary and always positive', () => {
    expect(toNextRank(0)).toBe(cumulativeCost(1))            // 25
    expect(toNextRank(STEP)).toBe(cumulativeCost(2) - STEP)  // 75 - 25 = 50
    for (let e = 0; e <= 5000; e += 13) {
      const gap = toNextRank(e)
      expect(gap).toBeGreaterThan(0)
      const r = rankForEnlisted(e)
      expect(e + gap).toBe(cumulativeCost(r + 1))
    }
  })
})

describe('rank: titles / insignia bands', () => {
  it('is UNRANKED / blank at rank 0', () => {
    expect(rankTitle(0)).toBe('UNRANKED')
    expect(rankBadge(0)).toBe('')
    expect(prestigeGlyph(0)).toBe('')
    expect(rankBandColor(0)).toBe('#52525b')
  })
  it('promotes the title every 5 ranks and clamps at the top band', () => {
    expect(rankTitle(1)).toBe('RECRUIT')
    expect(rankTitle(5)).toBe('RECRUIT')
    expect(rankTitle(6)).toBe('OPERATIVE')
    expect(rankTitle(41)).toBe('MYTHIC')   // floor(40/5) = 8 → last band
    expect(rankTitle(999)).toBe('MYTHIC')  // clamped
  })
  it('renders a Lv badge for a ranked player', () => {
    expect(rankBadge(12)).toBe('Lv12')
  })
  it('has a defined glyph + hex colour for every ranked band', () => {
    for (const r of [1, 5, 6, 10, 11, 25, 26, 40, 41, 100]) {
      expect(prestigeGlyph(r)).not.toBe('')
      expect(rankBandColor(r)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('rank: persistence + enlist conserves currency', () => {
  it('round-trips through localStorage and clamps', () => {
    saveRank({ enlisted: 137 })
    expect(loadRank().enlisted).toBe(137)
    saveRank({ enlisted: -5 })
    expect(loadRank().enlisted).toBe(0)
    saveRank({ enlisted: 10.9 })
    expect(loadRank().enlisted).toBe(10)
  })
  it('moves shards meta→rank, conserving the total', () => {
    saveMeta({ shards: 200, up: { ...noUp } })
    saveRank({ enlisted: 0 })
    const before = loadMeta().shards + loadRank().enlisted
    enlist(120)
    expect(loadMeta().shards).toBe(80)
    expect(loadRank().enlisted).toBe(120)
    expect(loadMeta().shards + loadRank().enlisted).toBe(before)   // total is invariant
  })
  it('enlist() with no arg banks ALL shards', () => {
    saveMeta({ shards: 300, up: { ...noUp } })
    saveRank({ enlisted: 0 })
    enlist()
    expect(loadMeta().shards).toBe(0)
    expect(loadRank().enlisted).toBe(300)
  })
  it('never moves more shards than are banked', () => {
    saveMeta({ shards: 40, up: { ...noUp } })
    saveRank({ enlisted: 0 })
    enlist(1000)
    expect(loadMeta().shards).toBe(0)
    expect(loadRank().enlisted).toBe(40)
  })
})
