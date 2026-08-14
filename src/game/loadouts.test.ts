import { describe, it, expect } from 'vitest'
import { DOCTRINES, loadSelected, saveSelected, doctrineById, selectedDoctrine } from './loadouts'

const WEAPONS = ['normal', 'spread', 'rapid', 'laser', 'fire', 'arc']
const PASSIVES = ['refund', 'ignite', 'pierce', 'rampage', 'guard']   // 'none' is runtime-only; no Doctrine carries it

describe('loadouts: DOCTRINES table integrity', () => {
  it('has unique ids', () => {
    const ids = DOCTRINES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('uses valid weapons and a real signature passive (never the neutral "none")', () => {
    for (const d of DOCTRINES) {
      expect(WEAPONS).toContain(d.startWeapon)
      expect(PASSIVES).toContain(d.passive)
    }
  })
  it('keeps start mastery within 0..2 stars', () => {
    for (const d of DOCTRINES) {
      expect(d.startMastery).toBeGreaterThanOrEqual(0)
      expect(d.startMastery).toBeLessThanOrEqual(2)
    }
  })
})

describe('loadouts: selection persistence + guards', () => {
  it('defaults to vanguard when nothing is stored', () => {
    expect(loadSelected()).toBe('vanguard')
    expect(selectedDoctrine().id).toBe('vanguard')
  })
  it('round-trips a valid selection', () => {
    saveSelected('bastion')
    expect(loadSelected()).toBe('bastion')
    expect(selectedDoctrine().id).toBe('bastion')
  })
  it('refuses to store an invalid id', () => {
    saveSelected('bastion')
    saveSelected('not_a_doctrine')   // ignored — leaves the prior valid selection
    expect(loadSelected()).toBe('bastion')
  })
  it('falls back to vanguard for a corrupt stored id', () => {
    localStorage.setItem('apex_doctrine', 'garbage')
    expect(loadSelected()).toBe('vanguard')
  })
  it('doctrineById falls back to the first doctrine for an unknown id', () => {
    expect(doctrineById('nope')).toBe(DOCTRINES[0])
    expect(doctrineById('pyro').id).toBe('pyro')
  })
})
