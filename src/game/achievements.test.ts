import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, BOSS_KINDS, loadAch, evalAchievements, recordBossKill, achievementCount } from './achievements'

// A zeroed RunSummary with per-test overrides.
const run = (over: Partial<Parameters<typeof evalAchievements>[0]> = {}) => ({
  score: 0, kills: 0, maxCombo: 0, sector: 1, win: false, noHit: false,
  gunMaxed: false, dailyStreak: 0, shards: 0, ...over,
})

describe('achievements: table integrity', () => {
  it('has unique ids and reports the total', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(achievementCount().total).toBe(ACHIEVEMENTS.length)
  })
})

describe('achievements: evalAchievements folds + unlocks', () => {
  it('unlocks FIRST BLOOD on the first kill and never re-awards it', () => {
    expect(evalAchievements(run({ kills: 1 })).map((a) => a.id)).toContain('first_blood')
    expect(evalAchievements(run({ kills: 1 })).map((a) => a.id)).not.toContain('first_blood')
  })
  it('accumulates lifetime kills across runs (CENTURION at 100)', () => {
    for (let i = 0; i < 9; i++) evalAchievements(run({ kills: 11 }))   // 99 lifetime
    expect(loadAch().life.kills).toBe(99)
    expect(loadAch().unlocked).not.toContain('centurion')
    expect(evalAchievements(run({ kills: 1 })).map((a) => a.id)).toContain('centurion')   // crosses 100
  })
  it('FLAWLESS requires win AND noHit', () => {
    expect(evalAchievements(run({ win: true, noHit: false })).map((a) => a.id)).not.toContain('flawless')
    expect(evalAchievements(run({ win: true, noHit: true })).map((a) => a.id)).toContain('flawless')
  })
  it('folds runs + wins into lifetime stats', () => {
    evalAchievements(run({ win: true }))
    const l = loadAch().life
    expect(l.runs).toBe(1)
    expect(l.wins).toBe(1)
  })
})

describe('achievements: boss mask → APEX SLAYER', () => {
  it('unlocks only after all 7 distinct bosses are recorded', () => {
    for (let i = 0; i < BOSS_KINDS.length - 1; i++) recordBossKill(BOSS_KINDS[i])   // 6 of 7
    expect(evalAchievements(run()).map((a) => a.id)).not.toContain('apex_slayer')
    recordBossKill(BOSS_KINDS[BOSS_KINDS.length - 1])                                // the 7th
    expect(evalAchievements(run()).map((a) => a.id)).toContain('apex_slayer')
  })
  it('unlocks BOSS BREAKER after any single boss', () => {
    recordBossKill(BOSS_KINDS[0])
    expect(evalAchievements(run()).map((a) => a.id)).toContain('boss_breaker')
  })
  it('ignores an unknown boss kind', () => {
    recordBossKill('not_a_boss')
    expect(loadAch().life.bossMask).toBe(0)
  })
})

describe('achievements: loadAch sanitizes', () => {
  it('drops unknown unlocked ids, floors negatives, masks bossMask', () => {
    localStorage.setItem('apex_ach', JSON.stringify({ unlocked: ['first_blood', 'bogus'], life: { kills: -5, bossMask: 99999 } }))
    const st = loadAch()
    expect(st.unlocked).toEqual(['first_blood'])   // 'bogus' filtered out
    expect(st.life.kills).toBe(0)                  // negative floored to 0
    expect(st.life.bossMask).toBe(99999 & 127)     // masked to the 7 boss bits
  })
})
