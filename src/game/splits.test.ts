import { describe, it, expect } from 'vitest'
import { loadSplits, recordSplit, fmtTime, fmtDelta } from './splits'

describe('splits: recordSplit', () => {
  it('records a first clear with delta 0 and first=true', () => {
    const r = recordSplit(3, 45230)
    expect(r).toEqual({ best: 45230, delta: 0, record: true, first: true })
    expect(loadSplits()['3']).toBe(45230)
  })
  it('a faster time is a new record with a negative delta', () => {
    recordSplit(3, 45000)
    const r = recordSplit(3, 42000)
    expect(r.record).toBe(true)
    expect(r.first).toBe(false)
    expect(r.best).toBe(42000)
    expect(r.delta).toBe(-3000)
  })
  it('a slower time keeps the old best (positive delta, record=false)', () => {
    recordSplit(3, 40000)
    const r = recordSplit(3, 47000)
    expect(r.record).toBe(false)
    expect(r.best).toBe(40000)
    expect(r.delta).toBe(7000)
    expect(loadSplits()['3']).toBe(40000)   // not overwritten by the slower run
  })
  it('rounds and floors a negative cumulative time to 0', () => {
    expect(recordSplit(1, -20).best).toBe(0)
  })
  it('keeps splits per-sector independent', () => {
    recordSplit(1, 10000)
    recordSplit(2, 20000)
    const s = loadSplits()
    expect(s['1']).toBe(10000)
    expect(s['2']).toBe(20000)
  })
})

describe('splits: fmtTime (m:ss.d in tenths)', () => {
  it('formats seconds and tenths', () => {
    expect(fmtTime(0)).toBe('0:00.0')
    expect(fmtTime(45230)).toBe('0:45.2')
    expect(fmtTime(60000)).toBe('1:00.0')
    expect(fmtTime(125400)).toBe('2:05.4')
  })
  it('never goes negative', () => {
    expect(fmtTime(-500)).toBe('0:00.0')
  })
})

describe('splits: fmtDelta (signed, true minus glyph)', () => {
  it('uses − for ahead (<=0) and + for behind', () => {
    expect(fmtDelta(-2100)).toBe('−2.1s')
    expect(fmtDelta(3000)).toBe('+3.0s')
    expect(fmtDelta(0)).toBe('−0.0s')   // 0 counts as ahead (ms <= 0)
  })
})
