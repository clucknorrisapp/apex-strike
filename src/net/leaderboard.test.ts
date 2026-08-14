import { describe, it, expect } from 'vitest'
import { cleanHandle, monthKey, prevMonthKey, monthLabel, myWallet, hasWallet, saveRival, loadRival, clearRival } from './leaderboard'

describe('leaderboard: cleanHandle sanitizes input', () => {
  it('keeps alnum / _ / - / single spaces and strips the rest', () => {
    expect(cleanHandle('Hello@@@World!!!')).toBe('HelloWorld')
    expect(cleanHandle('good_name-1')).toBe('good_name-1')
    expect(cleanHandle('foo   bar')).toBe('foo bar')   // collapse whitespace
    expect(cleanHandle('  padded  ')).toBe('padded')   // trim
  })
  it('caps length at 16', () => {
    expect(cleanHandle('a'.repeat(40)).length).toBe(16)
  })
  it('neutralizes markup/injection characters', () => {
    expect(cleanHandle('<img src=x>')).toBe('img srcx')   // < > = stripped, the space survives
  })
})

describe('leaderboard: month keys (UTC, boundary-safe)', () => {
  it('monthKey is YYYY-MM in UTC', () => {
    expect(monthKey(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08')   // month index 7 = August
    expect(monthKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01')
    expect(monthKey(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12')
  })
  it('prevMonthKey rolls the year at January', () => {
    expect(prevMonthKey(new Date(Date.UTC(2026, 0, 15)))).toBe('2025-12')
    expect(prevMonthKey(new Date(Date.UTC(2026, 7, 1)))).toBe('2026-07')
  })
  it('monthLabel maps a key to a month name, optionally with the year', () => {
    expect(monthLabel('2026-08')).toBe('AUGUST')
    expect(monthLabel('2026-08', true)).toBe('AUGUST 2026')
    expect(monthLabel('2026-01')).toBe('JANUARY')
    expect(monthLabel('2026-12')).toBe('DECEMBER')
  })
})

describe('leaderboard: wallet validation (localStorage)', () => {
  it('accepts a 0x + 40-hex address and lowercases it', () => {
    localStorage.setItem('apex_wallet', '0x' + 'ABCDEF0123'.repeat(4))
    expect(myWallet()).toBe('0x' + 'abcdef0123'.repeat(4))
    expect(hasWallet()).toBe(true)
  })
  it('rejects a malformed wallet', () => {
    localStorage.setItem('apex_wallet', 'not-a-wallet')
    expect(myWallet()).toBe(null)
    expect(hasWallet()).toBe(false)
  })
})

describe('leaderboard: pinned rival is season-scoped', () => {
  it('reads back a rival pinned this month', () => {
    saveRival({ handle: 'Rival', score: 5000 })
    expect(loadRival()).toEqual({ handle: 'Rival', score: 5000 })
  })
  it('voids a pin left over from a different month', () => {
    localStorage.setItem('apex_rival', JSON.stringify({ month: '2000-01', handle: 'Old', score: 1 }))
    expect(loadRival()).toBe(null)
  })
  it('clears cleanly', () => {
    saveRival({ handle: 'Rival', score: 5000 })
    clearRival()
    expect(loadRival()).toBe(null)
  })
})
