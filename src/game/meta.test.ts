import { describe, it, expect } from 'vitest'
import { UPGRADES, loadMeta, saveMeta, bankShards, nextCost, buyUpgrade } from './meta'

const noUp = { vitality: 0, reserves: 0, firepower: 0, boots: 0, dash: 0 }

describe('meta: UPGRADES table integrity', () => {
  it('every upgrade has costs.length === max', () => {
    for (const u of UPGRADES) expect(u.costs.length).toBe(u.max)
  })
  it('costs strictly increase per upgrade', () => {
    for (const u of UPGRADES) for (let i = 1; i < u.costs.length; i++) expect(u.costs[i]).toBeGreaterThan(u.costs[i - 1])
  })
  it('keys are unique', () => {
    const keys = UPGRADES.map((u) => u.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('meta: load/save sanitize', () => {
  it('defaults to zero on an empty device', () => {
    const m = loadMeta()
    expect(m.shards).toBe(0)
    expect(m.up.vitality).toBe(0)
  })
  it('clamps tiers to each upgrade max and floors shards at 0', () => {
    localStorage.setItem('apex_meta', JSON.stringify({ shards: -50, up: { vitality: 99, reserves: -3, firepower: 2.7, boots: 5, dash: 1 } }))
    const m = loadMeta()
    expect(m.shards).toBe(0)
    expect(m.up.vitality).toBe(3)   // max 3
    expect(m.up.reserves).toBe(0)   // floored up from -3
    expect(m.up.firepower).toBe(2)  // floor(2.7)
    expect(m.up.boots).toBe(2)      // max 2
    expect(m.up.dash).toBe(1)
  })
  it('survives corrupt JSON', () => {
    localStorage.setItem('apex_meta', '{not json')
    expect(loadMeta().shards).toBe(0)
  })
})

describe('meta: bankShards', () => {
  it('adds and never drops below 0', () => {
    expect(bankShards(50)).toBe(50)
    expect(bankShards(-20)).toBe(30)
    expect(bankShards(-999)).toBe(0)
  })
})

describe('meta: nextCost + buyUpgrade', () => {
  it('returns the tier cost then null once maxed', () => {
    expect(nextCost('vitality', 0)).toBe(20)
    expect(nextCost('vitality', 2)).toBe(90)
    expect(nextCost('vitality', 3)).toBe(null)   // max is 3
  })
  it('buys a tier and deducts exactly the cost', () => {
    saveMeta({ shards: 100, up: { ...noUp } })
    const m = buyUpgrade('vitality')
    expect(m.up.vitality).toBe(1)
    expect(m.shards).toBe(80)        // 100 - 20
  })
  it('refuses an unaffordable buy with no partial spend', () => {
    saveMeta({ shards: 10, up: { ...noUp } })
    const m = buyUpgrade('vitality')   // costs 20
    expect(m.up.vitality).toBe(0)
    expect(m.shards).toBe(10)
  })
  it('refuses to buy past max', () => {
    saveMeta({ shards: 9999, up: { ...noUp, vitality: 3 } })
    const m = buyUpgrade('vitality')
    expect(m.up.vitality).toBe(3)
    expect(m.shards).toBe(9999)      // untouched
  })
})
