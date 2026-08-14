import Phaser from 'phaser'
import { record as recordTelemetry, newRun, currentIds, type DeathCause } from '../dev/telemetry'
import { loadMeta, bankShards, buyUpgrade, nextCost, UPGRADES } from './meta'
import { evalAchievements, recordBossKill, achievementCount, loadAch, ACHIEVEMENTS, type RunSummary } from './achievements'
import { renderFlexCard, shareCard, type FlexSummary } from './flexcard'
import { weekKey, bossOrderForWeek, saveTrialsBest, loadTrialsBest } from './rush'
import { recordSplit, fmtTime, fmtDelta } from './splits'
import { heatMods, loadHeatUnlocked, noteCampaignClear, noteHeatClear, MAX_HEAT } from './heat'
import { DOCTRINES, selectedDoctrine, loadSelected, saveSelected, doctrineById, type DoctrinePassive } from './loadouts'
import { loadRank, currentRank, rankTitle, rankBadge, prestigeGlyph, rankBandColor, toNextRank, cumulativeCost, enlist as enlistShards } from './rank'
import { submitScore, fetchLeaderboard, setHandle, myWallet, hasWallet, localHandle, submitDaily, fetchDaily, submitTrials, fetchTrials, submitAscension, fetchAscension, submitSpeedrun, fetchSpeedruns, submitRank, fetchRanks, submitSeason, fetchSeason, monthKey, prevMonthKey, monthLabel, seasonSeen, markSeasonSeen, recordSeasonFinish, loadRival, saveRival, clearRival, type BoardData, type DailyData, type TrialsData, type AscensionData, type SpeedData, type RankData, type SeasonData, type SubmitResult } from '../net/leaderboard'
import { todayMod, todayKey, noteDailyPlayed, getDailyStreak, claimDailyDividend, pendingDividend, claimCampaignDaily, type DailyMod } from './daily'
import { evalBounties, todayBounties, loadBountyState, bountyDoneCount } from './bounties'
import { foldRun as foldContracts, contractProgress } from './contracts'

const ASSETS = {
  huntress: '/assets/huntress.png',
  huntress_run: '/assets/huntress_run.png',
  huntress_jump: '/assets/huntress_jump.png',
  huntress_crouch: '/assets/huntress_crouch.png',
  enemy_soldier: '/assets/enemy_soldier.png',
  enemy_flyer: '/assets/enemy_flyer.png',
  enemy_tank: '/assets/enemy_tank.png',
  boss: '/assets/boss.png',
  pickup_pod: '/assets/pickup_pod.png',
  platform_tile: '/assets/platform_tile.png',
  logo: '/assets/logo.webp',
}

// Painted per-stage backdrops (real art — replaces the procedural skyline when present)
const WORLD_BG: Record<string, string> = {
  streets: '/assets/bg_streets.webp',
  industrial: '/assets/bg_industrial.webp',
  sky: '/assets/bg_sky.webp',
  core: '/assets/bg_core.webp',
  throne: '/assets/bg_throne.webp',
  volt: '/assets/bg_volt.webp',
}

// ---- Feel kit (Contra run-and-gun + Mario-grade jump) ----
const GROUND_ENEMIES = new Set(['walker', 'tank', 'charger', 'turret', 'sniper', 'shielder', 'sapper'])  // get drop shadows (keyed by getData('type'): soldiers are 'walker')
const RUN = 275          // horizontal top speed
const DASH_SPEED = 640   // Phase Dash burst speed
const ACCEL = 1500       // ground acceleration (doubled when reversing = snappy turns)
const AIR_ACCEL = 950
const DRAG = 1700        // deceleration when no input
const GRAV = 900         // rising gravity
const FALL_BOOST = 560   // extra gravity while falling => snappy, asymmetric arc
const JUMP_V = -545      // jump impulse
const SHORT_HOP = -150   // released-early velocity clamp (variable height)
const COYOTE = 110       // ms of grace after leaving a ledge
const BUFFER = 130       // ms a jump press stays "remembered"
const MAX_JUMPS = 2
// How much WORLD width the main camera shows across the canvas. Bigger = pulled
// back = more of the level on screen at once (the Contra "run-and-gun" wide
// view: small hero, enemies visible as they approach). The HUD camera stays at
// 512 so the interface keeps its crisp hi-res scale independent of this.
const WORLD_VIEW_W = 720

// Per-sector music beds — each is an 8-step eighth-note phrase (bass drives, lead arps the
// top half; 0 = rest) at its own tempo, so the six sectors sound distinct instead of sharing
// one A-minor loop. Keyed by ThemeName.
const MUSIC_THEMES: Record<string, { bpm: number; bass: number[]; lead: number[] }> = {
  streets:    { bpm: 138, bass: [55, 55, 82.41, 55, 65.41, 55, 82.41, 97.99],            lead: [220, 0, 261.63, 0, 329.63, 0, 261.63, 391.99] },     // A minor — driving
  industrial: { bpm: 122, bass: [41.20, 41.20, 61.74, 41.20, 49.00, 41.20, 61.74, 55.00], lead: [164.81, 0, 196.00, 0, 246.94, 0, 196.00, 293.66] }, // E minor — heavy / grinding
  sky:        { bpm: 148, bass: [73.42, 73.42, 110.00, 73.42, 98.00, 73.42, 110.00, 146.83], lead: [293.66, 0, 349.23, 0, 440.00, 0, 349.23, 587.33] }, // D — bright / airy
  core:       { bpm: 132, bass: [49.00, 49.00, 73.42, 49.00, 58.27, 49.00, 73.42, 65.41], lead: [196.00, 0, 233.08, 0, 293.66, 0, 233.08, 349.23] }, // G minor — tense
  throne:     { bpm: 126, bass: [55, 55, 73.42, 82.41, 65.41, 55, 82.41, 110.00],         lead: [220, 0, 293.66, 0, 329.63, 0, 261.63, 440.00] },     // A minor — stately / grand
  volt:       { bpm: 152, bass: [92.50, 92.50, 138.59, 92.50, 110.00, 92.50, 138.59, 123.47], lead: [369.99, 0, 440.00, 0, 554.37, 0, 440.00, 739.99] }, // F# minor — fast / electric
  frost:      { bpm: 118, bass: [65.41, 65.41, 98.00, 65.41, 82.41, 65.41, 98.00, 87.31],     lead: [523.25, 0, 622.25, 0, 783.99, 0, 622.25, 1046.50] }, // C minor — slow, crystalline highs
}

// Asset-free procedural sound — short Web-Audio blips, no files needed.
class Sfx {
  private ctx: AudioContext | null = null
  private master: DynamicsCompressorNode | null = null   // limiter bus so layered SFX + music never clip
  private duckGain: GainNode | null = null               // music-only bus; dips under big SFX (sidechain)
  private heat: BiquadFilterNode | null = null           // adaptive lowpass on the musical bed; opens as the fight heats up
  muted = false
  constructor() {
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      const Ctor = AC.AudioContext || AC.webkitAudioContext
      this.ctx = Ctor ? new Ctor() : null
      if (this.ctx) {
        const comp = this.ctx.createDynamicsCompressor()
        const t = this.ctx.currentTime
        comp.threshold.setValueAtTime(-10, t); comp.knee.setValueAtTime(24, t)
        comp.ratio.setValueAtTime(12, t); comp.attack.setValueAtTime(0.003, t); comp.release.setValueAtTime(0.25, t)
        comp.connect(this.ctx.destination)
        this.master = comp
        const dg = this.ctx.createGain(); dg.gain.value = 1; dg.connect(comp); this.duckGain = dg
        // Adaptive lowpass sitting in front of the duck bus: the music + drone bed play THROUGH it,
        // muffled and distant when calm and opening up bright as the fight heats up. SFX bypass it.
        const hf = this.ctx.createBiquadFilter(); hf.type = 'lowpass'
        hf.frequency.value = 1800; hf.Q.value = 0.7; hf.connect(dg); this.heat = hf
      }
    } catch { this.ctx = null }
  }
  private dest(): AudioNode { return this.master ?? this.ctx!.destination }
  // Positional output: routes a one-shot through a StereoPanner (clamped ±0.9 so nothing pins
  // fully to one ear) into the master bus. pan == null → dead-center (the master directly), so
  // every existing centered sound is untouched. A fresh panner per shot — they're cheap + GC'd.
  private out(pan?: number): AudioNode {
    const c = this.ctx
    if (!c || pan == null || !c.createStereoPanner) return this.dest()
    const p = c.createStereoPanner()
    p.pan.value = Math.max(-0.9, Math.min(0.9, pan))
    p.connect(this.dest())
    return p
  }
  // Sidechain duck: dip the music bed briefly so SFX (which bypass duckGain into the master) punch through.
  duck(depth = 0.45, dur = 0.28) {
    const c = this.ctx, dg = this.duckGain; if (!c || !dg || this.muted) return
    const g = dg.gain, t = c.currentTime
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(Math.max(0.05, 1 - depth), t + 0.02)
    g.setTargetAtTime(1, t + 0.05, dur)
  }
  resume() { this.ctx?.resume?.() }
  setMuted(v: boolean) {
    this.muted = v
    const c = this.ctx; if (!c) return
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(v ? 0 : this.targetMusicVol(), c.currentTime, 0.02)
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(v ? 0 : this.targetDroneVol(), c.currentTime, 0.05)
  }
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, pan?: number) {
    const c = this.ctx; if (!c || this.muted) return
    const t = c.currentTime
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.out(pan))
    o.start(t); o.stop(t + dur + 0.02)
  }
  private noise(dur: number, gain: number, pan?: number) {
    const c = this.ctx; if (!c || this.muted) return
    const t = c.currentTime
    const n = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = c.createBufferSource(); src.buffer = buf
    const g = c.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(g); g.connect(this.out(pan)); src.start(t)
  }
  shoot() { this.tone(820 + Math.random() * 180, 300, 0.05, 'square', 0.045) }
  jump() { this.tone(420, 780, 0.12, 'square', 0.05) }
  hit() { this.tone(240, 140, 0.05, 'square', 0.035) }
  // TELEGRAPH PUNISH: a bright rising two-note ping so a crit reads by ear over the normal thunk.
  crit(pan?: number) { this.tone(1000, 1950, 0.07, 'square', 0.05, pan); this.note(2100, 0.05, 'triangle', 0.04, 0.04, undefined, pan) }
  // RAZOR GRAZE: a tiny high tick as a bolt shaves past.
  graze(pan?: number) { this.tone(2600, 3100, 0.03, 'triangle', 0.03, pan) }
  // COUNTER-DASH DEFLECT: a bright metallic snap as a caught bolt whips back at its owner.
  deflect(pan?: number) { this.tone(1800, 2700, 0.05, 'triangle', 0.05, pan); this.note(2500, 0.05, 'square', 0.03, 0.04, undefined, pan) }
  // STAGGER: a heavy poise-break crack — a low downward thud under a short mid ring.
  stagger(pan?: number) { this.tone(200, 90, 0.1, 'square', 0.06, pan); this.note(680, 0.09, 'triangle', 0.04, 0.05, undefined, pan) }
  explode(pan?: number) { this.noise(0.28, 0.09, pan); this.duck() }
  pickup() { this.tone(620, 1240, 0.16, 'sine', 0.06) }
  // Distinct pickup motif per powerup so you hear WHICH pod you grabbed, eyes on the action.
  pickupMotif(kind: string) {
    switch (kind) {
      case 'health': this.note(523.25, 0.12, 'sine', 0.06, 0); this.note(783.99, 0.17, 'sine', 0.05, 0.09); break      // C->G warm heal
      case 'spread': this.note(523.25, 0.07, 'triangle', 0.05, 0); this.note(659.25, 0.07, 'triangle', 0.05, 0.05); this.note(783.99, 0.1, 'triangle', 0.05, 0.1); break  // up-arp
      case 'rapid':  this.tone(880, 1320, 0.05, 'square', 0.04); this.note(990, 0.05, 'square', 0.035, 0.05, 1480); break  // fast tick-up
      case 'laser':  this.note(659.25, 0.14, 'sawtooth', 0.05, 0, 1318.5); break                                       // bright zap up
      case 'fire':   this.note(196, 0.2, 'sawtooth', 0.05, 0, 392); this.noise(0.06, 0.02); break                      // low warm swell
      default:       this.pickup()
    }
  }
  hurt() { this.tone(300, 70, 0.28, 'sawtooth', 0.08); this.duck() }
  stomp(pan?: number) { this.tone(520, 150, 0.1, 'square', 0.06, pan) }
  // Enemy muzzle blip — lower, softer + shorter than the player's shot so it reads as "incoming",
  // and panned to the shooter's side so you can locate an off-screen threat by ear.
  enemyShot(pan?: number) { this.tone(300, 150, 0.05, 'square', 0.03, pan) }
  clear() { this.tone(520, 940, 0.14, 'square', 0.05) }
  dash() { this.tone(200, 520, 0.14, 'sawtooth', 0.05) }
  // DASH DENIED: a short muted low click when dash is mashed while still on cooldown — so the failed
  // input is acknowledged by ear instead of reading as a dropped press.
  dashDenied(pan?: number) { this.tone(170, 108, 0.05, 'square', 0.028, pan); this.noise(0.03, 0.01, pan) }
  swap() { this.tone(440, 720, 0.08, 'square', 0.05) }
  scrape() { this.noise(0.07, 0.018) }   // brief soft skid scrape

  // ---- Audio depth: fixed-pitch note helper + expressive one-shots ----
  // note() plays a discrete pitch (optionally gliding to a second pitch) at an absolute
  // time offset, so sequences (fanfares, heartbeats) can be scheduled sample-accurately.
  private note(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, glideTo?: number, pan?: number) {
    const c = this.ctx; if (!c || this.muted) return
    const t = c.currentTime + when
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.out(pan))
    o.start(t); o.stop(t + dur + 0.02)
  }
  // Distinct fire sound per weapon so the arsenal reads by ear, not just by colour.
  weaponShot(weapon: string) {
    switch (weapon) {
      case 'spread':                                              // three detuned pops
        this.note(700, 0.05, 'square', 0.032, 0, 470)
        this.note(770, 0.05, 'square', 0.028, 0.006, 520)
        this.note(630, 0.05, 'square', 0.028, 0.012, 430)
        break
      case 'rapid':                                               // tight high tick
        this.tone(1000 + Math.random() * 140, 640, 0.032, 'square', 0.03)
        break
      case 'laser':                                               // descending zap
        this.note(1450, 0.13, 'sawtooth', 0.045, 0, 250)
        break
      case 'fire':                                                // crackly low burst
        this.tone(360 + Math.random() * 80, 150, 0.06, 'sawtooth', 0.05)
        this.noise(0.05, 0.035)
        break
      case 'arc':                                                 // hollow launcher thump
        this.tone(190, 96, 0.12, 'sine', 0.06)
        this.noise(0.05, 0.03)
        break
      default:                                                    // normal blaster
        this.tone(820 + Math.random() * 180, 300, 0.05, 'square', 0.045)
    }
  }
  // Combo pitch-ladder — each successive kill in a chain climbs a pentatonic step.
  comboBlip(step: number) {
    if (step < 2) return
    const semis = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27]
    const s = semis[Math.min(step - 2, semis.length - 1)]
    const f = 330 * Math.pow(2, s / 12)
    this.note(f, 0.1, 'triangle', 0.05, 0, f * 1.5)
    if (step >= 5) this.note(f * 2, 0.08, 'sine', 0.028, 0.015)   // sparkle harmonic on big chains
  }
  // Low-health heartbeat — a lub-dub thump; the scene drives the cadence and speeds it up when critical.
  heartbeat(fast: boolean) {
    this.note(96, 0.13, 'sine', 0.16, 0, 46)
    this.note(80, 0.16, 'sine', 0.12, 0.15, 38)
    if (fast) this.note(150, 0.05, 'square', 0.025, 0)
  }
  // Boss entrance — a low detuned swell with a noise bed.
  bossRoar() {
    const c = this.ctx; if (!c || this.muted) return
    this.note(55, 0.9, 'sawtooth', 0.10, 0, 84)
    this.note(41.2, 0.9, 'sawtooth', 0.085, 0, 62)
    this.note(110, 0.5, 'square', 0.035, 0.12, 72)
    this.noise(0.6, 0.045)
    this.duck(0.7, 0.5)
  }
  // Phase-2 enrage stinger — a rising alarm.
  enrage() {
    this.note(220, 0.5, 'sawtooth', 0.09, 0, 660)
    this.note(233, 0.5, 'sawtooth', 0.06, 0.05, 700)
    this.note(880, 0.16, 'square', 0.045, 0)
    this.noise(0.3, 0.05)
    this.duck(0.7, 0.5)
  }
  // Sector clear — bright ascending triad + capstone.
  fanfare() {
    const notes = [392, 523.25, 659.25, 783.99]
    notes.forEach((f, i) => this.note(f, 0.2, 'square', 0.06, i * 0.085))
    this.note(1046.5, 0.45, 'sine', 0.05, notes.length * 0.085)
  }
  // Boss defeated — an impact then a triumphant rising run.
  bossDefeat() {
    this.note(180, 0.18, 'sawtooth', 0.08, 0, 90)
    this.noise(0.25, 0.05)
    const notes = [261.63, 392, 523.25, 659.25, 783.99]
    notes.forEach((f, i) => this.note(f, 0.24, 'square', 0.06, 0.14 + i * 0.1))
    this.note(1046.5, 0.6, 'sine', 0.05, 0.14 + notes.length * 0.1)
    this.duck(0.7, 0.5)
  }
  // Per-boss signature phrase (semitone offsets from a root) — melodic identity on top of the roar.
  bossLeitmotif(phrase: number[], enraged: boolean) {
    if (!phrase || !phrase.length) return
    const root = enraged ? 110 : 82.4, step = enraged ? 0.11 : 0.16
    phrase.forEach((semi, i) => this.note(root * Math.pow(2, semi / 12), enraged ? 0.14 : 0.2, enraged ? 'square' : 'triangle', 0.06, i * step))
  }
  // Boss wind-up telegraph — a distinct pre-attack cue per move class (dodge-by-ear).
  bossTele(cls: 'charge' | 'lunge' | 'summon') {
    if (cls === 'lunge') { this.tone(430, 90, 0.26, 'sawtooth', 0.05); this.noise(0.16, 0.03) }        // low descending whoosh
    else if (cls === 'summon') { this.tone(330, 460, 0.18, 'square', 0.04); this.note(494, 0.14, 'square', 0.03, 0.06) }  // mid warble
    else this.tone(210, 560, 0.24, 'sawtooth', 0.045)                                                  // rising charge whine
  }
  // Turret wind-up — a short high tick so on-screen turret volleys read by ear too.
  turretTele(pan?: number) { this.tone(760, 1240, 0.07, 'square', 0.03, pan) }
  // Landing a hit on a boss — a beefier thunk than the grunt tick, so chipping the boss has weight.
  bossHit() { this.tone(200, 96, 0.07, 'square', 0.05); this.noise(0.045, 0.028); this.duck(0.3, 0.16) }

  // ---- Procedural background music: a per-sector driving synth loop with a boss-intensity layer ----
  private musicGain: GainNode | null = null
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private musicStep = 0
  private readonly MUSIC_VOL = 0.05
  private musicBass: number[] = MUSIC_THEMES.streets.bass
  private musicLead: number[] = MUSIC_THEMES.streets.lead
  private musicStepDur = (60 / 138) / 2
  private musicTheme = 'streets'
  private musicIntense = false
  private targetMusicVol() { return this.musicIntense ? this.MUSIC_VOL * 1.5 : this.MUSIC_VOL }
  private applyMusicTheme(theme: string) {
    const v = MUSIC_THEMES[theme] || MUSIC_THEMES.streets
    this.musicTheme = theme
    this.musicBass = v.bass
    this.musicLead = v.lead
    this.musicStepDur = (60 / v.bpm) / 2
  }
  startMusic(theme = 'streets') {
    const c = this.ctx
    if (!c || this.musicTimer !== null) return
    this.musicGain = c.createGain()
    this.musicGain.gain.value = this.muted ? 0 : this.targetMusicVol()
    this.musicGain.connect(this.heat ?? this.duckGain ?? this.dest())   // through the heat lowpass → duck bus; SFX bypass both
    this.musicStep = 0
    this.applyMusicTheme(theme)
    this.startDrone((MUSIC_THEMES[theme] || MUSIC_THEMES.streets).bass[0])   // ambient low pad, keyed to the sector root
    this.startMusicTimer()
  }
  private startMusicTimer() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null }
    const tick = () => {
      const cc = this.ctx
      if (!cc || !this.musicGain) return
      const t = cc.currentTime + 0.06
      const s = this.musicStep % 8
      const bass = this.musicBass, lead = this.musicLead, sd = this.musicStepDur
      this.musicNote(bass[s], t, sd * 0.92, 'sawtooth', 0.5)
      if (lead[s] > 0 && this.musicStep % 16 < 8) this.musicNote(lead[s], t, sd * 0.5, 'square', 0.13)
      if (this.musicIntense) {                                   // boss fight: brighter octave-up drive + steady pulse
        this.musicNote(bass[s] * 2, t, sd * 0.45, 'square', 0.07)
        if (s % 2 === 0) this.musicNote(bass[s], t, sd * 0.3, 'square', 0.05)
      }
      this.musicStep++
    }
    tick()
    this.musicTimer = setInterval(tick, this.musicStepDur * 1000)
  }
  // Retune to a new sector's bed while the track keeps playing (restarts the interval at the new tempo).
  setMusicTheme(theme: string) {
    if (this.musicTimer === null || theme === this.musicTheme) return
    this.applyMusicTheme(theme)
    this.retuneDrone((MUSIC_THEMES[theme] || MUSIC_THEMES.streets).bass[0])   // glide the pad to the new sector's key
    this.startMusicTimer()
  }
  // Swell + thicken the track while a boss is on the field.
  setMusicIntensity(on: boolean) {
    if (this.musicIntense === on) return
    this.musicIntense = on
    if (this.musicGain && this.ctx && !this.muted) this.musicGain.gain.setTargetAtTime(this.targetMusicVol(), this.ctx.currentTime, 0.1)
  }
  private musicNote(freq: number, t: number, dur: number, type: OscillatorType, gain: number) {
    const c = this.ctx
    if (!c || !this.musicGain) return
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.musicGain)
    o.start(t); o.stop(t + dur + 0.02)
  }
  stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null }
    if (this.musicGain) { try { this.musicGain.disconnect() } catch { /* noop */ } this.musicGain = null }
    this.stopDrone()
    this.musicIntense = false
  }

  // ---- Ambient drone bed: a continuous low pad under the whole mix, keyed to the sector ----
  // Root + a slightly detuned twin (slow beating) + a fifth + an octave shimmer, all breathing on a
  // very slow LFO. Runs through the heat lowpass + duck bus like the music, so it muffles when calm,
  // brightens in a fight, and dips under explosions.
  private droneGain: GainNode | null = null
  private droneOscs: OscillatorNode[] = []
  private droneLfo: OscillatorNode | null = null
  private musicHeat = 0
  private readonly DRONE_VOL = 0.03
  private targetDroneVol() { return this.DRONE_VOL * (1 + this.musicHeat * 0.35) }
  private droneFreqs(root: number) { return [root, root * 1.004, root * 1.5, root * 2] }
  startDrone(root = 55) {
    const c = this.ctx; if (!c || this.droneGain) return
    const g = c.createGain(); g.gain.value = this.muted ? 0 : this.targetDroneVol()
    g.connect(this.heat ?? this.duckGain ?? this.dest()); this.droneGain = g
    const types: OscillatorType[] = ['sine', 'sine', 'triangle', 'sine']
    const gains = [0.6, 0.5, 0.26, 0.12]
    this.droneOscs = this.droneFreqs(root).map((f, i) => {
      const o = c.createOscillator(); o.type = types[i]; o.frequency.value = f
      const og = c.createGain(); og.gain.value = gains[i]
      o.connect(og); og.connect(g); o.start()
      return o
    })
    // slow breathing on the whole pad's amplitude (summed into the drone gain param)
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07
    const lg = c.createGain(); lg.gain.value = this.DRONE_VOL * 0.45
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); this.droneLfo = lfo
  }
  retuneDrone(root: number) {
    const c = this.ctx; if (!c || !this.droneOscs.length) return
    const t = c.currentTime
    this.droneFreqs(root).forEach((f, i) => this.droneOscs[i]?.frequency.setTargetAtTime(f, t, 0.6))
  }
  stopDrone() {
    this.droneOscs.forEach((o) => { try { o.stop() } catch { /* noop */ } try { o.disconnect() } catch { /* noop */ } })
    this.droneOscs = []
    if (this.droneLfo) { try { this.droneLfo.stop() } catch { /* noop */ } try { this.droneLfo.disconnect() } catch { /* noop */ } this.droneLfo = null }
    if (this.droneGain) { try { this.droneGain.disconnect() } catch { /* noop */ } this.droneGain = null }
  }
  // Adaptive intensity: 0 calm/exploring … 3 boss/chaos. Opens the lowpass (dark → bright) and swells
  // the drone as the fight escalates — the soundtrack reacts to what's on screen without a new track.
  setMusicHeat(level: number) {
    const c = this.ctx; if (!c) return
    const L = Math.max(0, Math.min(3, Math.round(level)))
    if (L === this.musicHeat) return
    this.musicHeat = L
    const t = c.currentTime
    const cutoff = [820, 1800, 3800, 8500][L]
    const q = [0.6, 0.75, 0.95, 1.15][L]
    if (this.heat) { this.heat.frequency.setTargetAtTime(cutoff, t, 0.4); this.heat.Q.setTargetAtTime(q, t, 0.4) }
    if (this.droneGain && !this.muted) this.droneGain.gain.setTargetAtTime(this.targetDroneVol(), t, 0.5)
  }
  dispose() {
    this.stopMusic()
    try { this.ctx?.close?.() } catch { /* noop */ }
    this.ctx = null
  }
}

export type ThemeName = 'streets' | 'industrial' | 'sky' | 'core' | 'throne' | 'volt' | 'frost'

export interface Theme {
  bg: number
  far: number
  mid: number
  rim: number
  fill: number
  ledge: number
  accent: number
}

export const THEMES: Record<ThemeName, Theme> = {
  streets:    { bg: 0x0a0612, far: 0x1a1030, mid: 0x2a1a4d, rim: 0x22d3ee, fill: 0x2c1f4a, ledge: 0x3b2a63, accent: 0xe879f9 },
  industrial: { bg: 0x0f0a07, far: 0x2a1c10, mid: 0x3d2a15, rim: 0xfb923c, fill: 0x3a2917, ledge: 0x4a3420, accent: 0xfbbf24 },
  sky:        { bg: 0x071018, far: 0x122438, mid: 0x1d3a57, rim: 0x22d3ee, fill: 0x1f3a52, ledge: 0x2a4a63, accent: 0x67e8f9 },
  core:       { bg: 0x120406, far: 0x2e0d14, mid: 0x4a141f, rim: 0xf43f5e, fill: 0x45141d, ledge: 0x5a1a26, accent: 0xfb7185 },
  throne:     { bg: 0x0b0714, far: 0x241a3a, mid: 0x3a2a5c, rim: 0xfbbf24, fill: 0x362a52, ledge: 0x4a3a2a, accent: 0xfde68a },
  volt:       { bg: 0x070a16, far: 0x141a34, mid: 0x1e2a52, rim: 0x818cf8, fill: 0x1c2348, ledge: 0x2a3566, accent: 0xa5b4fc },
  frost:      { bg: 0x060c14, far: 0x0e2233, mid: 0x18384f, rim: 0x7dd3fc, fill: 0x1a3a52, ledge: 0x2a5573, accent: 0xe0f2fe },
}

export interface EnemySpawn { kind: string; x: number; y: number; hp: number; speed: number }

export interface LevelDef {
  name: string
  theme: ThemeName
  w: number
  h: number
  spawn: [number, number]
  ground: [number, number, number][]         // [x1, x2, topY]  — gaps = pits
  plats: [number, number, number][]           // [centerX, topY, width]
  walls: [number, number, number, number][]   // [centerX, topY, width, height]
  turrets: [number, number][]                 // [x, surfaceTopY]
  enemies: EnemySpawn[]
  pods: [number, number, string][]            // [x, y, kind]
  goal: [number, number]                      // reach this point to clear
  shards?: [number, number][]                 // optional explicit Apex Shard spots; auto-scattered when omitted
  movers?: [number, number, number, string, number, number][]  // [cx, top, w, axis 'h'|'v', dist, speed] — moving platforms
  hazards?: [number, number, number][]        // [cx, topY, w] — spike strips that damage on contact
  bouncers?: [number, number, number][]       // [cx, topY, w] — launch pads that spring you upward
  endBoss?: { x: number; y: number; hp: number; speed: number; label: string; kind: string }  // guardian holding the extraction — spawns near the exit; beat it to unlock the goal (kind = boss behavior id)
}

// Horizontal Contra-style run-and-gun stages: push RIGHT through distinct
// sections — cross pits, ride movers, climb staircases, gun waves of enemies —
// to the extraction at the far right. Each stage has its own structural
// character (streets staircases / industrial conveyors+rise / sky rails+gaps /
// core hazard-corridors) and ends on the throne boss. Ground top is 600 so the
// pulled-back camera frames the action; pits are ~180px (jumpable, some
// mover-bridged); staircases climb in staged ~110px steps.
export const LEVELS: LevelDef[] = [
  {
    // NEON STREETS — the opening run, extended to the next tier. The tuned early
    // game (0–7000: entry/mid staircases, mover-bridged pits, catwalk line, turret
    // nests) is preserved intact; three NEW sub-sections then push to extraction:
    // SIGNAL CROSSING (mover-bridged voids + catwalks), STEAM TERRACE (bounce-pad
    // vertical beat), and a RUBBLE RUN hazard-gauntlet finale into a tank gate.
    name: 'NEON STREETS', theme: 'streets', w: 9500, h: 780, spawn: [120, 500], goal: [9470, 540],
    ground: [[0, 760, 600], [940, 1560, 600], [1740, 3800, 600], [3980, 5700, 600], [5880, 7420, 600], [7660, 7900, 600], [8140, 8380, 600], [8560, 8900, 600], [9020, 9500, 600]],
    plats: [[200, 430, 150], [1900, 410, 150], [2200, 390, 150], [3600, 360, 150], [4250, 410, 150], [5150, 400, 150], [6100, 400, 150], [6750, 380, 150], [7300, 400, 150], [7780, 380, 150], [8620, 420, 140], [8800, 340, 140], [8720, 260, 150], [9180, 410, 140], [9360, 390, 140]],
    walls: [
      [420, 550, 180, 120], [600, 490, 180, 240],                              // S1 entry staircase
      [1160, 540, 190, 130], [1350, 470, 190, 300],                            // S2 mid staircase
      [2980, 550, 190, 110], [3170, 490, 190, 230], [3360, 430, 190, 350],     // S4 mid 3-step climb
      [4980, 550, 190, 110], [5170, 490, 190, 230], [5360, 430, 190, 350],     // S6 mid 3-step climb
      [8260, 500, 150, 200],                                                   // A3 rubble-block turret perch (Signal Crossing)
    ],
    turrets: [[600, 490], [1350, 470], [3360, 430], [5360, 430], [6100, 400], [8260, 500], [8800, 340], [9360, 390]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 3, speed: 72 }, { kind: 'soldier', x: 420, y: 516, hp: 3, speed: 66 },
      { kind: 'soldier', x: 600, y: 456, hp: 3, speed: 66 }, { kind: 'soldier', x: 700, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 1160, y: 506, hp: 3, speed: 65 }, { kind: 'tank', x: 1500, y: 560, hp: 6, speed: 30 },
      { kind: 'charger', x: 1800, y: 566, hp: 4, speed: 64 }, { kind: 'soldier', x: 1900, y: 566, hp: 3, speed: 72 },
      { kind: 'charger', x: 2020, y: 566, hp: 4, speed: 66 }, { kind: 'soldier', x: 2140, y: 566, hp: 3, speed: 72 },
      { kind: 'soldier', x: 2400, y: 566, hp: 3, speed: 70 }, { kind: 'tank', x: 2500, y: 560, hp: 6, speed: 30 },
      { kind: 'soldier', x: 2800, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 3550, y: 566, hp: 3, speed: 70 }, { kind: 'soldier', x: 3700, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 4100, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 4250, y: 566, hp: 4, speed: 64 },
      { kind: 'tank', x: 4450, y: 560, hp: 6, speed: 30 }, { kind: 'soldier', x: 4850, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 5520, y: 566, hp: 3, speed: 70 }, { kind: 'tank', x: 5640, y: 560, hp: 7, speed: 30 },
      { kind: 'soldier', x: 5950, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 6150, y: 566, hp: 4, speed: 66 },
      { kind: 'tank', x: 6350, y: 560, hp: 7, speed: 30 }, { kind: 'soldier', x: 6720, y: 566, hp: 3, speed: 70 },
      { kind: 'charger', x: 6900, y: 566, hp: 4, speed: 66 },
      { kind: 'flyer', x: 1650, y: 280, hp: 3, speed: 52 }, { kind: 'flyer', x: 3250, y: 280, hp: 3, speed: 52 },
      { kind: 'flyer', x: 4900, y: 300, hp: 3, speed: 55 }, { kind: 'flyer', x: 6300, y: 300, hp: 3, speed: 55 },
      { kind: 'soldier', x: 7300, y: 566, hp: 3, speed: 70 }, { kind: 'soldier', x: 7780, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 8720, y: 566, hp: 3, speed: 68 }, { kind: 'flyer', x: 8600, y: 260, hp: 3, speed: 55 },
      { kind: 'soldier', x: 9050, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 9250, y: 566, hp: 4, speed: 64 },
      { kind: 'tank', x: 9410, y: 560, hp: 7, speed: 30 },
    ],
    pods: [[314, 545, 'spread'], [1782, 545, 'health'], [3550, 510, 'rapid'], [4250, 370, 'spread'], [5588, 545, 'health'], [6750, 340, 'rapid'], [7300, 370, 'rapid'], [7780, 350, 'health'], [8720, 230, 'laser'], [9180, 380, 'health']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1650, 590, 130, 'h', 95, 0.9], [7540, 590, 120, 'h', 110, 0.9], [8020, 590, 120, 'h', 110, 0.9]],
    hazards: [[1000, 600, 110], [2350, 600, 120], [4350, 600, 120], [6280, 600, 110], [9120, 600, 90], [9320, 600, 80]],
    bouncers: [[2050, 600, 90], [8640, 600, 90], [8820, 600, 90]],
    endBoss: { x: 9200, y: 450, hp: 24, speed: 60, label: 'NEON REAPER', kind: 'reaper' },
  },
  {
    // INDUSTRIAL RISE — factory. Early game preserved: conveyor shuttles bridge the
    // pits, a vertical lift climbs the "rise", spike vents, divers overhead. Extended
    // into three new beats: a CONVEYOR GAUNTLET (three shuttle-bridged pits), a
    // HIGHER-RISE lift arena (floor-emerging lift up to a turret perch), and a
    // SPIKE-VENT CORRIDOR run under an overhead PIPE-CATWALK to the extraction.
    name: 'INDUSTRIAL RISE', theme: 'industrial', w: 9500, h: 800, spawn: [120, 500], goal: [9490, 540],
    ground: [[0, 700, 600], [880, 1440, 600], [1620, 2200, 600], [2380, 4680, 600], [4860, 5800, 600], [5980, 7000, 600], [7190, 7410, 600], [7620, 7840, 600], [8050, 8980, 600], [9160, 9500, 600]],
    plats: [[250, 430, 150], [1150, 420, 170], [3010, 400, 160], [3450, 400, 150], [4300, 410, 160], [5100, 400, 150], [6300, 400, 150], [6800, 380, 150], [8960, 300, 140], [9200, 330, 150], [9380, 330, 150]],
    walls: [
      [450, 540, 200, 140],                                    // S1 machine housing
      [1750, 520, 160, 200], [1950, 440, 160, 320],            // S3 the RISE (staircase up)
      [2600, 540, 180, 120], [2790, 470, 180, 260],            // S4 staircase
      [4750, 540, 180, 120], [4940, 470, 180, 260],            // S6 mid staircase
    ],
    turrets: [[1950, 440], [2790, 470], [4940, 470], [6300, 400], [8960, 300], [9380, 330]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 3, speed: 65 }, { kind: 'tank', x: 630, y: 560, hp: 6, speed: 28 },
      { kind: 'soldier', x: 920, y: 566, hp: 3, speed: 68 }, { kind: 'soldier', x: 1150, y: 386, hp: 3, speed: 70 },
      { kind: 'charger', x: 1300, y: 566, hp: 4, speed: 62 }, { kind: 'soldier', x: 1400, y: 566, hp: 3, speed: 70 },
      { kind: 'diver', x: 1050, y: 300, hp: 3, speed: 100 }, { kind: 'soldier', x: 1750, y: 486, hp: 3, speed: 70 },
      { kind: 'tank', x: 2120, y: 560, hp: 7, speed: 30 }, { kind: 'diver', x: 2050, y: 300, hp: 4, speed: 104 },
      { kind: 'soldier', x: 2600, y: 506, hp: 3, speed: 70 }, { kind: 'tank', x: 3050, y: 560, hp: 7, speed: 30 },
      { kind: 'soldier', x: 3500, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 4200, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 4400, y: 566, hp: 4, speed: 62 },
      { kind: 'tank', x: 4550, y: 560, hp: 7, speed: 30 }, { kind: 'diver', x: 4600, y: 300, hp: 4, speed: 104 },
      { kind: 'soldier', x: 5120, y: 566, hp: 3, speed: 70 }, { kind: 'soldier', x: 5500, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 6050, y: 566, hp: 3, speed: 70 }, { kind: 'tank', x: 6250, y: 560, hp: 7, speed: 30 },
      { kind: 'charger', x: 6450, y: 566, hp: 4, speed: 62 }, { kind: 'diver', x: 6350, y: 300, hp: 4, speed: 104 },
      { kind: 'soldier', x: 6780, y: 566, hp: 3, speed: 70 }, { kind: 'soldier', x: 6920, y: 566, hp: 3, speed: 70 },
      { kind: 'soldier', x: 7300, y: 566, hp: 3, speed: 68 }, { kind: 'soldier', x: 7730, y: 566, hp: 3, speed: 70 },
      { kind: 'charger', x: 8160, y: 566, hp: 4, speed: 62 }, { kind: 'diver', x: 7550, y: 300, hp: 4, speed: 104 },
      { kind: 'diver', x: 8000, y: 300, hp: 4, speed: 104 },
      { kind: 'tank', x: 8540, y: 560, hp: 7, speed: 30 }, { kind: 'soldier', x: 8650, y: 566, hp: 3, speed: 70 },
      { kind: 'charger', x: 8920, y: 566, hp: 4, speed: 62 }, { kind: 'diver', x: 8800, y: 300, hp: 4, speed: 104 },
      { kind: 'soldier', x: 9365, y: 566, hp: 3, speed: 70 }, { kind: 'tank', x: 9470, y: 560, hp: 7, speed: 30 },
      { kind: 'diver', x: 9280, y: 300, hp: 4, speed: 104 },
      { kind: 'flyer', x: 850, y: 300, hp: 3, speed: 55 }, { kind: 'flyer', x: 4700, y: 280, hp: 3, speed: 55 },
      { kind: 'flyer', x: 6100, y: 280, hp: 3, speed: 55 }, { kind: 'flyer', x: 8560, y: 285, hp: 3, speed: 55 },
    ],
    pods: [[620, 510, 'rapid'], [2150, 510, 'health'], [3016, 545, 'laser'], [5164, 545, 'health'], [6300, 360, 'health'], [7300, 540, 'rapid'], [8600, 540, 'health'], [8960, 270, 'laser'], [9180, 540, 'spread']],
    movers: [[790, 590, 140, 'h', 90, 0.85], [1530, 590, 130, 'h', 95, 0.9], [2290, 500, 120, 'v', 150, 0.7], [4680, 590, 130, 'h', 90, 0.85], [5890, 590, 130, 'h', 90, 0.85], [7095, 590, 130, 'h', 105, 0.9], [7515, 590, 130, 'h', 120, 0.9], [7945, 590, 130, 'h', 120, 0.9], [8810, 451, 120, 'v', 150, 0.7]],
    hazards: [[1000, 600, 130], [2450, 600, 120], [4300, 600, 120], [6200, 600, 120], [9300, 600, 90], [9420, 600, 70]],
    bouncers: [[1250, 600, 90], [9200, 600, 70]],
    endBoss: { x: 9250, y: 450, hp: 32, speed: 55, label: 'FOUNDRY BRUTE', kind: 'brute' },
  },
  {
    // SKY RAIL — high altitude, the LONGEST world. Tuned intro (rail crossings +
    // vertical lift + bounce-to-plats) preserved, then four new motifs: a MOVER-RAIL
    // CHAIN over wide void pits, a BOUNCE-PAD ASCENT onto high catwalks, a PIT-HOPPING
    // GAUNTLET, and a PYLON-CHOKE finale. Aerial-heavy; flyers stay sparse.
    name: 'SKY RAIL', theme: 'sky', w: 9800, h: 820, spawn: [120, 500], goal: [9760, 540],
    ground: [[0, 640, 600], [820, 1300, 600], [1480, 1960, 600], [2140, 2620, 600], [2800, 4000, 600], [4240, 4480, 600], [4720, 4960, 600], [5200, 5440, 600], [5680, 6060, 600], [6240, 8800, 600], [8980, 9800, 600]],
    plats: [[300, 420, 140], [520, 350, 140], [920, 410, 150], [1650, 400, 150], [1850, 320, 150], [2400, 400, 150], [3120, 380, 150], [3500, 320, 150], [4360, 380, 140], [4840, 340, 140], [5320, 380, 140], [5760, 340, 150], [6340, 450, 150], [6560, 370, 150], [6760, 300, 160], [6980, 340, 150], [7180, 300, 160], [7480, 400, 140], [7860, 380, 140], [8270, 360, 140], [8680, 380, 140], [9600, 360, 150]],
    walls: [[1100, 540, 180, 120], [3300, 520, 180, 180], [9080, 540, 90, 160], [9250, 430, 90, 270], [9420, 320, 90, 380]],
    turrets: [[520, 350], [1850, 320], [3500, 320], [4840, 340], [5760, 340], [6760, 300], [7180, 300], [8270, 360], [9250, 430], [9420, 320]],
    enemies: [
      { kind: 'soldier', x: 300, y: 566, hp: 3, speed: 70 }, { kind: 'charger', x: 560, y: 566, hp: 5, speed: 64 },
      { kind: 'soldier', x: 870, y: 566, hp: 3, speed: 75 }, { kind: 'tank', x: 1600, y: 560, hp: 7, speed: 30 },
      { kind: 'soldier', x: 1750, y: 566, hp: 3, speed: 75 }, { kind: 'charger', x: 2300, y: 566, hp: 5, speed: 66 },
      { kind: 'soldier', x: 2900, y: 566, hp: 4, speed: 70 }, { kind: 'tank', x: 3550, y: 560, hp: 8, speed: 32 },
      { kind: 'diver', x: 900, y: 300, hp: 4, speed: 104 }, { kind: 'diver', x: 2000, y: 300, hp: 4, speed: 108 },
      { kind: 'diver', x: 3000, y: 300, hp: 4, speed: 108 },
      { kind: 'flyer', x: 450, y: 260, hp: 3, speed: 65 }, { kind: 'flyer', x: 2400, y: 240, hp: 4, speed: 70 },
      { kind: 'soldier', x: 4360, y: 566, hp: 4, speed: 72 }, { kind: 'charger', x: 4840, y: 566, hp: 5, speed: 66 },
      { kind: 'soldier', x: 5320, y: 566, hp: 4, speed: 72 }, { kind: 'tank', x: 5880, y: 560, hp: 8, speed: 32 },
      { kind: 'diver', x: 4500, y: 300, hp: 4, speed: 108 }, { kind: 'diver', x: 5120, y: 300, hp: 4, speed: 108 },
      { kind: 'diver', x: 5620, y: 300, hp: 4, speed: 110 }, { kind: 'flyer', x: 5000, y: 250, hp: 4, speed: 70 },
      { kind: 'soldier', x: 6400, y: 566, hp: 4, speed: 72 }, { kind: 'soldier', x: 6650, y: 566, hp: 4, speed: 75 },
      { kind: 'charger', x: 7100, y: 566, hp: 5, speed: 66 }, { kind: 'soldier', x: 7350, y: 566, hp: 4, speed: 72 },
      { kind: 'diver', x: 6500, y: 300, hp: 4, speed: 108 }, { kind: 'diver', x: 7050, y: 300, hp: 4, speed: 110 },
      { kind: 'flyer', x: 6900, y: 260, hp: 4, speed: 70 },
      { kind: 'charger', x: 7860, y: 566, hp: 5, speed: 68 }, { kind: 'soldier', x: 8270, y: 566, hp: 4, speed: 75 },
      { kind: 'charger', x: 8680, y: 566, hp: 5, speed: 68 },
      { kind: 'diver', x: 7850, y: 300, hp: 4, speed: 110 }, { kind: 'diver', x: 8200, y: 300, hp: 4, speed: 112 },
      { kind: 'diver', x: 8600, y: 300, hp: 4, speed: 112 },
      { kind: 'soldier', x: 9165, y: 566, hp: 4, speed: 72 }, { kind: 'soldier', x: 9335, y: 566, hp: 4, speed: 72 },
      { kind: 'charger', x: 9520, y: 566, hp: 5, speed: 66 }, { kind: 'tank', x: 9650, y: 560, hp: 9, speed: 32 },
      { kind: 'soldier', x: 9745, y: 566, hp: 4, speed: 75 },
    ],
    pods: [[520, 320, 'laser'], [1650, 370, 'health'], [3150, 350, 'fire'], [4360, 350, 'spread'], [6760, 270, 'health'], [7480, 360, 'rapid'], [8680, 340, 'health'], [9600, 330, 'laser']],
    movers: [[730, 590, 130, 'h', 95, 0.9], [1390, 590, 130, 'h', 95, 0.9], [2050, 500, 120, 'v', 160, 0.7], [2710, 590, 130, 'h', 95, 0.9], [4120, 590, 130, 'h', 95, 0.9], [4600, 590, 130, 'h', 95, 0.9], [5080, 590, 130, 'h', 95, 0.9], [5560, 590, 130, 'h', 95, 0.9], [6150, 470, 110, 'v', 150, 0.7]],
    hazards: [[950, 600, 110], [6510, 600, 100], [7220, 600, 90]],
    bouncers: [[400, 600, 90], [1700, 600, 90], [3200, 600, 90], [6340, 600, 90], [6600, 600, 90], [7060, 600, 90], [7360, 600, 90]],
    endBoss: { x: 9450, y: 430, hp: 46, speed: 66, label: 'SKY TYRANT', kind: 'tyrant' },
  },
  {
    // CORE ACCESS — reactor interior, doubled into the hardest run world before the throne.
    // Preserves the tuned early run (0→6540), then three new motifs: A) spike-vent gauntlet
    // threaded with movers, B) a tight choke-and-climb staircase under turret fire, C) a coil
    // chamber with bouncer verticality. Hazard-heavy throughout; heavier tanks/chargers; flyers sparse.
    name: 'CORE ACCESS', theme: 'core', w: 9400, h: 780, spawn: [120, 500], goal: [9360, 540],
    ground: [[0, 760, 600], [940, 1520, 600], [1700, 2360, 600], [2540, 4640, 600], [4820, 5800, 600], [5980, 6540, 600], [6740, 7020, 600], [7220, 7520, 600], [7720, 9400, 600]],
    plats: [[280, 430, 140], [1020, 410, 150], [2200, 400, 150], [3600, 380, 150], [4300, 410, 150], [5100, 400, 150], [6300, 400, 150], [6880, 360, 150], [8820, 320, 150], [8970, 360, 150], [9120, 320, 150]],
    walls: [
      [500, 500, 160, 200],                                    // S1 choke
      [1200, 480, 180, 240], [1400, 540, 180, 120],            // S2 tiered
      [2000, 480, 180, 240],                                   // S3 choke
      [2900, 500, 180, 220], [3100, 440, 180, 320],            // S4 staircase
      [4950, 500, 180, 220], [5150, 440, 180, 320],            // S6 mid staircase
      [7960, 540, 160, 160], [8140, 430, 160, 270], [8320, 320, 160, 380],  // S8 choke-and-climb (110px steps)
    ],
    turrets: [[1200, 480], [2000, 480], [3100, 440], [5150, 440], [6300, 400], [8320, 320], [8970, 360]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 4, speed: 70 }, { kind: 'tank', x: 720, y: 560, hp: 8, speed: 30 },
      { kind: 'soldier', x: 1000, y: 566, hp: 4, speed: 75 }, { kind: 'charger', x: 1750, y: 566, hp: 5, speed: 66 },
      { kind: 'tank', x: 1850, y: 560, hp: 8, speed: 32 }, { kind: 'soldier', x: 2200, y: 566, hp: 4, speed: 75 },
      { kind: 'soldier', x: 2650, y: 566, hp: 4, speed: 75 }, { kind: 'tank', x: 3400, y: 560, hp: 9, speed: 32 },
      { kind: 'soldier', x: 3600, y: 566, hp: 4, speed: 75 },
      { kind: 'soldier', x: 4200, y: 566, hp: 4, speed: 75 }, { kind: 'tank', x: 4450, y: 560, hp: 8, speed: 30 },
      { kind: 'soldier', x: 5300, y: 566, hp: 4, speed: 75 }, { kind: 'charger', x: 5400, y: 566, hp: 5, speed: 66 },
      { kind: 'tank', x: 5550, y: 560, hp: 9, speed: 32 },
      { kind: 'soldier', x: 6050, y: 566, hp: 4, speed: 75 }, { kind: 'tank', x: 6250, y: 560, hp: 8, speed: 30 },
      { kind: 'charger', x: 6450, y: 566, hp: 5, speed: 66 },
      { kind: 'charger', x: 6970, y: 566, hp: 5, speed: 68 }, { kind: 'soldier', x: 7470, y: 566, hp: 4, speed: 75 },
      { kind: 'tank', x: 7760, y: 560, hp: 9, speed: 32 }, { kind: 'charger', x: 7860, y: 566, hp: 6, speed: 68 },
      { kind: 'tank', x: 8710, y: 560, hp: 9, speed: 32 }, { kind: 'charger', x: 8920, y: 566, hp: 6, speed: 70 },
      { kind: 'soldier', x: 9030, y: 566, hp: 5, speed: 78 }, { kind: 'soldier', x: 9200, y: 566, hp: 5, speed: 78 },
      { kind: 'flyer', x: 850, y: 280, hp: 4, speed: 75 }, { kind: 'flyer', x: 4900, y: 280, hp: 4, speed: 80 },
      { kind: 'flyer', x: 6100, y: 280, hp: 4, speed: 80 }, { kind: 'flyer', x: 8100, y: 260, hp: 4, speed: 82 },
    ],
    pods: [[350, 510, 'rapid'], [970, 510, 'health'], [2224, 545, 'laser'], [3324, 545, 'fire'], [5400, 510, 'health'], [6300, 360, 'health'], [6880, 320, 'spread'], [7800, 510, 'laser'], [8820, 280, 'health'], [9120, 280, 'fire']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1610, 590, 130, 'h', 95, 0.9], [2450, 590, 120, 'h', 85, 0.9], [4640, 590, 120, 'h', 85, 0.9], [5890, 590, 120, 'h', 85, 0.9], [6640, 590, 130, 'h', 100, 0.9], [7120, 590, 130, 'h', 100, 0.9], [7620, 590, 130, 'h', 100, 0.9]],
    hazards: [[650, 600, 110], [1050, 600, 120], [1780, 600, 120], [2700, 600, 120], [3450, 600, 120], [4300, 600, 120], [5250, 600, 120], [6180, 600, 120], [6880, 600, 120], [7370, 600, 120], [8440, 600, 80], [9280, 600, 90]],
    bouncers: [[1500, 600, 90], [8820, 600, 90], [9120, 600, 90]],
    endBoss: { x: 9080, y: 430, hp: 56, speed: 60, label: 'CORE WARDEN', kind: 'warden' },
  },
  {
    // VOLT SPIRE — the electrified ascent to the throne. Past the CORE the run turns
    // vertical: tesla-coil chokes, arc-strip floors, and mover rails over charged voids,
    // climbing through a choke-and-climb finale to the guardian. Hardest RUN stage before
    // the throne — heavier tanks/chargers and diver drones raining from the coils above.
    name: 'VOLT SPIRE', theme: 'volt', w: 9600, h: 800, spawn: [120, 500], goal: [9560, 540],
    ground: [[0, 780, 600], [960, 1540, 600], [1720, 2300, 600], [2480, 4260, 600], [4440, 5400, 600], [5580, 6560, 600], [6760, 7040, 600], [7240, 7520, 600], [7720, 9600, 600]],
    plats: [[280, 430, 150], [1050, 410, 150], [2000, 390, 150], [2200, 300, 140], [3000, 380, 150], [3500, 310, 150], [4300, 400, 150], [5100, 390, 150], [6300, 400, 150], [6820, 350, 150], [8760, 320, 150], [8940, 360, 150], [9120, 320, 150]],
    walls: [
      [500, 500, 160, 200],                                    // S1 coil choke
      [1250, 480, 180, 240], [1450, 540, 180, 120],            // S2 tiered pylons
      [2900, 500, 180, 220], [3100, 440, 180, 320],            // S4 staircase climb (110px steps)
      [4950, 500, 180, 220], [5150, 440, 180, 320],            // S6 mid staircase
      [7960, 540, 160, 160], [8140, 430, 160, 270], [8320, 320, 160, 380],  // S8 choke-and-climb finale
    ],
    turrets: [[1250, 480], [2000, 390], [3100, 440], [5150, 440], [6300, 400], [8320, 320], [8940, 360]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 5, speed: 76 }, { kind: 'soldier', x: 340, y: 566, hp: 5, speed: 76 },
      { kind: 'tank', x: 700, y: 560, hp: 9, speed: 32 }, { kind: 'soldier', x: 1000, y: 566, hp: 5, speed: 78 },
      { kind: 'charger', x: 1080, y: 566, hp: 6, speed: 68 }, { kind: 'soldier', x: 1145, y: 566, hp: 5, speed: 78 },
      { kind: 'soldier', x: 1780, y: 566, hp: 5, speed: 78 }, { kind: 'charger', x: 1880, y: 566, hp: 6, speed: 68 },
      { kind: 'tank', x: 2050, y: 560, hp: 9, speed: 32 }, { kind: 'soldier', x: 2250, y: 566, hp: 5, speed: 78 },
      { kind: 'soldier', x: 2600, y: 566, hp: 5, speed: 78 }, { kind: 'tank', x: 2750, y: 560, hp: 10, speed: 32 },
      { kind: 'soldier', x: 3300, y: 566, hp: 5, speed: 78 }, { kind: 'charger', x: 3450, y: 566, hp: 6, speed: 70 },
      { kind: 'tank', x: 3620, y: 560, hp: 10, speed: 32 }, { kind: 'soldier', x: 3820, y: 566, hp: 5, speed: 78 },
      { kind: 'soldier', x: 4020, y: 566, hp: 5, speed: 78 }, { kind: 'charger', x: 4160, y: 566, hp: 6, speed: 70 },
      { kind: 'soldier', x: 4520, y: 566, hp: 5, speed: 78 }, { kind: 'tank', x: 4720, y: 560, hp: 9, speed: 32 },
      { kind: 'soldier', x: 5300, y: 566, hp: 5, speed: 80 }, { kind: 'charger', x: 5380, y: 566, hp: 6, speed: 70 },
      { kind: 'soldier', x: 5650, y: 566, hp: 5, speed: 80 }, { kind: 'tank', x: 5850, y: 560, hp: 10, speed: 32 },
      { kind: 'charger', x: 6050, y: 566, hp: 6, speed: 70 }, { kind: 'soldier', x: 6250, y: 566, hp: 5, speed: 80 },
      { kind: 'charger', x: 6450, y: 566, hp: 6, speed: 72 },
      { kind: 'charger', x: 6900, y: 566, hp: 6, speed: 72 }, { kind: 'soldier', x: 7380, y: 566, hp: 5, speed: 80 },
      { kind: 'soldier', x: 7800, y: 566, hp: 5, speed: 80 },
      { kind: 'tank', x: 8500, y: 560, hp: 10, speed: 32 }, { kind: 'charger', x: 8700, y: 566, hp: 6, speed: 72 },
      { kind: 'soldier', x: 8900, y: 566, hp: 6, speed: 82 }, { kind: 'soldier', x: 9060, y: 566, hp: 6, speed: 82 },
      { kind: 'charger', x: 9260, y: 566, hp: 7, speed: 72 }, { kind: 'tank', x: 9460, y: 560, hp: 10, speed: 32 },
      { kind: 'diver', x: 1050, y: 300, hp: 5, speed: 108 }, { kind: 'diver', x: 2050, y: 300, hp: 5, speed: 110 },
      { kind: 'diver', x: 3000, y: 300, hp: 5, speed: 110 }, { kind: 'diver', x: 4600, y: 300, hp: 5, speed: 112 },
      { kind: 'diver', x: 5100, y: 300, hp: 5, speed: 112 }, { kind: 'diver', x: 6300, y: 300, hp: 5, speed: 112 },
      { kind: 'diver', x: 7000, y: 300, hp: 5, speed: 114 }, { kind: 'diver', x: 8600, y: 300, hp: 5, speed: 114 },
      { kind: 'flyer', x: 850, y: 280, hp: 5, speed: 82 }, { kind: 'flyer', x: 4700, y: 280, hp: 5, speed: 84 },
      { kind: 'flyer', x: 6100, y: 280, hp: 5, speed: 84 }, { kind: 'flyer', x: 8100, y: 270, hp: 5, speed: 86 },
    ],
    pods: [[350, 510, 'rapid'], [1000, 510, 'health'], [2000, 350, 'laser'], [3300, 545, 'fire'], [4520, 545, 'health'], [5650, 545, 'spread'], [6300, 360, 'health'], [6820, 310, 'laser'], [8500, 510, 'health'], [9120, 280, 'fire']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1630, 590, 130, 'h', 95, 0.9], [2390, 590, 120, 'h', 85, 0.9], [4350, 590, 120, 'h', 85, 0.9], [5490, 590, 120, 'h', 85, 0.9], [6660, 590, 130, 'h', 100, 0.9], [7140, 590, 130, 'h', 100, 0.9], [7620, 590, 130, 'h', 100, 0.9], [2200, 470, 110, 'v', 150, 0.7]],
    hazards: [[650, 600, 110], [1780, 600, 120], [3450, 600, 120], [5300, 600, 110], [6250, 600, 110], [8600, 600, 90], [9300, 600, 90]],
    bouncers: [[2100, 600, 90], [3800, 600, 90], [8760, 600, 90]],
    endBoss: { x: 9280, y: 430, hp: 60, speed: 62, label: 'VOLT WRAITH', kind: 'wraith' },
  },
  {
    // CRYO VAULT — a frozen data-vault penultimate sector. Geometry is the proven VOLT SPIRE
    // layout (guaranteed-completable staircases, movers, hazard pits, launch pads) re-skinned in
    // cold blues, with a tougher enemy mix and the CRYO REVENANT guardian holding the extraction.
    name: 'CRYO VAULT', theme: 'frost', w: 9600, h: 800, spawn: [120, 500], goal: [9560, 540],
    ground: [[0, 780, 600], [960, 1540, 600], [1720, 2300, 600], [2480, 4260, 600], [4440, 5400, 600], [5580, 6560, 600], [6760, 7040, 600], [7240, 7520, 600], [7720, 9600, 600]],
    plats: [[280, 430, 150], [1050, 410, 150], [2000, 390, 150], [2200, 300, 140], [3000, 380, 150], [3500, 310, 150], [4300, 400, 150], [5100, 390, 150], [6300, 400, 150], [6820, 350, 150], [8760, 320, 150], [8940, 360, 150], [9120, 320, 150]],
    walls: [
      [500, 500, 160, 200],
      [1250, 480, 180, 240], [1450, 540, 180, 120],
      [2900, 500, 180, 220], [3100, 440, 180, 320],
      [4950, 500, 180, 220], [5150, 440, 180, 320],
      [7960, 540, 160, 160], [8140, 430, 160, 270], [8320, 320, 160, 380],
    ],
    turrets: [[1250, 480], [2000, 390], [3100, 440], [5150, 440], [6300, 400], [8320, 320], [8940, 360]],
    enemies: [
      { kind: 'soldier', x: 250, y: 566, hp: 6, speed: 80 }, { kind: 'soldier', x: 340, y: 566, hp: 6, speed: 80 },
      { kind: 'tank', x: 700, y: 560, hp: 11, speed: 32 }, { kind: 'charger', x: 1080, y: 566, hp: 7, speed: 72 },
      { kind: 'soldier', x: 1780, y: 566, hp: 6, speed: 82 }, { kind: 'tank', x: 2050, y: 560, hp: 11, speed: 32 },
      { kind: 'charger', x: 2600, y: 566, hp: 7, speed: 72 }, { kind: 'tank', x: 2750, y: 560, hp: 12, speed: 32 },
      { kind: 'soldier', x: 3300, y: 566, hp: 6, speed: 82 }, { kind: 'charger', x: 3450, y: 566, hp: 7, speed: 74 },
      { kind: 'tank', x: 3620, y: 560, hp: 12, speed: 32 }, { kind: 'soldier', x: 4020, y: 566, hp: 6, speed: 82 },
      { kind: 'charger', x: 4160, y: 566, hp: 7, speed: 74 }, { kind: 'tank', x: 4720, y: 560, hp: 11, speed: 32 },
      { kind: 'soldier', x: 5300, y: 566, hp: 6, speed: 84 }, { kind: 'charger', x: 5380, y: 566, hp: 7, speed: 74 },
      { kind: 'tank', x: 5850, y: 560, hp: 12, speed: 32 }, { kind: 'charger', x: 6050, y: 566, hp: 7, speed: 74 },
      { kind: 'charger', x: 6900, y: 566, hp: 7, speed: 76 }, { kind: 'soldier', x: 7380, y: 566, hp: 6, speed: 84 },
      { kind: 'tank', x: 8500, y: 560, hp: 12, speed: 32 }, { kind: 'charger', x: 8700, y: 566, hp: 7, speed: 76 },
      { kind: 'soldier', x: 8900, y: 566, hp: 7, speed: 86 }, { kind: 'charger', x: 9260, y: 566, hp: 8, speed: 76 },
      { kind: 'diver', x: 1050, y: 300, hp: 6, speed: 114 }, { kind: 'diver', x: 2050, y: 300, hp: 6, speed: 114 },
      { kind: 'diver', x: 3000, y: 300, hp: 6, speed: 116 }, { kind: 'diver', x: 4600, y: 300, hp: 6, speed: 116 },
      { kind: 'diver', x: 5100, y: 300, hp: 6, speed: 118 }, { kind: 'diver', x: 6300, y: 300, hp: 6, speed: 118 },
      { kind: 'diver', x: 7000, y: 300, hp: 6, speed: 120 }, { kind: 'diver', x: 8600, y: 300, hp: 6, speed: 120 },
      { kind: 'flyer', x: 850, y: 280, hp: 6, speed: 88 }, { kind: 'flyer', x: 4700, y: 280, hp: 6, speed: 90 },
      { kind: 'flyer', x: 6100, y: 280, hp: 6, speed: 90 }, { kind: 'flyer', x: 8100, y: 270, hp: 6, speed: 92 },
    ],
    pods: [[350, 510, 'laser'], [1000, 510, 'health'], [2000, 350, 'spread'], [3300, 545, 'rapid'], [4520, 545, 'health'], [5650, 545, 'fire'], [6300, 360, 'health'], [6820, 310, 'laser'], [8500, 510, 'health'], [9120, 280, 'spread']],
    movers: [[850, 590, 120, 'h', 85, 0.9], [1630, 590, 130, 'h', 95, 0.9], [2390, 590, 120, 'h', 85, 0.9], [4350, 590, 120, 'h', 85, 0.9], [5490, 590, 120, 'h', 85, 0.9], [6660, 590, 130, 'h', 100, 0.9], [7140, 590, 130, 'h', 100, 0.9], [7620, 590, 130, 'h', 100, 0.9], [2200, 470, 110, 'v', 150, 0.7]],
    hazards: [[650, 600, 110], [1780, 600, 120], [3450, 600, 120], [5300, 600, 110], [6250, 600, 110], [8600, 600, 90], [9300, 600, 90]],
    bouncers: [[2100, 600, 90], [3800, 600, 90], [8760, 600, 90]],
    endBoss: { x: 9280, y: 430, hp: 62, speed: 64, label: 'CRYO REVENANT', kind: 'revenant' },
  },
  {
    // APEX THRONE — the final boss arena. A compact, symmetric throne where the
    // Apex boss looms dead-center over a single solid floor (kept low enough to
    // stay in the pulled-back frame). Flanking ledges + a pair of launch pads give
    // dodge-friendly verticality to break the aimed fan volleys and rain fire back;
    // two side spike strips pressure the flanks while the center corridor under the
    // boss stays clear. Clear every enemy — boss, tanks, flyers, pillar turrets — to win.
    name: 'APEX THRONE', theme: 'throne', w: 2800, h: 760, spawn: [120, 500], goal: [0, 0],
    ground: [[0, 2800, 600]],
    plats: [[600, 450, 160], [1000, 400, 150], [1800, 400, 150], [2200, 450, 160]],
    walls: [[250, 520, 110, 160], [2550, 520, 110, 160]],
    turrets: [[250, 520], [2550, 520]],
    enemies: [
      { kind: 'boss', x: 1400, y: 330, hp: 64, speed: 55 },
      { kind: 'flyer', x: 500, y: 230, hp: 3, speed: 55 }, { kind: 'flyer', x: 2300, y: 230, hp: 3, speed: 55 },
      { kind: 'tank', x: 650, y: 560, hp: 8, speed: 28 }, { kind: 'tank', x: 2150, y: 560, hp: 8, speed: 28 },
    ],
    pods: [[600, 400, 'health'], [1000, 360, 'laser'], [1800, 360, 'spread'], [2200, 400, 'fire']],
    hazards: [[780, 600, 120], [2020, 600, 120]],
    bouncers: [[1150, 600, 100], [1650, 600, 100]],
  },
]

// APEX TRIALS arena — a single symmetric boss-duel floor (goal [0,0] ⇒ isBossLevel). No ambient
// waves or turrets; the rush controller spawns bosses into it one after another. Pods refill mid-fight.
const RUSH_ARENA: LevelDef = {
  name: 'APEX TRIALS', theme: 'throne', w: 2800, h: 760, spawn: [1400, 500], goal: [0, 0],
  ground: [[0, 2800, 600]],
  plats: [[560, 450, 160], [1000, 400, 150], [1800, 400, 150], [2240, 450, 160]],
  walls: [[250, 520, 110, 160], [2550, 520, 110, 160]],
  turrets: [],
  enemies: [],
  pods: [[560, 400, 'health'], [1000, 360, 'laser'], [1800, 360, 'spread'], [2240, 400, 'fire']],
  hazards: [[780, 600, 120], [2020, 600, 120]],
  bouncers: [[1150, 600, 100], [1650, 600, 100]],
}
const RUSH_LEVELS: LevelDef[] = [RUSH_ARENA]

// Level Lab injection: when set, the scene plays THESE levels instead of the campaign.
let LAB_LEVELS: LevelDef[] | null = null
export function setLabLevels(levels: LevelDef[] | null) { LAB_LEVELS = levels }

interface TouchState {
  left: boolean
  right: boolean
  jump: boolean
  shoot: boolean
  up: boolean
  down: boolean
  dash: boolean
}

// Gamepad actions that can be remapped (press-to-bind, persisted to localStorage).
// Movement + aim stay on the d-pad / left stick; only these action buttons rebind.
type PadBindAction = 'fire' | 'jump' | 'swap' | 'pause' | 'dash'
const PAD_BIND_DEFAULTS: Record<PadBindAction, number> = { fire: 2, jump: 0, swap: 3, pause: 9, dash: 5 }
const PAD_BIND_ORDER: PadBindAction[] = ['fire', 'jump', 'swap', 'dash', 'pause']
const PAD_BIND_LABEL: Record<PadBindAction, string> = { fire: 'FIRE', jump: 'JUMP', swap: 'SWAP WEAPON', pause: 'PAUSE', dash: 'DASH' }
// Normalised gamepad snapshot read straight from navigator.getGamepads() (see readPad).
type PadState = { buttons: boolean[]; axes: number[]; id: string }
// Bridge to the React DOM gutter controls (off-canvas buttons in the letterbox
// gutters). React writes `pad` + `gutter`; the scene installs `act` for pause/mute/swap.
type ApexBridge = { pad: Record<string, boolean>; gutter: boolean; act: ((name: string) => void) | null; state?: string; dashActive?: boolean }

// One source of truth for every powerup: pod tint, display name, and a plain-language
// descriptor of what it does. The pod sprite, the on-pickup callout, and the HUD all read
// from here so a pickup is instantly legible — you see the colour, the name, AND the effect.
type PowerupInfo = { label: string; desc: string; color: number; hex: string; glyph: string }
const POWERUP_INFO: Record<string, PowerupInfo> = {
  health: { label: 'HEALTH', desc: '+1 HEART',        color: 0x4ade80, hex: '#4ade80', glyph: '+' },
  spread: { label: 'SPREAD', desc: '5-WAY SHOT',      color: 0x22d3ee, hex: '#22d3ee', glyph: 'S' },
  rapid:  { label: 'RAPID',  desc: 'RAPID FIRE',      color: 0xfbbf24, hex: '#fbbf24', glyph: 'R' },
  laser:  { label: 'LASER',  desc: 'PIERCING BEAM',   color: 0xe879f9, hex: '#e879f9', glyph: 'L' },
  fire:   { label: 'FIRE',   desc: 'BURNING ROUNDS',  color: 0xfb923c, hex: '#fb923c', glyph: 'F' },
  arc:    { label: 'ARC',    desc: 'LOBBED AoE BOMB', color: 0x84cc16, hex: '#84cc16', glyph: 'A' },
}
const powerupInfo = (kind: string): PowerupInfo =>
  POWERUP_INFO[kind] || { label: kind.toUpperCase(), desc: '', color: 0xffffff, hex: '#ffffff', glyph: '?' }

// Per-boss identity: signature move rotation (+ an enraged phase-2 rotation), attack
// cadence (ms), and an accent colour that tints its sprite and its bolts so each of the
// five fights reads as a distinct boss instead of the same fan-volley scaled up.
// Moves: burst=quick aimed shots, fan/spread=aimed volleys, ring=radial bullets,
// sweep=rotating beam of bolts, lob=heavy slow shots, dash=lunge across, pound=slam +
// ground ring, dive=swoop at you, summon=call flyers.
const BOSS_MOVES: Record<string, string[]> = {
  reaper:   ['burst', 'dash', 'lance', 'burst', 'spread'],
  brute:    ['lob', 'pound', 'nova', 'lob', 'ring'],
  tyrant:   ['spread', 'dive', 'cross', 'summon', 'spread', 'ring'],
  warden:   ['ring', 'sweep', 'mines', 'spiral', 'ring', 'lob'],
  sentinel: ['fan', 'ring', 'nova', 'burst', 'dive', 'spread'],
  wraith:   ['dash', 'ring', 'seeker', 'lance', 'burst', 'sweep', 'spread'],
  revenant: ['spread', 'nova', 'lance', 'ring', 'sweep', 'burst'],
}
const BOSS_MOVES_P2: Record<string, string[]> = {
  reaper:   ['dash', 'burst', 'curtain', 'nova', 'spread', 'dash', 'ring'],
  brute:    ['pound', 'cross', 'ring', 'lob', 'pound'],
  tyrant:   ['dive', 'spread', 'curtain', 'spiral', 'ring', 'summon', 'dive'],
  warden:   ['sweep', 'cross', 'ring', 'sweep', 'lob', 'ring'],
  sentinel: ['fan', 'ring', 'mines', 'dive', 'lance', 'sweep', 'pound', 'burst'],
  wraith:   ['dash', 'sweep', 'spiral', 'ring', 'dive', 'ring', 'burst'],
  revenant: ['nova', 'lance', 'seeker', 'spiral', 'ring', 'spread', 'dash', 'nova'],
}
// Classify each boss move so the wind-up telegraph can play a matching audio cue —
// a rising whine for projectile volleys, a low whoosh for lunges, a warble for summons —
// letting players dodge by ear when the boss is off-screen or the field is bullet-soup.
const BOSS_MOVE_CLASS: Record<string, 'charge' | 'lunge' | 'summon'> = {
  burst: 'charge', fan: 'charge', spread: 'charge', ring: 'charge', lob: 'charge', sweep: 'charge',
  cross: 'charge', spiral: 'charge', lance: 'charge', nova: 'charge',
  curtain: 'charge', seeker: 'charge', mines: 'summon',
  dash: 'lunge', dive: 'lunge', pound: 'lunge', summon: 'summon',
}
// Wind-up telegraph COLOUR per move — a learnable visual tell for what the player must DO, matching the
// audio cue so the boss's 14 moves stop sharing one indistinguishable gold flash: RED = aimed straight at
// you (move!), GOLD = a spread/volley (weave to the edge), GREEN = a curtain with one safe lane (find it),
// VIOLET = a summon/trap (watch for spawns). Any move not listed falls back to the classic gold.
const BOSS_TELE_COLOR: Record<string, number> = {
  lance: 0xff5555, seeker: 0xff5555, dash: 0xff5555, dive: 0xff5555, pound: 0xff5555, burst: 0xff5555,   // burst = 3 AIMED bolts → RED (move!)
  fan: 0xffe08a, spread: 0xffe08a, sweep: 0xffe08a, lob: 0xffe08a,
  ring: 0xffe08a, nova: 0xffe08a, spiral: 0xffe08a, cross: 0xffe08a,
  curtain: 0x86efac,
  mines: 0xc4b5fd, summon: 0xc4b5fd,
}

const BOSS_CADENCE: Record<string, number> = { reaper: 1100, brute: 1750, tyrant: 1500, warden: 1350, sentinel: 1250, wraith: 1200, revenant: 1300 }
const BOSS_HOME_Y: Record<string, number> = { reaper: 430, brute: 500, tyrant: 350, warden: 420, sentinel: 400, wraith: 380, revenant: 400 }

// APEX TRIALS boss-rush stats per kind (base HP ramps with position in advanceTrials).
const BOSS_RUSH: Record<string, { label: string; hp: number; speed: number }> = {
  reaper:   { label: 'NEON REAPER',   hp: 40, speed: 64 },
  brute:    { label: 'FOUNDRY BRUTE', hp: 46, speed: 56 },
  tyrant:   { label: 'SKY TYRANT',    hp: 48, speed: 66 },
  warden:   { label: 'CORE WARDEN',   hp: 50, speed: 60 },
  sentinel: { label: 'APEX SENTINEL', hp: 48, speed: 58 },
  wraith:   { label: 'VOLT WRAITH',   hp: 52, speed: 62 },
  revenant: { label: 'CRYO REVENANT', hp: 54, speed: 64 },
}
const BOSS_ACCENT: Record<string, number> = { reaper: 0xf43f5e, brute: 0xfb923c, tyrant: 0x67e8f9, warden: 0xc084fc, sentinel: 0xfbbf24, wraith: 0x818cf8, revenant: 0x7dd3fc }
const bossAccent = (kind: string): number => BOSS_ACCENT[kind] ?? 0xfbbf24
// Signature 4-note phrase (semitone offsets) per boss — a melodic leitmotif to pair with the roar.
const BOSS_LEITMOTIF: Record<string, number[]> = {
  reaper:   [0, 7, 6, 0], brute:    [0, 0, 5, 3], tyrant:  [0, 12, 7, 12], warden:   [0, 5, 8, 5],
  sentinel: [0, 4, 7, 11], wraith:  [0, 8, 6, 3], revenant: [0, 3, 10, 7],
}

// Apex Contracts — between every sector (campaign only) you pick 1 of 3 boons that persist for the
// rest of the run, turning the fixed campaign into a lightweight roguelite with real decisions.
// Effects apply through the scene's existing stat machinery (see applyContract).
// `relic: true` marks a build-defining, one-time boon (excluded from the draw once owned); the rest are
// repeatable stat boons. Relics change HOW you play and stack across sectors.
const CONTRACTS: { id: string; name: string; desc: string; hex: string; relic?: boolean }[] = [
  { id: 'heal',      name: 'FIELD MEDIC', desc: 'refill all hearts',          hex: '#4ade80' },
  { id: 'vitality',  name: 'IRONHEART',   desc: '+1 max heart (full refill)', hex: '#f472b6' },
  { id: 'reserves',  name: 'SECOND WIND', desc: '+1 extra life',              hex: '#67e8f9' },
  { id: 'firepower', name: 'OVERCLOCK',   desc: 'permanently faster fire',    hex: '#fbbf24' },
  { id: 'boots',     name: 'AIR SURGE',   desc: '+1 air-jump',                hex: '#c084fc' },
  { id: 'mastery',   name: 'GUNSMITH',    desc: '+1 mastery on your gun',     hex: '#22d3ee' },
  // --- RELICS (one-time, build-defining) ---
  { id: 'embers',    name: 'EMBERS',      desc: 'every hit sets foes smoldering',      hex: '#fb923c', relic: true },
  { id: 'salvage',   name: 'SALVAGE',     desc: 'every 7th kill drops a heart',         hex: '#4ade80', relic: true },
  { id: 'aegis',     name: 'AEGIS',       desc: 'absorb the first hit of each sector',  hex: '#67e8f9', relic: true },
  { id: 'arclash',   name: 'ARC LASH',    desc: 'a PUNISH crit lashes a nearby foe',    hex: '#e879f9', relic: true },
  { id: 'gale',      name: 'GALE',        desc: 'a dash refunds your air-jumps',        hex: '#c084fc', relic: true },
  { id: 'momentum',  name: 'MOMENTUM',    desc: 'a fresh kill quickens your fire',      hex: '#fbbf24', relic: true },
]

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private spaceKey!: Phaser.Input.Keyboard.Key
  private bullets!: Phaser.Physics.Arcade.Group
  private arcBombs!: Phaser.Physics.Arcade.Group      // ARC LAUNCHER lobs — their OWN group so gravity + ground collision don't touch normal bullets
  private enemyBullets!: Phaser.Physics.Arcade.Group
  private enemies!: Phaser.Physics.Arcade.Group
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private movers!: Phaser.Physics.Arcade.StaticGroup   // moving platforms (ride them)
  private hazards!: Phaser.Physics.Arcade.StaticGroup  // spike strips (damage on contact)
  private bouncers!: Phaser.Physics.Arcade.StaticGroup // launch pads (spring you up)
  private powerups!: Phaser.Physics.Arcade.Group
  private bgFar!: Phaser.GameObjects.TileSprite
  private bgMid!: Phaser.GameObjects.TileSprite
  private bgStars!: Phaser.GameObjects.TileSprite
  private bgImage!: Phaser.GameObjects.Image
  private bgScrim!: Phaser.GameObjects.Rectangle
  private uiCam?: Phaser.Cameras.Scene2D.Camera  // crisp HUD camera (hi-res render)
  private decor: Phaser.GameObjects.GameObject[] = []
  private shadowGfx!: Phaser.GameObjects.Graphics  // per-frame drop shadows (grounding)
  private poiseGfx!: Phaser.GameObjects.Graphics   // per-frame STAGGER poise bars above enemies under fire
  private runFrameT = 0     // run-cycle timer (2-frame bounding run)
  private runFrame = 0      // which run frame (0/1)
  private landRecoverUntil = 0  // brief crouch-on-landing window
  private airborneT = 0     // ms spent airborne (for landing detection)
  private camLookX = -140   // current (lerped) camera lead offset; leads the direction you run
  private camLookTarget = -140
  private camDip = 0        // transient downward camera nudge on a hard landing (decays)
  private recoilX = 0       // per-shot camera kick (decays) — weapon recoil punch
  private recoilY = 0
  private skidUntil = 0     // throttle for skid dust on a hard ground reverse
  private sfx?: Sfx
  private lastSfxShot = 0
  private lastFired = 0
  private fireRate = 100
  private fireBonus = 0                  // Armory FIREPOWER: ms shaved off every weapon's cooldown
  private health = 5
  private maxHealth = 6
  private score = 0
  private level = 1
  private lives = 3
  private runStartAt = 0       // Date.now() at run start (playtest telemetry)
  private sectorClearedMs = 0  // frozen elapsed-ms at the instant a sector is cleared, so the recorded SPLIT excludes the post-clear delay + contract deliberation
  private deathsThisRun = 0
  private runNoHit = true      // stays true until the player takes any damage this run (FLAWLESS badge)
  private runShards = 0        // Apex Shards collected this run, across all sectors (SHARDLORD badge)
  private combo = 0
  private comboTimer = 0
  private kills = 0
  private maxCombo = 0
  private bossesThisRun = 0     // bosses downed this run — feeds daily bounties
  private grazeCount = 0        // RAZOR GRAZE near-misses this run
  private lastShieldHintAt = 0  // throttle the shielder "BLOCKED" popup so a held beam doesn't spam it
  private lastBossChipAt = 0    // throttle the boss-bar hit flash so fast weapons don't wash out the HP fill
  // APEX RELICS — build-defining boons drafted between sectors (Apex Contract). Unlike the stat boons they
  // STACK for the rest of the run and change HOW you play. Kept survivability/utility/offense-shaped so the
  // score formula is untouched and the boards stay fair (same spirit as the Doctrine passives).
  private relics = new Set<string>()
  private salvageKills = 0       // SALVAGE relic: heart-drop kill counter
  private sectorShield = false   // AEGIS relic: one absorbed hit, refreshed each sector
  private momentumUntil = 0      // MOMENTUM relic: a fresh kill quickens fire until this time
  private deflectCount = 0      // COUNTER-DASH deflects this run
  private tipsShown = new Set<string>()   // session cache so a just-in-time tip is evaluated once
  private activeTip?: Phaser.GameObjects.Text   // single tip slot — a new tip replaces the old so early-run tips can't pile into a blob
  private heartT = 0                 // countdown to the next low-health heartbeat thump
  private prevOnGround = false
  private fallSpeed = 0
  private deathParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private healthText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private gameOver = false
  private gameOverAt = 0   // time the game-over screen appeared, for a brief restart grace
  private deathToken = 0   // bumped each game-over so a late async rank paint can't bleed onto the next run
  private shareRank: number | null = null   // authoritative rank for the current death screen, for the flex card
  // KILL-TIME slow-motion (distinct from the hard-freeze hitstop): eases the SIM to a fraction of
  // speed on a big beat then ramps back. Driven from update() off the real clock so timers stay honest.
  private slowFrom = 1; private slowStart = 0; private slowDur = 0
  private slowPending: { scale: number; ms: number } | null = null
  // Player squash & stretch — transient scale multipliers (1 = rest) decayed toward 1 each frame,
  // applied over the base scale sizePlayer() captures. Stretch on takeoff, squash on a hard landing.
  private baseSX = 1; private baseSY = 1; private squashX = 1; private squashY = 1
  private quickRetry = false   // set by init() when a death/victory RETRY restarts straight into a run (skips the title)
  private levelTransition = false
  private controllerSeen = false
  private invulnUntil = 0        // i-frames as a timestamp so overlapping grants extend (never truncate) each other
  private facingRight = true
  private aimUp = false
  private aimDown = false
  private movingH = false
  private onGround = false
  private prone = false
  private touch: TouchState = { left: false, right: false, jump: false, shoot: false, up: false, down: false, dash: false }
  // On-screen touch controls: collected so they can be toggled off (e.g. when a
  // keyboard or controller is attached). Preference persists across sessions.
  private touchUI: Phaser.GameObjects.GameObject[] = []
  private touchHidden = false
  private padPresentPrev = false   // edge-detect gamepad presence for TV-mode auto hide/show
  private touchToggle?: Phaser.GameObjects.Text
  private weapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' | 'arc' = 'normal'
  // Two-weapon carry: a backup slot you can swap into (Q / touch / gamepad Y).
  private altWeapon: 'normal' | 'spread' | 'rapid' | 'laser' | 'fire' | 'arc' = 'normal'
  private doctrinePassive: DoctrinePassive = 'none'   // the active Strike Doctrine's signature passive (Apex Loadouts); 'none' until a kit-applying run sets it
  // Weapon mastery (per kind, 0..2): picking up a pod for the gun you already hold levels it —
  // faster fire + more damage, plus a signature perk (laser pierces, spread gains pellets).
  private weaponLvl: Record<string, number> = { normal: 0, spread: 0, rapid: 0, laser: 0, fire: 0, arc: 0 }
  private padSwapPrev = false
  // Gamepad remap (press-to-bind, saved to localStorage) + robustness state.
  private padBinds: Record<PadBindAction, number> = { ...PAD_BIND_DEFAULTS }
  private gamepadActive = false        // armed only once a pad button/axis actually MOVES — never on presence (trap #3)
  private gpDebug = false              // ?gpdebug=1 — live-dump button/axis indices to tune oddball pads (trap #7)
  private gpDebugText?: Phaser.GameObjects.Text
  private padIcon?: Phaser.GameObjects.Text   // persistent HUD "controller connected" chip
  private controlsUI: Phaser.GameObjects.GameObject[] = []
  private controlsOpen = false
  private seasonCardOpen = false                // the one-time monthly SEASON rollover ceremony is up
  private seasonCardUI: Phaser.GameObjects.GameObject[] = []
  private armoryOpen = false
  private armoryUI: Phaser.GameObjects.GameObject[] = []
  private badgesOpen = false
  private badgesUI: Phaser.GameObjects.GameObject[] = []
  private closeBadgesKey?: () => void
  private contractOpen = false
  private contractUI: Phaser.GameObjects.GameObject[] = []
  private contractPicks: { id: string; name: string; desc: string; hex: string; relic?: boolean }[] = []
  private contractOnDone?: () => void
  private contractKey?: (e: KeyboardEvent) => void
  private contractPadPrev = false
  private contractFocus = 0                        // which boon the gamepad/keyboard cursor is on
  private contractNavPrev = 0                      // edge-detect vertical nav so one flick moves one card
  private contractFocusRing?: Phaser.GameObjects.Rectangle
  private contractCards: Phaser.GameObjects.Rectangle[] = []
  private closeArmoryKey = () => this.closeArmory()
  private leaderboardOpen = false
  private leaderboardUI: Phaser.GameObjects.GameObject[] = []
  private closeLeaderboardKey = () => this.closeLeaderboard()
  private lbTab = 0                            // leaderboard tab: 0 SCORE · 1 SEASON (monthly) · 2 SPEED (fastest clears)
  private lbScore: BoardData | null = null    // cached global score board
  private lbSeason: SeasonData | null = null  // cached monthly Season board
  private lbSpeed: SpeedData | null = null    // cached fastest-clears board
  private lbPadPrev = 0                        // gamepad d-pad edge-detect while the leaderboard is open
  private lbKeyHandler = (e: KeyboardEvent) => {
    if (!this.leaderboardOpen) return
    if (e.key === 'ArrowLeft') this.setLbTab(this.lbTab - 1)
    else if (e.key === 'ArrowRight') this.setLbTab(this.lbTab + 1)
  }
  private dailyOpen = false
  private dailyUI: Phaser.GameObjects.GameObject[] = []
  private closeDailyKey = () => this.closeDaily()
  private trialsOpen = false                // the weekly APEX TRIALS board screen is up
  private trialsUI: Phaser.GameObjects.GameObject[] = []
  private closeTrialsKey = () => this.closeTrials()
  private intelOpen = false                 // the INTEL codex (enemy/boss/weapon encyclopedia) is up
  private intelUI: Phaser.GameObjects.GameObject[] = []
  private intelTab = 0                       // 0 WEAPONS · 1 FOES · 2 BOSSES
  private intelPadPrev = 0                    // gamepad d-pad edge-detect while the codex is open
  private closeIntelKey = () => this.closeIntel()
  private heatOpen = false                   // the APEX HEAT ascension select screen is up
  private heatUI: Phaser.GameObjects.GameObject[] = []
  private heatSel = 1                          // tier highlighted on the select screen
  private heatPadPrev = 0                      // gamepad d-pad edge-detect while the heat screen is open
  private heatConfirmPrev = false              // gamepad face-button rising-edge guard on the heat screen (no confirm re-fire while held)
  private closeHeatKey = () => this.closeHeat()
  private rankOpen = false                    // the APEX RANK enlist + prestige-board screen is up
  private rankUI: Phaser.GameObjects.GameObject[] = []
  private rankData: RankData | null = null    // fetched standings (null = loading/offline)
  private rankPadPrev = false                 // gamepad face-button rising-edge guard on the rank screen
  private closeRankKey = () => this.closeRank()
  private rankKeyHandler = (e: KeyboardEvent) => {
    if (!this.rankOpen || this.time.now < this.startGraceUntil) return
    if (e.key === 'Enter' || e.key === ' ') this.enlistNow()
  }
  private heatRun = false                      // this run is an APEX HEAT ascension run (campaign + modifiers)
  private heatTier = 0                         // active heat tier this run (0 = normal campaign)
  private loadoutOpen = false                  // the APEX LOADOUTS (Strike Doctrine) picker is up
  private loadoutUI: Phaser.GameObjects.GameObject[] = []
  private loadoutSel = 0                        // focused doctrine index on the picker
  private loadoutPadPrev = 0
  private loadoutConfirmPrev = false           // gamepad face-button rising-edge guard on the doctrine picker (no select re-fire / rebuild-flicker while held)
  private closeLoadoutKey = () => this.closeLoadout()
  private loadoutKeyHandler = (e: KeyboardEvent) => {
    if (!this.loadoutOpen || this.time.now < this.startGraceUntil) return   // ignore the keypress that just opened the screen (matches rankKeyHandler)
    if (e.key === 'ArrowLeft') this.setLoadoutSel(this.loadoutSel - 1)
    else if (e.key === 'ArrowRight') this.setLoadoutSel(this.loadoutSel + 1)
    else if (e.key === 'Enter' || e.key === ' ') this.selectFocusedDoctrine()
  }
  private intelKeyHandler = (e: KeyboardEvent) => {
    if (!this.intelOpen) return
    if (e.key === 'ArrowLeft') this.setIntelTab(this.intelTab - 1)
    else if (e.key === 'ArrowRight') this.setIntelTab(this.intelTab + 1)
  }
  private dailyRun = false                 // this run posts to the Daily board (modifier applied, Armory ignored)
  private rushRun = false                  // APEX TRIALS boss-rush run (own arena, 7 bosses back-to-back, local best)
  private rushIndex = 0                    // which boss of the rush we're on
  private rushOrder: string[] = []         // this week's boss sequence
  private dailyDay = ''                     // UTC day captured at run START — a midnight-crossing run scores its own day's board
  private rebinding: PadBindAction | null = null
  private rebindArmed = false          // true once all buttons release, so the opening tap can't self-bind
  private rebindHint?: Phaser.GameObjects.Text
  private startGraceUntil = 0          // brief guard so a pad press leaving a menu can't skip the next screen
  private startKeyHandler?: (e: KeyboardEvent) => void
  // Title focus-nav (bug#5): d-pad / arrow keys move a focus ring across the title's menu entries so
  // gamepad + TV players can reach DAILY / TRIALS / ARMORY / etc., not just start the campaign.
  private titleNav: { obj: Phaser.GameObjects.Text; act: () => void }[] = []
  private titleFocus = 0
  private titleNavActive = false       // has the player begun navigating? (ring hidden until then, so mouse/touch never see it)
  private titleRing?: Phaser.GameObjects.Rectangle
  private titleNavPrev = 0             // gamepad d-pad edge-detect on the title
  private titleConfirmPrev = false     // gamepad confirm edge-detect on the title
  private closeControlsKey = () => this.closeControls()
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter
  private dangerVignette?: Phaser.GameObjects.Image
  private dangerTween?: Phaser.Tweens.Tween
  private jumpsLeft = 2
  private maxJumps = MAX_JUMPS           // MAX_JUMPS + Armory KINETIC BOOTS tier
  private lastGroundAt = 0
  private jumpBufferAt = -9999
  private prevJump = false
  // Phase Dash (Armory-unlocked dodge). dashLevel 0 = locked.
  private dashKey!: Phaser.Input.Keyboard.Key
  private dashLevel = 0
  private dashHitList: Phaser.GameObjects.GameObject[] = []   // enemies already struck by the current dash (PHASE STRIKE)
  private dashDeflects = 0   // bolts deflected during the current dash (capped so one dash can't wipe a full curtain)
  private lastRefundAt = 0   // VANGUARD refund dedupe: one dash refund per volley, not per pellet/pierce-contact
  private dashCd = 820   // baseline dash cooldown (Armory PHASE DASH tiers shorten it)
  private dashUntil = 0
  private dashCdUntil = 0
  // DASH readiness tell — the cooldown was invisible and a mashed dash on cooldown read as a dropped
  // input; these drive an on-canvas gauge + touch-button rim + a "denied" flash so readiness is legible.
  private dashGaugeFill?: Phaser.GameObjects.Rectangle
  private dashGaugeLabel?: Phaser.GameObjects.Text
  private dashTouchBtn?: Phaser.GameObjects.Rectangle
  private dashWasReady = true
  private dashDeniedAt = 0
  private dashIframeUntil = 0
  private dashDir = 1
  private prevDash = false
  private isJumping = false
  private lastGroundX = 80
  private lastGroundY = 480
  private spawnTimer = 0
  private bossPhase = 1
  private levelW = 2600
  private levelH = 1200
  private goalX = 0
  private goalY = 0
  // End-of-stage guardian: holds the extraction until beaten.
  private extractionLocked = false
  private pendingEndBoss?: LevelDef['endBoss']
  private endBossSpawned = false
  private midSecured = false                   // fired the mid-sector "AREA SECURED" checkpoint beat this stage
  private nextBossLabel = 'APEX SENTINEL'
  private nextBossKind = 'sentinel'
  private lockHintAt = 0
  // Pause / mute
  private userPaused = false
  private muted = false
  private reduceMotion = false          // accessibility: suppress screen-shake / flashes / zoom-punch / vignette pulse
  private prevStart = false
  private pauseUI: Phaser.GameObjects.GameObject[] = []
  private muteIcon!: Phaser.GameObjects.Text
  // Boss HP bar
  private bossRef?: Phaser.Physics.Arcade.Sprite
  private bossMusicOn = false          // tracks whether the boss-intensity music layer is engaged
  private musicHeatAt = 0              // next wall-clock time to re-evaluate adaptive music heat (throttled)
  private bossBar: Phaser.GameObjects.GameObject[] = []
  private bossBarFill?: Phaser.GameObjects.Rectangle
  // Apex Shards (collectibles)
  private shards!: Phaser.Physics.Arcade.Group
  private shardsGot = 0
  private shardsTotal = 0
  private shardText!: Phaser.GameObjects.Text
  // Title / start gate (skipped in the Level Lab)
  private started = false
  private coachGate = false     // FIRST-RUN "DROP IN" gate: the sim stays paused behind a readable controls card until the player acknowledges it (no teaching mid-combat)
  private coachGateUI: Phaser.GameObjects.GameObject[] = []
  private coachGraceUntil = 0   // swallow the very keypress/tap that launched the run so it can't instantly drop in
  private coachGateKey?: (e: KeyboardEvent) => void
  private titleUI: Phaser.GameObjects.GameObject[] = []
  // Extraction compass — edge arrow pointing to the goal when it's off-screen
  private compass?: Phaser.GameObjects.Triangle
  private progressFill?: Phaser.GameObjects.Rectangle
  private progressTrack?: Phaser.GameObjects.Rectangle
  private progressGoalMark?: Phaser.GameObjects.Text
  private objectiveText?: Phaser.GameObjects.Text   // persistent "what am I doing" line at the top of the HUD
  private objectiveMsg = ''                          // last objective string shown — re-pop the line only when it changes

  constructor() {
    super({ key: 'MainScene' })
  }

  // Active level set — the injected Lab levels if present, else the campaign.
  private levels(): LevelDef[] { return this.rushRun ? RUSH_LEVELS : (LAB_LEVELS ?? LEVELS) }
  private isBossLevel(): boolean {
    const d = this.levels()[this.level - 1]
    return !!d && d.goal[0] === 0 && d.goal[1] === 0
  }

  // Brief physics freeze — makes meaningful impacts LAND (Contra crunch). Not on per-bullet ticks.
  private hitstop(ms: number) {
    if (this.physics.world.isPaused) return
    this.physics.world.pause()
    this.time.delayedCall(ms, () => { if (!this.userPaused) this.physics.world.resume() })
  }
  // KILL-TIME: request slow motion at `scale` speed (0.4 = 40%) easing back to 1.0 over `ms`. Only
  // ARMS here — the driver activates it the first frame physics ISN'T paused, so a preceding
  // hitstop plays out first (freeze → drip). Latest strong request wins; gated by reduced-motion.
  private slowmo(scale: number, ms: number) {
    if (this.reduceMotion) return
    if (this.slowDur > 0 && scale >= this.slowFrom && !this.slowPending) return   // don't weaken an active slow-mo
    this.slowPending = { scale: Math.max(0.15, Math.min(1, scale)), ms }
  }
  // Per-frame: activate a pending request once the sim is live, then ease the sim time-scales back to
  // normal. time.timeScale stays 1.0 so delayedCall (spawns/attacks/fuses) are unaffected — only
  // physics motion, tweens and anims slow. Arcade's world.timeScale is INVERTED (2 = half speed).
  private updateSlowmo() {
    if (this.slowPending && !this.physics.world.isPaused) {
      this.slowFrom = this.slowPending.scale; this.slowStart = this.time.now; this.slowDur = this.slowPending.ms
      this.slowPending = null
    }
    if (this.slowDur <= 0) return
    const t = (this.time.now - this.slowStart) / this.slowDur
    if (t >= 1 || this.reduceMotion) {
      this.slowDur = 0
      this.physics.world.timeScale = 1; this.tweens.timeScale = 1; this.anims.globalTimeScale = 1
      return
    }
    const s = this.slowFrom + (1 - this.slowFrom) * (t * t)   // hold the slow, then snap back
    this.physics.world.timeScale = 1 / s
    this.tweens.timeScale = s
    this.anims.globalTimeScale = s
  }
  private resetTimeScales() {
    this.slowDur = 0; this.slowPending = null
    this.physics.world.timeScale = 1; this.tweens.timeScale = 1; this.anims.globalTimeScale = 1
  }
  // Reduced-motion gates: all screen-shake, screen-flash and zoom-punch route through these, so the
  // accessibility toggle can suppress the motion-heavy effects without touching gameplay.
  private fxShake(dur: number, intensity: number) { const cam = this.cameras.main; if (!this.reduceMotion) cam.shake(dur, intensity) }
  private fxFlash(dur: number, r?: number, g?: number, b?: number, force?: boolean) { const cam = this.cameras.main; if (!this.reduceMotion) cam.flash(dur, r, g, b, force) }
  // Mobile haptics — a silent no-op off Android/where unsupported; shares the reduced-motion opt-out.
  private buzz(pattern: number | number[]) { if (this.reduceMotion) return; try { (navigator as Navigator).vibrate?.(pattern) } catch { /* unsupported */ } }
  // Snap-zoom the world camera in then ease back — a cinematic accent for the biggest beats.
  // The HUD lives on uiCam so its crispness is untouched; zoomTo(base) self-heals after a resize.
  private zoomPunch(mult = 1.12, dur = 200) {
    if (this.reduceMotion) return
    const cam = this.cameras.main
    const base = this.scale.width / WORLD_VIEW_W
    // Tween a proxy value and setZoom each frame (frame-rate independent, unlike chained zoomTo
    // effects which can race and strand the camera zoomed in). onComplete pins it exactly on base,
    // so overlapping punches and mid-punch resizes always resolve back to the true base zoom.
    const o = { z: cam.zoom }
    this.tweens.add({
      targets: o, z: base * mult, duration: Math.max(60, dur * 0.45), ease: 'Quad.easeOut',
      yoyo: true, hold: 40,
      onUpdate: () => cam.setZoom(o.z),
      onComplete: () => cam.setZoom(base),
    })
  }
  // Expanding neon ring on kills/impacts.
  private shockwave(x: number, y: number, color: number, r = 30) {
    const ring = this.add.circle(x, y, r, color, 0).setStrokeStyle(2, color, 0.9).setDepth(23).setScale(0.25)
    this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() })
  }
  // Weapon-colored muzzle burst at the gun tip — sells every shot.
  private muzzleFlash(x: number, y: number, dir: number, angle: number) {
    const color = this.weapon === 'laser' ? 0xe879f9 : this.weapon === 'fire' ? 0xfb923c : 0x22d3ee
    const rad = Phaser.Math.DegToRad(angle)
    const isVert = angle === -90 || angle === 90
    const dx = isVert ? 0 : Math.cos(rad) * dir
    const dy = Math.sin(rad)
    const fx = x + dx * 10, fy = y + dy * 10
    const spin = Math.atan2(dy, dx)
    // Directional cone pointing along the shot + a hot white core — sharp, not a soft blob.
    const cone = this.add.triangle(fx, fy, 0, -5, 20, 0, 0, 5, color, 1).setRotation(spin).setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
    const core = this.add.circle(fx, fy, 4.5, 0xffffff, 1).setDepth(22).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({ targets: [cone, core], scaleX: 0.15, scaleY: 0.15, alpha: 0, duration: 80, onComplete: () => { cone.destroy(); core.destroy() } })
  }
  // Kicked-up dust when you hit the ground hard.
  private landingDust(speed: number) {
    const y = (this.player.body as Phaser.Physics.Arcade.Body).bottom
    const n = Phaser.Math.Clamp(Math.floor(speed / 90), 3, 12)
    this.deathParticles.setParticleTint(0xcbd5e1)
    this.deathParticles.emitParticleAt(this.player.x, y, n)
    if (speed > 760) this.fxShake(70, 0.008)
  }

  // Kicked-up dust behind a hard direction change — makes the deliberately-snappy reverse legible.
  private skidDust() {
    const b = this.player.body as Phaser.Physics.Arcade.Body
    const y = b.bottom
    this.deathParticles.setParticleTint(0xcbd5e1)
    this.deathParticles.emitParticleAt(this.player.x - Math.sign(b.velocity.x) * 8, y, 6)
    this.sfx?.scrape()
  }

  // Combo escalation — pop + colour-climb the counter, with a burst at every x5 milestone.
  private applyCombo(basePts: number): number {
    this.combo++
    this.comboTimer = 2400
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    if (this.combo <= 1) return basePts
    const c = this.combo
    const pts = Math.floor(basePts * (1 + Math.min(c, 15) * 0.12))
    const col = c >= 15 ? '#ffffff' : c >= 10 ? '#f43f5e' : c >= 5 ? '#fb923c' : '#fbbf24'
    this.comboText.setColor(col).setText('COMBO x' + c).setAlpha(1)
    this.tweens.killTweensOf(this.comboText)
    this.comboText.setScale(1)
    this.tweens.add({ targets: this.comboText, scale: { from: c % 5 === 0 ? 1.5 : 1.3, to: 1 }, duration: 200, ease: 'Back.easeOut' })
    this.sfx?.comboBlip(c)
    if (c >= 5 && c % 5 === 0) this.comboMilestone(c)
    return pts
  }

  private comboMilestone(c: number) {
    const label = c >= 20 ? 'APEX' : c >= 15 ? 'UNREAL' : c >= 10 ? 'RAMPAGE' : 'STREAK'
    const col = c >= 15 ? 0x67e8f9 : c >= 10 ? 0xf43f5e : 0xfb923c
    this.screenToast(label + '  x' + c, '#' + col.toString(16).padStart(6, '0'), 100)
    if (this.player?.active) this.shockwave(this.player.x, this.player.y, col, 46)
    this.fxShake(90, 0.008)
    this.buzz(c >= 15 ? [20, 40, 20] : 25)   // milestone buzz — a triple pulse at the big streaks
    this.sfx?.explode()
  }

  // Pulsing red screen-edge vignette while health is critical — cheap, readable tension.
  private updateDanger() {
    if (!this.dangerVignette) return
    if (this.dangerTween) { this.dangerTween.stop(); this.dangerTween = undefined }
    const critical = this.started && !this.gameOver && this.health > 0 && this.health <= 2
    if (critical) {
      if (this.reduceMotion) {
        this.dangerVignette.setAlpha(this.health <= 1 ? 0.34 : 0.2)   // steady, no pulse, under reduced motion
      } else {
        this.dangerVignette.setAlpha(0.12)
        this.dangerTween = this.tweens.add({ targets: this.dangerVignette, alpha: this.health <= 1 ? 0.42 : 0.26, duration: this.health <= 1 ? 420 : 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      }
    } else {
      this.tweens.add({ targets: this.dangerVignette, alpha: 0, duration: 220 })
    }
  }

  // Phase Dash trail — tinted afterimages + a puff + ring.
  private dashFx() {
    const col = this.dashLevel >= 2 ? 0x67e8f9 : 0x22d3ee
    const key = this.player.texture.key
    for (let i = 1; i <= 3; i++) {
      const g = this.add.image(this.player.x - this.dashDir * i * 13, this.player.y, key)
        .setFlipX(this.player.flipX).setDisplaySize(this.player.displayWidth, this.player.displayHeight)
        .setTint(col).setAlpha(0.45).setDepth((this.player.depth || 0) - 1).setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({ targets: g, alpha: 0, duration: 200, delay: i * 18, onComplete: () => g.destroy() })
    }
    const b = this.player.body as Phaser.Physics.Arcade.Body
    this.deathParticles.setParticleTint(col)
    this.deathParticles.emitParticleAt(this.player.x, b.bottom, 6)
    this.shockwave(this.player.x, this.player.y, col, 20)
  }

  preload() {
    // Hero pose set — one consistent side-view lioness across all states, each
    // aligned to a shared canvas so they swap without jitter (ready/run/jump/crouch).
    this.load.image('huntress', ASSETS.huntress)
    this.load.image('huntress_run', ASSETS.huntress_run)
    this.load.image('huntress_jump', ASSETS.huntress_jump)
    this.load.image('huntress_crouch', ASSETS.huntress_crouch)
    this.load.image('enemy_soldier', ASSETS.enemy_soldier)
    this.load.image('enemy_flyer', ASSETS.enemy_flyer)
    this.load.image('enemy_tank', ASSETS.enemy_tank)
    this.load.image('boss_art', ASSETS.boss)
    this.load.image('pickup_pod', ASSETS.pickup_pod)
    this.load.image('platform_tile', ASSETS.platform_tile)
    this.load.image('logo', ASSETS.logo)
    // Painted backdrops; tolerate a missing file (falls back to procedural skyline)
    Object.entries(WORLD_BG).forEach(([k, url]) => this.load.image('bg_' + k, url))
    this.load.on('loaderror', (f: Phaser.Loader.File) => { if (f.key?.startsWith('bg_')) console.warn('bg missing', f.key) })
  }

  // Phaser passes scene.restart()'s data here, before create(). A death/victory RETRY sets
  // quickRetry so this run skips the title and drops straight into play; a plain restart clears it.
  init(data?: { quickRetry?: boolean }) {
    this.quickRetry = !!(data && data.quickRetry)
  }

  create() {
    this.gameOver = false
    this.levelTransition = false
    this.dailyRun = false                  // reset here — instance fields survive scene.restart()
    this.rushRun = false; this.rushIndex = 0
    this.heatRun = false; this.heatTier = 0
    this.resetTimeScales()                 // clear any slow-mo left mid-ramp by the previous run
    this.squashX = 1; this.squashY = 1
    // Apex Armory — apply persistent upgrades to this run's starting stats.
    this.applyArmory()
    this.dashUntil = 0; this.dashCdUntil = 0; this.dashIframeUntil = 0; this.prevDash = false
    this.runStartAt = Date.now()   // playtest telemetry: new run
    this.deathsThisRun = 0
    this.runNoHit = true
    this.runShards = 0
    this.coachGate = false
    newRun()
    this.score = 0
    this.level = 1
    this.combo = 0
    this.comboTimer = 0
    this.kills = 0
    this.maxCombo = 0
    this.bossesThisRun = 0
    this.grazeCount = 0
    this.relics.clear(); this.salvageKills = 0; this.sectorShield = false; this.momentumUntil = 0   // fresh run → no relics
    this.deflectCount = 0
    this.prevOnGround = false
    this.fallSpeed = 0
    this.camLookX = -140; this.camLookTarget = -140; this.camDip = 0; this.recoilX = 0; this.recoilY = 0
    this.invulnUntil = 0
    this.facingRight = true
    this.weapon = 'normal'
    this.altWeapon = 'normal'
    this.weaponLvl = { normal: 0, spread: 0, rapid: 0, laser: 0, fire: 0, arc: 0 }   // mastery is per-run, earned in-run
    this.padSwapPrev = false
    this.fireRate = 100
    this.jumpsLeft = this.maxJumps
    this.jumpBufferAt = -9999
    this.isJumping = false
    this.spawnTimer = 0
    this.bossPhase = 1
    this.prone = false
    this.decor = []
    this.userPaused = false
    this.prevStart = false
    this.pauseUI = []
    this.bossBar = []
    this.bossRef = undefined
    this.shardsGot = 0
    this.shardsTotal = 0
    this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false, dash: false }
    this.controlsOpen = false
    this.controlsUI = []
    this.seasonCardOpen = false
    this.seasonCardUI = []
    this.rebinding = null
    this.rebindArmed = false
    this.rebindHint = undefined
    this.gpDebugText = undefined
    this.padIcon = undefined
    this.padPresentPrev = false
    this.startKeyHandler = undefined
    this.startGraceUntil = 0

    this.physics.world.gravity.y = GRAV
    this.sfx?.dispose()   // kill any prior music/context before a fresh restart
    this.sfx = new Sfx()
    this.events.once('shutdown', () => this.sfx?.dispose())  // stop music on restart / unmount
    this.createTextures()
    this.createThemeTextures()

    this.platforms = this.physics.add.staticGroup()
    this.movers = this.physics.add.staticGroup()
    this.hazards = this.physics.add.staticGroup()
    this.bouncers = this.physics.add.staticGroup()
    // Projectiles ignore world gravity so they fly straight + flat (no droop).
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 120, allowGravity: false })
    // Arc bombs get gravity ON (per-body) + their own colliders so they lob and burst on the ground.
    this.arcBombs = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 24, allowGravity: true })
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 80, allowGravity: false })
    this.enemies = this.physics.add.group()
    this.powerups = this.physics.add.group()
    this.shards = this.physics.add.group({ allowGravity: false, immovable: true })

    // Restore the saved mute preference (persists across page reloads too).
    try { this.muted = localStorage.getItem('apex_muted') === '1' } catch { /* ignore */ }
    try { const rf = localStorage.getItem('apex_reducefx'); this.reduceMotion = rf === '1' || (rf == null && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } catch { /* ignore */ }
    this.sfx.setMuted(this.muted)

    // Backdrop pinned to the camera. Sized to the pulled-back world view (plus a
    // margin) so it fills the wide run-and-gun frame instead of leaving black bars.
    const vw = WORLD_VIEW_W, vh = WORLD_VIEW_W * 0.75, vcx = vw / 2, vcy = vh / 2
    this.bgImage = this.add.image(vcx, vcy, 'stars').setScrollFactor(0).setDepth(-10).setVisible(false)
    this.bgScrim = this.add.rectangle(vcx, vcy, vw + 60, vh + 60, 0x05040a, 0.16).setScrollFactor(0).setDepth(-9).setVisible(false)
    // Procedural parallax fallback (both axes for the 2D world)
    this.bgStars = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'stars').setScrollFactor(0).setDepth(0)
    this.bgFar = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'far_streets').setScrollFactor(0).setDepth(1)
    this.bgMid = this.add.tileSprite(vcx, vcy, vw + 60, vh + 60, 'mid_streets').setScrollFactor(0).setDepth(2)
    // Drop shadows drawn fresh each frame (grounds the player + enemies on the busy art).
    this.shadowGfx = this.add.graphics().setDepth(8)
    this.poiseGfx = this.add.graphics().setDepth(30)   // above enemies — STAGGER poise meters

    this.buildLevel(1)

    const def = this.levels()[0]
    const pKey = this.textures.exists('huntress') ? 'huntress' : 'player'
    this.player = this.physics.add.sprite(def.spawn[0], def.spawn[1], pKey)
    this.sizePlayer()
    this.player.setCollideWorldBounds(true)
    this.player.setBounce(0)
    this.player.setDepth(25)
    this.player.setMaxVelocity(RUN, 1250)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setDeadzone(110, 90)
    // Bias the view so the hero rides left-of-centre — you see the ground ahead
    // and enemies approaching from the right (run-and-gun framing).
    this.cameras.main.setFollowOffset(-140, 24)

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.player, this.movers)
    this.physics.add.overlap(this.player, this.hazards, () => this.damagePlayer('hazard'), undefined, this)
    this.physics.add.collider(this.player, this.bouncers, ((_p: unknown, pad: unknown) => this.bounce(pad as Phaser.Physics.Arcade.Sprite)) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.collider(this.enemies, this.platforms)
    this.physics.add.collider(this.powerups, this.platforms)

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.arcBombs, this.enemies, this.hitArcEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.collider(this.arcBombs, this.platforms, this.arcHitGround as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.powerups, this.collectPowerup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitByEnemyBullet as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)
    this.physics.add.overlap(this.player, this.shards, this.collectShard as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)

    // Web-Audio needs a user gesture before it can play
    const resumeAudio = () => this.sfx?.resume()
    this.input.keyboard!.once('keydown', resumeAudio)
    this.input.once('pointerdown', resumeAudio)

    // Pause (P / Esc) and mute (M) — event-driven so they work while paused.
    this.input.keyboard!.on('keydown-P', () => this.togglePause())
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard!.on('keydown-M', () => this.toggleMute())
    this.input.keyboard!.on('keydown-Q', () => this.swapWeapon())

    // Controller: arm on ACTUAL input, never on mere presence — a wireless dongle
    // or headset can enumerate as a "gamepad" and must not hijack the UI (trap #3).
    // The READY toast + gamepadActive flag are driven from real button/axis motion
    // in update() via pollGamepadInput(). Load saved rebinds + the debug flag here.
    this.loadPadBinds()
    try { this.gpDebug = new URLSearchParams(window.location.search).get('gpdebug') === '1' } catch { /* ignore */ }

    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 380 },
      scale: { start: 0.8, end: 0 },
      lifespan: 340,
      blendMode: 'ADD',
      emitting: false,
    })
    this.particles.setDepth(24)

    // Chunky debris burst on kills — arcs up and falls (gravity), reads as gibs not sparkle.
    this.deathParticles = this.add.particles(0, 0, 'spark', {
      speed: { min: 90, max: 300 },
      angle: { min: 200, max: 340 },
      gravityY: 520,
      scale: { start: 1.7, end: 0 },
      lifespan: 620,
      emitting: false,
    })
    this.deathParticles.setDepth(22)

    this.createHUD()
    // On-screen controls only where they're needed (touch devices) — keep desktop clean.
    if (this.sys.game.device.input.touch) {
      this.createTouchControls()
      // Restore-on-touch: a tap on the canvas brings the in-canvas pad back if TV mode
      // hid it — but not when the DOM gutter controls are driving (they replace it).
      this.input.on('pointerdown', () => { if (this.touchHidden && !this.gutterActive()) this.setTouchControlsHidden(false) })
    }
    // Bridge for the React DOM gutter controls: they write __APEX.pad + call __APEX.act.
    {
      const w = window as unknown as { __APEX?: ApexBridge }
      w.__APEX = w.__APEX || { pad: {}, gutter: false, act: null }
      w.__APEX.act = (name: string) => {
        if (name === 'pause') this.togglePause()
        else if (name === 'mute') this.toggleMute()
        // Belt-and-suspenders: SWAP only fires during live play, never bleeding through a
        // contract / pause / death overlay even if a stray gutter button were somehow tapped.
        else if (name === 'swap') { if (this.started && !this.gameOver && !this.contractOpen && !this.userPaused) this.swapWeapon() }
      }
    }

    // Real game opens on a title screen; the Level Lab drops straight into play. A quick-retry
    // skips the title entirely — beginPlay() runs at the end of create() (below), after cameras.
    if (LAB_LEVELS) {
      this.started = true
      this.showBanner('SECTOR 1', def.name)
      this.setBridge('playing')
    } else if (!this.quickRetry) {
      this.started = false
      this.showTitle()
    }

    this.initHiResCameras()

    // Test hook: ?probe exposes the scene for headless physics verification.
    // Zero impact for players (only attaches when the URL opts in).
    try {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('probe')) {
        ;(window as unknown as { __scene?: MainScene }).__scene = this
      }
    } catch { /* ignore */ }

    // Quick-retry: a death/victory RETRY skips the title and drops straight into a fresh run.
    // Runs last so cameras/input are fully set up; consumes the flag so a later restart-to-title
    // still shows the title, and clears the prior run's `started` so beginPlay() proceeds.
    if (this.quickRetry && !LAB_LEVELS) {
      this.quickRetry = false
      this.started = false
      this.beginPlay()
    }
  }

  // Render at 2x on the real game (1024x768) while keeping every coordinate in
  // the 512x384 design space: the world camera zooms to show the SAME view at 2x
  // pixels, and a non-scrolling UI camera (same zoom) draws the HUD crisp on top.
  // RES is 1 in the Level Lab (512-wide), so it behaves exactly as before there.
  private initHiResCameras() {
    const RES = this.scale.width / 512
    // World camera pulls back to show WORLD_VIEW_W of level (wide run-and-gun
    // view); the HUD camera below stays at RES so the interface is unaffected.
    this.cameras.main.setZoom(this.scale.width / WORLD_VIEW_W)
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    this.uiCam.setZoom(RES)
    // Anchor the UI camera's zoom at the top-left so the HUD's 512x384-space
    // coordinates scale straight to the 1024x768 canvas (design x,y -> x*RES,y*RES)
    // instead of zooming around the canvas centre and flying off to the corner.
    this.uiCam.setOrigin(0, 0)
    this.uiCam.setScroll(0, 0)
    this.routeCameras()
    // Cinematic pass on the WORLD camera only (HUD stays crisp): a subtle bloom
    // makes the neon/cyan tech glow pop like the reference vibe, and a soft
    // vignette frames the action. Guarded — postFX needs the WebGL renderer.
    try {
      this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 1, 0.55, 3)
      this.cameras.main.postFX.addVignette(0.5, 0.5, 1.05, 0.16)
    } catch { /* Canvas renderer / no postFX — skip gracefully */ }
  }

  // Assign each display object to exactly one camera: screen-pinned HUD/overlays
  // (scrollFactor 0, depth >= 100) render on the UI camera; everything else
  // (world + backgrounds) on the main camera. Runs each frame so dynamically
  // spawned objects (bullets, enemies, hit FX, transient overlays) get routed.
  private routeCameras() {
    if (!this.uiCam) return
    const list = this.children.list
    for (let i = 0; i < list.length; i++) {
      const go = list[i] as Phaser.GameObjects.GameObject & { _routed?: boolean; depth?: number; scrollFactorX?: number }
      if (go._routed) continue
      go._routed = true
      const isUI = go.scrollFactorX === 0 && (go.depth ?? 0) >= 100
      if (isUI) this.cameras.main.ignore(go)
      else this.uiCam.ignore(go)
    }
  }

  private sizePlayer() {
    const k = this.player.texture.key
    if (k === 'huntress' || k === 'huntress_run' || k === 'huntress_jump' || k === 'huntress_crouch') {
      // All hero poses share one aligned 1024x900 canvas — each already scaled to
      // a consistent apparent size (crouch a touch shorter) and anchored feet@760
      // — so one display size + hitbox keeps the physics stable across swaps.
      const DISP_H = 156
      this.player.setDisplaySize(DISP_H * (1024 / 900), DISP_H)
      this.baseSX = this.player.scaleX; this.baseSY = this.player.scaleY   // rest scale for squash & stretch
      const tw = this.player.width, th = this.player.height   // 1024 x 900
      const b = this.player.body as Phaser.Physics.Arcade.Body
      if (k === 'huntress_crouch') {
        // Crouch: collapse the hitbox to ~60% height with the FEET planted (body
        // bottom fixed at th*0.84) so the head drops — the huntress fits under low
        // overhangs and enemy fire passes over the lowered profile.
        const bh = th * 0.26
        b.setSize(tw * 0.13, bh)
        b.setOffset(tw * 0.435, th * 0.84 - bh)
      } else {
        b.setSize(tw * 0.11, th * 0.44)        // torso+legs column
        b.setOffset(tw * 0.445, th * 0.40)     // centred x, from mid-torso down to the feet
      }
    }
  }

  private createTextures() {
    if (!this.textures.exists('player')) {
      const p = this.make.graphics({ x: 0, y: 0 })
      p.fillStyle(0x7c3aed, 1); p.fillRoundedRect(4, 8, 24, 36, 4)
      p.fillStyle(0x22d3ee, 1); p.fillCircle(16, 10, 6)
      p.generateTexture('player', 32, 48); p.destroy()
    }
    if (!this.textures.exists('terrain')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillGradientStyle(0xbfc4d6, 0xbfc4d6, 0x30323f, 0x30323f, 1)
      g.fillRect(0, 0, 32, 256)
      g.generateTexture('terrain', 32, 256); g.destroy()
    }
    // Tileable armored tech-plate — the terrain surface. Light base so a per-theme
    // tint colours it; panel seams + bevels + rivets + brushed sheen give real
    // texture (tiled across any platform size = no stretch, no "cheap flat bar").
    if (!this.textures.exists('slab')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xb7bccf, 1); g.fillRect(0, 0, 64, 64)                              // metallic base
      // brushed vertical sheen
      g.fillStyle(0xffffff, 0.05); g.fillRect(7, 0, 3, 64); g.fillRect(39, 0, 3, 64)
      g.fillStyle(0x000000, 0.06); g.fillRect(21, 0, 2, 64); g.fillRect(53, 0, 2, 64)
      // panel seams on a 32px grid (wrap seamlessly when tiled)
      g.fillStyle(0x353947, 1); g.fillRect(0, 30, 64, 4); g.fillRect(30, 0, 4, 64)
      g.fillStyle(0xe9ecf5, 0.45); g.fillRect(0, 28, 64, 2); g.fillRect(28, 0, 2, 64) // raised bevel (lit)
      g.fillStyle(0x1d2029, 0.5); g.fillRect(0, 34, 64, 2); g.fillRect(34, 0, 2, 64)  // groove shadow
      // rivets (top-left of each sub-panel) — bolt + tiny specular
      const rivet = (x: number, y: number) => { g.fillStyle(0x2a2d38, 1); g.fillCircle(x, y, 2.4); g.fillStyle(0xeef1f8, 0.6); g.fillCircle(x - 0.7, y - 0.7, 1) }
      ;[[9, 9], [41, 9], [9, 41], [41, 41], [24, 24], [56, 56]].forEach(([x, y]) => rivet(x, y))
      g.generateTexture('slab', 64, 64); g.destroy()
    }
    // Projectiles: crisp directional energy bolts (drawn pointing RIGHT, tip at
    // the right edge) at hi-res so they stay sharp under the 2x render. Each bolt
    // is rotated to its travel angle at spawn — clean "new-age" look, no blobs.
    if (!this.textures.exists('bullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x0e7490, 1); g.fillRoundedRect(1, 3, 40, 12, 6)   // dark cyan shell
      g.fillStyle(0x22d3ee, 1); g.fillRoundedRect(3, 4, 36, 10, 5)   // bright cyan
      g.fillStyle(0xcffafe, 1); g.fillRoundedRect(7, 6, 26, 6, 3)    // pale inner
      g.fillStyle(0xffffff, 1); g.fillCircle(40, 9, 6)               // hot leading tip
      g.generateTexture('bullet', 48, 18); g.destroy()
    }
    if (!this.textures.exists('laser')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x86198f, 1); g.fillRoundedRect(0, 4, 72, 7, 3)    // magenta shell
      g.fillStyle(0xe879f9, 1); g.fillRoundedRect(2, 5, 68, 5, 2)    // bright magenta
      g.fillStyle(0xfdf4ff, 1); g.fillRect(5, 6, 62, 2)             // white core line
      g.fillStyle(0xffffff, 1); g.fillCircle(68, 7, 5)              // hot tip
      g.generateTexture('laser', 72, 14); g.destroy()
    }
    if (!this.textures.exists('fireball')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xc2410c, 1); g.fillEllipse(22, 12, 42, 20)        // deep-orange body
      g.fillStyle(0xf97316, 1); g.fillEllipse(25, 12, 32, 16)        // orange
      g.fillStyle(0xfacc15, 1); g.fillEllipse(29, 12, 20, 11)        // yellow core
      g.fillStyle(0xfffbeb, 1); g.fillCircle(32, 12, 5)             // white-hot head
      g.generateTexture('fireball', 44, 24); g.destroy()
    }
    if (!this.textures.exists('arcbomb')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x3f6212, 1); g.fillCircle(14, 18, 11)     // dark olive shell
      g.fillStyle(0x65a30d, 1); g.fillCircle(14, 18, 8)      // olive body
      g.fillStyle(0xa3e635, 1); g.fillCircle(11, 15, 4)      // lime highlight
      g.fillStyle(0x52525b, 1); g.fillRect(12, 3, 4, 7)      // fuse cap
      g.fillStyle(0xfbbf24, 1); g.fillCircle(14, 3, 3)       // lit spark
      g.generateTexture('arcbomb', 28, 32); g.destroy()
    }
    if (!this.textures.exists('enemyBullet')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x9f1239, 1); g.fillRoundedRect(1, 3, 24, 9, 4)    // dark red shell
      g.fillStyle(0xf43f5e, 1); g.fillRoundedRect(3, 4, 20, 7, 3)    // red
      g.fillStyle(0xffe4e6, 1); g.fillRoundedRect(6, 5, 11, 4, 2)    // pink core
      g.fillStyle(0xffffff, 1); g.fillCircle(24, 7, 4)              // tip
      g.generateTexture('enemyBullet', 28, 14); g.destroy()
    }
    if (!this.textures.exists('turret')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x2b2740, 1); g.fillRect(4, 22, 40, 16)
      g.fillStyle(0x3f3a5c, 1); g.fillRoundedRect(10, 8, 28, 18, 6)
      g.fillStyle(0x18151f, 1); g.fillRect(30, 14, 18, 7)
      g.fillStyle(0xf43f5e, 1); g.fillCircle(24, 17, 4)
      g.generateTexture('turret', 48, 40); g.destroy()
    }
    const mk = (key: string, color: number, w: number, h: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(color, 1); g.fillRect(0, 0, w, h)
      g.generateTexture(key, w, h); g.destroy()
    }
    mk('enemy', 0xe11d48, 32, 36); mk('flyer', 0xa855f7, 32, 32)
    mk('tank', 0xea580c, 44, 40); mk('boss', 0xdc2626, 64, 58)

    ;['pow_health', 'pow_spread', 'pow_rapid', 'pow_laser', 'pow_fire', 'pow_arc'].forEach((k, i) => {
      const colors = [0x4ade80, 0x22d3ee, 0xfbbf24, 0xe879f9, 0xfb923c, 0x84cc16]
      if (!this.textures.exists(k)) {
        const g = this.make.graphics({ x: 0, y: 0 })
        g.fillStyle(colors[i], 1); g.fillCircle(14, 14, 14)
        g.fillStyle(0xffffff, 0.95); g.fillCircle(14, 14, 6)
        g.generateTexture(k, 28, 28); g.destroy()
      }
    })
    if (!this.textures.exists('spark')) {
      // Tight, crisp glint (hot core + minimal falloff) instead of a soft ball,
      // so muzzle/impact sparks read sharp under the 2x render.
      const s = this.make.graphics({ x: 0, y: 0 })
      s.fillStyle(0xffffff, 0.22); s.fillCircle(8, 8, 8)
      s.fillStyle(0xffffff, 0.6); s.fillCircle(8, 8, 4)
      s.fillStyle(0xffffff, 1); s.fillCircle(8, 8, 2)
      s.generateTexture('spark', 16, 16); s.destroy()
    }
    if (!this.textures.exists('spike')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      const n = 5, sw = 64 / n
      for (let i = 0; i < n; i++) {
        const x = i * sw
        g.fillStyle(0x7f1d1d, 1); g.fillTriangle(x, 22, x + sw / 2, 1, x + sw, 22)             // dark base
        g.fillStyle(0xef4444, 1); g.fillTriangle(x + 2, 22, x + sw / 2, 6, x + sw - 2, 22)     // red body
        g.fillStyle(0xfecaca, 0.9); g.fillTriangle(x + sw / 2 - 1, 12, x + sw / 2, 4, x + sw / 2 + 2, 12) // glint
      }
      g.generateTexture('spike', 64, 22); g.destroy()
    }
    if (!this.textures.exists('pad')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0x0f3d2e, 1); g.fillRoundedRect(0, 8, 64, 16, 5)        // dark housing
      g.fillStyle(0x10b981, 1); g.fillRoundedRect(3, 4, 58, 12, 5)        // green spring face
      g.fillStyle(0x6ee7b7, 1)
      g.fillTriangle(20, 12, 26, 3, 32, 12); g.fillTriangle(34, 12, 40, 3, 46, 12)  // up chevrons
      g.generateTexture('pad', 64, 26); g.destroy()
    }
    if (!this.textures.exists('shard')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      const diamond = (cx: number, cy: number, r: number) => { g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fillPath() }
      g.fillStyle(0x22d3ee, 1); diamond(11, 11, 11)
      g.fillStyle(0xa5f3fc, 1); diamond(11, 11, 6)
      g.fillStyle(0xffffff, 0.95); diamond(11, 9, 2.5)
      g.generateTexture('shard', 22, 22); g.destroy()
    }
  }

  private createThemeTextures() {
    if (!this.textures.exists('stars')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      for (let i = 0; i < 90; i++) {
        const a = 0.3 + Math.random() * 0.6
        g.fillStyle(0xffffff, a)
        g.fillCircle(Math.random() * 800, Math.random() * 420, Math.random() > 0.85 ? 1.6 : 1)
      }
      g.generateTexture('stars', 800, 600); g.destroy()
    }
    const makeSkyline = (key: string, color: number, accent: number, baseY: number, step: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0 })
      let x = 0
      while (x < 800) {
        const w = Phaser.Math.Between(Math.floor(step * 0.6), Math.floor(step * 1.5))
        const h = Phaser.Math.Between(80, 300)
        const top = baseY - h
        g.fillStyle(color, 1); g.fillRect(x, top, w - 6, h)
        g.fillStyle(accent, 0.4)
        for (let wy = top + 12; wy < baseY - 10; wy += 22) {
          for (let wx = x + 6; wx < x + w - 14; wx += 16) {
            if (Math.random() > 0.62) g.fillRect(wx, wy, 6, 9)
          }
        }
        x += w
      }
      g.generateTexture(key, 800, 600); g.destroy()
    }
    ;(Object.keys(THEMES) as ThemeName[]).forEach((name) => {
      const t = THEMES[name]
      makeSkyline('far_' + name, t.far, t.rim, 430, 66)
      makeSkyline('mid_' + name, t.mid, t.accent, 560, 108)
    })
  }

  private buildLevel(lvl: number) {
    this.platforms.clear(true, true)
    this.enemies.clear(true, true)
    this.powerups.clear(true, true)
    this.bullets.clear(true, true)
    this.arcBombs?.clear(true, true)
    this.enemyBullets.clear(true, true)
    this.movers.clear(true, true)
    this.hazards.clear(true, true)
    this.bouncers.clear(true, true)
    this.shards?.getChildren().forEach((s) => this.tweens.killTweensOf(s))
    this.shards?.clear(true, true)
    this.destroyBossBar()
    this.bossRef = undefined
    this.shardsGot = 0
    this.shardsTotal = 0
    this.decor.forEach((d) => { this.tweens.killTweensOf(d); d.destroy() })
    this.decor = []
    this.spawnTimer = 0
    this.bossPhase = 1

    const def = this.levels()[lvl - 1]
    const theme = THEMES[def.theme]
    this.bossMusicOn = false                 // new sector starts calm; boss layer re-arms when its guardian appears
    this.sfx?.setMusicTheme(def.theme)       // retune the bed to this sector (no-op if music isn't playing yet)
    this.levelW = def.w
    this.levelH = def.h
    this.goalX = def.goal[0]
    this.goalY = def.goal[1]
    // End-of-stage guardian: on a normal (goal-based) stage, lock the extraction and
    // arm the guardian to spawn as the player nears the exit. (Boss stages are kill-all.)
    this.nextBossLabel = 'APEX SENTINEL'
    this.nextBossKind = 'sentinel'
    this.endBossSpawned = false
    this.midSecured = false
    this.objectiveMsg = ''                            // fresh stage → let its objective line pop into view
    this.pendingEndBoss = undefined
    this.extractionLocked = false
    if (def.endBoss && !(this.goalX === 0 && this.goalY === 0)) {
      this.pendingEndBoss = def.endBoss
      this.extractionLocked = true
    }

    this.cameras.main.setBackgroundColor(theme.bg)
    // Extra fall room below the content so pits are real drops.
    this.physics.world.setBounds(0, 0, def.w, def.h + 400)
    this.cameras.main.setBounds(0, 0, def.w, def.h)

    const bgKey = 'bg_' + def.theme
    if (this.textures.exists(bgKey)) {
      this.bgImage.setTexture(bgKey).setDisplaySize(WORLD_VIEW_W + 60, WORLD_VIEW_W * 0.75 + 60).setVisible(true)
      this.bgScrim.setVisible(true)
      this.bgStars.setVisible(false); this.bgFar.setVisible(false); this.bgMid.setVisible(false)
    } else {
      this.bgImage.setVisible(false); this.bgScrim.setVisible(false)
      this.bgStars.setVisible(true).setTexture('stars')
      this.bgFar.setVisible(true).setTexture('far_' + def.theme)
      this.bgMid.setVisible(true).setTexture('mid_' + def.theme)
    }

    // Per-theme environmental set-dressing (procedural, behind + around the terrain)
    // so each stage reads as a distinct place, not just a recolour.
    this.decorateLevel(def, theme)

    // A solid terrain block: textured tech-plate body (tiled → no stretch), shaded
    // mass toward the bottom, dimensional side edges, and a bright walkable top.
    const solid = (cx: number, top: number, w: number, h: number, tint: number, rim: number) => {
      const s = this.platforms.create(cx, top + h / 2, 'terrain') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, h); s.setDepth(5); s.refreshBody(); s.setVisible(false)              // collision only
      this.decor.push(this.add.tileSprite(cx, top + h / 2, w, h, 'slab').setTint(tint).setDepth(5))
      this.decor.push(this.add.rectangle(cx, top + h * 0.66, w, h * 0.68, 0x000000, 0.32).setDepth(5))            // mass shade (darker low)
      this.decor.push(this.add.rectangle(cx - w / 2 + 2, top + h / 2, 3, h, 0xffffff, 0.10).setDepth(6))          // lit left edge
      this.decor.push(this.add.rectangle(cx + w / 2 - 2, top + h / 2, 3, h, 0x000000, 0.28).setDepth(6))          // shadow right edge
      this.decor.push(this.add.rectangle(cx, top + 6, w + 10, 20, rim, 0.14).setDepth(4).setBlendMode(Phaser.BlendModes.ADD))  // top glow halo
      this.decor.push(this.add.rectangle(cx, top + 5, w - 2, 9, 0xffffff, 0.12).setDepth(6))                      // top sheen
      this.decor.push(this.add.rectangle(cx, top + 1, w, 3, rim, 1).setDepth(7))                                  // crisp neon lip
    }

    def.ground.forEach(([x1, x2, top]) => solid((x1 + x2) / 2, top, x2 - x1, def.h + 400 - top, theme.fill, theme.rim))
    // Elevated platforms: real chunky solid slabs (varied thickness) you run UNDER
    // and land ON — substantial terrain, not floating bars.
    def.plats.forEach(([cx, top, w]) => {
      const seed = Math.abs(Math.round(cx * 2.3 + top * 1.7))
      const th = 34 + (seed % 4) * 8           // 34..58px thick, varied
      solid(cx, top, w, th, theme.ledge, theme.rim)
    })
    def.walls.forEach(([cx, top, w, h]) => solid(cx, top, w, h, theme.ledge, theme.accent))

    // Spike strips — throwback hazard, new-age look. Overlap = damage.
    def.hazards?.forEach(([cx, top, w]) => {
      const s = this.hazards.create(cx, top - 8, 'spike') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, 18).setDepth(8).refreshBody()
      this.decor.push(this.add.rectangle(cx, top - 1, w, 3, 0xef4444, 0.7).setDepth(7).setBlendMode(Phaser.BlendModes.ADD))
      this.decor.push(this.add.rectangle(cx, top + 6, w, 10, 0x7f1d1d, 0.55).setDepth(6))  // mounting base
    })

    // Moving platforms — sine-driven lifts/shuttles you ride across gaps and up shafts.
    def.movers?.forEach(([cx, top, w, axis, dist, spd]) => {
      const cy = top + 10
      const m = this.movers.create(cx, cy, 'slab') as Phaser.Physics.Arcade.Sprite
      m.setDisplaySize(w, 22).setTint(theme.ledge).setDepth(18).refreshBody()   // textured tech platform
      const glow = this.add.rectangle(cx, cy, w + 12, 30, theme.accent, 0.18).setDepth(17).setBlendMode(Phaser.BlendModes.ADD)
      const rim = this.add.rectangle(cx, cy - 10, w, 3, theme.accent, 1).setDepth(19)
      const under = this.add.rectangle(cx, cy + 11, w - 6, 4, theme.accent, 0.85).setDepth(19).setBlendMode(Phaser.BlendModes.ADD)  // powered underside
      const chev = axis === 'v' ? '↕' : '↔'
      const mark = this.add.text(cx, cy, chev, { fontFamily: 'monospace', fontSize: '12px', color: '#' + theme.accent.toString(16).padStart(6, '0') }).setOrigin(0.5).setAlpha(0.7).setDepth(19)
      m.setData('axis', axis); m.setData('dist', dist); m.setData('spd', spd); m.setData('t', 0)
      m.setData('home', axis === 'v' ? cy : cx)
      m.setData('rider', [glow, rim, under, mark])
      this.decor.push(glow, rim, under, mark)
    })

    // Launch pads — land on one and spring high (reaches ledges a double-jump can't).
    def.bouncers?.forEach(([cx, top, w]) => {
      const s = this.bouncers.create(cx, top - 5, 'pad') as Phaser.Physics.Arcade.Sprite
      s.setDisplaySize(w, 20).setDepth(9).refreshBody()
      s.setData('lastPop', -9999); s.setData('sy', s.scaleY)
      this.decor.push(this.add.rectangle(cx, top - 2, w, 4, 0x6ee7b7, 0.8).setDepth(9).setBlendMode(Phaser.BlendModes.ADD))
      this.decor.push(this.add.rectangle(cx, top - 26, w + 10, 44, 0x10b981, 0.10).setDepth(8).setBlendMode(Phaser.BlendModes.ADD))
    })

    // Extraction beacon at the goal
    if (!(this.goalX === 0 && this.goalY === 0)) {
      const gx = def.goal[0], gy = def.goal[1]
      this.decor.push(this.add.rectangle(gx, gy, 46, 150, theme.accent, 0.14).setDepth(6))
      this.decor.push(this.add.rectangle(gx - 15, gy, 12, 150, theme.rim, 1).setDepth(7))
      this.decor.push(this.add.rectangle(gx + 15, gy, 12, 150, theme.rim, 1).setDepth(7))
      const chev = this.add.text(gx, gy - 96, '▼', { fontFamily: 'monospace', fontSize: '22px', color: '#' + theme.rim.toString(16).padStart(6, '0') }).setOrigin(0.5).setDepth(7)
      this.tweens.add({ targets: chev, y: gy - 76, duration: 700, yoyo: true, repeat: -1 })
      this.decor.push(chev)
    }

    def.turrets.forEach(([x, surY]) => this.spawnEnemy('turret', x, surY - 19, 4 + lvl, 0))
    // Promote a deterministic handful of ground fighters to ELITE mini-bosses (up to 2/sector) so
    // every run has a couple of memorable tougher fights — fair and identical across runs.
    let eligibleSeen = 0, elitesMade = 0
    // APEX HEAT packs in more elite mini-bosses (and a denser stride so the cap is actually reached).
    const hot = this.heatRun && this.heatTier > 0
    const eliteCap = hot ? Math.min(8, 2 + this.heatTier) : 2
    const eliteStride = hot ? 3 : 5
    const eliteOffset = hot ? 1 : 3
    def.enemies.forEach((e) => {
      const eligible = e.kind === 'soldier' || e.kind === 'tank' || e.kind === 'charger'
      let makeElite = false
      if (eligible) { eligibleSeen++; if (elitesMade < eliteCap && eligibleSeen % eliteStride === eliteOffset) { makeElite = true; elitesMade++ } }
      this.spawnEnemy(e.kind, e.x, e.y, e.hp, e.speed, undefined, makeElite)
    })
    def.pods.forEach(([x, y, kind]) => this.spawnPowerup(x, y, kind as string))
    this.placeShards(def)
  }

  // Per-theme environmental set-dressing. Procedural props (no art assets) that give
  // each stage a distinct sense of place — city neon+windows, factory pipes+gears, sky
  // clouds+pylons, reactor conduits+coils, throne columns+braziers. All non-colliding,
  // parallaxed, and pushed to `decor` so they clear on rebuild. Depth < 5 sits behind
  // the terrain; depth 9 is a thin foreground haze that never covers the play space.
  private decorateLevel(def: LevelDef, theme: Theme) {
    const w = def.w
    const gy = 600                                   // standard walk surface (horizontal levels)
    const ADD = Phaser.BlendModes.ADD
    // Deterministic per-stage RNG so each layout is stable + hand-tunable across runs.
    let s = (0x9e3779b9 ^ def.name.length) >>> 0
    for (let i = 0; i < def.name.length; i++) s = Math.imul(s ^ def.name.charCodeAt(i), 0x85ebca6b) >>> 0
    const rnd = () => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; s = Math.imul(s ^ (s >>> 13), 0x297a2d39) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296 }
    const R = (a: number, b: number) => a + rnd() * (b - a)
    const RI = (a: number, b: number) => Math.floor(R(a, b + 0.999))
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.decor.push(o); return o }
    const rect = (x: number, y: number, rw: number, rh: number, c: number, a = 1, d = 4, sf = 1) =>
      keep(this.add.rectangle(x, y, rw, rh, c, a).setDepth(d).setScrollFactor(sf))
    const glow = (x: number, y: number, rw: number, rh: number, c: number, a: number, d = 4, sf = 1) =>
      keep(this.add.rectangle(x, y, rw, rh, c, a).setDepth(d).setScrollFactor(sf).setBlendMode(ADD))
    const gc = (x: number, y: number, r: number, c: number, a = 1, d = 4, sf = 1) =>
      keep(this.add.circle(x, y, r, c, a).setDepth(d).setScrollFactor(sf))
    const pulse = (o: Phaser.GameObjects.GameObject, from: number, to: number, dur: number) =>
      this.tweens.add({ targets: o, alpha: { from, to }, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    const A = theme.accent, RIM = theme.rim, LED = theme.ledge

    switch (def.theme) {
      case 'streets': {
        // Back tower faces with lit-window grids (slow parallax; extended below the
        // ground so vertical parallax never reveals a gap under the terrain).
        for (let x = 240; x < w - 160; x += RI(320, 470)) {
          const bw = R(120, 220), bh = R(180, 330), top = gy - bh
          rect(x, (top + gy + 160) / 2, bw, bh + 160, 0x140c26, 0.92, 3, 0.6)
          glow(x, top + 3, bw, 5, A, 0.4, 3, 0.6)
          for (let wy = top + 18; wy < gy - 16; wy += 24)
            for (let wx = x - bw / 2 + 14; wx < x + bw / 2 - 12; wx += 22)
              if (rnd() > 0.62) glow(wx, wy, 7, 11, rnd() > 0.72 ? RIM : 0xfbbf24, R(0.22, 0.55), 3, 0.6)
        }
        // Blinking vertical neon signs hung on the faces.
        for (let x = 320; x < w - 220; x += RI(520, 820)) {
          const sy = gy - R(150, 260), sh = R(70, 120), col = rnd() > 0.5 ? RIM : A
          glow(x, sy, 22, sh + 12, col, 0.12, 3, 0.72)
          const sign = glow(x, sy, 11, sh, col, 0.8, 4, 0.72)
          if (rnd() > 0.45) pulse(sign, 0.32, 0.85, R(560, 1150))
        }
        // Street lamps rising from the walkway, each with a soft down-cone.
        for (let x = 280; x < w - 150; x += RI(360, 520)) {
          const dir = rnd() > 0.5 ? 1 : -1
          rect(x, gy - 62, 5, 128, 0x0e0a1a, 0.95, 4)
          rect(x + 13 * dir, gy - 120, 30, 6, LED, 1, 4)
          glow(x + 24 * dir, gy - 114, 10, 6, 0xfff1a8, 0.85, 5)
          keep(this.add.triangle(x + 24 * dir, gy - 40, -15, -72, 15, -72, 0, 0, 0xfff1a8, 0.06).setDepth(4).setBlendMode(ADD))
        }
        // Drifting ground steam (thin foreground band).
        for (let x = 320; x < w - 150; x += RI(440, 660)) {
          const h = keep(this.add.ellipse(x, gy - 8, R(70, 130), 26, 0x6d5a9a, 0.10).setDepth(9).setBlendMode(ADD))
          this.tweens.add({ targets: h, y: gy - 44, alpha: 0, scaleX: 1.6, duration: R(2600, 4200), repeat: -1, ease: 'Sine.easeOut' })
        }
        break
      }

      case 'industrial': {
        // Fat vertical pipes running the back wall, with band highlights + valves.
        for (let x = 240; x < w - 160; x += RI(280, 440)) {
          const pw = R(26, 44), top = gy - R(160, 300)
          rect(x, (top + gy + 140) / 2, pw, (gy + 140) - top, 0x2a1c10, 0.95, 3, 0.7)
          rect(x - pw / 2 + 3, (top + gy) / 2, 3, gy - top, 0xffd9a0, 0.14, 3, 0.7)   // lit edge
          rect(x + pw / 2 - 3, (top + gy) / 2, 4, gy - top, 0x000000, 0.3, 3, 0.7)    // shade edge
          for (let vy = top + 30; vy < gy - 20; vy += RI(70, 120)) rect(x, vy, pw + 10, 9, LED, 0.9, 3, 0.7)  // couplings
        }
        // A long overhead pipe run with joint boxes.
        {
          const py = gy - R(300, 350)
          rect(w / 2, py, w, 14, 0x241a10, 0.9, 3, 0.7)
          rect(w / 2, py - 8, w, 3, 0xffd9a0, 0.12, 3, 0.7)
          for (let x = 200; x < w; x += RI(260, 420)) rect(x, py, 26, 24, LED, 0.95, 3, 0.7)
        }
        // Slow-turning gears (spokes poke past the rim to read as cogs).
        for (let x = 380; x < w - 200; x += RI(560, 900)) {
          const r = R(34, 60), y = gy - R(120, 240)
          const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, r + 5, RIM, 0.16).setBlendMode(ADD),
            this.add.circle(0, 0, r, 0x241a10, 0.96),
            this.add.circle(0, 0, r * 0.5, LED, 0.9),
            this.add.circle(0, 0, r * 0.18, 0x120c06, 1),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45),
            this.add.rectangle(0, 0, 6, r * 2.3, RIM, 0.45),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45).setRotation(Math.PI / 4),
            this.add.rectangle(0, 0, r * 2.3, 6, RIM, 0.45).setRotation(-Math.PI / 4),
          ]
          const gear = keep(this.add.container(x, y, parts).setDepth(3).setScrollFactor(0.75))
          this.tweens.add({ targets: gear, angle: rnd() > 0.5 ? 360 : -360, duration: R(9000, 16000), repeat: -1 })
        }
        // Steam vents puffing off the floor.
        for (let x = 300; x < w - 150; x += RI(500, 760)) {
          const v = keep(this.add.ellipse(x, gy - 10, 40, 20, 0xffd9a0, 0.12).setDepth(9).setBlendMode(ADD))
          this.tweens.add({ targets: v, y: gy - 70, scaleX: 2, scaleY: 2.4, alpha: 0, duration: R(1500, 2400), repeat: -1, ease: 'Sine.easeOut' })
        }
        break
      }

      case 'sky': {
        // Drifting cloud banks (deep parallax) built from stacked soft ellipses.
        for (let i = 0; i < 10; i++) {
          const cx = R(200, w - 200), cy = R(80, 360), cw = R(120, 240)
          const puffs: Phaser.GameObjects.GameObject[] = []
          for (let j = 0; j < 4; j++) puffs.push(keep(this.add.ellipse(cx + R(-cw / 2, cw / 2), cy + R(-14, 14), R(70, 130), R(34, 56), 0xbfe6ff, R(0.05, 0.12)).setDepth(2).setScrollFactor(0.35).setBlendMode(ADD)))
          this.tweens.add({ targets: puffs, x: '+=' + R(40, 90), duration: R(9000, 16000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Tall lattice pylons rising behind the rails (legs + rungs + X-braces).
        for (let x = 300; x < w - 200; x += RI(500, 780)) {
          const top = gy - R(220, 340), half = R(26, 40)
          rect(x - half, (top + gy + 120) / 2, 5, (gy + 120) - top, 0x18344a, 0.9, 3, 0.6)
          rect(x + half, (top + gy + 120) / 2, 5, (gy + 120) - top, 0x18344a, 0.9, 3, 0.6)
          const bl = Math.hypot(half * 2, 44), ba = Math.atan2(44, half * 2)
          for (let ry = top + 24; ry < gy; ry += RI(52, 74)) {
            rect(x, ry, half * 2, 4, 0x1d3a57, 0.9, 3, 0.6)                                   // rung
            keep(this.add.rectangle(x, ry + 22, bl, 3, 0x2a4a63, 0.5).setRotation(ba).setDepth(3).setScrollFactor(0.6))   // X-brace
            keep(this.add.rectangle(x, ry + 22, bl, 3, 0x2a4a63, 0.5).setRotation(-ba).setDepth(3).setScrollFactor(0.6))
          }
        }
        // Blinking beacon masts.
        for (let x = 360; x < w - 200; x += RI(600, 900)) {
          const mh = R(120, 200)
          rect(x, gy - mh / 2, 4, mh, 0x14283a, 0.9, 4)
          const light = gc(x, gy - mh, 6, 0xff5566, 0.95, 5)
          glow(x, gy - mh, 16, 16, 0xff5566, 0.4, 4)
          pulse(light, 0.25, 1, R(500, 800))
        }
        break
      }

      case 'core': {
        // Pulsing vertical energy conduits threading the back wall.
        for (let x = 220; x < w - 140; x += RI(200, 320)) {
          const top = gy - R(180, 320)
          rect(x, (top + gy + 140) / 2, 10, (gy + 140) - top, 0x2a0d13, 0.95, 3, 0.7)
          const vein = glow(x, (top + gy) / 2, 4, gy - top, rnd() > 0.5 ? RIM : A, 0.6, 3, 0.7)
          pulse(vein, 0.25, 0.85, R(900, 1700))
          for (let cy = top + 26; cy < gy - 16; cy += RI(60, 100)) glow(x, cy, 16, 5, A, 0.5, 3, 0.7)  // couplings
        }
        // Reactor coil rings that breathe (concentric strokes, pulsing scale).
        for (let x = 420; x < w - 220; x += RI(560, 900)) {
          const y = gy - R(150, 260)
          const halo = gc(x, y, R(60, 90), A, 0.06, 3, 0.75)
          for (let k = 0; k < 3; k++) {
            const ring = keep(this.add.circle(x, y, 26 + k * 16, 0x000000, 0).setStrokeStyle(3, k === 1 ? RIM : A, 0.7).setDepth(3).setScrollFactor(0.75).setBlendMode(ADD))
            this.tweens.add({ targets: ring, scale: { from: 0.85, to: 1.12 }, duration: R(1400, 2200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 160 })
          }
          this.tweens.add({ targets: halo, scale: { from: 0.9, to: 1.2 }, alpha: { from: 0.05, to: 0.12 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Warning chevrons stencilled on the floor.
        for (let x = 300; x < w - 150; x += RI(360, 560)) {
          keep(this.add.text(x, gy - 12, '▶▶', { fontFamily: 'monospace', fontSize: '13px', color: '#' + (RIM >>> 0).toString(16).padStart(6, '0') }).setOrigin(0.5).setAlpha(0.28).setDepth(4))
        }
        break
      }

      case 'throne': {
        // Fluted columns framing the hall (base + shaft highlights + capital).
        for (let x = 260; x < w - 160; x += RI(300, 420)) {
          const top = gy - R(240, 340), cw = R(40, 60)
          rect(x, (top + gy + 120) / 2, cw, (gy + 120) - top, 0x2a2040, 0.92, 3, 0.8)
          rect(x - cw / 2 + 5, (top + gy) / 2, 4, gy - top, 0xffe9b0, 0.12, 3, 0.8)
          rect(x + cw / 2 - 5, (top + gy) / 2, 4, gy - top, 0x000000, 0.28, 3, 0.8)
          rect(x, top + 8, cw + 20, 18, LED, 0.95, 3, 0.8)     // capital
          glow(x, top + 8, cw + 26, 20, RIM, 0.14, 3, 0.8)
        }
        // Hanging banners with an emblem, gently swaying from the top.
        for (let x = 360; x < w - 200; x += RI(420, 640)) {
          const by = gy - R(300, 360), bh = R(120, 180)
          const banner = keep(this.add.rectangle(x, by, 46, bh, A, 0.28).setOrigin(0.5, 0).setDepth(4).setScrollFactor(0.85))
          const emblem = keep(this.add.star(x, by + 34, 4, 5, 13, RIM, 0.7).setOrigin(0.5, 0).setDepth(4).setScrollFactor(0.85))
          this.tweens.add({ targets: [banner, emblem], angle: { from: -2.5, to: 2.5 }, duration: R(2400, 3400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Braziers with a flickering flame + rising embers.
        for (let x = 320; x < w - 150; x += RI(440, 640)) {
          rect(x, gy - 26, 22, 12, 0x3a2a1a, 1, 4)               // bowl
          rect(x, gy - 14, 8, 22, 0x2a1f14, 1, 4)                // stand
          const flame = keep(this.add.ellipse(x, gy - 40, 20, 34, 0xffb347, 0.7).setDepth(5).setBlendMode(ADD))
          glow(x, gy - 40, 44, 50, 0xff7a1a, 0.18, 4)
          this.tweens.add({ targets: flame, scaleY: { from: 0.8, to: 1.25 }, scaleX: { from: 1, to: 0.8 }, alpha: { from: 0.55, to: 0.85 }, duration: R(180, 320), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
          for (let e = 0; e < 3; e++) {
            const ember = keep(this.add.circle(x + R(-8, 8), gy - 40, R(1.5, 2.6), 0xffcf7a, 0.9).setDepth(9).setBlendMode(ADD))
            this.tweens.add({ targets: ember, y: gy - R(120, 190), x: '+=' + R(-16, 16), alpha: 0, duration: R(1400, 2400), repeat: -1, ease: 'Sine.easeOut', delay: e * 500 })
          }
        }
        break
      }

      case 'volt': {
        // Tesla coils rising off the back wall — a mast stacked with coil rings, a bright
        // discharge tip, and a soft charge halo that pulses.
        for (let x = 240; x < w - 160; x += RI(300, 460)) {
          const top = gy - R(200, 320)
          rect(x, (top + gy + 120) / 2, 8, (gy + 120) - top, 0x161d3a, 0.95, 3, 0.7)          // mast
          for (let cy = top + 26; cy < gy - 20; cy += RI(46, 70))
            keep(this.add.circle(x, cy, R(14, 26), 0x000000, 0).setStrokeStyle(3, RIM, 0.5).setDepth(3).setScrollFactor(0.7))  // coil ring
          const tip = gc(x, top, 7, RIM, 0.95, 4, 0.7)                                        // discharge tip
          glow(x, top, 20, 20, RIM, 0.35, 3, 0.7)
          pulse(tip, 0.3, 1, R(420, 780))
        }
        // Crackling arcs strung between the coil tips (thin bright bars that flicker).
        for (let x = 360; x < w - 240; x += RI(560, 920)) {
          const arc = glow(x, gy - R(210, 300), R(120, 200), 3, A, 0.5, 4, 0.7)
          this.tweens.add({ targets: arc, alpha: { from: 0.08, to: 0.8 }, scaleX: { from: 0.9, to: 1.1 }, duration: R(140, 300), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
        }
        // Charge orbs drifting up the spire.
        for (let x = 300; x < w - 160; x += RI(360, 560)) {
          const orb = keep(this.add.circle(x + R(-20, 20), gy - R(40, 120), R(2.5, 5), A, 0.9).setDepth(9).setBlendMode(ADD))
          this.tweens.add({ targets: orb, y: gy - R(200, 340), x: '+=' + R(-24, 24), alpha: 0, duration: R(2200, 3600), repeat: -1, ease: 'Sine.easeOut', delay: R(0, 1400) })
        }
        // Electrified floor seams.
        for (let x = 300; x < w - 150; x += RI(420, 640)) {
          const seam = glow(x, gy - 6, R(80, 150), 5, RIM, 0.16, 4)
          pulse(seam, 0.06, 0.28, R(700, 1300))
        }
        break
      }
    }
  }

  private spawnEnemy(kind: string, x: number, y: number, hp: number, speed: number, type?: string, elite = false) {
    // APEX HEAT: scale enemy HP + speed by the active tier (campaign heat runs only). Applied to the
    // parameters so downstream maxHp, elite HP (hp*2.5), and speed all inherit the multiplier.
    if (this.heatRun && this.heatTier > 0) {
      const m = heatMods(this.heatTier)
      hp = Math.max(1, Math.round(hp * m.hp))
      speed = speed * m.spd
    }
    let tex = 'enemy'
    let t = type || 'walker'
    let displayW = 48, displayH = 48

    if (kind === 'soldier' || kind === 'enemy') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = type || 'walker'; displayW = 47; displayH = 64   // respect an explicit type (e.g. 'sniper') built on the soldier body
    } else if (kind === 'flyer') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'flyer'; displayW = 56; displayH = 56
    } else if (kind === 'tank') {
      tex = this.textures.exists('enemy_tank') ? 'enemy_tank' : 'tank'
      t = 'tank'; displayW = 88; displayH = 65
    } else if (kind === 'turret') {
      tex = 'turret'; t = 'turret'; displayW = 50; displayH = 42
    } else if (kind === 'charger') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'charger'; displayW = 52; displayH = 70
    } else if (kind === 'diver') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'diver'; displayW = 58; displayH = 58
    } else if (kind === 'sapper') {
      tex = this.textures.exists('enemy_soldier') ? 'enemy_soldier' : 'enemy'
      t = 'sapper'; displayW = 50; displayH = 66
    } else if (kind === 'splitter') {
      tex = this.textures.exists('enemy_flyer') ? 'enemy_flyer' : 'flyer'
      t = 'splitter'; displayW = 58; displayH = 58
    } else if (kind === 'boss') {
      tex = this.textures.exists('boss_art') ? 'boss_art' : 'boss'
      // Size scales with HP so mini-guardians read smaller than the final boss.
      t = 'boss'; displayW = displayH = Math.min(230, Math.round(120 + hp * 1.7))
    }

    const enemy = this.enemies.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    enemy.setDisplaySize(displayW, displayH)
    if (t === 'charger') { enemy.setData('baseTint', 0xff7a3c); enemy.setTint(0xff7a3c) }
    if (t === 'diver') { enemy.setData('baseTint', 0xff4d6d); enemy.setTint(0xff4d6d) }
    if (t === 'sniper') { enemy.setData('baseTint', 0x93c5fd); enemy.setTint(0x93c5fd) }   // cold steel-blue long-range shooter
    if (t === 'sapper') {   // orange mortar unit — marks the ground then detonates it; clean up its reticle if killed mid-wind-up
      enemy.setData('baseTint', 0xf97316); enemy.setTint(0xf97316)
      ;(enemy as Phaser.GameObjects.Sprite).on('destroy', () => { const r = enemy.getData('reticle') as Phaser.GameObjects.Arc | undefined; if (r) r.destroy() })
    }
    if (t === 'splitter') { enemy.setData('baseTint', 0xc084fc); enemy.setTint(0xc084fc) }   // violet fission pod — bursts into two ground minis
    if (t === 'shielder') {   // slate bruiser with a frontal energy shield — hit it from above (aim down) or behind
      enemy.setData('baseTint', 0x94a3b8); enemy.setTint(0x94a3b8)
      const shield = this.add.rectangle(enemy.x, enemy.y, 9, 48, 0x67e8f9, 0.42).setStrokeStyle(2, 0xa5f3fc, 0.9).setDepth(19)
      enemy.setData('shield', shield)
      ;(enemy as Phaser.GameObjects.Sprite).on('destroy', () => shield.destroy())
    }
    if (t === 'boss') {
      // Each boss carries its behavior id + accent colour (tints the sprite + its bolts).
      const bk = this.nextBossKind
      enemy.setData('bossKind', bk)
      enemy.setData('atkT', 1100); enemy.setData('atkIdx', 0)
      const acc = bossAccent(bk)
      enemy.setData('baseTint', acc); enemy.setTint(acc)
    }
    enemy.setData('bsx', enemy.scaleX); enemy.setData('bsy', enemy.scaleY)
    enemy.setBounce(0.02)
    enemy.setCollideWorldBounds(false)
    enemy.setData('hp', hp); enemy.setData('maxHp', hp); enemy.setData('speed', speed)
    enemy.setData('type', t)
    enemy.setData('dir', Math.random() > 0.5 ? 1 : -1)
    enemy.setData('shootTimer', Phaser.Math.Between(200, 900))
    enemy.setDepth(18)

    // ELITE: a roaming mini-boss variant of an ordinary enemy — same AI, but tougher (2.5x HP),
    // bigger, gold-tinted with a pulsing aura, a touch faster, and a guaranteed drop on death.
    if (elite && t !== 'boss') {
      const ehp = Math.max(hp + 4, Math.round(hp * 2.5))
      enemy.setData('hp', ehp); enemy.setData('maxHp', ehp)
      enemy.setData('speed', speed * 1.12)
      enemy.setData('elite', true)
      const ex = enemy.scaleX * 1.32, ey = enemy.scaleY * 1.32
      enemy.setScale(ex, ey); enemy.setData('bsx', ex); enemy.setData('bsy', ey)
      enemy.setData('baseTint', 0xfde047); enemy.setTint(0xfde047)
      const aura = this.add.circle(enemy.x, enemy.y, 24, 0xfbbf24, 0).setStrokeStyle(2, 0xfde047, 0.85).setDepth(17)
      enemy.setData('aura', aura)
      this.tweens.add({ targets: aura, scale: { from: 0.9, to: 1.28 }, alpha: { from: 0.9, to: 0.28 }, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      ;(enemy as Phaser.GameObjects.Sprite).on('destroy', () => { this.tweens.killTweensOf(aura); aura.destroy() })
    }

    // STAGGER poise: FOCUS-FIRE builds it; a break freezes the enemy for a burst window. Sized off max
    // HP (~0.7×) so it breaks a durable foe around 30% HP for a finish, while grunts die before it fills.
    // Bosses are exempt — they run scripted phases.
    if (t !== 'boss') {
      const mhp = enemy.getData('maxHp') as number
      enemy.setData('poiseMax', Math.max(4, Math.round(mhp * 0.7)))
      enemy.setData('poise', 0); enemy.setData('staggerUntil', 0); enemy.setData('staggerImmuneUntil', 0); enemy.setData('lastPoiseAt', 0)
    }

    // Materialize: pop in with a quick scale-up + white flash so spawns read with
    // presence instead of blinking into existence. Boss keeps its own entrance.
    if (t !== 'boss') {
      const bsx = enemy.scaleX, bsy = enemy.scaleY
      enemy.setScale(bsx * 0.25, bsy * 0.25).setTint(0xffffff)
      this.tweens.add({ targets: enemy, scaleX: bsx, scaleY: bsy, duration: 210, ease: 'Back.easeOut' })
      this.time.delayedCall(110, () => this.restoreTint(enemy))
    }

    if (t === 'boss') {
      this.bossRef = enemy; this.createBossBar(hp)
      this.sfx?.bossRoar()                     // every boss roars on entrance — guardians AND the inline throne boss
      this.sfx?.bossLeitmotif(BOSS_LEITMOTIF[this.nextBossKind] || [], false)
      this.fxShake(220, 0.015)
      if (this.isBossLevel()) this.screenToast('⚠ ' + this.nextBossLabel, '#f43f5e', 110)   // final boss announces itself (guardians toast at their spawn site)
    }

    if (t === 'flyer' || t === 'boss' || t === 'diver' || t === 'splitter') {
      enemy.setVelocity(speed * (Math.random() > 0.5 ? 1 : -1), t === 'boss' ? 15 : speed * 0.3)
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    } else if (t === 'turret') {
      ;(enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      enemy.setImmovable(true); enemy.setVelocity(0, 0)
    } else {
      enemy.setVelocityX(speed * (enemy.getData('dir') as number))
    }
  }

  private spawnPowerup(x: number, y: number, kind: string) {
    const usePod = this.textures.exists('pickup_pod')
    // Per-kind color so a heal never reads like a weapon. Health owns green; guns own their bullet colors.
    const info = powerupInfo(kind)
    const tex = usePod ? 'pickup_pod' : ({
      health: 'pow_health', spread: 'pow_spread', rapid: 'pow_rapid', laser: 'pow_laser', fire: 'pow_fire', arc: 'pow_arc',
    } as Record<string, string>)[kind]
    const p = this.powerups.create(x, y, tex) as Phaser.Physics.Arcade.Sprite
    p.setData('kind', kind)
    if (usePod) { p.setDisplaySize(40, 40); p.setTint(info.color) }
    // No bounce (bouncing wedged pods into corners/pockets behind blocks) — a gentle
    // pop then settle straight down onto the surface directly below. setImmovable so a
    // settled pod can't get shoved sideways into a gap by a passing body.
    p.setBounce(0); p.setCollideWorldBounds(false); p.setVelocityY(-70); p.setDepth(14)
    // Glyph badge on the pod + a color-coded NAME tag beneath it, so you can read what a
    // pod is on approach — before you ever touch it. A soft pulse keeps it eye-catching.
    const badge = this.add.text(x, y, info.glyph, { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold' }).setOrigin(0.5).setDepth(15)
    const tag = this.add.text(x, y + 28, info.label, { fontFamily: 'monospace', fontSize: '9px', color: info.hex, fontStyle: 'bold', stroke: '#0a0612', strokeThickness: 3 }).setOrigin(0.5).setDepth(15)
    const pulseTw = this.tweens.add({ targets: [p, badge], scale: '*=1.12', duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    p.setData('badge', badge); p.setData('tag', tag)
    // Kill the infinite pulse when the pod is collected or the level rebuilds — otherwise the
    // repeat:-1 tween keeps running against a destroyed target and leaks across pods/sectors.
    ;(p as Phaser.GameObjects.Sprite).on('destroy', () => { pulseTw.remove(); badge.destroy(); tag.destroy() })
  }

  private createHUD() {
    this.add.rectangle(78, 47, 150, 94, 0x0a0612, 0.75).setScrollFactor(0).setDepth(99).setStrokeStyle(1, 0xa855f7, 0.5)
    this.scoreText = this.add.text(10, 7, 'SCORE  0', { fontFamily: 'monospace', fontSize: '11px', color: '#e879f9' }).setScrollFactor(0).setDepth(100)
    this.healthText = this.add.text(10, 21, 'HP  ♥♥♥♥♥', { fontFamily: 'monospace', fontSize: '10px', color: '#f472b6' }).setScrollFactor(0).setDepth(100)
    this.livesText = this.add.text(10, 33, 'LIVES  3', { fontFamily: 'monospace', fontSize: '9px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(100)
    this.levelText = this.add.text(10, 44, 'SECTOR  1', { fontFamily: 'monospace', fontSize: '9px', color: '#71717a' }).setScrollFactor(0).setDepth(100)
    this.weaponText = this.add.text(10, 55, 'GUN  NORMAL', { fontFamily: 'monospace', fontSize: '9px', color: '#22d3ee' }).setScrollFactor(0).setDepth(100)
    this.comboText = this.add.text(10, 66, '', { fontFamily: 'monospace', fontSize: '9px', color: '#fbbf24' }).setScrollFactor(0).setDepth(100)
    this.shardText = this.add.text(10, 78, '◆ ' + this.shardsGot + '/' + this.shardsTotal, { fontFamily: 'monospace', fontSize: '9px', color: '#67e8f9' }).setScrollFactor(0).setDepth(100)
    // DASH readiness gauge (right side of the HUD box) — dash is the core dodge / Phase-Strike verb, but
    // its cooldown was invisible; this fills as it recharges, flashes cyan the frame it's ready, and flashes
    // red when a press lands on cooldown, so a denied dash never reads as a dropped input. (round-11 combat#1)
    this.dashGaugeLabel = this.add.text(122, 46, '» DASH', { fontFamily: 'monospace', fontSize: '7px', color: '#5eead4' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100)
    this.add.rectangle(122, 60, 52, 4, 0x3f3f46, 0.55).setScrollFactor(0).setDepth(100)   // gauge track (static)
    this.dashGaugeFill = this.add.rectangle(96, 60, 52, 4, 0x67e8f9, 0.95).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100)
    this.muteIcon = this.add.text(502, 7, this.muted ? '♪ OFF' : '♪ ON', { fontFamily: 'monospace', fontSize: '9px', color: this.muted ? '#ef4444' : '#a5b4fc' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100)
    // Persistent controller-connected chip — high depth so it shows over the title too.
    this.padIcon = this.add.text(502, 32, this.gamepadActive ? '🎮 PAD' : '', { fontFamily: 'monospace', fontSize: '9px', color: '#67e8f9' }).setOrigin(1, 0).setScrollFactor(0).setDepth(245)
    // Danger vignette — a red radial that pulses at the screen edges when health is critical.
    if (!this.textures.exists('vignette')) {
      const cw = 512, ch = 384
      const canvas = this.textures.createCanvas('vignette', cw, ch)
      const ctx = canvas?.getContext()
      if (ctx) {
        const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.30, cw / 2, ch / 2, ch * 0.72)
        g.addColorStop(0, 'rgba(244,63,94,0)')
        g.addColorStop(1, 'rgba(244,63,94,0.95)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, cw, ch)
        canvas?.refresh()
      }
    }
    this.dangerVignette = this.add.image(256, 192, 'vignette').setScrollFactor(0).setDepth(96).setAlpha(0)
    if (!this.sys.game.device.input.touch) {
      this.add.text(256, 373, 'P pause   ·   M mute   ·   Q swap gun', { fontFamily: 'monospace', fontSize: '8px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(100)
    }
    // Extraction compass — points to the goal when it's off-screen.
    this.compass = this.add.triangle(256, 192, 0, -9, 18, 0, 0, 9, 0xfbbf24, 0.9).setScrollFactor(0).setDepth(120).setVisible(false)
    this.compass.setStrokeStyle(2, 0x1a1004, 0.6)
    // Extraction progress bar across the very top — how far to the goal on these long runs.
    this.progressTrack = this.add.rectangle(256, 3, 500, 3, 0x2a1a4d, 0.5).setScrollFactor(0).setDepth(100)
    this.progressFill = this.add.rectangle(6, 3, 500, 3, 0x67e8f9, 0.9).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)
    this.progressFill.scaleX = 0
    this.progressGoalMark = this.add.text(508, -1, '⚑', { fontFamily: 'monospace', fontSize: '10px', color: '#fbbf24' }).setOrigin(1, 0).setScrollFactor(0).setDepth(101)
    // Persistent objective line under the extraction bar — always says what you're trying to do.
    // Legible size + a dark stroke so it reads as a real directive over the busy playfield, not chrome. (round-10 clarity)
    this.objectiveText = this.add.text(256, 13, '', { fontFamily: 'monospace', fontSize: '11px', color: '#67e8f9', fontStyle: 'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101)
    this.objectiveText.setStroke('#05040a', 3)
  }

  // Fill the top bar from spawn → extraction. Hidden on the boss stage (goal is the boss).
  private updateProgress() {
    if (!this.progressFill) return
    const boss = this.isBossLevel()
    // Always tell the player what they're doing: kill the boss, drop the guardian, or reach extraction.
    // Colour-code the three states and pop the line whenever it changes — most importantly the moment
    // the guardian seals extraction, so that state flip never slips past unseen. (round-10 clarity)
    const msg = (this.rushRun || boss) ? '☠ DEFEAT THE BOSS'
      : this.extractionLocked ? '⚔ DEFEAT THE GUARDIAN — extraction is sealed'
      : '▶ REACH EXTRACTION ⚑'
    if (this.objectiveText && msg !== this.objectiveMsg) {
      this.objectiveMsg = msg
      const col = (this.rushRun || boss) ? '#fca5a5' : this.extractionLocked ? '#fbbf24' : '#67e8f9'
      this.objectiveText.setText(msg).setColor(col)
      this.tweens.killTweensOf(this.objectiveText)
      this.objectiveText.setScale(1)
      this.tweens.add({ targets: this.objectiveText, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.easeOut' })
    }
    this.progressFill.setVisible(!boss)
    this.progressTrack?.setVisible(!boss)
    this.progressGoalMark?.setVisible(!boss)
    if (boss || !this.player) return
    const p = Phaser.Math.Clamp((this.player.x - 120) / Math.max(1, this.goalX - 120), 0, 1)
    this.progressFill.scaleX = p
    this.progressFill.setFillStyle(p > 0.85 ? 0xfbbf24 : 0x67e8f9, 0.9)   // goes extraction-gold on the home stretch
  }

  private updateCompass() {
    if (!this.compass) return
    if (this.isBossLevel()) { this.compass.setVisible(false); return }
    const cam = this.cameras.main
    // The compass lives on the 512x384 UI camera, but the world camera is zoomed (worldView ~720x540).
    // Map the goal's position WITHIN the visible view into UI space, so the arrow hides exactly when
    // the goal is genuinely on-screen and points from the true view centre. (round-4 BUG2)
    const vw = cam.worldView.width || 720, vh = cam.worldView.height || 540
    const gx = ((this.goalX - cam.worldView.x) / vw) * 512
    const gy = ((this.goalY - cam.worldView.y) / vh) * 384
    const m = 44
    if (gx > m && gx < 512 - m && gy > m && gy < 384 - m) { this.compass.setVisible(false); return }
    const ang = Math.atan2(gy - 192, gx - 256)
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const halfW = 256 - 26, halfH = 192 - 26
    const d = Math.min(cos !== 0 ? halfW / Math.abs(cos) : Infinity, sin !== 0 ? halfH / Math.abs(sin) : Infinity)
    this.compass.setPosition(256 + cos * d, 192 + sin * d).setRotation(ang).setVisible(true)
  }

  // Repaint the DASH readiness gauge + touch-button rim each frame: fill tracks the cooldown, a white
  // pop marks the frame it refills, and a recent denied mash flashes it red. (round-11 combat#1)
  private updateDashGauge(time: number) {
    const f = this.dashGaugeFill; if (!f) return
    const cd = Math.max(1, this.dashCd)
    const p = Phaser.Math.Clamp(1 - (this.dashCdUntil - time) / cd, 0, 1)
    const ready = p >= 1
    const denied = time - this.dashDeniedAt < 220
    const justReady = ready && !this.dashWasReady
    f.scaleX = p
    if (justReady) {                                   // the frame it comes back — a brief white pop + label flash
      f.setFillStyle(0xffffff, 1)
      this.dashGaugeLabel?.setColor('#ffffff')
      this.time.delayedCall(90, () => this.dashGaugeLabel?.setColor('#5eead4'))
    } else {
      f.setFillStyle(denied ? 0xf43f5e : ready ? 0x67e8f9 : 0xf59e0b, denied || ready ? 0.98 : 0.8)
      this.dashGaugeLabel?.setColor(denied ? '#fda4af' : ready ? '#5eead4' : '#a8a29e')
    }
    this.dashWasReady = ready
    this.dashTouchBtn?.setStrokeStyle(2, denied ? 0xf43f5e : ready ? 0x22d3ee : 0x475569, denied ? 1 : ready ? 0.9 : 0.5)
  }

  private createTouchControls() {
    this.touchUI = []
    // Enough simultaneous touches for move + aim + jump + fire at once.
    this.input.addPointer(4)
    const btn = (
      x: number, y: number, w: number, h: number, label: string, key: keyof TouchState,
      tint = 0x1e1b4b, rim = 0xa855f7, fs = '11px'
    ) => {
      const bg = this.add.rectangle(x, y, w, h, tint, 0.42).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(2, rim, 0.75)
      const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: fs, color: '#f5f3ff', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(151)
      const press = () => { this.touch[key] = true; bg.setFillStyle(rim, 0.55) }
      const release = () => { this.touch[key] = false; bg.setFillStyle(tint, 0.42) }
      bg.on('pointerdown', press)
      bg.on('pointerup', release)
      // Release only when the finger actually LIFTS (over or off the button) — not on mere drift.
      // pointerout used to drop held FIRE/JUMP/move the instant a thumb slid off; pointerupoutside
      // keeps the input held through the drift and releases on the real lift.
      bg.on('pointerupoutside', release)
      this.touchUI.push(bg, txt)
      return bg
    }
    // Left thumb — move (violet) + 8-way aim (cyan). Cross layout, bottom-left.
    btn(78, 268, 56, 38, '▲', 'up', 0x134e4a, 0x22d3ee)
    btn(44, 322, 56, 46, '◀', 'left')
    btn(112, 322, 56, 46, '▶', 'right')
    btn(78, 362, 56, 30, '▼', 'down', 0x134e4a, 0x22d3ee)
    // Right thumb — jump (green) + fire (red). Big targets, bottom-right.
    btn(452, 266, 96, 46, 'JUMP', 'jump', 0x14532d, 0x4ade80, '12px')
    btn(452, 338, 96, 66, 'FIRE', 'shoot', 0x4c0519, 0xf43f5e, '13px')
    // Pause + mute + swap, tucked in the gap between the thumb clusters.
    const tapBtn = (x: number, label: string, cb: () => void) => {
      const bg = this.add.rectangle(x, 361, 42, 26, 0x1e1b4b, 0.4).setScrollFactor(0).setDepth(150).setInteractive()
      bg.setStrokeStyle(1, 0xa855f7, 0.6)
      const txt = this.add.text(x, 361, label, { fontFamily: 'monospace', fontSize: '11px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(151)
      bg.on('pointerdown', cb)
      this.touchUI.push(bg, txt)
    }
    tapBtn(228, 'II', () => this.togglePause())
    tapBtn(284, '♪', () => this.toggleMute())
    tapBtn(340, '⇄', () => this.swapWeapon())
    // DASH — the in-canvas pad never had a dash control, so no-gutter touch players (e.g. iPad landscape)
    // were taught "Tap DASH to DODGE" for a button that didn't exist. Give the pad a real dash. (round-11 onboarding#1)
    this.dashTouchBtn = btn(356, 300, 82, 42, '» DASH', 'dash', 0x134e4a, 0x22d3ee, '12px')

    // Toggle to hide/show the on-screen controls. NOT persisted any more: a
    // remembered "off" used to strand players whose controller wasn't recognised.
    // Touch starts ON and self-manages via TV mode (hidden only while a gamepad is
    // actively present; restored on any genuine touch — see pollGamepadInput/create).
    const toggle = this.add.text(502, 38, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd',
      backgroundColor: '#0a0612', padding: { x: 6, y: 3 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(160).setInteractive({ useHandCursor: true })
    toggle.on('pointerdown', () => this.setTouchControlsHidden(!this.touchHidden))
    this.touchToggle = toggle
    this.applyTouchControls()
  }

  private setTouchControlsHidden(hidden: boolean) {
    if (this.touchHidden === hidden) return
    this.touchHidden = hidden
    // Drop any held inputs so nothing sticks when the pads vanish.
    if (hidden) this.touch = { left: false, right: false, jump: false, shoot: false, up: false, down: false, dash: false }
    this.applyTouchControls()
  }

  private applyTouchControls() {
    const vis = !this.touchHidden
    this.touchUI.forEach((o) => {
      const go = o as Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => void; input?: { enabled: boolean } | null }
      go.setVisible?.(vis)
      if (go.input) go.input.enabled = vis  // hidden pads must not swallow taps
    })
    this.touchToggle?.setText(this.touchHidden ? '⌨ Controls: OFF' : '⌨ Controls: ON')
    this.touchToggle?.setVisible(!this.gutterActive())   // irrelevant when DOM gutter controls drive

  }

  private controllerToast() {
    if (this.controllerSeen) return
    this.controllerSeen = true
    const t = this.add.text(256, 28, '🎮  CONTROLLER READY', {
      fontFamily: 'monospace', fontSize: '11px', color: '#67e8f9',
      backgroundColor: '#0a0612', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(245).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 1400, onComplete: () => t.destroy() })
  }

  // ---- Gamepad: remap persistence + arm-on-input + debug ---------------------

  private loadPadBinds() {
    this.padBinds = { ...PAD_BIND_DEFAULTS }
    try {
      const raw = localStorage.getItem('apex_binds')
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<PadBindAction, number>>
        for (const a of PAD_BIND_ORDER) {
          const v = saved[a]
          if (typeof v === 'number' && v >= 0 && v < 32) this.padBinds[a] = v
        }
      }
    } catch { /* ignore malformed / blocked storage */ }
  }

  private savePadBinds() {
    try { localStorage.setItem('apex_binds', JSON.stringify(this.padBinds)) } catch { /* ignore */ }
  }

  // Human label for a raw button index — names the standard-mapping buttons and
  // always shows the index, so an oddball clone stays unambiguous.
  private padButtonLabel(i: number): string {
    const names: Record<number, string> = {
      0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
      8: 'BACK', 9: 'START', 10: 'L3', 11: 'R3', 12: 'D-UP', 13: 'D-DOWN', 14: 'D-LEFT', 15: 'D-RIGHT', 16: 'GUIDE',
    }
    return names[i] ? `${names[i]} (${i})` : `BTN ${i}`
  }

  // Standalone Gamepad API read — do NOT rely on Phaser's gamepad manager, which
  // fails to initialise in some browsers/builds (that was the bug: "connected"
  // never armed and rebinding never captured a press). navigator.getGamepads()
  // works everywhere; the browser only surfaces a pad after its first button press.
  private readPad(): PadState | null {
    let pads: (Gamepad | null)[] = []
    try { pads = (navigator.getGamepads && navigator.getGamepads()) || [] } catch { return null }
    const live = pads.filter((p): p is Gamepad => !!(p && p.connected && p.buttons && p.buttons.length))
    if (!live.length) return null
    // MERGE every connected pad. Split controllers (e.g. Switch Joy-Cons) enumerate as
    // TWO gamepads — reading only the first meant a press on the other half did nothing.
    // Now a button/stick on ANY connected pad counts.
    const nb = Math.max(...live.map((p) => p.buttons.length))
    const na = Math.max(...live.map((p) => p.axes.length))
    const buttons = new Array(nb).fill(false)
    const axes = new Array(na).fill(0)
    for (const p of live) {
      for (let i = 0; i < p.buttons.length; i++) { const b = p.buttons[i]; if (b && (b.pressed || b.value > 0.5)) buttons[i] = true }
      for (let i = 0; i < p.axes.length; i++) { if (Math.abs(p.axes[i]) > Math.abs(axes[i])) axes[i] = p.axes[i] }
    }
    return { buttons, axes, id: (live.length > 1 ? `${live.length}× ` : '') + (live[0].id || '?') }
  }

  // True while the React DOM gutter controls are mounted (off-canvas buttons in use).
  private gutterActive(): boolean {
    return !!(window as unknown as { __APEX?: ApexBridge }).__APEX?.gutter
  }

  // Apex Rank insignia beside a handle on any board — 'Lv12' when that player has enlisted, '' otherwise.
  private prestigeTag(p?: number): string { return p && p > 0 ? '  ' + prestigeGlyph(p) + rankBadge(p) : '' }

  // Tell the React gutter which scene state we're in + whether DASH is live THIS run, so it can
  // render the action cluster only during play and the DASH slot only when the run actually has
  // dash (dashLevel>0 — a Daily zeroes it). Fixes: dead DASH in Daily, SWAP firing through
  // overlays, and buttons lingering over the death screen's tap-to-restart.
  private setBridge(state: string) {
    try {
      const w = window as unknown as { __APEX?: ApexBridge }
      w.__APEX = w.__APEX || { pad: {}, gutter: false, act: null }
      w.__APEX.state = state
      w.__APEX.dashActive = true   // dash is baseline now — the touch DASH button shows for everyone
      window.dispatchEvent(new CustomEvent('apex-state'))
    } catch { /* SSR / no window — ignore */ }
  }

  // World x → stereo pan (-1..1) around the camera's screen center (the Sfx side clamps to ±0.9),
  // so a threat's sound lands on the ear matching the side of the screen it's on — audio threat radar.
  private panAt(x: number): number {
    const cam = this.cameras?.main
    const mid = cam ? cam.midPoint.x : x
    return Math.max(-1, Math.min(1, (x - mid) / (WORLD_VIEW_W / 2)))
  }

  private anyPadButtonDown(buttons: boolean[]): boolean {
    for (let i = 0; i < buttons.length; i++) if (buttons[i]) return true
    return false
  }

  private firstPadButtonDown(buttons: boolean[]): number {
    for (let i = 0; i < buttons.length; i++) if (buttons[i]) return i
    return -1
  }

  // Runs every frame BEFORE the game gates: arms controller mode only once a
  // button or stick actually MOVES (never on presence, trap #3), and feeds gpdebug.
  private pollGamepadInput() {
    const pad = this.readPad()
    if (pad && !this.gamepadActive) {
      const moved = this.anyPadButtonDown(pad.buttons) ||
        Math.abs(pad.axes[0] || 0) > 0.4 || Math.abs(pad.axes[1] || 0) > 0.4
      if (moved) { this.gamepadActive = true; this.controllerToast() }
    }
    // Persistent "connected" chip once a pad has actually driven input.
    if (this.padIcon && this.gamepadActive && this.padIcon.text === '') this.padIcon.setText('🎮 PAD')
    if (this.gpDebug) this.updateGpDebug(pad)
    // TV mode: a present controller hides the on-screen pad; losing it brings the pad
    // back. Edge-detected so a restore-on-touch isn't instantly re-hidden. If iOS never
    // exposes the pad (e.g. an unsupported controller), padNow stays false and touch
    // controls remain — so the player is never stranded.
    const padNow = !!pad
    if (this.sys.game.device.input.touch) {
      if (padNow && !this.padPresentPrev) this.setTouchControlsHidden(true)
      else if (!padNow && this.padPresentPrev) this.setTouchControlsHidden(false)
      // DOM gutter controls replace the in-canvas pad entirely.
      if (this.gutterActive() && !this.touchHidden) this.setTouchControlsHidden(true)
    }
    this.padPresentPrev = padNow
  }

  private updateGpDebug(pad: PadState | null) {
    if (!this.gpDebugText) {
      this.gpDebugText = this.add.text(6, 96, '', {
        fontFamily: 'monospace', fontSize: '9px', color: '#86efac',
        backgroundColor: '#0a0612', padding: { x: 4, y: 3 },
      }).setScrollFactor(0).setDepth(260)
    }
    if (!pad) { this.gpDebugText.setText('gpdebug: no pad — press a button on your controller'); return }
    const btns: number[] = []
    for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i]) btns.push(i)
    const b = this.padBinds
    const mark = (i: number) => `${i}${pad.buttons[i] ? '●' : ''}`   // ● = that bound button is pressed right now
    const ax = pad.axes.map((v, i) => `${i}:${v.toFixed(2)}`).join(' ')
    this.gpDebugText.setText(`gpdebug ${pad.id.slice(0, 22)}\npressed:[${btns.join(',')}]\nfire ${mark(b.fire)}  jump ${mark(b.jump)}  swap ${mark(b.swap)}  pause ${mark(b.pause)}\naxes ${ax}`)
  }

  // ---- Controls / rebind overlay --------------------------------------------

  private openControls() {
    if (this.controlsOpen) return
    this.controlsOpen = true
    this.rebinding = null
    this.rebindArmed = false
    this.buildControlsScreen()
    this.input.keyboard!.on('keydown-ESC', this.closeControlsKey)   // Esc closes / cancels
  }

  private closeControls() {
    if (!this.controlsOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeControlsKey)
    this.controlsUI.forEach((o) => o.destroy())
    this.controlsUI = []
    this.rebindHint = undefined
    this.controlsOpen = false
    this.rebinding = null
    this.rebindArmed = false
    this.startGraceUntil = this.time.now + 400   // so the closing tap/press can't skip the title
  }

  private buildControlsScreen() {
    this.controlsUI.forEach((o) => o.destroy())
    this.controlsUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.controlsUI.push(o); return o }

    // Backdrop — interactive so nothing behind it (title / pause menu) receives taps.
    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.93).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 22, 'CONTROLS', { fontFamily: 'monospace', fontSize: '18px', color: '#e879f9', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))

    // Keyboard column
    const kb = [
      'KEYBOARD',
      'Move       A / D  ·  ← / →',
      'Jump       W / ↑  (double)',
      'Aim        ↑ / ↓  (8-way)',
      'Crouch     hold ↓ / S',
      'Fire       SPACE (hold)',
      'Swap gun   Q',
      'Dash       SHIFT  (Armory)',
      'Pause      P / Esc',
      'Mute       M',
    ]
    push(this.add.text(22, 50, kb.join('\n'), { fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd', lineSpacing: 5 }).setScrollFactor(0).setDepth(251))

    // Gamepad column
    push(this.add.text(276, 50, 'GAMEPAD', { fontFamily: 'monospace', fontSize: '10px', color: '#67e8f9' }).setScrollFactor(0).setDepth(251))
    push(this.add.text(276, 66, 'Move / Aim   D-pad / Left stick', { fontFamily: 'monospace', fontSize: '9px', color: '#c4b5fd' }).setScrollFactor(0).setDepth(251))

    // Rebindable action rows — tap the value box, then press a pad button.
    const rowY = 88
    PAD_BIND_ORDER.forEach((action, idx) => {
      const y = rowY + idx * 24
      push(this.add.text(276, y, PAD_BIND_LABEL[action], { fontFamily: 'monospace', fontSize: '10px', color: '#e9d5ff' }).setScrollFactor(0).setDepth(251))
      const val = push(this.add.text(400, y - 2, this.padButtonLabel(this.padBinds[action]), {
        fontFamily: 'monospace', fontSize: '10px', color: '#fbbf24',
        backgroundColor: '#1e1b4b', padding: { x: 6, y: 3 },
      }).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      val.on('pointerover', () => { if (this.rebinding !== action) val.setColor('#fde68a') })
      val.on('pointerout', () => { if (this.rebinding !== action) val.setColor('#fbbf24') })
      val.on('pointerdown', () => this.beginRebind(action, val))
    })

    this.rebindHint = push(this.add.text(276, rowY + PAD_BIND_ORDER.length * 24 + 4, 'Tap a button box, then press a pad button to bind it.', {
      fontFamily: 'monospace', fontSize: '8px', color: '#71717a', wordWrap: { width: 216 },
    }).setScrollFactor(0).setDepth(251))

    const reset = push(this.add.text(276, 296, '[ RESET DEFAULTS ]', { fontFamily: 'monospace', fontSize: '9px', color: '#a5b4fc' }).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    reset.on('pointerdown', () => { this.padBinds = { ...PAD_BIND_DEFAULTS }; this.savePadBinds(); this.rebinding = null; this.buildControlsScreen() })

    if (this.sys.game.device.input.touch) {
      push(this.add.text(22, 296, 'TOUCH  on-screen pad ( ⌨ toggles )', { fontFamily: 'monospace', fontSize: '9px', color: '#71717a' }).setScrollFactor(0).setDepth(251))
    }

    const back = push(this.add.text(256, 344, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    back.on('pointerdown', () => this.closeControls())
  }

  // ---- Apex Armory — spend banked shards on permanent upgrades (between-run shop) ----
  private openArmory() {
    if (this.armoryOpen || this.controlsOpen) return
    this.armoryOpen = true
    this.buildArmoryScreen()
    this.input.keyboard!.on('keydown-ESC', this.closeArmoryKey)
  }

  private closeArmory() {
    if (!this.armoryOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeArmoryKey)
    this.armoryUI.forEach((o) => o.destroy())
    this.armoryUI = []
    this.armoryOpen = false
    this.startGraceUntil = this.time.now + 400   // the closing tap/press can't also start play
  }

  private buildArmoryScreen() {
    this.armoryUI.forEach((o) => o.destroy())
    this.armoryUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.armoryUI.push(o); return o }
    const meta = loadMeta()

    // Backdrop — interactive so nothing behind it (title) receives taps.
    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 22, 'APEX ARMORY', { fontFamily: 'monospace', fontSize: '18px', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    push(this.add.text(256, 40, 'permanent upgrades · bought with Apex Shards', { fontFamily: 'monospace', fontSize: '8px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    push(this.add.text(256, 62, '◆ ' + meta.shards, { fontFamily: 'monospace', fontSize: '16px', color: '#67e8f9', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))

    UPGRADES.forEach((def, i) => {
      const y = 88 + i * 50
      const tier = meta.up[def.key]
      const cost = nextCost(def.key, tier)
      push(this.add.text(34, y - 8, def.glyph + '  ' + def.name, { fontFamily: 'monospace', fontSize: '12px', color: def.hex, fontStyle: 'bold' }).setScrollFactor(0).setDepth(251))
      push(this.add.text(36, y + 9, def.blurb, { fontFamily: 'monospace', fontSize: '8px', color: '#a1a1aa' }).setScrollFactor(0).setDepth(251))
      let pips = ''
      for (let t = 0; t < def.max; t++) pips += t < tier ? '●' : '○'
      push(this.add.text(306, y, pips, { fontFamily: 'monospace', fontSize: '13px', color: def.hex }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
      if (cost == null) {
        push(this.add.text(470, y, 'MAXED', { fontFamily: 'monospace', fontSize: '11px', color: '#86efac', fontStyle: 'bold' }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(251))
      } else if (meta.shards >= cost) {
        const buy = push(this.add.text(470, y, 'BUY ◆' + cost, {
          fontFamily: 'monospace', fontSize: '11px', color: '#0a0612', fontStyle: 'bold',
          backgroundColor: def.hex, padding: { x: 8, y: 5 },
        }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
        buy.on('pointerover', () => buy.setAlpha(0.85))
        buy.on('pointerout', () => buy.setAlpha(1))
        buy.on('pointerdown', () => {
          buyUpgrade(def.key); this.sfx?.pickup(); this.buildArmoryScreen()
          try { window.dispatchEvent(new Event('apex-armory-changed')) } catch { /* SSR/none */ }   // let the on-screen DASH button unlock live
        })
      } else {
        push(this.add.text(470, y, '◆' + cost, { fontFamily: 'monospace', fontSize: '11px', color: '#52525b', padding: { x: 8, y: 5 } }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(251))
      }
    })

    // Maxed the Armory? Shards still matter — enlist them into APEX RANK (uncapped prestige ladder).
    const rk = currentRank()
    const rline = push(this.add.text(256, 320, '◆ APEX RANK ' + rk + ' · ' + rankTitle(rk) + '   —   ENLIST ▸', { fontFamily: 'monospace', fontSize: '10px', color: '#a5b4fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    rline.on('pointerover', () => rline.setColor('#c4b5fd'))
    rline.on('pointerout', () => rline.setColor('#a5b4fc'))
    rline.on('pointerdown', () => { this.closeArmory(); this.openRank() })
    push(this.add.text(256, 336, 'shards bank automatically in a run · spend on power above or prestige here', { fontFamily: 'monospace', fontSize: '7px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    const back = push(this.add.text(256, 358, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    back.on('pointerdown', () => this.closeArmory())
  }

  // ---- Leaderboard — our own global board (server-backed; graceful when offline) ----
  private openLeaderboard() {
    if (this.leaderboardOpen || this.controlsOpen || this.armoryOpen) return
    this.leaderboardOpen = true
    this.lbTab = 0; this.lbScore = null; this.lbSeason = null; this.lbSpeed = null; this.lbPadPrev = 0
    this.buildLeaderboardScreen()                                       // loading state
    this.input.keyboard!.on('keydown-ESC', this.closeLeaderboardKey)
    this.input.keyboard!.on('keydown', this.lbKeyHandler)
    fetchLeaderboard().then((d) => { this.lbScore = d; if (this.leaderboardOpen && this.lbTab === 0) this.buildLeaderboardScreen() })
  }

  private closeLeaderboard() {
    if (!this.leaderboardOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeLeaderboardKey)
    this.input.keyboard!.off('keydown', this.lbKeyHandler)
    this.leaderboardUI.forEach((o) => o.destroy())
    this.leaderboardUI = []
    this.leaderboardOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private setLbTab(t: number) {
    this.lbTab = ((t % 3) + 3) % 3
    this.buildLeaderboardScreen()
    this.sfx?.swap()
    if (this.lbTab === 0 && !this.lbScore) fetchLeaderboard().then((d) => { this.lbScore = d; if (this.leaderboardOpen && this.lbTab === 0) this.buildLeaderboardScreen() })
    if (this.lbTab === 1 && !this.lbSeason) fetchSeason(monthKey()).then((d) => { this.lbSeason = d; if (this.leaderboardOpen && this.lbTab === 1) this.buildLeaderboardScreen() })
    if (this.lbTab === 2 && !this.lbSpeed) fetchSpeedruns().then((d) => { this.lbSpeed = d; if (this.leaderboardOpen && this.lbTab === 2) this.buildLeaderboardScreen() })
  }

  private buildLeaderboardScreen() {
    this.leaderboardUI.forEach((o) => o.destroy())
    this.leaderboardUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.leaderboardUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const mine = myWallet()
    const short = (w: string) => w.slice(0, 6) + '…' + w.slice(-4)

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 20, 'LEADERBOARD', { fontFamily: 'monospace', fontSize: '18px', color: '#67e8f9', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    const back = () => {
      const b = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      b.on('pointerdown', () => this.closeLeaderboard())
    }
    // Tabs (click / ◄ ► / d-pad): SCORE = all-time high scores · SEASON = this month's race · SPEED = fastest clears.
    const tabs = ['SCORE', 'SEASON', 'SPEED']
    const tx = [150, 256, 362]
    tabs.forEach((name, i) => {
      const on = i === this.lbTab
      const tab = push(this.add.text(tx[i], 42, name, { fontFamily: 'monospace', fontSize: '11px', color: on ? '#a5f3fc' : '#52525b', fontStyle: on ? 'bold' : 'normal' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      tab.on('pointerdown', () => this.setLbTab(i))
      if (on) push(this.add.rectangle(tx[i], 53, name.length * 8 + 8, 2, 0x67e8f9, 0.9).setScrollFactor(0).setDepth(251))
    })

    if (this.lbTab === 0) {
      // ---- SCORE board ----
      const data = this.lbScore
      if (!data) { T(256, 188, 'loading…', 12, '#a5b4fc', 0.5); back(); return }
      if (!data.online) { T(256, 176, 'The global board is warming up.', 11, '#c4b5fd', 0.5); T(256, 196, "Scores will post here once it's live.", 9, '#71717a', 0.5); back(); return }
      T(30, 66, 'RANK', 8, '#52525b'); T(78, 66, 'PLAYER', 8, '#52525b'); T(372, 66, 'SCORE', 8, '#52525b', 1); T(474, 66, 'SECTOR', 8, '#52525b', 1)
      if (data.top.length === 0) T(256, 160, 'No runs yet — be the first.', 11, '#a5b4fc', 0.5)
      data.top.forEach((r, i) => {
        const y = 82 + i * 20
        const you = !!mine && r.wallet.toLowerCase() === mine
        const c = you ? '#fde68a' : '#e9d5ff'
        T(34, y, '#' + (i + 1), 11, i < 3 ? '#67e8f9' : '#a1a1aa')
        T(78, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 11, c)
        T(372, y, String(r.score), 11, c, 1)
        T(474, y, 'S' + r.sector, 11, c, 1)
      })
      if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
        T(256, 292, `YOU  ·  #${data.you.rank}  ·  ${data.you.score}  ·  S${data.you.sector}${this.prestigeTag(currentRank())}`, 11, '#fde68a', 0.5)
        if (data.next) { const who = (data.next.handle || 'the rank above').slice(0, 14); T(256, 308, `▲  ${Math.max(1, data.next.score - data.you.score).toLocaleString()} to pass ${who}`, 9, '#fbbf24', 0.5) }
      }
      if (hasWallet()) {
        const set = push(this.add.text(256, 326, localHandle() ? '[ CHANGE NAME ]' : '[ SET NAME ]', { fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
        set.on('pointerdown', () => {
          const input = typeof window !== 'undefined' ? window.prompt('Leaderboard name (max 16):', localHandle()) : null
          if (input != null) setHandle(input).then(() => fetchLeaderboard().then((d) => { this.lbScore = d; if (this.leaderboardOpen && this.lbTab === 0) this.buildLeaderboardScreen() }))
        })
      } else { T(256, 326, 'connect your Apex wallet to post a score', 9, '#52525b', 0.5) }
    } else if (this.lbTab === 1) {
      // ---- SEASON board: this calendar month's campaign-score race (resets monthly; same metric as SCORE) ----
      const data = this.lbSeason
      const MON = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
      const label = data ? (MON[Number(data.month.slice(5, 7))] || '') + ' ' + data.month.slice(0, 4) : ''
      T(256, 300, (label ? label + '  ·  ' : '') + 'resets monthly — the all-time SCORE board keeps every record', 8, '#52525b', 0.5)
      if (!data) { T(256, 188, 'loading…', 12, '#a5b4fc', 0.5); back(); return }
      if (!data.online) { T(256, 186, 'The season board is warming up.', 11, '#c4b5fd', 0.5); back(); return }
      T(30, 66, 'RANK', 8, '#52525b'); T(78, 66, 'PLAYER', 8, '#52525b'); T(372, 66, 'SCORE', 8, '#52525b', 1); T(474, 66, 'SECTOR', 8, '#52525b', 1)
      if (data.top.length === 0) T(256, 160, 'No runs this month — claim the top slot.', 11, '#a5b4fc', 0.5)
      data.top.forEach((r, i) => {
        const y = 82 + i * 20
        const you = !!mine && r.wallet.toLowerCase() === mine
        const c = you ? '#fde68a' : '#e9d5ff'
        T(34, y, '#' + (i + 1), 11, i < 3 ? '#67e8f9' : '#a1a1aa')
        T(78, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 11, c)
        T(372, y, String(r.score), 11, c, 1)
        T(474, y, 'S' + r.sector, 11, c, 1)
      })
      if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
        T(256, 292, `YOU  ·  #${data.you.rank}  ·  ${data.you.score}  ·  S${data.you.sector}${this.prestigeTag(currentRank())}`, 11, '#fde68a', 0.5)
        if (data.next) { const who = (data.next.handle || 'the rank above').slice(0, 14); T(256, 308, `▲  ${Math.max(1, data.next.score - data.you.score).toLocaleString()} to pass ${who}`, 9, '#fbbf24', 0.5) }
      }
    } else {
      // ---- SPEED board: fastest full-campaign clears (ranked ascending by time) ----
      const data = this.lbSpeed
      T(256, 300, 'fastest full-campaign clears', 8, '#52525b', 0.5)
      if (!data) { T(256, 188, 'loading…', 12, '#a5b4fc', 0.5); back(); return }
      if (!data.online) { T(256, 186, 'The speed board is warming up.', 11, '#c4b5fd', 0.5); back(); return }
      T(30, 66, 'RANK', 8, '#52525b'); T(78, 66, 'PLAYER', 8, '#52525b'); T(430, 66, 'TIME', 8, '#52525b', 1)
      if (data.top.length === 0) T(256, 160, 'No clears yet — set the record.', 11, '#a5b4fc', 0.5)
      data.top.forEach((r, i) => {
        const y = 82 + i * 20
        const you = !!mine && r.wallet.toLowerCase() === mine
        const c = you ? '#fde68a' : '#e9d5ff'
        T(34, y, '#' + (i + 1), 11, i < 3 ? '#67e8f9' : '#a1a1aa')
        T(78, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 11, c)
        T(430, y, fmtTime(r.ms), 11, c, 1)
      })
      if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
        T(256, 268, `YOU  ·  #${data.you.rank}  ·  ${fmtTime(data.you.ms)}${this.prestigeTag(currentRank())}`, 11, '#fde68a', 0.5)
        if (data.next) T(256, 284, `▲  ${((data.you.ms - data.next.ms) / 1000).toFixed(1)}s faster to pass ${(data.next.handle || 'the ghost above').slice(0, 14)}`, 9, '#fbbf24', 0.5)
      }
    }
    back()
  }

  // ---- Badge Case — the achievement grid (per-device, localStorage) ----
  private openBadges() {
    if (this.badgesOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.loadoutOpen || this.rankOpen) return
    this.badgesOpen = true
    this.buildBadgesScreen()
    this.closeBadgesKey = () => this.closeBadges()
    this.input.keyboard!.on('keydown-ESC', this.closeBadgesKey)
  }

  private closeBadges() {
    if (!this.badgesOpen) return
    if (this.closeBadgesKey) { this.input.keyboard!.off('keydown-ESC', this.closeBadgesKey); this.closeBadgesKey = undefined }
    this.badgesUI.forEach((o) => o.destroy())
    this.badgesUI = []
    this.badgesOpen = false
    this.startGraceUntil = this.time.now + 400   // the closing tap/press can't also start play
  }

  private buildBadgesScreen() {
    this.badgesUI.forEach((o) => o.destroy()); this.badgesUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.badgesUI.push(o); return o }
    const st = loadAch()
    const owned = new Set(st.unlocked)
    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 18, 'BADGE CASE', { fontFamily: 'monospace', fontSize: '18px', color: '#c084fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    push(this.add.text(256, 39, st.unlocked.length + ' / ' + ACHIEVEMENTS.length + ' earned', { fontFamily: 'monospace', fontSize: '9px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    // Two columns of badge rows — earned in full colour, locked dimmed with the requirement shown.
    ACHIEVEMENTS.forEach((a, i) => {
      const x = (i % 2) === 0 ? 22 : 266
      const y = 58 + Math.floor(i / 2) * 40
      const has = owned.has(a.id)
      push(this.add.text(x + 12, y + 13, a.glyph, { fontFamily: 'monospace', fontSize: '20px', color: has ? a.hex : '#6b7280' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setAlpha(has ? 1 : 0.4))
      push(this.add.text(x + 32, y + 3, a.name, { fontFamily: 'monospace', fontSize: '10px', color: has ? a.hex : '#9ca3af', fontStyle: 'bold' }).setScrollFactor(0).setDepth(251).setAlpha(has ? 1 : 0.55))
      push(this.add.text(x + 32, y + 18, a.desc, { fontFamily: 'monospace', fontSize: '7px', color: has ? '#71717a' : '#52525b' }).setScrollFactor(0).setDepth(251).setAlpha(has ? 1 : 0.55))
    })
    const back = push(this.add.text(256, 366, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    back.on('pointerdown', () => this.closeBadges())
  }

  // ---- Daily Challenge — a rotating modifier + its own daily board (pure skill; Armory ignored) ----
  private openDaily() {
    if (this.dailyOpen || this.trialsOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen) return
    this.dailyOpen = true
    this.buildDailyScreen(null)
    this.input.keyboard!.on('keydown-ESC', this.closeDailyKey)
    fetchDaily(todayKey()).then((d) => { if (this.dailyOpen) this.buildDailyScreen(d) })
  }

  private closeDaily() {
    if (!this.dailyOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeDailyKey)
    this.dailyUI.forEach((o) => o.destroy())
    this.dailyUI = []
    this.dailyOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private startDaily(mod: DailyMod) {
    if (this.started) return
    // tear the screen down WITHOUT the start-grace closeDaily sets, then launch immediately
    this.input.keyboard!.off('keydown-ESC', this.closeDailyKey)
    this.dailyUI.forEach((o) => o.destroy())
    this.dailyUI = []
    this.dailyOpen = false
    // the day's modifier defines the START stats (base, not Armory — everyone equal)
    this.dailyRun = true
    this.dailyDay = todayKey()               // anchor the board to the day the run STARTED, not when it ends
    this.maxHealth = mod.maxHealth ?? 6
    this.lives = mod.lives ?? 3
    this.fireBonus = mod.fireBonus ?? 0
    this.maxJumps = MAX_JUMPS + (mod.bonusJumps ?? 0)
    this.dashLevel = 0; this.dashCd = 820   // daily = base kit (Armory off), but baseline dash for everyone
    this.weapon = (mod.weapon ?? 'normal') as typeof this.weapon
    this.altWeapon = this.weapon
    this.health = this.maxHealth
    this.jumpsLeft = this.maxJumps
    this.updateHealth()
    this.livesText.setText('LIVES  ' + this.lives)
    this.weaponText.setText('GUN  ' + this.weapon.toUpperCase())
    this.startGraceUntil = 0
    this.beginPlay()
    this.screenToast('DAILY · ' + mod.name, mod.hex, 118)
  }

  // ---- APEX TRIALS — a weekly boss rush over all 7 bosses in one arena (local best) ----
  // Launched straight from the title (no separate screen): rebuild to the arena, start play with
  // the player's Armory kit, and spawn the week's first boss. Each boss falls → heal + the next.
  private startTrials() {
    if (this.started) return
    if (this.startKeyHandler) { this.input.keyboard!.off('keydown', this.startKeyHandler); this.startKeyHandler = undefined }
    this.titleUI.forEach((o) => o.destroy()); this.titleUI = []
    this.titleNav = []; this.titleRing = undefined; this.titleNavActive = false
    this.rushRun = true
    this.rushIndex = 0
    this.rushOrder = bossOrderForWeek(weekKey())
    this.dailyRun = false
    this.level = 1
    this.buildLevel(1)   // levels() now returns the RUSH arena
    const d = this.levels()[0]
    this.player.setPosition(d.spawn[0], d.spawn[1]); this.player.setVelocity(0, 0)
    this.lastGroundX = d.spawn[0]; this.lastGroundY = d.spawn[1]
    this.applyArmory()   // Trials fights with your Armory kit — pick up any upgrade bought on the title
    this.updateHealth(); this.livesText.setText('LIVES  ' + this.lives)
    this.levelText.setText('TRIALS')
    this.startGraceUntil = 0
    this.started = true
    this.sfx?.resume(); this.sfx?.startMusic('throne')
    this.physics.resume()
    this.setBridge('playing')
    this.screenToast('⚔ APEX TRIALS · ' + this.rushOrder.length + ' BOSSES', '#fbbf24', 130)
    this.time.delayedCall(650, () => { if (this.rushRun && this.started && !this.gameOver) this.spawnTrialsBoss() })
  }

  private spawnTrialsBoss() {
    const kind = this.rushOrder[this.rushIndex] || 'sentinel'
    const info = BOSS_RUSH[kind] || { label: 'APEX SENTINEL', hp: 50, speed: 60 }
    this.nextBossKind = kind
    this.nextBossLabel = info.label
    this.bossPhase = 1
    this.spawnEnemy('boss', 1400, 330, info.hp + this.rushIndex * 6, info.speed)   // HP ramps each boss
    this.screenToast('⚠ ' + (this.rushIndex + 1) + '/' + this.rushOrder.length + '  ·  ' + info.label, '#f43f5e', 110)
    this.levelTransition = false   // next boss is live — the between-boss transition is over
  }

  // A rush boss fell: heal to full, breather, drop the next — or clear the trials on the last.
  private advanceTrials() {
    if (this.levelTransition) return   // now LIVE: set below so a double clear in one frame can't double-advance rushIndex
    this.levelTransition = true
    this.rushIndex++
    if (this.rushIndex >= this.rushOrder.length) { this.trialsComplete(); return }
    this.health = this.maxHealth; this.updateHealth()
    this.sfx?.fanfare()
    this.screenToast('BOSS ' + this.rushIndex + '/' + this.rushOrder.length + ' DOWN  ·  HEAL + NEXT', '#4ade80', 120)
    this.time.delayedCall(1200, () => { if (this.rushRun && this.started && !this.gameOver) this.spawnTrialsBoss() })
  }

  private trialsComplete() {
    this.screenToast('★  TRIALS CLEARED  ★', '#fbbf24', 150)
    // Weekly shard payout for clearing the 7-boss gauntlet — once per ISO week (stamped like the daily
    // deployment bonus), so the endgame feeds the shard economy (Armory / Rank) instead of paying
    // nothing beyond incidental bounty/contract credit.
    const wk = weekKey()
    let paid = ''
    try { paid = localStorage.getItem('apex_trials_paid') || '' } catch { /* storage blocked */ }
    if (paid !== wk) {
      try { localStorage.setItem('apex_trials_paid', wk) } catch { /* storage blocked */ }
      bankShards(24)
      this.time.delayedCall(900, () => { if (this.gameOver) this.screenToast('◆ TRIALS WEEKLY PAYOUT  +24', '#67e8f9', 186) })
    }
    this.showVictory()
  }

  private buildDailyScreen(data: DailyData | null) {
    this.dailyUI.forEach((o) => o.destroy())
    this.dailyUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.dailyUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const mod = todayMod()
    const ds = getDailyStreak()
    const dk = todayKey()

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 18, 'DAILY CHALLENGE', { fontFamily: 'monospace', fontSize: '18px', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 37, "today's run · resets 00:00 UTC · Armory off" + (ds.streak > 0 ? '  ·  ★ ' + ds.streak + '-day streak' : ''), 8, '#71717a', 0.5)
    push(this.add.text(256, 52, mod.name, { fontFamily: 'monospace', fontSize: '15px', color: mod.hex, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 71, mod.blurb, 9, '#c4b5fd', 0.5)
    const play = push(this.add.text(256, 96, '▶  PLAY DAILY', { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#fbbf24', padding: { x: 14, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    play.on('pointerover', () => play.setAlpha(0.85)); play.on('pointerout', () => play.setAlpha(1))
    play.on('pointerdown', () => this.startDaily(mod))

    const back = () => {
      const b = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      b.on('pointerdown', () => this.closeDaily())
    }

    // Daily bounties — three shard-paying objectives (any run counts), the same for everyone today.
    const doneN = bountyDoneCount(dk)
    T(256, 120, '— DAILY BOUNTIES  ' + doneN + '/3 —', 9, '#52525b', 0.5)
    const doneSet = new Set(loadBountyState(dk).done)
    todayBounties(dk).forEach((b, i) => {
      const y = 134 + i * 15
      const ok = doneSet.has(b.id)
      T(150, y, (ok ? '✓ ' : '◦ ') + b.label, 9, ok ? '#4ade80' : '#c4b5fd')
      T(384, y, '+' + b.reward + '◈', 9, ok ? '#4ade80' : '#71717a', 1)
    })

    T(256, 186, "— TODAY'S BOARD —", 9, '#52525b', 0.5)
    if (!data) { T(256, 212, 'loading…', 11, '#a5b4fc', 0.5); back(); return }
    if (!data.online) { T(256, 216, 'board offline', 10, '#71717a', 0.5); back(); return }
    const mine = myWallet()
    const short = (w: string) => w.slice(0, 6) + '…' + w.slice(-4)
    if (data.top.length === 0) T(256, 220, 'No runs yet today — set the pace.', 10, '#a5b4fc', 0.5)
    data.top.slice(0, 6).forEach((r, i) => {
      const y = 204 + i * 17
      const you = !!mine && r.wallet.toLowerCase() === mine
      const c = you ? '#fde68a' : '#e9d5ff'
      T(122, y, '#' + (i + 1), 10, i < 3 ? '#67e8f9' : '#a1a1aa')
      T(160, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 10, c)
      T(392, y, String(r.score), 10, c, 1)
    })
    if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
      T(256, 312, `YOU  ·  #${data.you.rank}  ·  ${data.you.score}${this.prestigeTag(currentRank())}`, 10, '#fde68a', 0.5)
    }
    back()
  }

  // ---- Weekly APEX TRIALS board screen (clones the Daily screen; scoped by ISO week) ----
  private openTrials() {
    if (this.trialsOpen || this.dailyOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen) return
    this.trialsOpen = true
    this.buildTrialsScreen(null)
    this.input.keyboard!.on('keydown-ESC', this.closeTrialsKey)
    fetchTrials(weekKey()).then((d) => { if (this.trialsOpen) this.buildTrialsScreen(d) })
  }

  private closeTrials() {
    if (!this.trialsOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeTrialsKey)
    this.trialsUI.forEach((o) => o.destroy())
    this.trialsUI = []
    this.trialsOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private buildTrialsScreen(data: TrialsData | null) {
    this.trialsUI.forEach((o) => o.destroy())
    this.trialsUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.trialsUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const wk = weekKey()
    const best = loadTrialsBest()

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 18, 'APEX TRIALS', { fontFamily: 'monospace', fontSize: '18px', color: '#fca5a5', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 36, wk + '  ·  resets Monday 00:00 UTC  ·  Armory ON', 8, '#71717a', 0.5)
    push(this.add.text(256, 54, '⚔  7-BOSS GAUNTLET', { fontFamily: 'monospace', fontSize: '13px', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    const play = push(this.add.text(256, 80, '▶  PLAY TRIALS', { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#fca5a5', padding: { x: 14, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    play.on('pointerover', () => play.setAlpha(0.85)); play.on('pointerout', () => play.setAlpha(1))
    play.on('pointerdown', () => {
      this.input.keyboard!.off('keydown-ESC', this.closeTrialsKey)
      this.trialsUI.forEach((o) => o.destroy()); this.trialsUI = []
      this.trialsOpen = false
      this.startTrials()
    })
    if (best > 0) T(256, 102, 'local best  ' + best.toLocaleString(), 8, '#67e8f9', 0.5)

    const back = () => {
      const b = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      b.on('pointerdown', () => this.closeTrials())
    }

    // Weekly contracts — cumulative goals that fill across the week and pay shards (+ a capstone).
    const cp = contractProgress(wk)
    T(256, 120, '— WEEKLY CONTRACTS  ' + cp.done + '/' + cp.total + ' —', 9, '#52525b', 0.5)
    cp.list.forEach((it, i) => {
      const y = 134 + i * 14
      T(56, y, (it.done ? '✓ ' : '◦ ') + it.c.label, 8, it.done ? '#4ade80' : '#c4b5fd')
      T(404, y, it.have + '/' + it.c.need + '  +' + it.c.reward + '◈', 8, it.done ? '#4ade80' : '#71717a', 1)
    })

    T(256, 196, "— THIS WEEK'S BOARD —", 9, '#52525b', 0.5)
    if (!data) { T(256, 222, 'loading…', 11, '#a5b4fc', 0.5); back(); return }
    if (!data.online) { T(256, 226, 'board offline', 10, '#71717a', 0.5); back(); return }
    const mine = myWallet()
    const short = (w: string) => w.slice(0, 6) + '…' + w.slice(-4)
    if (data.top.length === 0) T(256, 230, 'No runs yet this week — set the pace.', 10, '#a5b4fc', 0.5)
    data.top.slice(0, 4).forEach((r, i) => {
      const y = 214 + i * 18
      const you = !!mine && r.wallet.toLowerCase() === mine
      const c = you ? '#fde68a' : '#e9d5ff'
      T(120, y, '#' + (i + 1), 10, i < 3 ? '#67e8f9' : '#a1a1aa')
      T(156, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 10, c)
      T(338, y, r.sector + '/7', 9, you ? '#fde68a' : '#9ca3af', 1)   // bosses cleared that run
      T(392, y, String(r.score), 10, c, 1)
    })
    if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
      T(256, 300, `YOU  ·  #${data.you.rank}  ·  ${data.you.sector}/7  ·  ${data.you.score}${this.prestigeTag(currentRank())}`, 10, '#fde68a', 0.5)
    }
    back()
  }

  // ---- INTEL codex — an in-game encyclopedia of weapons, foes, and bosses (bug: nowhere to learn
  // what anything does). Three tabs, switchable by click / ◄► / d-pad; read-only, so no per-row focus.
  private openIntel() {
    if (this.intelOpen || this.dailyOpen || this.trialsOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.badgesOpen) return
    this.intelOpen = true
    this.intelTab = 0
    this.intelPadPrev = 0
    this.buildIntelScreen()
    this.input.keyboard!.on('keydown-ESC', this.closeIntelKey)
    this.input.keyboard!.on('keydown', this.intelKeyHandler)
  }

  private closeIntel() {
    if (!this.intelOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeIntelKey)
    this.input.keyboard!.off('keydown', this.intelKeyHandler)
    this.intelUI.forEach((o) => o.destroy())
    this.intelUI = []
    this.intelOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private setIntelTab(t: number) {
    this.intelTab = ((t % 3) + 3) % 3
    this.buildIntelScreen()
    this.sfx?.swap()
  }

  private buildIntelScreen() {
    this.intelUI.forEach((o) => o.destroy())
    this.intelUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.intelUI.push(o); return o }
    const hx = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0')
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))

    const WEAPONS: [string, number, string][] = [
      ['PULSE MG', 0xffffff, 'Your sidearm — steady single bolts.'],
      ['SPREAD', 0x22d3ee, 'Five-way volley; melts crowds up close.'],
      ['RAPID', 0xfbbf24, 'High fire-rate; light, quick hits.'],
      ['LASER', 0xe879f9, 'Piercing beam — punches a line, leaves a scar.'],
      ['FIRE', 0xfb923c, 'Burning rounds — ignite a damage-over-time.'],
      ['ARC', 0x84cc16, 'Lobbed bomb; area blast on impact.'],
    ]
    const FOES: [string, number, string][] = [
      ['SOLDIER', 0xf43f5e, 'Grunt — marches and takes potshots.'],
      ['FLYER', 0xa855f7, 'Hovers and strafes; leads its shots.'],
      ['CHARGER', 0xff7a3c, 'Rushes on sight — sidestep the charge.'],
      ['DIVER', 0xff4d6d, 'Swoops in from above in an arc.'],
      ['TANK', 0xfb923c, 'Heavy armor, slow — soaks a lot of damage.'],
      ['SNIPER', 0x93c5fd, 'Long-range aimed shot with a telegraph.'],
      ['SHIELDER', 0x94a3b8, 'Frontal shield — hit from above or behind.'],
      ['TURRET', 0xfca5a5, 'Fixed emplacement, relentless fire.'],
      ['SAPPER', 0xf97316, 'Marks the ground, then mortars it — step off.'],
      ['SPLITTER', 0xc084fc, 'Splits into two grunts when destroyed.'],
    ]
    const BOSS_BLURB: Record<string, string> = {
      reaper: 'Blink-dashes and rains aimed bursts.',
      brute: 'Slam bruiser — brutal at close range.',
      tyrant: 'Summons adds and dive-bombs you.',
      warden: 'Lays mines and radial ring curtains.',
      sentinel: 'Fans and novas — bullet-hell zoning.',
      wraith: 'Homing seeker bolts; dashes and sweeps.',
      revenant: 'Spirals and lances — the final trial.',
    }
    const BOSSES: [string, number, string][] = Object.keys(BOSS_RUSH).map((k) => [BOSS_RUSH[k].label, bossAccent(k), BOSS_BLURB[k] || ''])

    const TABS = [['WEAPONS', WEAPONS], ['FOES', FOES], ['BOSSES', BOSSES]] as const
    const rows = TABS[this.intelTab][1] as [string, number, string][]

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 20, '⊞  INTEL', { fontFamily: 'monospace', fontSize: '18px', color: '#7dd3fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 40, 'field guide  ·  ◄ ► switch tabs  ·  Esc back', 8, '#71717a', 0.5)

    // Tabs (clickable + keyboard/pad-switchable)
    const tx = [136, 256, 376]
    TABS.forEach(([name], i) => {
      const on = i === this.intelTab
      const tab = push(this.add.text(tx[i], 64, String(name), { fontFamily: 'monospace', fontSize: '11px', color: on ? '#e0f2fe' : '#52525b', fontStyle: on ? 'bold' : 'normal' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      tab.on('pointerdown', () => this.setIntelTab(i))
      if (on) push(this.add.rectangle(tx[i], 76, String(name).length * 8 + 8, 2, 0x7dd3fc, 0.9).setScrollFactor(0).setDepth(251))
    })

    // Entries for the active tab
    const top = 96
    rows.forEach((r, i) => {
      const y = top + i * 22
      T(46, y, String(r[0]), 10, hx(r[1] as number))
      T(150, y, String(r[2]), 9, '#a1a1aa')
    })

    const b = push(this.add.text(256, 360, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    b.on('pointerdown', () => this.closeIntel())
  }

  // ---- APEX HEAT — ascension select screen + launcher (unlocked by clearing the campaign) ----
  private openHeat() {
    if (this.heatOpen || this.dailyOpen || this.trialsOpen || this.intelOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.badgesOpen) return
    this.heatOpen = true
    this.heatPadPrev = 0
    this.startGraceUntil = this.time.now + 300   // swallow the confirm press still held from the title
    this.heatSel = Math.max(1, loadHeatUnlocked())   // default to the highest tier you've unlocked
    this.buildHeatScreen(null)
    this.input.keyboard!.on('keydown-ESC', this.closeHeatKey)
    this.input.keyboard!.on('keydown', this.heatKeyHandler)
    if (loadHeatUnlocked() >= 1) fetchAscension(this.heatSel).then((d) => { if (this.heatOpen && d.heat === this.heatSel) this.buildHeatScreen(d) })
  }

  private closeHeat() {
    if (!this.heatOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeHeatKey)
    this.input.keyboard!.off('keydown', this.heatKeyHandler)
    this.heatUI.forEach((o) => o.destroy())
    this.heatUI = []
    this.heatOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private heatKeyHandler = (e: KeyboardEvent) => {
    if (!this.heatOpen || this.time.now < this.startGraceUntil) return
    if (e.key === 'ArrowLeft') this.setHeatSel(this.heatSel - 1)
    else if (e.key === 'ArrowRight') this.setHeatSel(this.heatSel + 1)
    else if (e.key === 'Enter' || e.key === ' ') this.startHeat(this.heatSel)
  }

  private setHeatSel(t: number) {
    const unlocked = Math.max(1, loadHeatUnlocked())
    this.heatSel = Math.max(1, Math.min(unlocked, t))
    this.buildHeatScreen(null)
    if (loadHeatUnlocked() >= 1) fetchAscension(this.heatSel).then((d) => { if (this.heatOpen && d.heat === this.heatSel) this.buildHeatScreen(d) })
    this.sfx?.swap()
  }

  private startHeat(tier: number) {
    if (this.started) return
    this.input.keyboard!.off('keydown-ESC', this.closeHeatKey)
    this.input.keyboard!.off('keydown', this.heatKeyHandler)
    this.heatUI.forEach((o) => o.destroy()); this.heatUI = []
    this.heatOpen = false
    this.heatRun = true
    this.heatTier = Math.max(1, Math.min(MAX_HEAT, tier))
    this.dailyRun = false; this.rushRun = false
    this.startGraceUntil = 0
    this.beginPlay()                        // beginPlay applies the Armory kit (heat is not daily/rush)
    this.screenToast('🔥 APEX HEAT ' + this.heatTier + ' · ' + heatMods(this.heatTier).name, '#f97316', 130)
  }

  private buildHeatScreen(data: AscensionData | null) {
    this.heatUI.forEach((o) => o.destroy())
    this.heatUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.heatUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const unlocked = loadHeatUnlocked()

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 20, '🔥 APEX HEAT', { fontFamily: 'monospace', fontSize: '18px', color: '#f97316', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))

    const back = () => {
      const b = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      b.on('pointerdown', () => this.closeHeat())
    }

    if (unlocked < 1) {
      T(256, 150, 'Clear the campaign to unlock Apex Heat.', 11, '#a5b4fc', 0.5)
      T(256, 172, 'Then climb stacking difficulty tiers — each with its own board.', 9, '#71717a', 0.5)
      back(); return
    }

    T(256, 40, 'ascension · clear a tier to unlock the next · Armory ON', 8, '#71717a', 0.5)

    // Tier selector (◄ / ►, click / keys / d-pad). Only unlocked tiers are selectable.
    const m = heatMods(this.heatSel)
    const arrow = (x: number, glyph: string, dir: number, on: boolean) => {
      const a = push(this.add.text(x, 66, glyph, { fontFamily: 'monospace', fontSize: '18px', color: on ? '#f97316' : '#3f3f46', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
      if (on) { a.setInteractive({ useHandCursor: true }); a.on('pointerdown', () => this.setHeatSel(this.heatSel + dir)) }
    }
    arrow(150, '◄', -1, this.heatSel > 1)
    push(this.add.text(256, 66, 'HEAT ' + this.heatSel + ' · ' + m.name, { fontFamily: 'monospace', fontSize: '15px', color: '#fb923c', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    arrow(362, '►', 1, this.heatSel < unlocked)
    T(256, 90, 'unlocked: HEAT ' + unlocked + ' / ' + MAX_HEAT, 8, '#52525b', 0.5)

    // Modifier readout
    const pct = (v: number) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%'
    T(256, 110, 'enemies ' + pct(m.hp) + ' HP  ·  ' + pct(m.spd) + ' speed  ·  ' + m.elite.toFixed(1) + '× elites  ·  ' + Math.round(m.pods * 100) + '% drops', 9, '#c4b5fd', 0.5)

    const play = push(this.add.text(256, 138, '▶  PLAY HEAT ' + this.heatSel, { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#f97316', padding: { x: 14, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    play.on('pointerover', () => play.setAlpha(0.85)); play.on('pointerout', () => play.setAlpha(1))
    play.on('pointerdown', () => this.startHeat(this.heatSel))

    T(256, 166, '— HEAT ' + this.heatSel + ' BOARD —', 9, '#52525b', 0.5)
    if (!data) { T(256, 192, 'loading…', 11, '#a5b4fc', 0.5); back(); return }
    if (!data.online) { T(256, 196, 'board offline', 10, '#71717a', 0.5); back(); return }
    const mine = myWallet()
    const short = (w: string) => w.slice(0, 6) + '…' + w.slice(-4)
    if (data.top.length === 0) T(256, 200, 'No clears yet at this tier — set the pace.', 10, '#a5b4fc', 0.5)
    data.top.slice(0, 6).forEach((r, i) => {
      const y = 186 + i * 17
      const you = !!mine && r.wallet.toLowerCase() === mine
      const c = you ? '#fde68a' : '#e9d5ff'
      T(120, y, '#' + (i + 1), 10, i < 3 ? '#fb923c' : '#a1a1aa')
      T(156, y, (r.handle || short(r.wallet)) + this.prestigeTag(r.prestige) + (you ? '  (you)' : ''), 10, c)
      T(338, y, 'S' + r.sector, 9, you ? '#fde68a' : '#9ca3af', 1)
      T(392, y, String(r.score), 10, c, 1)
    })
    if (data.you && !data.top.some((r) => !!mine && r.wallet.toLowerCase() === mine)) {
      T(256, 312, `YOU  ·  #${data.you.rank}  ·  S${data.you.sector}  ·  ${data.you.score}${this.prestigeTag(currentRank())}`, 10, '#fde68a', 0.5)
    }
    back()
  }

  // ---- APEX LOADOUTS — Strike Doctrine picker (a pre-run identity applied wherever the Armory kit is; Campaign, Heat & Trials. Daily is the sole equal-kit board.) ----
  private openLoadout() {
    if (this.loadoutOpen || this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.badgesOpen) return
    this.loadoutOpen = true
    this.loadoutPadPrev = 0
    this.loadoutConfirmPrev = true   // the still-held confirm that opened this screen must release first
    this.startGraceUntil = this.time.now + 300   // swallow the confirm press still held from the title (matches openHeat/openRank)
    this.loadoutSel = Math.max(0, DOCTRINES.findIndex((d) => d.id === loadSelected()))
    this.buildLoadoutScreen()
    this.input.keyboard!.on('keydown-ESC', this.closeLoadoutKey)
    this.input.keyboard!.on('keydown', this.loadoutKeyHandler)
  }

  private closeLoadout() {
    if (!this.loadoutOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeLoadoutKey)
    this.input.keyboard!.off('keydown', this.loadoutKeyHandler)
    this.loadoutUI.forEach((o) => o.destroy())
    this.loadoutUI = []
    this.loadoutOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  private setLoadoutSel(i: number) {
    const n = DOCTRINES.length
    this.loadoutSel = ((i % n) + n) % n
    this.buildLoadoutScreen()
    this.sfx?.swap()
  }

  private selectFocusedDoctrine() {
    saveSelected(DOCTRINES[this.loadoutSel].id)
    this.sfx?.pickup()
    this.buildLoadoutScreen()
  }

  private buildLoadoutScreen() {
    this.loadoutUI.forEach((o) => o.destroy())
    this.loadoutUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.loadoutUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const d = DOCTRINES[this.loadoutSel]
    const activeId = loadSelected()
    const isActive = d.id === activeId

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 18, 'STRIKE DOCTRINE', { fontFamily: 'monospace', fontSize: '18px', color: '#a5b4fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 38, 'choose your kit — a starting weapon, stats, and a passive', 8, '#71717a', 0.5)

    // selector arrows + focused name
    const arrow = (x: number, glyph: string, dir: number) => {
      const a = push(this.add.text(x, 66, glyph, { fontFamily: 'monospace', fontSize: '18px', color: '#a5b4fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      a.on('pointerdown', () => this.setLoadoutSel(this.loadoutSel + dir))
    }
    arrow(140, '◄', -1)
    push(this.add.text(256, 66, d.glyph + '  ' + d.name, { fontFamily: 'monospace', fontSize: '16px', color: d.hex, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    arrow(372, '►', 1)
    T(256, 90, d.blurb, 9, '#c4b5fd', 0.5)

    // stat readout
    const sign = (n: number) => (n > 0 ? '+' + n : String(n))
    const stats: string[] = ['start ' + d.startWeapon.toUpperCase() + '★'.repeat(d.startMastery)]
    if (d.dHealth) stats.push(sign(d.dHealth) + ' ♥')
    if (d.dLives) stats.push(sign(d.dLives) + ' life')
    if (d.dJumps) stats.push(sign(d.dJumps) + ' jump')
    if (d.dFire) stats.push((d.dFire > 0 ? 'faster' : 'slower') + ' fire')
    T(256, 118, stats.join('   ·   '), 9, '#e9d5ff', 0.5)
    T(256, 140, '✦ ' + d.passiveText, 9, '#fbbf24', 0.5)

    // select / active button
    if (isActive) {
      push(this.add.text(256, 174, '✓  ACTIVE DOCTRINE', { fontFamily: 'monospace', fontSize: '13px', color: '#4ade80', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    } else {
      const sel = push(this.add.text(256, 174, '▶  SELECT', { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#a5b4fc', padding: { x: 16, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      sel.on('pointerover', () => sel.setAlpha(0.85)); sel.on('pointerout', () => sel.setAlpha(1))
      sel.on('pointerdown', () => this.selectFocusedDoctrine())
    }

    // roster row (all doctrines; active ringed)
    T(256, 210, '— ROSTER —', 9, '#52525b', 0.5)
    const step = 512 / (DOCTRINES.length + 1)
    DOCTRINES.forEach((dd, i) => {
      const x = step * (i + 1)
      const on = dd.id === activeId, foc = i === this.loadoutSel
      const g = push(this.add.text(x, 236, dd.glyph, { fontFamily: 'monospace', fontSize: '18px', color: on ? dd.hex : '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      g.on('pointerdown', () => this.setLoadoutSel(i))
      if (foc) push(this.add.rectangle(x, 236, 26, 26, 0x000000, 0).setStrokeStyle(2, 0xa5b4fc, 0.9).setScrollFactor(0).setDepth(251))
      push(this.add.text(x, 254, dd.name.slice(0, 7), { fontFamily: 'monospace', fontSize: '7px', color: on ? '#e9d5ff' : '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    })

    T(256, 290, 'applies to Campaign, Heat & Trials — Daily stays equal-kit', 8, '#52525b', 0.5)
    T(256, 306, '◄ ► browse   ·   Enter select   ·   Esc back', 8, '#3f3f46', 0.5)
    const back = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    back.on('pointerdown', () => this.closeLoadout())
  }

  // ---- APEX RANK — enlist banked shards for a permanent prestige rank + a global rank board.
  // Fixes the shard economy's dead end: the Armory caps at 705 shards, after which every shard a run
  // pays out is worthless. Enlisting is an uncapped sink; Rank is cosmetic (a title/badge) so the score
  // ladders stay pure. Reached from the Armory.
  private openRank() {
    if (this.rankOpen || this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.loadoutOpen || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.badgesOpen) return
    this.rankOpen = true
    this.rankPadPrev = false
    this.rankData = null
    this.startGraceUntil = this.time.now + 300
    this.buildRankScreen()
    this.input.keyboard!.on('keydown-ESC', this.closeRankKey)
    this.input.keyboard!.on('keydown', this.rankKeyHandler)
    fetchRanks().then((d) => { this.rankData = d; if (this.rankOpen) this.buildRankScreen() })
  }

  private closeRank() {
    if (!this.rankOpen) return
    this.input.keyboard!.off('keydown-ESC', this.closeRankKey)
    this.input.keyboard!.off('keydown', this.rankKeyHandler)
    this.rankUI.forEach((o) => o.destroy())
    this.rankUI = []
    this.rankOpen = false
    this.startGraceUntil = this.time.now + 400
  }

  // Enlist ALL banked shards into rank, persist, POST the new standing, and refresh the screen.
  private enlistNow() {
    if (!this.rankOpen) return
    const before = loadMeta().shards
    if (before <= 0) return
    const oldRank = currentRank()
    const newRank = enlistShards()   // moves every banked shard into enlisted; returns the resulting rank
    this.sfx?.pickup()
    this.screenToast('◆ ENLISTED ' + before + ' → RANK ' + newRank, '#a5b4fc', 130)
    if (newRank > oldRank && rankTitle(newRank) !== rankTitle(oldRank)) {
      // crossed into a new Insignia band — celebrate the promotion in the band's colour
      this.time.delayedCall(380, () => { if (this.rankOpen) { this.screenToast('★ PROMOTED — ' + rankTitle(newRank), rankBandColor(newRank), 240); this.sfx?.crit() } })
    }
    submitRank(newRank).then((res) => { if (res && this.rankOpen) fetchRanks().then((d) => { this.rankData = d; if (this.rankOpen) this.buildRankScreen() }) })
    this.buildRankScreen()
    try { window.dispatchEvent(new Event('apex-armory-changed')) } catch { /* SSR/none */ }
  }

  private buildRankScreen() {
    this.rankUI.forEach((o) => o.destroy())
    this.rankUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.rankUI.push(o); return o }
    const T = (x: number, y: number, s: string, size: number, color: string, ox = 0) =>
      push(this.add.text(x, y, s, { fontFamily: 'monospace', fontSize: size + 'px', color }).setOrigin(ox, 0).setScrollFactor(0).setDepth(251))
    const enlisted = loadRank().enlisted
    const r = currentRank()
    const banked = loadMeta().shards
    const toNext = toNextRank(enlisted)
    const bandBase = cumulativeCost(r), bandTop = cumulativeCost(r + 1)
    const frac = bandTop > bandBase ? Math.max(0, Math.min(1, (enlisted - bandBase) / (bandTop - bandBase))) : 0

    push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.985).setScrollFactor(0).setDepth(250).setInteractive())
    push(this.add.text(256, 20, '◆ APEX RANK', { fontFamily: 'monospace', fontSize: '18px', color: '#a5b4fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 40, 'enlist banked shards for permanent prestige — cosmetic, never in-run power', 8, '#71717a', 0.5)

    push(this.add.text(256, 68, prestigeGlyph(r) + ' RANK ' + r, { fontFamily: 'monospace', fontSize: '22px', color: rankBandColor(r), fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(251))
    T(256, 94, rankTitle(r), 11, rankBandColor(r), 0.5)

    const bw = 300, bx = 256 - bw / 2, by = 118
    push(this.add.rectangle(bx, by, bw, 8, 0x1e1b4b).setOrigin(0, 0.5).setScrollFactor(0).setDepth(251))
    if (frac > 0) push(this.add.rectangle(bx, by, bw * frac, 8, 0xa5b4fc).setOrigin(0, 0.5).setScrollFactor(0).setDepth(252))
    T(256, 128, '▲ ' + toNext + ' ◆ to RANK ' + (r + 1), 9, '#c4b5fd', 0.5)

    T(256, 152, '◆ ' + banked + ' banked   ·   ◆ ' + enlisted + ' enlisted', 10, '#67e8f9', 0.5)
    if (banked > 0) {
      const btn = push(this.add.text(256, 180, '▶  ENLIST ◆' + banked, { fontFamily: 'monospace', fontSize: '13px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#a5b4fc', padding: { x: 16, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
      btn.on('pointerover', () => btn.setAlpha(0.85)); btn.on('pointerout', () => btn.setAlpha(1))
      btn.on('pointerdown', () => this.enlistNow())
    } else {
      T(256, 180, hasWallet() ? 'grab ◆ pods in a run, then enlist here' : 'connect a wallet + bank shards to enlist', 9, '#52525b', 0.5)
    }

    T(256, 212, '— APEX RANKS —', 9, '#52525b', 0.5)
    const d = this.rankData
    if (!d) { T(256, 238, 'loading…', 11, '#a5b4fc', 0.5) }
    else if (!d.online) { T(256, 238, 'board offline', 10, '#71717a', 0.5) }
    else {
      const mine = myWallet()
      const short = (w: string) => w.slice(0, 6) + '…' + w.slice(-4)
      if (d.top.length === 0) T(256, 240, 'No ranks enlisted yet — be the first.', 10, '#a5b4fc', 0.5)
      d.top.slice(0, 5).forEach((row, i) => {
        const y = 232 + i * 17
        const you = !!mine && row.wallet.toLowerCase() === mine
        const c = you ? '#fde68a' : '#e9d5ff'
        T(150, y, '#' + (i + 1), 10, i < 3 ? '#a5b4fc' : '#a1a1aa')
        T(186, y, (row.handle || short(row.wallet)) + (you ? '  (you)' : ''), 10, c)
        T(362, y, rankTitle(row.rank) + ' ' + prestigeGlyph(row.rank) + rankBadge(row.rank), 9, you ? c : rankBandColor(row.rank), 1)
      })
      if (d.you && !d.top.some((row) => !!mine && row.wallet.toLowerCase() === mine)) {
        T(256, 322, 'YOU  ·  #' + d.you.pos + '  ·  RANK ' + d.you.rank, 10, '#fde68a', 0.5)
      }
    }

    const back = push(this.add.text(256, 356, '[ BACK ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(251).setInteractive({ useHandCursor: true }))
    back.on('pointerdown', () => this.closeRank())
  }

  private beginRebind(action: PadBindAction, val: Phaser.GameObjects.Text) {
    this.rebinding = action
    this.rebindArmed = false          // must see all buttons release first, so this tap can't self-bind
    val.setColor('#f43f5e').setText('press…')
    this.rebindHint?.setText(`Press a button for ${PAD_BIND_LABEL[action]}   ·   Esc cancels`)
  }

  // Polled from update() while the controls screen is open.
  private updateControlsRebind() {
    const pad = this.readPad()
    // Live connection status on the hint line whenever we're not mid-capture.
    if (!this.rebinding) {
      this.rebindHint?.setText(pad
        ? '🎮 Controller detected — tap a box, then press a button'
        : 'No controller seen — press any button on your pad to wake it')
      return
    }
    if (!pad) return
    if (!this.rebindArmed) { if (!this.anyPadButtonDown(pad.buttons)) this.rebindArmed = true; return }
    const i = this.firstPadButtonDown(pad.buttons)
    if (i >= 0) {
      this.padBinds[this.rebinding] = i
      this.savePadBinds()
      this.rebinding = null
      this.rebindArmed = false
      this.buildControlsScreen()      // redraw rows with the new binding
    }
  }

  private screenToast(text: string, color = '#a5b4fc', y = 120) {
    const t = this.add.text(256, y, text, { fontFamily: 'monospace', fontSize: '12px', color })
      .setOrigin(0.5).setScrollFactor(0).setDepth(232).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 160, yoyo: true, hold: 800, onComplete: () => t.destroy() })
  }

  // Just-in-time teaching: the first time a mechanic becomes relevant (a telegraph, a graze, a second
  // gun, the guardian), show ONE readable tip — once ever (localStorage), campaign-only, early levels.
  // Spaced contextual tips teach action mechanics far better than one front-loaded wall of text.
  private tipOnce(key: string, text: string, color = '#67e8f9') {
    if (this.tipsShown.has(key)) return
    if (this.dailyRun || this.rushRun || this.heatRun || this.level > 2 || this.gameOver) return
    this.tipsShown.add(key)                       // don't re-evaluate this session
    let seen = false
    try { seen = localStorage.getItem('apex_tip_' + key) === '1' } catch { seen = true }
    if (seen) return                              // already taught in a past session
    try { localStorage.setItem('apex_tip_' + key, '1') } catch { /* storage blocked */ }
    if (this.activeTip && this.activeTip.active) this.activeTip.destroy()   // single slot: replace the prior tip so two that fire close together never overlap into an unreadable blob
    const t = this.add.text(256, 170, text, { fontFamily: 'monospace', fontSize: '10px', color, backgroundColor: 'rgba(10,6,18,0.85)', padding: { x: 9, y: 5 }, align: 'center' })   // y=170: off the SECTOR-banner lane (y=150) so a tip + banner never overlap (round-11 onboarding#6)
      .setOrigin(0.5).setScrollFactor(0).setDepth(232).setAlpha(0)
    this.activeTip = t
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 2600, onComplete: () => { if (this.activeTip === t) this.activeTip = undefined; t.destroy() } })
  }

  // First time a shield eats a shot, teach the flank once — level-independent (unlike the early-run tipOnce
  // lane), because a shielder can first appear well past level 2 and its block MUST be explained on contact.
  private teachShield() {
    try { if (localStorage.getItem('apex_tip_shield') === '1') return } catch { return }
    try { localStorage.setItem('apex_tip_shield', '1') } catch { /* storage blocked */ }
    this.screenToast('◈ SHIELD — hit it from ABOVE (aim down) or BEHIND', '#a5f3fc', 170)
  }

  private togglePause() {
    if (this.controlsOpen || this.coachGate) return   // the DROP IN card says "press any key" — ESC/P mustn't also pause behind it
    if (!this.started || this.gameOver || this.levelTransition || !this.player?.active) return
    this.userPaused = !this.userPaused
    this.setBridge(this.userPaused ? 'paused' : 'playing')
    if (this.userPaused) {
      this.physics.pause()
      const dim = this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.72).setScrollFactor(0).setDepth(230)
      const title = this.add.text(256, 148, 'PAUSED', { fontFamily: 'monospace', fontSize: '26px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(231)
      const hint = this.add.text(256, 190, 'P / Start  resume        M  ' + (this.muted ? 'unmute' : 'mute'), { fontFamily: 'monospace', fontSize: '10px', color: '#a5b4fc' }).setOrigin(0.5).setScrollFactor(0).setDepth(231)
      const resume = this.add.text(256, 226, '[ RESUME ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      resume.on('pointerdown', () => this.togglePause())
      const restart = this.add.text(256, 250, '[ RESTART MISSION ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      restart.on('pointerdown', () => this.restartRun())
      const controls = this.add.text(256, 278, '[ CONTROLS ]', { fontFamily: 'monospace', fontSize: '11px', color: '#a5b4fc' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      controls.on('pointerdown', () => this.openControls())
      // Accessibility toggles reachable mid-run (previously title-only) — dial down motion or sound
      // without quitting to the title.
      const motionLbl = () => 'MOTION:  ' + (this.reduceMotion ? 'REDUCED' : 'FULL')
      const motion = this.add.text(256, 304, motionLbl(), { fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      motion.on('pointerdown', () => { this.toggleReduceMotion(); motion.setText(motionLbl()) })
      const muteLbl = () => 'SOUND:  ' + (this.muted ? 'OFF' : 'ON')
      const mute = this.add.text(256, 324, muteLbl(), { fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8' }).setOrigin(0.5).setScrollFactor(0).setDepth(231).setInteractive({ useHandCursor: true })
      mute.on('pointerdown', () => { this.toggleMute(); mute.setText(muteLbl()) })
      this.pauseUI = [dim, title, hint, resume, restart, controls, motion, mute]
    } else {
      this.physics.resume()
      this.pauseUI.forEach((o) => o.destroy())
      this.pauseUI = []
    }
  }

  private toggleMute() {
    if (this.coachGate) return   // 'M' as the DROP IN "any key" mustn't also flip mute
    this.muted = !this.muted
    try { localStorage.setItem('apex_muted', this.muted ? '1' : '0') } catch { /* ignore */ }
    this.sfx?.setMuted(this.muted)
    if (this.muteIcon) { this.muteIcon.setText(this.muted ? '♪ OFF' : '♪ ON'); this.muteIcon.setColor(this.muted ? '#ef4444' : '#a5b4fc') }
    this.screenToast(this.muted ? 'SOUND OFF' : 'SOUND ON')
  }

  private toggleReduceMotion() {
    this.reduceMotion = !this.reduceMotion
    try { localStorage.setItem('apex_reducefx', this.reduceMotion ? '1' : '0') } catch { /* ignore */ }
    this.sfx?.swap()
    this.screenToast(this.reduceMotion ? 'REDUCED MOTION ON' : 'REDUCED MOTION OFF', '#94a3b8')
  }

  private collectShard(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    sObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const s = sObj as Phaser.Physics.Arcade.Sprite
    if (!s.active) return
    this.tweens.killTweensOf(s)
    s.destroy()
    this.shardsGot++
    this.runShards++
    this.score += 75
    this.scoreText.setText('SCORE  ' + this.score)
    this.shardText?.setText('◆ ' + this.shardsGot + '/' + this.shardsTotal)
    bankShards(1)                                     // Apex Armory: shard banks permanently the instant it's grabbed
    this.particles.emitParticleAt(s.x, s.y, 12)
    this.shockwave(s.x, s.y, 0x67e8f9, 18)
    this.popup(s.x, s.y - 16, '+75', '#67e8f9')
    this.sfx?.pickup()
    if (this.shardsTotal > 0 && this.shardsGot === this.shardsTotal) {
      this.score += 500
      this.scoreText.setText('SCORE  ' + this.score)
      this.screenToast('ALL SHARDS  +500', '#67e8f9', 118)
    }
  }

  // Reward exploration — explicit shard spots (e.g. from the Level Lab) win;
  // otherwise a shard hovers over most ledges + wide ground spans.
  private placeShards(def: LevelDef) {
    let chosen: [number, number][]
    if (def.shards && def.shards.length) {
      chosen = def.shards
    } else {
      // A shard may only hover in OPEN air — never buried inside a wall/staircase block
      // (wide ground spans are exactly where staircases sit, so a raw midpoint often lands
      // inside one) and never floating over spikes. clear() enforces both.
      const platTh = (cx: number, top: number) => 34 + (Math.abs(Math.round(cx * 2.3 + top * 1.7)) % 4) * 8
      const clear = (x: number, y: number) =>
        !def.walls.some(([cx, top, w, h]) => x >= cx - w / 2 - 12 && x <= cx + w / 2 + 12 && y >= top - 12 && y <= top + h) &&
        !def.plats.some(([cx, top, w]) => x >= cx - w / 2 - 12 && x <= cx + w / 2 + 12 && y >= top - 12 && y <= top + platTh(cx, top)) &&
        !(def.hazards || []).some(([cx, , w]) => x >= cx - w / 2 - 16 && x <= cx + w / 2 + 16)
      const spots: [number, number][] = []
      def.plats.forEach(([cx, top]) => { if (clear(cx, top - 26)) spots.push([cx, top - 26]) })
      // Sample several points across each wide ground span; keep only the open ones so a
      // buried midpoint is replaced by clear neighbours instead of dropping the shard in a wall.
      def.ground.forEach(([x1, x2]) => {
        if (x2 - x1 < 320) return
        for (const f of [0.22, 0.4, 0.6, 0.78]) { const x = Math.round(x1 + (x2 - x1) * f); if (clear(x, 570)) spots.push([x, 570]) }
      })
      Phaser.Utils.Array.Shuffle(spots)
      chosen = spots.filter(([x]) => Math.abs(x - def.spawn[0]) > 130).slice(0, 12)
    }
    chosen.forEach(([x, y]) => this.spawnShard(x, y))
    this.shardsTotal = chosen.length
    this.shardText?.setText('◆ 0/' + this.shardsTotal)
  }

  private spawnShard(x: number, y: number) {
    const s = this.shards.create(x, y, 'shard') as Phaser.Physics.Arcade.Sprite
    s.setDepth(13); s.setDisplaySize(20, 20)
    ;(s.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    this.tweens.add({ targets: s, angle: 360, duration: 2600, repeat: -1 })
    this.tweens.add({ targets: s, y: y - 7, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }

  private createBossBar(maxHp: number) {
    this.destroyBossBar()
    const w = 300
    const frame = this.add.rectangle(256, 26, w + 8, 16, 0x0a0612, 0.85).setScrollFactor(0).setDepth(205).setStrokeStyle(1, 0xf43f5e, 0.85)
    const fill = this.add.rectangle(256 - w / 2, 26, w, 10, 0xf43f5e, 1).setOrigin(0, 0.5).setScrollFactor(0).setDepth(206)
    const label = this.add.text(256, 12, this.nextBossLabel, { fontFamily: 'monospace', fontSize: '9px', color: '#fca5a5' }).setOrigin(0.5).setScrollFactor(0).setDepth(206)
    fill.setData('max', maxHp)
    this.bossBarFill = fill
    this.bossBar = [frame, fill, label]
  }

  // A quick white flash over the boss bar on each hit — the HP chip reads as impact, not just decay.
  private bossBarChip() {
    if (!this.bossBarFill) return
    // Throttle: laser/rapid hit every 40-70ms, so an un-gated full-bar flash layered into a near-constant
    // white wash that hid the HP fill you're trying to read. One flash per ~90ms still reads each hit. (round-11 combat#9)
    if (this.time.now - this.lastBossChipAt < 90) return
    this.lastBossChipAt = this.time.now
    const flash = this.add.rectangle(256, 26, 308, 16, 0xffffff, 0.42).setScrollFactor(0).setDepth(207)
    this.tweens.add({ targets: flash, alpha: 0, duration: 120, onComplete: () => flash.destroy() })
  }

  private updateBossBar() {
    const boss = this.bossRef
    if (!boss || !boss.active) { this.destroyBossBar(); this.bossRef = undefined; return }
    if (!this.bossBarFill) return
    const hp = Math.max(0, boss.getData('hp') as number)
    const max = this.bossBarFill.getData('max') as number
    const frac = Phaser.Math.Clamp(hp / max, 0, 1)
    this.bossBarFill.scaleX = frac
    this.bossBarFill.setFillStyle(frac > 0.5 ? 0xf43f5e : frac > 0.25 ? 0xfb923c : 0xfbbf24, 1)
  }

  private destroyBossBar() {
    this.bossBar.forEach((o) => o.destroy())
    this.bossBar = []
    this.bossBarFill = undefined
  }

  private showBanner(title: string, subtitle: string) {
    const t = this.add.text(256, 150, title + '\n' + subtitle, {
      fontFamily: 'monospace', fontSize: '18px', color: '#22d3ee', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 700, onComplete: () => t.destroy() })
  }

  // Whole hours until the next UTC midnight — when the daily bounties reset. Min 1 so it never reads "0h".
  private hoursToUtcMidnight(): number {
    const now = new Date()
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    return Math.max(1, Math.ceil((next - now.getTime()) / 3600000))
  }

  private showTitle() {
    this.physics.pause()
    this.setBridge('title')
    let best = 0
    try { best = parseInt(localStorage.getItem('apex_best') || '0', 10) || 0 } catch { best = 0 }
    // PROGRESSIVE HUB: a brand-new player sees only START / CONTROLS / MOTION — the mode row and meta
    // entries (all empty or locked for them) bloom in once they've actually played a run. Cuts the
    // "which of 11 buttons?" first-run overwhelm.
    const veteran = best > 0 || loadMeta().shards > 0 || achievementCount().unlocked > 0 || getDailyStreak().streak > 0 || currentRank() > 0
    const els: Phaser.GameObjects.GameObject[] = []
    // Reset the focus-nav layer for this fresh title build.
    this.titleNav = []; this.titleFocus = 0; this.titleNavActive = false
    this.titleRing = undefined; this.titleNavPrev = 0; this.titleConfirmPrev = false
    els.push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.68).setScrollFactor(0).setDepth(240))
    if (this.textures.exists('logo')) {
      const logo = this.add.image(256, 112, 'logo').setScrollFactor(0).setDepth(241)
      const src = this.textures.get('logo').getSourceImage() as { width: number; height: number }
      const sc = Math.min(230 / (src.width || 230), 190 / (src.height || 190))
      logo.setScale(sc)
      els.push(logo)
    }
    // The logo carries the APEX STRIKE wordmark, so no separate title label is needed.
    els.push(this.add.text(256, 226, 'a CLKN Productions game', { fontFamily: 'monospace', fontSize: '8px', color: '#7c6f9c' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    if (best > 0) els.push(this.add.text(256, 246, 'BEST  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#67e8f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    const prompt = this.add.text(256, 272, this.sys.game.device.input.touch ? '▶  TAP TO START' : '▶  PRESS ANY KEY TO START', { fontFamily: 'monospace', fontSize: '12px', color: '#f5f3ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(241)
    this.tweens.add({ targets: prompt, alpha: 0.32, duration: 620, yoyo: true, repeat: -1 })
    els.push(prompt)
    this.titleNav.push({ obj: prompt, act: () => this.beginPlay() })   // focus #0 — START (default)
    if (veteran) {   // ---- mode row + meta entries: only once the player has actually played ----
    // DAILY CHALLENGE — headline entry. ABOVE the start catcher so a tap opens it, never starts play.
    // Show today's modifier name so the title visibly changes each day and hints at the run.
    const daily = this.add.text(150, 294, '◆ DAILY · ' + todayMod().name, { fontFamily: 'monospace', fontSize: '11px', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    daily.on('pointerover', () => daily.setColor('#fde68a'))
    daily.on('pointerout', () => daily.setColor('#fbbf24'))
    daily.on('pointerdown', () => this.openDaily())
    els.push(daily)
    this.titleNav.push({ obj: daily, act: () => this.openDaily() })
    // APEX TRIALS — weekly boss rush; opens the board screen (weekly standings + PLAY). Above the start catcher.
    const trials = this.add.text(378, 294, '⚔ TRIALS', { fontFamily: 'monospace', fontSize: '11px', color: '#fca5a5', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    trials.on('pointerover', () => trials.setColor('#fecaca'))
    trials.on('pointerout', () => trials.setColor('#fca5a5'))
    trials.on('pointerdown', () => this.openTrials())
    els.push(trials)
    this.titleNav.push({ obj: trials, act: () => this.openTrials() })
    // APEX HEAT — ascension ladder (endgame). Centre of the mode row; the screen explains the unlock.
    const heatLocked = loadHeatUnlocked() < 1
    const heat = this.add.text(256, 294, '🔥 HEAT', { fontFamily: 'monospace', fontSize: '11px', color: heatLocked ? '#9a5b3b' : '#f97316', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    heat.on('pointerover', () => heat.setColor('#fdba74'))
    heat.on('pointerout', () => heat.setColor(heatLocked ? '#9a5b3b' : '#f97316'))
    heat.on('pointerdown', () => this.openHeat())
    els.push(heat)
    this.titleNav.push({ obj: heat, act: () => this.openHeat() })
    // OBJECTIVES readout — surface the single most immediate OPEN objective and its expiry, not just a
    // count: an abstract "0/3" gives no reason to play, but a concrete, time-boxed task does. Daily bounties
    // (reset soonest) lead; once they're clear the top open weekly contract shows with its progress. (round-11 retention)
    const dk = todayKey()
    const bdone = loadBountyState(dk).done
    const openB = todayBounties(dk).find((b) => !bdone.includes(b.id))
    const cprog = contractProgress(weekKey())
    const openC = cprog.list.find((x) => !x.done)
    const anyOpen = !!openB || !!openC
    const objLine = openB
      ? '◇ ' + openB.label + '  ·  resets ' + this.hoursToUtcMidnight() + 'h    ◈ ' + cprog.done + '/' + cprog.total
      : openC
        ? '◇ bounties ✓    ◈ ' + openC.c.label + '  (' + openC.have + '/' + openC.c.need + ')'
        : '✓ all bounties & contracts clear — come back tomorrow'
    els.push(this.add.text(256, 284, objLine, { fontFamily: 'monospace', fontSize: '8px', color: anyOpen ? '#fbbf24' : '#4ade80' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    // Don't-break-the-chain streak nudge (per-device).
    const ds = getDailyStreak()
    if (ds.streak > 0) {
      const div = pendingDividend()
      const tail = ds.playedToday ? '  ✓' : (div > 0 ? '  · play today  +' + div + ' ◆' : '  · play to keep it')
      els.push(this.add.text(256, 307, '★ ' + ds.streak + '-DAY STREAK' + tail,
        { fontFamily: 'monospace', fontSize: '8px', color: ds.playedToday ? '#4ade80' : '#fbbf24' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    }
    // Apex shard bank + APEX RANK prestige — an interactive gateway to the RANK screen (the endgame
    // shard sink, buried till now with no title entry). Shows the Insignia glyph + band colour when
    // ranked so the flex reads at a glance; registered in titleNav for pad users.
    const bank = loadMeta().shards
    const rk = currentRank()
    if (rk > 0 || bank > 0) {
      const label = rk > 0
        ? '◆ ' + bank + '  ·  ' + prestigeGlyph(rk) + ' RANK ' + rk + ' ' + rankTitle(rk) + '  ▸'
        : '◆ ' + bank + ' BANKED  ·  ENLIST FOR RANK  ▸'
      const base = rk > 0 ? rankBandColor(rk) : '#67e8f9'
      const rankLine = this.add.text(256, 318, label, { fontFamily: 'monospace', fontSize: '9px', color: base, fontStyle: rk > 0 ? 'bold' : 'normal' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
      rankLine.on('pointerover', () => rankLine.setColor('#f5f3ff'))
      rankLine.on('pointerout', () => rankLine.setColor(base))
      rankLine.on('pointerdown', () => this.openRank())
      els.push(rankLine)
      this.titleNav.push({ obj: rankLine, act: () => this.openRank() })
    } else {
      els.push(this.add.text(256, 318, 'collect ◆ shards to fund upgrades', { fontFamily: 'monospace', fontSize: '9px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    }
    // Badge case — tap to view the achievement grid; shows earned / total.
    const bc = achievementCount()
    const badgeCol = bc.unlocked > 0 ? '#c084fc' : '#52525b'
    const badges = this.add.text(96, 330, '❖ BADGES ' + bc.unlocked + '/' + bc.total, { fontFamily: 'monospace', fontSize: '9px', color: badgeCol }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    badges.on('pointerover', () => badges.setColor('#e9d5ff'))
    badges.on('pointerout', () => badges.setColor(badgeCol))
    badges.on('pointerdown', () => this.openBadges())
    els.push(badges)
    this.titleNav.push({ obj: badges, act: () => this.openBadges() })
    // APEX LOADOUTS — pick your Strike Doctrine (starting kit + passive). Shows the active one.
    const docName = doctrineById(loadSelected()).name
    const doc = this.add.text(256, 330, '◆ ' + docName, { fontFamily: 'monospace', fontSize: '9px', color: '#a5b4fc', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    doc.on('pointerover', () => doc.setColor('#c7d2fe'))
    doc.on('pointerout', () => doc.setColor('#a5b4fc'))
    doc.on('pointerdown', () => this.openLoadout())
    els.push(doc)
    this.titleNav.push({ obj: doc, act: () => this.openLoadout() })
    // INTEL codex — the enemy / boss / weapon encyclopedia.
    const intel = this.add.text(416, 330, '⊞ INTEL', { fontFamily: 'monospace', fontSize: '9px', color: '#7dd3fc' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    intel.on('pointerover', () => intel.setColor('#bae6fd'))
    intel.on('pointerout', () => intel.setColor('#7dd3fc'))
    intel.on('pointerdown', () => this.openIntel())
    els.push(intel)
    this.titleNav.push({ obj: intel, act: () => this.openIntel() })
    }   // ---- end veteran-only entries ----
    // ARMORY · LEADERBOARD · CONTROLS — also ABOVE the start catcher.
    const mkBtn = (x: number, label: string, color: string, hover: string, act: () => void) => {
      const b = this.add.text(x, 342, label, { fontFamily: 'monospace', fontSize: '10px', color }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
      b.on('pointerover', () => b.setColor(hover))
      b.on('pointerout', () => b.setColor(color))
      b.on('pointerdown', act)
      els.push(b)
      this.titleNav.push({ obj: b, act })
    }
    if (veteran) {
      mkBtn(108, '[ ARMORY ]', '#fbbf24', '#fde68a', () => this.openArmory())
      mkBtn(256, '[ LEADERBOARD ]', '#67e8f9', '#a5f3fc', () => this.openLeaderboard())
    }
    mkBtn(veteran ? 404 : 256, '[ CONTROLS ]', '#c4b5fd', '#f0abfc', () => this.openControls())   // centered when it's the only entry (first-run)
    // Accessibility: reduce-motion toggle (persisted) — suppresses shake / flash / zoom-punch / vignette pulse.
    const motionLabel = () => 'MOTION:  ' + (this.reduceMotion ? 'REDUCED' : 'FULL')
    const motion = this.add.text(256, 364, motionLabel(), { fontFamily: 'monospace', fontSize: '9px', color: '#94a3b8' }).setOrigin(0.5).setScrollFactor(0).setDepth(242).setInteractive({ useHandCursor: true })
    motion.on('pointerover', () => motion.setColor('#e2e8f0'))
    motion.on('pointerout', () => motion.setColor('#94a3b8'))
    motion.on('pointerdown', () => { this.toggleReduceMotion(); motion.setText(motionLabel()) })
    els.push(motion)
    this.titleNav.push({ obj: motion, act: () => { this.toggleReduceMotion(); motion.setText(motionLabel()) } })
    // Full-screen catcher: a tap on empty space starts. Below the button, above the dim.
    const startCatcher = this.add.rectangle(256, 192, 512, 384, 0x000000, 0.001).setScrollFactor(0).setDepth(240.5).setInteractive()
    startCatcher.on('pointerdown', () => this.beginPlay())
    els.push(startCatcher)
    this.titleUI = els
    // Keyboard: arrow keys drive the focus ring; otherwise any key starts (classic arcade feel). Once
    // you're navigating, only Enter/Space confirms the focused entry — so you can't accidentally start.
    this.startKeyHandler = (e: KeyboardEvent) => {
      if (this.time.now < this.startGraceUntil) return
      if (this.seasonCardOpen) { this.closeSeasonRollover(); return }   // any key dismisses the season rollover ceremony (nothing else owns its input)
      // Inert while any overlay owns the screen (its own handlers drive it).
      if (this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.loadoutOpen || this.rankOpen || this.badgesOpen || this.armoryOpen || this.leaderboardOpen || this.controlsOpen) return
      const k = e.key
      if (k === 'ArrowUp' || k === 'ArrowLeft') { this.titleNavMove(-1); return }
      if (k === 'ArrowDown' || k === 'ArrowRight') { this.titleNavMove(1); return }
      if (this.titleNavActive) {
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') this.titleActivate()
        else if (this.titleFocus === 0) this.beginPlay()   // focus still on START → any key still starts (round-4 FRAGILITY4)
        return
      }
      this.beginPlay()
    }
    this.input.keyboard!.on('keydown', this.startKeyHandler)
    this.maybeShowSeasonRollover()   // once per new month: surface the just-closed season standing + the fresh board
  }

  // ONE-TIME SEASON ROLLOVER ceremony. The monthly Season board resets silently at 00:00 UTC on the 1st;
  // without a closing beat a month of climbing vanishes unacknowledged. On the first title of a new month
  // (per wallet), read the just-closed month (the server keeps past rows) and, if you competed, show a
  // "you finished #N — new season is live" card. Fires at most once per month; offline retries next launch.
  private maybeShowSeasonRollover() {
    if (!hasWallet()) return
    const now = monthKey()
    if (seasonSeen() === now) return
    const prev = prevMonthKey()
    fetchSeason(prev).then((d) => {
      if (!d.online) return                       // board unreachable — don't burn the one-shot; retry next launch
      if (!d.you || !d.you.rank) { markSeasonSeen(now); return }   // competed nothing last month → consume the one-shot, no card
      // Only present the ceremony — and consume the one-shot — when we're genuinely idle on the title. If the
      // player has already started a run, a card's up, the title's torn down, or a submenu owns the screen,
      // DON'T mark it seen (retry next launch) and never pop the modal over gameplay/another overlay. (round-12 bug#2/#3)
      if (this.started || this.seasonCardOpen || !this.titleUI.length || this.anyTitleOverlayOpen()) return
      markSeasonSeen(now)
      recordSeasonFinish(prev, d.you.rank)
      this.showSeasonRollover(prev, now, d.you.rank)
    }).catch(() => { /* offline — ignore, retry next launch */ })
  }

  // Any of the title's own submenu overlays currently up? Used to hold the async season ceremony back so
  // it can't render over an open menu (its depth-260 backdrop would otherwise steal that menu's input).
  private anyTitleOverlayOpen(): boolean {
    return this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.loadoutOpen
      || this.rankOpen || this.badgesOpen || this.armoryOpen || this.leaderboardOpen || this.controlsOpen
  }

  private showSeasonRollover(prevKey: string, nowKey: string, rank: number) {
    if (this.seasonCardOpen) return
    this.seasonCardOpen = true
    this.seasonCardUI = []
    const push = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.seasonCardUI.push(o); return o }
    const backdrop = push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.9).setScrollFactor(0).setDepth(260).setInteractive())
    push(this.add.rectangle(256, 192, 344, 214, 0x0a0713, 0.98).setScrollFactor(0).setDepth(261).setStrokeStyle(2, 0x67e8f9, 0.5))
    const rankCol = rank <= 3 ? '#fbbf24' : rank <= 10 ? '#67e8f9' : '#e5e7eb'
    push(this.add.text(256, 106, '◆  SEASON CLOSED', { fontFamily: 'monospace', fontSize: '13px', color: '#67e8f9', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    push(this.add.text(256, 128, monthLabel(prevKey, true), { fontFamily: 'monospace', fontSize: '10px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    push(this.add.text(256, 162, 'YOU FINISHED', { fontFamily: 'monospace', fontSize: '9px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    const big = push(this.add.text(256, 192, '#' + rank, { fontFamily: 'monospace', fontSize: '40px', color: rankCol, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    push(this.add.text(256, 230, '▶  ' + monthLabel(nowKey) + ' IS LIVE', { fontFamily: 'monospace', fontSize: '12px', color: '#4ade80', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    push(this.add.text(256, 250, 'board reset · everyone starts at zero · climb again', { fontFamily: 'monospace', fontSize: '8px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(262))
    const cont = push(this.add.text(256, 278, '[ CONTINUE ]', { fontFamily: 'monospace', fontSize: '12px', color: '#86efac' }).setOrigin(0.5).setScrollFactor(0).setDepth(262).setInteractive({ useHandCursor: true }))
    cont.on('pointerover', () => cont.setColor('#bbf7d0'))
    cont.on('pointerout', () => cont.setColor('#86efac'))
    cont.on('pointerdown', () => this.closeSeasonRollover())
    backdrop.on('pointerdown', () => this.closeSeasonRollover())
    big.setScale(0.6)
    this.tweens.add({ targets: big, scale: 1, duration: 340, ease: 'Back.easeOut' })
    this.sfx?.resume(); this.sfx?.fanfare()
  }

  private closeSeasonRollover() {
    if (!this.seasonCardOpen) return
    this.seasonCardUI.forEach((o) => o.destroy())
    this.seasonCardUI = []
    this.seasonCardOpen = false
    this.startGraceUntil = this.time.now + 400   // the closing tap/press can't also start play
  }

  // Move the title focus ring (bug#5). The first directional press just reveals the ring where you
  // are; subsequent presses step through the menu entries (wrapping).
  private titleNavMove(dir: number) {
    if (this.seasonCardOpen || !this.titleNav.length) return
    const first = !this.titleNavActive
    this.titleNavActive = true
    if (!first) this.titleFocus = (this.titleFocus + dir + this.titleNav.length) % this.titleNav.length
    this.updateTitleRing()
    this.sfx?.swap()
  }

  private titleActivate() {
    if (this.seasonCardOpen) return
    const it = this.titleNav[this.titleFocus]
    if (it && it.obj.active) it.act()
  }

  // Draw/reposition the focus ring around the focused entry. Entries are origin-centred + scrollFactor
  // 0, so their x/y IS the on-screen centre — no camera math needed.
  private updateTitleRing() {
    const it = this.titleNav[this.titleFocus]
    if (!it || !it.obj.active) return
    if (!this.titleRing) {
      this.titleRing = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setScrollFactor(0).setDepth(243).setStrokeStyle(2, 0x22d3ee, 0.95)
      this.titleUI.push(this.titleRing)
    }
    this.titleRing.setVisible(this.titleNavActive)
    this.titleRing.setPosition(it.obj.x, it.obj.y).setSize(it.obj.width + 18, it.obj.height + 10)
  }

  // Apply persistent Apex Armory upgrades to this run's starting stats. Called at create() AND at
  // the moment a run actually begins, so an upgrade BOUGHT on the title takes effect THIS run, not next.
  private applyArmory() {
    const meta = loadMeta()
    // APEX LOADOUTS: layer the chosen Strike Doctrine on top of the Armory result — reshaped stats, a
    // pre-mastered starting weapon, and a signature passive. Side-grades, so the campaign board stays fair.
    const doc = selectedDoctrine()
    this.doctrinePassive = doc.passive
    this.maxHealth = Math.max(1, 6 + meta.up.vitality + doc.dHealth)
    this.maxJumps = MAX_JUMPS + meta.up.boots + doc.dJumps
    this.fireBonus = meta.up.firepower * 12 + doc.dFire
    this.dashLevel = meta.up.dash
    this.dashCd = this.dashLevel >= 2 ? 480 : this.dashLevel >= 1 ? 660 : 820   // baseline cooldown shortens per tier
    this.lives = Math.max(1, 3 + meta.up.reserves + doc.dLives)
    this.weapon = doc.startWeapon
    this.altWeapon = doc.startWeapon
    this.weaponLvl[doc.startWeapon] = Math.max(this.weaponLvl[doc.startWeapon] || 0, doc.startMastery)
    this.health = this.maxHealth
    this.jumpsLeft = this.maxJumps
  }

  private beginPlay() {
    if (this.started || this.controlsOpen || this.armoryOpen || this.leaderboardOpen || this.dailyOpen || this.trialsOpen || this.intelOpen || this.heatOpen || this.loadoutOpen || this.rankOpen || this.badgesOpen || this.seasonCardOpen) return   // seasonCardOpen: the rollover ceremony must never be started through (round-12 bug#1)
    if (this.time.now < this.startGraceUntil) return   // the keypress/tap that just closed CONTROLS can't also start
    if (this.startKeyHandler) { this.input.keyboard!.off('keydown', this.startKeyHandler); this.startKeyHandler = undefined }
    if (!this.dailyRun && !this.rushRun) { this.applyArmory(); this.updateHealth(); this.livesText?.setText('LIVES  ' + this.lives); this.updateWeaponHUD() }   // pick up any upgrade / doctrine kit (Daily sets its own)
    else if (this.dailyRun) this.doctrinePassive = 'none'   // Daily is the sole equal-kit board — force the passive off. (Trials is Armory-on: startTrials applies the full kit, doctrine included.)
    this.started = true
    this.sfx?.resume()
    this.sfx?.startMusic(this.levels()[this.level - 1]?.theme ?? 'streets')
    this.titleUI.forEach((o) => o.destroy())
    this.titleUI = []
    this.titleNav = []; this.titleRing = undefined; this.titleNavActive = false
    // The gate has its OWN flag: a first-ever Daily (which burns apex_coached via the legacy card) must
    // not suppress the campaign DROP IN gate.
    const firstRun = (() => { try { return localStorage.getItem('apex_dropin') !== '1' } catch { return true } })()
    if (firstRun && this.isBaseCampaign()) {
      this.startCoachGate()   // FIRST RUN: hold the sim paused behind a readable controls card until the player DROPS IN — no teaching mid-combat
    } else {
      this.physics.resume()
      const d = this.levels()[this.level - 1]
      this.showBanner('SECTOR 1', d?.name || '')
      this.showFirstRunCoach()   // no-op once coached; the older inline card still covers a first-run non-campaign start
    }
    this.setBridge('playing')
  }

  // FIRST-RUN DROP IN gate — the game's one controls teach used to fire 1.5s into live combat and
  // collide with pickup/tip pop-ups; this shows it in calm air (sim paused) and only starts the fight
  // once the player acknowledges. Once-ever, gated on apex_coached.
  private startCoachGate() {
    this.coachGate = true
    // flags are burned in endCoachGate (on actual drop-in), not here — closing the tab behind the modal
    // must not silently spend the tutorial.
    const touch = this.sys.game.device.input.touch
    const lines = touch
      ? ['LEFT side — drag to move & aim', 'RIGHT side — FIRE · JUMP · DASH', 'grab ◆ pods · reach the sector boss']
      : ['MOVE  A / D   ( or ◄ ► )', 'JUMP  W / ▲   — tap again to double-jump', 'AIM   hold ▲ / ▼ while you FIRE', 'FIRE  SPACE (hold)       SWAP  Q', 'DASH  SHIFT — i-frames, and DEFLECT bolts back']
    const els: Phaser.GameObjects.GameObject[] = []
    els.push(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.86).setScrollFactor(0).setDepth(240).setInteractive())
    // Premise HEADLINE — read first. It used to be a 9px afterthought wedged under the CONTROLS label, so a
    // first-timer learned keys but never what the game IS; now it leads and CONTROLS is a sub-caption. (round-11 onboarding#2)
    els.push(this.add.text(256, 86, 'Fight to the extraction. Drop the guardian. Get out.', { fontFamily: 'monospace', fontSize: '12px', color: '#fde68a', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    els.push(this.add.text(256, 112, '▸ CONTROLS ◂', { fontFamily: 'monospace', fontSize: '10px', color: '#22d3ee', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    lines.forEach((ln, i) => els.push(this.add.text(256, 132 + i * 20, ln, { fontFamily: 'monospace', fontSize: touch ? '11px' : '10px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(241)))
    const prompt = this.add.text(256, 262, '▶  DROP IN', { fontFamily: 'monospace', fontSize: '15px', color: '#0a0612', fontStyle: 'bold', backgroundColor: '#22d3ee', padding: { x: 18, y: 7 } }).setOrigin(0.5).setScrollFactor(0).setDepth(241).setInteractive({ useHandCursor: true })
    els.push(prompt)
    els.push(this.add.text(256, 298, 'press any key · tap · or a gamepad button to begin', { fontFamily: 'monospace', fontSize: '8px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(241))
    this.coachGateUI = els
    this.tweens.add({ targets: prompt, alpha: 0.55, duration: 620, yoyo: true, repeat: -1 })
    this.coachGraceUntil = this.time.now + 700   // longer beat so the title's start-mash can't blow through the card (round-11 onboarding#3)
    const drop = () => { if (this.coachGate && this.time.now >= this.coachGraceUntil) this.endCoachGate() }
    ;(els[0] as Phaser.GameObjects.Rectangle).on('pointerdown', drop)   // tap anywhere on the backdrop
    prompt.on('pointerdown', drop)
    this.coachGateKey = (e: KeyboardEvent) => { if (!e.repeat) drop() }   // ignore auto-repeat from a still-held start key — only a deliberate fresh press drops in
    this.input.keyboard!.on('keydown', this.coachGateKey)
  }

  private endCoachGate() {
    if (!this.coachGate) return
    this.coachGate = false
    this.prevStart = true   // a still-held gamepad Start that dropped us in must not read as a fresh pause edge next frame
    try { localStorage.setItem('apex_dropin', '1'); localStorage.setItem('apex_coached', '1') } catch { /* storage blocked — gate shows again next run */ }
    if (this.coachGateKey) { this.input.keyboard!.off('keydown', this.coachGateKey); this.coachGateKey = undefined }
    this.coachGateUI.forEach((o) => o.destroy())
    this.coachGateUI = []
    this.physics.resume()
    const d = this.levels()[this.level - 1]
    this.showBanner('SECTOR 1', d?.name || '')
  }

  // One-time control coach on a player's first run — a control card that appears after the SECTOR
  // banner clears and fades on its own. Adapts to touch vs keyboard; remembered so it never nags again.
  private showFirstRunCoach() {
    try { if (localStorage.getItem('apex_coached') === '1') return } catch { /* storage blocked — still show the card, just don't persist that it was seen */ }
    const touch = this.sys.game.device.input.touch
    const lines = touch
      ? ['LEFT — drag to move & aim', 'RIGHT — FIRE · JUMP · DASH', 'grab ◆ pods · beat the sector boss']
      : ['MOVE  A/D ◄►      JUMP  W/▲ (double)', 'FIRE  SPACE (hold)      AIM  hold ▲/▼', 'SWAP  Q      DASH  SHIFT']
    this.time.delayedCall(1500, () => {
      if (this.gameOver || !this.started) return
      // Burn the "seen it" flag only once the card ACTUALLY renders — a fast first death (e.g. a
      // 1-heart Daily) must not silently consume the game's only controls tutorial. (round-4 BUG1)
      try { localStorage.setItem('apex_coached', '1') } catch { /* storage blocked — show again next run */ }
      const els: Phaser.GameObjects.GameObject[] = []
      els.push(this.add.rectangle(256, 214, 372, 76, 0x0a0612, 0.8).setScrollFactor(0).setDepth(190).setStrokeStyle(1, 0x22d3ee, 0.55))
      els.push(this.add.text(256, 187, '▸ CONTROLS ◂', { fontFamily: 'monospace', fontSize: '10px', color: '#22d3ee', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(191))
      lines.forEach((ln, i) => els.push(this.add.text(256, 206 + i * 15, ln, { fontFamily: 'monospace', fontSize: '9px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(191)))
      this.time.delayedCall(4600, () => this.tweens.add({ targets: els, alpha: 0, duration: 500, onComplete: () => els.forEach((o) => o.destroy()) }))
    })
  }

  private popup(x: number, y: number, text: string, color = '#e879f9') {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '11px', color }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 600, onComplete: () => t.destroy() })
  }

  update(time: number, delta: number) {
    this.routeCameras()  // route any newly-spawned objects to the right camera
    this.updateSlowmo()  // KILL-TIME: ease sim time-scales back to normal after a big beat
    this.updateHomingBullets()   // SEEKER boss bolts steer toward the player while their window is open
    this.pollGamepadInput()                                          // arm-on-input READY toast + gpdebug overlay
    if (this.coachGate) {   // FIRST-RUN DROP IN gate — sim frozen behind the controls card; any gamepad button drops in
      const gp = this.readPad()
      if (gp && this.time.now >= this.coachGraceUntil && this.anyPadButtonDown(gp.buttons)) this.endCoachGate()
      return
    }
    if (this.controlsOpen) { this.updateControlsRebind(); return }   // controls / rebind screen owns input
    if (this.contractOpen) {   // Apex Contract screen — pad ▲▼ moves the focus ring, a face button confirms THAT boon
      const gp = this.readPad()
      if (gp) {
        const ax1 = gp.axes[1] || 0
        const nav = (ax1 < -0.4 || gp.buttons[12]) ? -1 : (ax1 > 0.4 || gp.buttons[13]) ? 1 : 0
        if (nav !== 0 && this.contractNavPrev === 0) { this.contractFocus += nav; this.updateContractFocus() }  // edge-detected: one flick = one card
        this.contractNavPrev = nav
        // Confirm on a FACE button only (0-3), so the d-pad can navigate without also confirming.
        // contractPadPrev starts true (set in offerContract) to swallow the press still held from the boss kill.
        const confirm = !!(gp.buttons[0] || gp.buttons[1] || gp.buttons[2] || gp.buttons[3])
        if (confirm && !this.contractPadPrev && this.contractPicks[this.contractFocus]) this.pickContract(this.contractPicks[this.contractFocus].id)
        this.contractPadPrev = confirm
      }
      return
    }
    if (this.intelOpen) {   // INTEL codex: d-pad ◄► switches tabs, B/circle closes
      const gp = this.readPad()
      if (gp) {
        const ax = gp.axes[0] || 0
        const dir = (gp.buttons[15] || ax > 0.5) ? 1 : (gp.buttons[14] || ax < -0.5) ? -1 : 0
        if (dir !== 0 && this.intelPadPrev === 0) this.setIntelTab(this.intelTab + dir)
        this.intelPadPrev = dir
        if (gp.buttons[1]) this.closeIntel()
      }
      return
    }
    if (this.heatOpen) {   // APEX HEAT select: d-pad ◄► picks a tier, a face button plays it, B closes
      const gp = this.readPad()
      if (gp && time > this.startGraceUntil) {
        const ax = gp.axes[0] || 0
        const dir = (gp.buttons[15] || ax > 0.5) ? 1 : (gp.buttons[14] || ax < -0.5) ? -1 : 0
        if (dir !== 0 && this.heatPadPrev === 0) this.setHeatSel(this.heatSel + dir)
        this.heatPadPrev = dir
        const confirm = !!(gp.buttons[0] || gp.buttons[2] || gp.buttons[3])
        if (gp.buttons[1]) this.closeHeat()
        else if (confirm && !this.heatConfirmPrev) this.startHeat(this.heatSel)   // rising edge only
        this.heatConfirmPrev = confirm
      }
      return
    }
    if (this.leaderboardOpen) {   // LEADERBOARD: d-pad ◄► switches SCORE/SPEED tabs, B closes
      const gp = this.readPad()
      if (gp) {
        const ax = gp.axes[0] || 0
        const dir = (gp.buttons[15] || ax > 0.5) ? 1 : (gp.buttons[14] || ax < -0.5) ? -1 : 0
        if (dir !== 0 && this.lbPadPrev === 0) this.setLbTab(this.lbTab + dir)
        this.lbPadPrev = dir
        if (gp.buttons[1]) this.closeLeaderboard()
      }
      return
    }
    if (this.loadoutOpen) {   // STRIKE DOCTRINE picker: d-pad ◄► browses, a face button selects, B closes
      const gp = this.readPad()
      if (gp && time > this.startGraceUntil) {
        const ax = gp.axes[0] || 0
        const dir = (gp.buttons[15] || ax > 0.5) ? 1 : (gp.buttons[14] || ax < -0.5) ? -1 : 0
        if (dir !== 0 && this.loadoutPadPrev === 0) this.setLoadoutSel(this.loadoutSel + dir)
        this.loadoutPadPrev = dir
        const confirm = !!(gp.buttons[0] || gp.buttons[2] || gp.buttons[3])
        if (gp.buttons[1]) this.closeLoadout()
        else if (confirm && !this.loadoutConfirmPrev) this.selectFocusedDoctrine()   // rising edge only — holding the button must not re-select + rebuild every frame
        this.loadoutConfirmPrev = confirm
      }
      return
    }
    if (this.rankOpen) {   // APEX RANK: a face button ENLISTs banked shards, B closes
      const gp = this.readPad()
      if (gp && time > this.startGraceUntil) {
        const confirm = !!(gp.buttons[0] || gp.buttons[2] || gp.buttons[3])
        if (gp.buttons[1]) this.closeRank()
        else if (confirm && !this.rankPadPrev) this.enlistNow()   // rising edge only
        this.rankPadPrev = confirm
      }
      return
    }
    if (this.armoryOpen || this.dailyOpen || this.trialsOpen || this.badgesOpen) return   // a menu screen owns input (pointer-driven)
    if (this.gameOver) {
      // Restart on any gamepad button (tap/click/key handled by listeners set at game over).
      const gp = this.readPad()
      if (gp && time > this.gameOverAt + 400 && this.anyPadButtonDown(gp.buttons)) this.restartRun()
      return
    }
    if (!this.started) {
      if (this.seasonCardOpen) {   // the season rollover ceremony owns pad input on the title: a button DISMISSES it, never starts a run (round-12 bug#1)
        const gpc = this.readPad()
        if (gpc && time > this.startGraceUntil && this.anyPadButtonDown(gpc.buttons)) this.closeSeasonRollover()
        return
      }
      const gp = this.readPad()
      if (gp && time > this.startGraceUntil) {
        // D-pad / stick drives the focus ring (bug#5). Before you navigate, any button starts (classic).
        const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0
        const nav = (gp.buttons[13] || gp.buttons[15] || ay > 0.5 || ax > 0.5) ? 1
          : (gp.buttons[12] || gp.buttons[14] || ay < -0.5 || ax < -0.5) ? -1 : 0
        if (nav !== 0 && this.titleNavPrev === 0) this.titleNavMove(nav)
        this.titleNavPrev = nav
        if (!this.titleNavActive) {
          if (nav === 0 && this.anyPadButtonDown(gp.buttons)) this.beginPlay()
        } else {
          const confirm = !!(gp.buttons[0] || gp.buttons[1] || gp.buttons[2] || gp.buttons[3])
          if (confirm && !this.titleConfirmPrev) this.titleActivate()
          this.titleConfirmPrev = confirm
        }
      }
      return
    }
    // Gamepad pause button toggles pause (edge-detected) — polled even while paused.
    const spad = this.readPad()
    const startNow = !!(spad && spad.buttons[this.padBinds.pause])
    if (startNow && !this.prevStart) this.togglePause()
    this.prevStart = startNow
    if (this.userPaused) return
    if (this.levelTransition || !this.player?.active) return
    if (this.bossRef) this.updateBossBar()
    const bossNow = !!(this.bossRef && this.bossRef.active)   // swell the music while a boss holds the field
    if (bossNow !== this.bossMusicOn) { this.bossMusicOn = bossNow; this.sfx?.setMusicIntensity(bossNow) }
    // Adaptive music heat (throttled): the bed's lowpass opens + the drone swells with on-field pressure.
    if (time >= this.musicHeatAt) {
      this.musicHeatAt = time + 400
      const n = this.enemies.countActive(true)
      this.sfx?.setMusicHeat(bossNow ? 3 : n >= 6 ? 2 : n >= 1 ? 1 : 0)
    }
    this.updateCompass()
    this.updateProgress()

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const landed = !this.prevOnGround && body.blocked.down
    this.onGround = body.blocked.down
    if (this.onGround) {
      this.lastGroundAt = time
      this.jumpsLeft = this.maxJumps
      if (this.player.y < this.levelH) { this.lastGroundX = this.player.x; this.lastGroundY = this.player.y }
    }
    if (landed && this.fallSpeed > 380) { this.landingDust(this.fallSpeed); this.squashX = 1.2; this.squashY = 0.8 }   // squash short+wide on impact
    if (landed && this.airborneT > 170) this.landRecoverUntil = time + 100   // brief crouch after a real jump/fall
    this.prevOnGround = this.onGround
    if (!this.onGround) { this.fallSpeed = body.velocity.y; this.airborneT += delta } else this.airborneT = 0
    this.drawShadows()
    this.drawPoiseBars()   // STAGGER poise meters (above enemies under fire)

    // Dynamic camera: lead the direction you're running (so threats ahead are on-screen, not just to
    // the right) and dip briefly on a hard landing for weight. Lerped so a turn glides, never snaps.
    if (body.velocity.x > 40) this.camLookTarget = -140
    else if (body.velocity.x < -40) this.camLookTarget = 140
    this.camLookX += (this.camLookTarget - this.camLookX) * 0.05
    if (landed && this.fallSpeed > 380) this.camDip = Math.min(22, this.fallSpeed * 0.03)
    this.camDip *= 0.86
    this.recoilX *= 0.72; this.recoilY *= 0.72   // weapon recoil kick decays back to rest
    this.cameras.main.setFollowOffset(this.camLookX + this.recoilX, 24 + this.camDip + this.recoilY)

    // Fell into a pit (below the content floor)
    if (this.player.y > this.levelH + 150) { this.pitFall(); return }

    // Parallax — both axes for the 2D world
    const cx = this.cameras.main.scrollX, cy = this.cameras.main.scrollY
    this.bgStars.tilePositionX = cx * 0.1; this.bgStars.tilePositionY = cy * 0.05
    this.bgFar.tilePositionX = cx * 0.22; this.bgFar.tilePositionY = cy * 0.1
    this.bgMid.tilePositionX = cx * 0.45; this.bgMid.tilePositionY = cy * 0.2

    // Low-health heartbeat — thump on a cadence that quickens when critical. Driven here so
    // it naturally falls silent while paused / on game-over / mid-transition (all early-return above).
    if (this.health > 0 && this.health <= 2) {
      this.heartT -= delta
      if (this.heartT <= 0) { const fast = this.health <= 1; this.sfx?.heartbeat(fast); this.heartT = fast ? 820 : 1180 }
    } else this.heartT = 0

    // i-frame blink — flicker the player while invulnerable, snap back to solid when it ends.
    if (this.player.active) {
      if (time < this.invulnUntil) this.player.setAlpha((time % 120) < 60 ? 1 : 0.4)
      else if (this.player.alpha !== 1) this.player.setAlpha(1)
    }

    if (this.combo > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) { this.combo = 0; this.comboText.setText('').setAlpha(1) }
      else this.comboText.setAlpha(this.comboTimer < 500 ? 0.3 + 0.7 * (this.comboTimer / 500) : 1)   // fade as the window closes
    }

    // Pose: land-recover → jump (airborne) → crouch (down) → run (2-frame bound) → ready.
    if (this.textures.exists('huntress')) {
      const moving = Math.abs(body.velocity.x) > 24
      let key = 'huntress'
      if (time < this.landRecoverUntil && this.textures.exists('huntress_crouch')) key = 'huntress_crouch'
      else if (!this.onGround && this.textures.exists('huntress_jump')) key = 'huntress_jump'
      else if (this.prone && this.textures.exists('huntress_crouch')) key = 'huntress_crouch'
      else if (moving && this.textures.exists('huntress_run')) {
        // Bounding run: alternate the extended lunge and the gathered frame (the
        // height difference between them reads as a natural running bob).
        this.runFrameT += delta
        if (this.runFrameT > 115) { this.runFrameT = 0; this.runFrame ^= 1 }
        key = (this.runFrame === 1 && this.textures.exists('huntress_run2')) ? 'huntress_run2' : 'huntress_run'
      } else { this.runFrame = 0; this.runFrameT = 0 }
      if (this.player.texture.key !== key) { this.player.setTexture(key); this.sizePlayer() }
      // Squash & stretch (visual weight): ease the transient multipliers back to rest, then apply
      // over the captured base scale. A fixed-size body is re-asserted right after so the hitbox
      // never breathes with the visual deform (collision stays exactly what sizePlayer set).
      if (this.reduceMotion) { this.squashX = 1; this.squashY = 1 }
      else { this.squashX += (1 - this.squashX) * 0.16; this.squashY += (1 - this.squashY) * 0.16 }
      this.player.setScale(this.baseSX * this.squashX, this.baseSY * this.squashY)
    }

    // Mid-sector CHECKPOINT — a decoupled "first win" ~halfway to extraction, so a run that dies before
    // the far-right guardian still banks a felt milestone (the biggest lever on starting run 2). Pure
    // celebration (toast + fanfare); no reward, so it can't touch difficulty or the score economy.
    if (!this.midSecured && !this.isBossLevel() && this.goalX > 0 && this.player.x > 120 + (this.goalX - 120) * 0.5) {
      this.midSecured = true
      this.screenToast('✓ AREA SECURED  ·  push to extraction', '#4ade80', 100)
      this.sfx?.fanfare()
    }

    // Spawn the stage guardian as the player nears the exit — a proper end-of-stage fight.
    if (this.pendingEndBoss && !this.endBossSpawned && this.player.x > this.goalX - 900) {
      const eb = this.pendingEndBoss
      this.endBossSpawned = true
      this.bossPhase = 1
      this.nextBossLabel = eb.label
      this.nextBossKind = eb.kind
      this.spawnEnemy('boss', eb.x, eb.y, eb.hp, eb.speed)   // roar + shake fire inside spawnEnemy now
      this.screenToast('⚠ GUARDIAN  ·  ' + eb.label, '#f43f5e', 110)
      this.tipOnce('dash', 'PHASE STRIKE — DASH clean THROUGH a foe\nto gut it. Your dodge is also your finisher.', '#22d3ee')
    }

    // Reached the extraction point? Boss stages clear by kill-all; guardian stages stay
    // locked until the guardian falls.
    if (!this.isBossLevel()) {
      const dx = this.player.x - this.goalX, dy = this.player.y - this.goalY
      if (dx * dx + dy * dy < 70 * 70) {
        if (this.extractionLocked) {
          if (time > this.lockHintAt) { this.lockHintAt = time + 1600; this.screenToast('EXTRACTION LOCKED — DEFEAT THE GUARDIAN', '#fbbf24', 118) }
        } else { this.onLevelClear(); return }
      }
    }

    this.handleInput(time)
    this.updateMovers(delta)
    this.updateEnemies(delta)
    this.updateBurns()   // FIRE damage-over-time: drain burn stacks laid down by fire rounds
    this.updateDeflect() // COUNTER-DASH: dash i-frames catch incoming bolts and whip them back
    this.updateGraze()   // RAZOR GRAZE: reward enemy bolts that shave past without hitting
    this.maybeSpawnReinforcements(delta)
  }

  // RAZOR GRAZE — dodging by inches is now the high-value play. An enemy bolt that shaves just past
  // your hitbox (a thin band outside it) scores + tops up the combo timer, so tight threading sustains
  // a kill-chain through a bullet curtain. Each bolt grazes once; the flag clears when it's retired so
  // a pooled bolt is fresh on reuse.
  private updateGraze() {
    const pb = this.player?.body as Phaser.Physics.Arcade.Body | undefined
    if (!pb || this.time.now < this.invulnUntil || this.time.now < this.dashIframeUntil) return   // no "graze" while already i-framed — hit-invuln OR a dash (grazing rewards shaving a bolt UNPROTECTED)
    const pcx = pb.center.x, pcy = pb.center.y
    const hitR = Math.max(pb.halfWidth, pb.halfHeight)
    const inner = hitR + 6, outer = hitR + 24               // the graze band, just outside the hitbox
    this.enemyBullets.getChildren().forEach((obj) => {
      const b = obj as Phaser.Physics.Arcade.Image
      if (!b.active) { if (b.getData('grazed')) b.setData('grazed', false); if (b.getData('deflected')) b.setData('deflected', false); return }   // fresh on reuse (graze + deflect flags)
      if (b.getData('grazed')) return
      const dx = b.x - pcx, dy = b.y - pcy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d <= inner || d >= outer) return
      b.setData('grazed', true)
      this.grazeCount++
      this.tipOnce('graze', 'RAZOR GRAZE — shaving a bolt scores\n+ keeps your combo alive', '#a5f3fc')
      this.score += 5; this.scoreText.setText('SCORE  ' + this.score)
      if (this.combo > 0) this.comboTimer = Math.min(2400, this.comboTimer + 420)   // tight dodging sustains a chain
      this.particles.emitParticleAt(b.x, b.y, 2)
      this.shockwave(b.x, b.y, 0x93c5fd, 8)   // a small cyan flare on the shaved bolt so a single near-miss reads (visual only — payout unchanged) (round-11 combat#5)
      this.sfx?.graze(this.panAt(b.x))
      if (this.grazeCount % 8 === 0) { this.popup(pcx, pcy - 34, 'GRAZE ×' + this.grazeCount, '#a5f3fc'); this.slowmo(0.85, 60) }
    })
  }

  // COUNTER-DASH DEFLECT — the dash is already an i-frame dodge; timing it INTO fire now turns that
  // fire back on the shooter. Any enemy bolt caught in the immediate threat zone during dash i-frames is
  // retired and re-fired as a player bolt at the nearest foe — so it flows through the normal
  // bullet→enemy path and inherits damage, PUNISH, combo and drops for free. Capped per dash so one dash
  // can't erase a whole curtain; a clean deflect tops up the combo timer like a graze.
  private updateDeflect() {
    if (this.time.now >= this.dashIframeUntil || this.dashDeflects >= 3) return   // only mid-dash, and only up to the per-dash budget
    const pb = this.player?.body as Phaser.Physics.Arcade.Body | undefined
    if (!pb) return
    const pcx = pb.center.x, pcy = pb.center.y
    const catchR = Math.max(pb.halfWidth, pb.halfHeight) + 16   // the imminent-impact zone the dash is phasing through
    this.enemyBullets.getChildren().forEach((obj) => {
      if (this.dashDeflects >= 3) return
      const bolt = obj as Phaser.Physics.Arcade.Image
      if (!bolt.active || bolt.getData('deflected')) return
      const dx = bolt.x - pcx, dy = bolt.y - pcy
      if (dx * dx + dy * dy > catchR * catchR) return
      // CATCH: retire the incoming bolt, then whip a counter-shot at the nearest live enemy (or, if the
      // room is empty, straight along the dash line).
      bolt.setData('deflected', true)
      bolt.setActive(false).setVisible(false)
      this.dashDeflects++
      this.deflectCount++
      let tx = pcx + this.dashDir * 400, ty = pcy, best = Infinity
      this.enemies.getChildren().forEach((o) => {
        const en = o as Phaser.Physics.Arcade.Sprite
        if (!en.active || en.getData('dying') === true) return
        const dd = (en.x - pcx) * (en.x - pcx) + (en.y - pcy) * (en.y - pcy)
        if (dd < best) { best = dd; tx = en.x; ty = en.y }
      })
      const cb = this.bullets.get(pcx, pcy, 'bullet') as Phaser.Physics.Arcade.Image
      if (cb) {
        cb.setActive(true).setVisible(true); cb.setScale(0.7); cb.setDepth(20)
        cb.body?.reset(pcx, pcy)
        ;(cb.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
        cb.setData('pierce', 0); cb.setData('hit', null)   // a normal single-contact bolt on the bullet×enemy overlap
        const ang = Math.atan2(ty - pcy, tx - pcx)
        cb.setVelocity(Math.cos(ang) * 900, Math.sin(ang) * 900)
        cb.setRotation(ang)
        this.time.delayedCall(1400, () => { if (cb.active) cb.setActive(false).setVisible(false) })
      }
      this.shockwave(bolt.x, bolt.y, 0x93c5fd, 16)
      this.popup(bolt.x, bolt.y - 20, 'DEFLECT', '#93c5fd')
      this.sfx?.deflect(this.panAt(bolt.x))
      if (this.combo > 0) this.comboTimer = Math.min(2400, this.comboTimer + 300)   // a clean deflect sustains the chain
      this.tipOnce('deflect', 'DASH into fire to DEFLECT it —\nthe bolt snaps back at your attacker', '#93c5fd')
      if (this.deflectCount % 5 === 0) { this.popup(pcx, pcy - 34, 'DEFLECT ×' + this.deflectCount, '#93c5fd'); this.slowmo(0.8, 70) }
    })
  }

  // FIRE ignites what it hits: embers keep ticking damage for a beat after the round lands, so
  // FIRE trades a lighter per-shot punch for sustained pressure (strong on tanks/bosses you keep
  // painting). hitEnemy tops up the stack (capped); this drains one tick per ~300ms and routes a
  // burn-death through the normal kill path (combo, drops, boss finisher all intact).
  private updateBurns() {
    const now = this.time.now
    const toKill: Phaser.Physics.Arcade.Sprite[] = []
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite
      if (!e.active || e.getData('dying')) return
      const ticks = (e.getData('burnTicks') as number) || 0
      if (ticks <= 0 || now < ((e.getData('burnNext') as number) || 0)) return
      e.setData('burnTicks', ticks - 1)
      e.setData('burnNext', now + 300)
      this.particles.emitParticleAt(e.x + Phaser.Math.Between(-9, 9), e.y + Phaser.Math.Between(-14, 6), 2)   // ember lick
      const hp = ((e.getData('hp') as number) || 0) - 1
      e.setData('hp', hp)
      if (hp <= 0) { toKill.push(e); return }
      e.setTintFill(0xff7a1a)
      this.time.delayedCall(70, () => this.restoreTint(e))
    })
    // Kill AFTER the walk so killEnemy's group mutations (splitter fission, destroy) never race the iterator.
    toKill.forEach((e) => { if (e.active && !e.getData('dying')) this.killEnemy(e) })
  }

  // Sine-driven moving platforms. Static bodies don't impart motion, so we
  // reposition each one and manually carry the player. "Riding" is detected by
  // foot proximity + not-jumping (NOT blocked.down, which flickers when a
  // descending platform opens a gap under the feet). Each riding frame we snap
  // the feet to the new surface and kill downward velocity → locked-in lifts,
  // no jitter, no fall-through, and stepping off never launches you.
  private updateMovers(delta: number) {
    if (this.movers.getLength() === 0) return
    const pb = this.player?.body as Phaser.Physics.Arcade.Body | undefined
    this.movers.getChildren().forEach((c) => {
      const m = c as Phaser.Physics.Arcade.Sprite
      const mb = m.body as Phaser.Physics.Arcade.StaticBody
      const axis = m.getData('axis') as string
      const home = m.getData('home') as number
      const dist = m.getData('dist') as number
      const spd = m.getData('spd') as number
      const t = (m.getData('t') as number) + delta * 0.001 * spd
      m.setData('t', t)
      const prevX = m.x, prevY = m.y
      // Riding = feet near this platform's (pre-move) top, over it in x, and not
      // launching upward. Wider than a blocked.down check so descents stay glued.
      const feetGap = pb ? pb.bottom - mb.top : 999
      const riding = !!pb && pb.velocity.y > -30 &&
        feetGap > -12 && feetGap < 10 &&
        pb.right > mb.left + 3 && pb.left < mb.right - 3
      const off = Math.sin(t) * dist
      if (axis === 'v') m.y = home + off; else m.x = home + off
      const dx = m.x - prevX, dy = m.y - prevY
      mb.updateFromGameObject()
      const riders = m.getData('rider') as Array<{ x: number; y: number }> | undefined
      if (riders) for (const r of riders) { r.x += dx; r.y += dy }
      if (riding && pb) {
        if (dx) this.player.x += dx
        // Snap feet exactly onto the new surface (handles up + down identically).
        this.player.y += mb.top - pb.bottom
        if (pb.velocity.y > 0) pb.setVelocityY(0)
      }
    })
  }

  // Launch pad: land on top → spring high and refresh air-jumps. Guarded so a
  // side-brush doesn't fire, and rate-limited so one contact pops just once.
  private bounce(pad: Phaser.Physics.Arcade.Sprite) {
    const pb = this.player.body as Phaser.Physics.Arcade.Body
    if (pb.velocity.y < -20) return                       // already rising — not a landing
    const padTop = (pad.body as Phaser.Physics.Arcade.StaticBody).top
    if (pb.bottom > padTop + 18) return                   // must contact near the top face
    const now = this.time.now
    if (now - (pad.getData('lastPop') as number) < 250) return
    pad.setData('lastPop', now)
    pb.setVelocityY(-820)                                 // double-jump apex is ~ -560; this clears higher
    this.jumpsLeft = this.maxJumps                            // give the air-jumps back after a launch
    this.sfx?.jump()
    const sy = (pad.getData('sy') as number) || pad.scaleY
    this.tweens.killTweensOf(pad)
    pad.scaleY = sy * 0.55                                // squash, then spring back
    this.tweens.add({ targets: pad, scaleY: sy, duration: 200, ease: 'Back.out' })
    this.particles?.emitParticleAt(this.player.x, padTop, 8)
  }

  // A safe pit/death respawn x: set back from the ledge onto the SOLID segment the
  // player fell from (or the nearest solid ground to its left if they fell off a mover),
  // clamped inside it and nudged clear of any wall — so you don't drop straight back
  // into the pit or land wedged behind an obstacle.
  private safeRespawnX(): number {
    const def = this.levels()[this.level - 1]
    const from = this.lastGroundX
    if (!def || !def.ground.length) return from
    const on = def.ground.find(([x1, x2]) => from >= x1 - 8 && from <= x2 + 8)
    const seg = on
      || [...def.ground].filter(([, x2]) => x2 <= from + 40).sort((a, b) => b[1] - a[1])[0]
      || def.ground[0]
    const [x1, x2] = seg
    const MARGIN = 64
    let x = (x2 - x1 < 2 * MARGIN) ? (x1 + x2) / 2 : Phaser.Math.Clamp(from - MARGIN, x1 + 30, x2 - 30)
    for (const wl of def.walls) {                       // slide out of any solid wall span
      const l = wl[0] - wl[2] / 2, r = wl[0] + wl[2] / 2
      if (x > l - 16 && x < r + 16) x = Phaser.Math.Clamp(l - 26, x1 + 24, x2 - 24)
    }
    return x
  }

  // Playtest telemetry — log where the player was taken out + what did it, so the dev
  // dashboard can map difficulty hot-spots across everyone's runs.
  private recordDeath(cause: DeathCause, x: number, y: number, killer?: string) {
    this.deathsThisRun++
    const def = this.levels()[this.level - 1]
    const { sid, rid } = currentIds()
    recordTelemetry({
      t: 'death', sid, rid, ts: Date.now(), lvl: this.level, lvlName: def?.name || '?',
      x: Math.round(x), y: Math.round(y), cause, killer, weapon: this.weapon,
      score: this.score, livesLeft: this.lives, elapsed: Date.now() - this.runStartAt,
    })
  }

  private recordRun(outcome: 'gameover' | 'win') {
    const { sid, rid } = currentIds()
    recordTelemetry({
      t: 'run', sid, rid, ts: Date.now(), outcome, levelReached: this.level,
      score: this.score, durationMs: Date.now() - this.runStartAt, deaths: this.deathsThisRun,
    })
  }

  private pitFall() {
    if (this.gameOver || this.levelTransition) return
    this.player.setVelocity(0, 0)
    this.player.setPosition(this.safeRespawnX(), this.lastGroundY - 48)
    this.fxShake(180, 0.02)
    this.fxFlash(120, 120, 40, 200, false)
    this.sfx?.hurt()
    this.health -= 2
    this.runNoHit = false
    this.combo = 0; this.comboText.setText('')
    this.updateHealth()
    this.invulnUntil = this.time.now + 700
    this.player.setTint(0xff3060)
    this.time.delayedCall(200, () => { if (this.player.active) this.player.clearTint() })   // brief hit flash (i-frames run on the timestamp)
    if (this.health <= 0) {
      this.lives -= 1; this.livesText.setText('LIVES  ' + this.lives)
      this.recordDeath('pit', this.lastGroundX, this.lastGroundY)   // hot-spot = the ledge they fell from
      if (this.lives <= 0) this.triggerGameOver()
      else {
        this.health = this.maxHealth; this.updateHealth(); this.jumpsLeft = this.maxJumps
        this.invulnUntil = this.time.now + 1300
        this.player.clearTint()
      }
    }
  }

  private maybeSpawnReinforcements(delta: number) {
    if (this.isBossLevel()) return
    this.spawnTimer += delta
    // Slower cadence + a lower active cap so the screen doesn't fill with shooters.
    const interval = 4200 - this.level * 200
    if (this.spawnTimer > interval && this.enemies.countActive(true) < 8 + this.level) {
      this.spawnTimer = 0
      const camX = this.cameras.main.scrollX
      const camTop = this.cameras.main.scrollY
      // Reinforcements push in from AHEAD (the way you're driving), not out of the
      // space you already cleared. A grunt occasionally flanks from behind, but
      // flyers only ever come from the front — no more "shot at from all over".
      const fromAhead = Math.random() < 0.82
      const side = Phaser.Math.Clamp(fromAhead ? camX + 540 : camX - 20, 40, this.levelW - 40)
      if (fromAhead && this.level >= 4 && Math.random() < 0.2) {
        // Splitter pod: floats in, bursts into two ground minis on death — sudden crowd pressure.
        this.spawnEnemy('splitter', side, Phaser.Math.Clamp(camTop + Phaser.Math.Between(70, 210), 40, this.levelH), 4 + Math.floor(this.level / 2), 42 + this.level * 4)
      } else if (fromAhead && this.level >= 3 && Math.random() < 0.2) {
        // Sapper: a ground mortar unit that marks the floor under you then detonates it — keep moving.
        this.spawnEnemy('sapper', this.groundedSpawnX(side), 540, 5 + this.level, 42)
      } else if (fromAhead && this.level >= 3 && Math.random() < 0.22) {
        // Shielder reinforcement: a slow frontal-shield bruiser you must out-position.
        this.spawnEnemy('soldier', this.groundedSpawnX(side), 540, 7 + this.level, 34, 'shielder')
      } else if (fromAhead && this.level >= 2 && Math.random() < 0.28) {
        // Sniper reinforcement: a stationary long-range shooter that holds ground ahead of the run.
        this.spawnEnemy('soldier', this.groundedSpawnX(side), 540, 3 + Math.floor(this.level / 2), 40, 'sniper')
      } else if (fromAhead && Math.random() < 0.3) {
        this.spawnEnemy('flyer', side, Phaser.Math.Clamp(camTop + Phaser.Math.Between(80, 240), 40, this.levelH), 2 + Math.floor(this.level / 2), 48 + this.level * 6)
      } else {
        // Ground reinforcements walk in near ground level on SOLID ground — never spawn
        // over a pit and drop straight in.
        this.spawnEnemy('soldier', this.groundedSpawnX(side), 540, 2 + Math.floor(this.level / 2), 55 + this.level * 8, 'walker')
      }
    }
  }

  // Nearest x that sits over a solid ground segment (so dropped-in enemies land on ground).
  private groundedSpawnX(x: number): number {
    const def = this.levels()[this.level - 1]
    if (!def || !def.ground.length) return x
    if (def.ground.some(([x1, x2]) => x >= x1 + 24 && x <= x2 - 24)) return x
    let best = x, bestD = Infinity
    for (const [x1, x2] of def.ground) {
      const cx = Phaser.Math.Clamp(x, x1 + 24, x2 - 24)
      const d = Math.abs(cx - x)
      if (d < bestD) { bestD = d; best = cx }
    }
    return best
  }

  private handleInput(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body

    let left = this.cursors.left.isDown || this.wasd.left.isDown || this.touch.left
    let right = this.cursors.right.isDown || this.wasd.right.isDown || this.touch.right
    let shoot = this.spaceKey.isDown || this.touch.shoot
    let jump = this.cursors.up.isDown || this.wasd.up.isDown || this.touch.jump
    this.aimUp = this.touch.up || this.cursors.up.isDown || this.wasd.up.isDown
    this.aimDown = this.wasd.down.isDown || this.cursors.down.isDown || this.touch.down

    // DOM gutter controls (off-canvas buttons) — native multi-touch, ORed in like any source.
    const dpad = (window as unknown as { __APEX?: ApexBridge }).__APEX?.pad
    if (dpad) {
      if (dpad.left) left = true
      if (dpad.right) right = true
      if (dpad.shoot) shoot = true
      if (dpad.jump) jump = true
      if (dpad.up) this.aimUp = true
      if (dpad.down) this.aimDown = true
    }

    const pad = this.readPad()
    if (pad) {
      const ax0 = pad.axes[0] || 0, ax1 = pad.axes[1] || 0
      // Move + aim: left stick OR d-pad buttons (standard indices 12–15) — tolerant.
      if (ax0 < -0.3 || pad.buttons[14]) left = true
      if (ax0 > 0.3 || pad.buttons[15]) right = true
      if (ax1 < -0.3 || pad.buttons[12]) this.aimUp = true
      if (ax1 > 0.3 || pad.buttons[13]) this.aimDown = true
      // Action buttons go through the remap table (press-to-bind, persisted).
      if (pad.buttons[this.padBinds.fire]) shoot = true
      if (pad.buttons[this.padBinds.jump]) jump = true
      const yNow = !!pad.buttons[this.padBinds.swap]  // edge-triggered so a held button swaps once
      if (yNow && !this.padSwapPrev) this.swapWeapon()
      this.padSwapPrev = yNow
    }

    this.movingH = left || right
    this.prone = this.onGround && this.aimDown && !this.movingH

    // --- Horizontal: acceleration + drag, with snappy reverse ---
    const accel = this.onGround ? ACCEL : AIR_ACCEL
    if (this.movingH && !this.prone) {
      if (left) {
        const reversing = body.velocity.x > 0
        this.player.setAccelerationX(reversing ? -accel * 2 : -accel)
        this.facingRight = false; this.player.setFlipX(true)
        if (this.onGround && reversing && body.velocity.x > 180 && time > this.skidUntil) { this.skidUntil = time + 260; this.skidDust() }
      } else {
        const reversing = body.velocity.x < 0
        this.player.setAccelerationX(reversing ? accel * 2 : accel)
        this.facingRight = true; this.player.setFlipX(false)
        if (this.onGround && reversing && body.velocity.x < -180 && time > this.skidUntil) { this.skidUntil = time + 260; this.skidDust() }
      }
    } else {
      this.player.setAccelerationX(0)
      this.player.setDragX(DRAG)
    }

    // --- Phase Dash — a dodge burst EVERYONE has from run one; the Armory PHASE DASH tiers only
    // sharpen it (longer i-frames, shorter cooldown, harder Phase Strike). Overrides horizontal.
    {
      const dashHeld = this.dashKey.isDown || !!this.touch.dash || !!(dpad && dpad.dash) || !!(pad && pad.buttons[this.padBinds.dash])
      if (dashHeld && !this.prevDash && time > this.dashCdUntil && !this.prone) {
        const dir = left ? -1 : right ? 1 : (this.facingRight ? 1 : -1)
        this.dashDir = dir
        this.dashUntil = time + 175
        this.dashHitList = []                 // fresh dedupe list per dash (PHASE STRIKE)
        this.dashDeflects = 0                 // fresh deflect budget per dash (COUNTER-DASH)
        this.dashCdUntil = time + this.dashCd
        this.dashIframeUntil = Math.max(this.dashUntil, time + (this.dashLevel >= 2 ? 220 : this.dashLevel >= 1 ? 195 : 175))   // i-frames always cover the full dash (dashUntil=175) AND still progress per PHASE DASH tier (175/195/220), so tier 1 isn't a no-op
        this.facingRight = dir > 0; this.player.setFlipX(dir < 0)
        if (this.relics.has('gale')) this.jumpsLeft = this.maxJumps   // GALE relic — a dash refunds your air-jumps (aggressive aerial play)
        this.dashFx()
        this.sfx?.jump()
      } else if (dashHeld && !this.prevDash && !this.prone) {
        // Pressed while still on cooldown — acknowledge the denied input (a red gauge flash + a muted
        // blip) so a dash that can't fire yet never reads as the game dropping the press. (round-11 combat#1)
        this.dashDeniedAt = time
        this.sfx?.dashDenied()
      }
      this.prevDash = dashHeld
      this.updateDashGauge(time)
    }
    if (time < this.dashUntil) {
      this.player.setAccelerationX(0)
      body.setVelocityX(this.dashDir * DASH_SPEED)
    }

    // --- Jump: coyote time + input buffering + variable height + double jump ---
    if (!this.onGround && time - this.lastGroundAt > COYOTE && this.jumpsLeft > this.maxJumps - 1) this.jumpsLeft = this.maxJumps - 1
    if (jump && !this.prevJump) this.jumpBufferAt = time
    if (time - this.jumpBufferAt < BUFFER && this.jumpsLeft > 0) {
      this.player.setVelocityY(JUMP_V)
      this.squashX = 0.84; this.squashY = 1.18   // stretch tall+thin off the ground
      this.jumpsLeft--; this.isJumping = true; this.jumpBufferAt = -9999
      this.sfx?.jump()
    }
    if (this.isJumping && !jump && body.velocity.y < SHORT_HOP) this.player.setVelocityY(SHORT_HOP)
    if (body.velocity.y >= 0) this.isJumping = false
    this.prevJump = jump

    // Asymmetric gravity: fall faster than you rise (snap)
    body.setGravityY(body.velocity.y > 0 ? FALL_BOOST : 0)

    if (shoot && time > this.lastFired) {
      this.fire()
      let rate = this.fireRate
      if (this.weapon === 'rapid') rate = 40
      else if (this.weapon === 'laser') rate = 70
      else if (this.weapon === 'spread') rate = 90
      else if (this.weapon === 'fire') rate = 85
      else if (this.weapon === 'arc') rate = 560   // heavy launcher — slow, deliberate lobs
      rate = Math.max(20, rate - this.fireBonus - (this.weaponLvl[this.weapon] || 0) * 10)   // Armory FIREPOWER + weapon mastery speed up fire
      if (this.doctrinePassive === 'rampage') rate = Math.max(18, rate - Math.min(34, this.combo * 2))   // GUNSLINGER: fire rate climbs with combo
      if (this.relics.has('momentum') && this.time.now < this.momentumUntil) rate = Math.max(16, Math.round(rate * 0.72))   // MOMENTUM relic — a fresh kill quickens fire
      this.lastFired = time + rate
    }
  }

  private fire() {
    const dir = this.facingRight ? 1 : -1
    let angle = 0
    if (this.aimUp && !this.aimDown) angle = this.movingH ? -45 : -90
    else if (this.aimDown && !this.onGround) angle = this.movingH ? 45 : 90

    // Muzzle tracks the aim: reach the barrel out from the huntress's hands along
    // the aim angle, so the flash + bullets emanate from where you're shooting.
    const aimRad = Phaser.Math.DegToRad(angle)
    const pivotX = this.player.x + dir * 6
    const pivotY = this.prone ? this.player.y + 14 : this.player.y - 6
    const barrel = this.prone ? 30 : 34
    const baseX = pivotX + Math.cos(aimRad) * dir * barrel
    const baseY = pivotY + Math.sin(aimRad) * barrel

    const laserLvl = this.weaponLvl['laser'] || 0
    const spawn = (ang: number, tex = 'bullet', spd = 800, scale = 0.6) => {
      const b = this.bullets.get(baseX, baseY, tex) as Phaser.Physics.Arcade.Image
      if (!b) return
      b.setActive(true).setVisible(true); b.setScale(scale); b.setDepth(20)
      b.body?.reset(baseX, baseY)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)   // pooled bodies: keep them flat
      // Laser is a PIERCING beam: it passes through up to (2 + mastery) enemies instead of dying on
      // first contact. 'hit' tracks who it already struck so it can't double-tap one enemy in passing.
      const pierce = tex === 'laser' ? 2 + laserLvl + (this.doctrinePassive === 'pierce' ? 1 : 0) : 0   // LANCER doctrine: +1 pierce
      b.setData('pierce', pierce)
      b.setData('hit', pierce > 0 ? [] : null)
      const rad = Phaser.Math.DegToRad(ang)
      const isVert = ang === -90 || ang === 90
      const vx = isVert ? 0 : Math.cos(rad) * dir * spd
      const vy = Math.sin(rad) * spd
      b.setVelocity(vx, vy)
      b.setRotation(Math.atan2(vy, vx))   // bolt points where it flies
      this.time.delayedCall(1400, () => { if (b.active) b.setActive(false).setVisible(false) })   // longer reach
    }

    this.particles.emitParticleAt(baseX, baseY, 3)
    if (this.time.now - this.lastSfxShot > 55) { this.sfx?.weaponShot(this.weapon); this.lastSfxShot = this.time.now }
    this.muzzleFlash(baseX, baseY, dir, angle)
    // Weapon recoil — a per-shot camera kick opposite the muzzle, so heavy guns FEEL heavy. Gated under
    // reduced motion; heavy guns also shove the body slightly (never while dashing, so the burst is clean).
    if (!this.reduceMotion) {
      const K = this.weapon === 'laser' || this.weapon === 'fire' || this.weapon === 'arc' ? 7 : this.weapon === 'spread' ? 5 : this.weapon === 'rapid' ? 2 : 4
      this.recoilX -= dir * Math.cos(aimRad) * K
      this.recoilY -= Math.sin(aimRad) * K
      if ((this.weapon === 'laser' || this.weapon === 'fire' || this.weapon === 'arc') && this.time.now >= this.dashUntil) {
        (this.player.body as Phaser.Physics.Arcade.Body).velocity.x -= dir * 40
      }
    }

    if (this.weapon === 'spread') {
      // Base 3-pellet fan; mastery adds a pair of wider outer pellets per level (L1 = 5, L2 = 7).
      spawn(angle, 'bullet', 820, 0.64)
      const pairs = 1 + (this.weaponLvl['spread'] || 0) + (this.doctrinePassive === 'guard' ? 1 : 0)   // BASTION doctrine: +1 pellet pair
      for (let i = 1; i <= pairs; i++) { const off = i * 18; spawn(angle - off, 'bullet', 780, 0.55); spawn(angle + off, 'bullet', 780, 0.55) }
    } else if (this.weapon === 'laser') {
      spawn(angle, 'laser', 1120, 1.0)   // ONE piercing beam — the old second collinear beam silently doubled laser DPS *and* pierce (round-9 balance fix)
    } else if (this.weapon === 'fire') {
      spawn(angle, 'fireball', 640, 0.78); spawn(angle - 14, 'fireball', 600, 0.62); spawn(angle + 14, 'fireball', 600, 0.62)
    } else if (this.weapon === 'rapid') {
      spawn(angle, 'bullet', 840, 0.5)
    } else if (this.weapon === 'arc') {
      this.fireArc(angle, dir, baseX, baseY)
    } else {
      spawn(angle, 'bullet', 800, 0.62)
    }
  }

  // ARC LAUNCHER — a gravity-lobbed bomb that bursts in an area. Falls from above to reach behind
  // a Shielder's frontal block and onto wall-perched turrets; aim shapes the throw. Mastery grows
  // the blast (L1) and adds cluster bomblets (L2). Detonates on an enemy, on the ground, or on fuse.
  private fireArc(angle: number, dir: number, baseX: number, baseY: number) {
    const b = this.arcBombs.get(baseX, baseY, 'arcbomb') as Phaser.Physics.Arcade.Image
    if (!b) return
    b.setActive(true).setVisible(true).setScale(0.8).setDepth(20)
    b.body?.reset(baseX, baseY)
    const body = b.body as Phaser.Physics.Arcade.Body
    body.setEnable(true)
    body.setAllowGravity(true); body.setGravityY(1100)   // self-contained arc regardless of world gravity
    const lvl = this.weaponLvl['arc'] || 0
    const radius = 66 + lvl * 26
    const dmg = 4 + lvl * 2
    // Launch keyed to aim: neutral is a forward lob; up throws higher/longer, down is a short toss.
    let vx = dir * 360, vy = -430
    if (angle === -90) { vx = dir * 110; vy = -600 }
    else if (angle === -45) { vx = dir * 340; vy = -520 }
    else if (angle === 45) { vx = dir * 300; vy = -240 }
    else if (angle === 90) { vx = dir * 70; vy = -170 }
    b.setVelocity(vx, vy)
    b.setData('arc', radius); b.setData('arcDmg', dmg); b.setData('arcLvl', lvl); b.setData('spent', false)
    b.setAngularVelocity(dir * 420)   // tumble in flight
    // Fuse: burst even on a clean miss that never touches ground (e.g. off a ledge). Stored so
    // burstArc can cancel it — else a pooled bomb reused before 1700ms inherits the stale timer.
    const fuse = this.time.delayedCall(1700, () => { if (b.active && !b.getData('spent')) this.burstArc(b) })
    b.setData('fuse', fuse)
  }

  // Detonate a specific bomb sprite once, then retire it (idempotent via the 'spent' flag).
  private burstArc(b: Phaser.Physics.Arcade.Image) {
    if (!b.active || b.getData('spent')) return
    b.setData('spent', true)
    const fuse = b.getData('fuse') as Phaser.Time.TimerEvent | undefined   // cancel the fuse so a reused pooled bomb can't inherit it
    if (fuse) { fuse.remove(false); b.setData('fuse', null) }
    const r = (b.getData('arc') as number) || 70
    const dmg = (b.getData('arcDmg') as number) || 4
    const lvl = (b.getData('arcLvl') as number) || 0
    const x = b.x, y = b.y
    b.setAngularVelocity(0); b.setActive(false).setVisible(false)
    const bd = b.body as Phaser.Physics.Arcade.Body | null
    if (bd) { bd.setVelocity(0, 0); bd.setEnable(false) }   // retire the pooled body so it can't ghost-collide while parked
    this.detonateArc(x, y, r, dmg)
    // L2 mastery — two smaller cluster bomblets burst just after, on either side.
    if (lvl >= 2) {
      ;[-1, 1].forEach((s) => this.time.delayedCall(110, () => this.detonateArc(x + s * r * 0.6, y - 6, r * 0.62, Math.max(2, dmg - 2))))
    }
  }

  // Area blast: damage every enemy inside the radius (bosses chip), with a punchy one-shot burst.
  private detonateArc(x: number, y: number, radius: number, dmg: number) {
    this.shockwave(x, y, 0x84cc16, radius)
    this.particles.emitParticleAt(x, y, 22)
    this.deathParticles.setParticleTint(0xa3e635); this.deathParticles.emitParticleAt(x, y, 12)
    if (!this.reduceMotion) this.fxShake(120, 0.016)
    this.sfx?.explode(this.panAt(x))
    const r2 = radius * radius
    // Scale the freeze to the SIZE of the play: a 5-enemy detonation should CRUNCH, not freeze the same
    // ~40ms as chipping one grunt. Pre-count the kills this blast lands, then ONE hitstop up front — the
    // per-kill hitstops fire while physics is already paused and get swallowed, so the flat 40ms used to
    // win no matter how big the play. (round-11 combat#8)
    let arcKills = 0
    this.enemies.getChildren().forEach((o) => {
      const e = o as Phaser.Physics.Arcade.Sprite
      if (!e.active || ((e.getData('hp') as number) ?? 1) <= 0) return
      const dx = e.x - x, dy = e.y - y
      if (dx * dx + dy * dy <= r2 && (e.getData('hp') as number) - dmg <= 0) arcKills++
    })
    this.hitstop(Math.min(130, 40 + arcKills * 20))
    // Snapshot: killEnemy() destroys enemies, which mutates the group's live array mid-loop.
    this.enemies.getChildren().slice().forEach((o) => {
      const e = o as Phaser.Physics.Arcade.Sprite
      // Skip a dead/DYING enemy: a boss defers destroy() through its ~1s explosion (only its body
      // is disabled, which this manual scan ignores), so without this the blast re-kills it →
      // double bossDeath → Trials skips bosses + global score/kill inflation.
      if (!e.active || ((e.getData('hp') as number) ?? 1) <= 0) return
      const dx = e.x - x, dy = e.y - y
      if (dx * dx + dy * dy > r2) return
      const hp = (e.getData('hp') as number) - dmg
      e.setData('hp', hp)
      if (hp <= 0) { this.killEnemy(e); return }
      e.setTintFill(0xffffff); this.time.delayedCall(60, () => this.restoreTint(e))
      const bsx = e.getData('bsx') as number, bsy = e.getData('bsy') as number
      this.tweens.killTweensOf(e)
      this.tweens.add({ targets: e, scaleX: bsx * 1.12, scaleY: bsy * 0.9, duration: 55, yoyo: true, onComplete: () => { if (e.active) e.setScale(bsx, bsy) } })
      if ((e.getData('type') as string) === 'boss') this.bossBarChip()
    })
  }

  private hitArcEnemy(bombObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile) {
    this.burstArc(bombObj as Phaser.Physics.Arcade.Image)
  }

  private arcHitGround(bombObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile) {
    this.burstArc(bombObj as Phaser.Physics.Arcade.Image)
  }

  // Soft elliptical drop shadows, redrawn each frame — grounds the player and
  // ground enemies against the busy backdrops. One Graphics object, no per-entity
  // lifecycle to leak. Player shadow rides the last ground height and fades on jumps.
  private drawShadows() {
    const g = this.shadowGfx
    if (!g) return
    g.clear()
    // Feet offset derived from the body so it tracks any display-size change.
    const feetOff = (this.player.body as Phaser.Physics.Arcade.Body).bottom - this.player.y
    const groundY = this.lastGroundY + feetOff
    const pFeet = this.player.y + feetOff
    const lift = Phaser.Math.Clamp((groundY - pFeet) / 140, 0, 1)  // 0 grounded → 1 high
    g.fillStyle(0x000000, 0.34 * (1 - lift * 0.75))
    g.fillEllipse(this.player.x, Math.max(groundY, pFeet), 52 * (1 - lift * 0.4), 13 * (1 - lift * 0.4))
    const grounded = GROUND_ENEMIES
    this.enemies.getChildren().forEach((c) => {
      const e = c as Phaser.Physics.Arcade.Sprite
      if (!e.active || !grounded.has(e.getData('type') as string)) return
      g.fillStyle(0x000000, 0.3)
      g.fillEllipse(e.x, e.y + e.displayHeight * 0.44, e.displayWidth * 0.55, e.displayHeight * 0.13)
    })
  }

  // STAGGER poise meter — a thin bar above any enemy under fire, filling toward the break so the
  // "focus-fire cracks their guard" mechanic is something you can SEE and aim for (not a surprise). It
  // brightens near full (about to crack) and hides during the freeze (the cyan body already reads).
  private drawPoiseBars() {
    const g = this.poiseGfx
    if (!g) return
    g.clear()
    const now = this.time.now
    this.enemies.getChildren().forEach((c) => {
      const e = c as Phaser.Physics.Arcade.Sprite
      if (!e.active) return
      const pm = (e.getData('poiseMax') as number) || 0
      const pv = (e.getData('poise') as number) || 0
      if (pm <= 0 || pv <= 0.5) return                                   // no meter until poise is building
      if (((e.getData('staggerUntil') as number) || 0) > now) return     // frozen — cyan body signals the break
      const frac = Math.min(1, pv / pm)
      const bw = 26, bx = e.x - bw / 2, by = e.y - e.displayHeight * 0.5 - 10
      g.fillStyle(0x0a0612, 0.65); g.fillRect(bx - 1, by - 1, bw + 2, 5)
      g.fillStyle(frac > 0.78 ? 0xa5f3fc : 0x22d3ee, 0.95); g.fillRect(bx, by, bw * frac, 3)
    })
  }

  // SAPPER mortar strike — a delayed AoE at the marked ground spot that hurts the PLAYER (not
  // enemies, unlike detonateArc). Miss it by moving off the reticle before it lands.
  private mortarImpact(x: number, y: number, r: number) {
    this.shockwave(x, y, 0xf97316, r); this.shockwave(x, y, 0xffedd5, r * 0.55)
    this.particles.emitParticleAt(x, y, 18)
    this.deathParticles.setParticleTint(0xf97316); this.deathParticles.emitParticleAt(x, y, 8)
    if (!this.reduceMotion) this.fxShake(90, 0.014)
    this.sfx?.explode(this.panAt(x))
    const dx = this.player.x - x, dy = this.player.y - y
    if (dx * dx + dy * dy < r * r) this.damagePlayer('enemy', 'sapper')
  }

  private updateEnemies(delta: number) {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite
      if (!enemy.active) return
      const type = enemy.getData('type') as string

      const aura = enemy.getData('aura') as Phaser.GameObjects.Arc | undefined   // elite aura rides the enemy
      if (aura) aura.setPosition(enemy.x, enemy.y)

      // STAGGER: frozen + defenseless during the break window; otherwise poise bleeds off, so only
      // sustained FOCUS-FIRE (not slow chip) ever breaks it.
      const stU = (enemy.getData('staggerUntil') as number) || 0
      if (stU > 0) {
        if (this.time.now < stU) { enemy.setVelocity(0, 0); return }   // broken — skip the AI this frame
        enemy.setData('staggerUntil', 0); this.restoreTint(enemy)      // window ended — thaw
      } else {
        const poise = (enemy.getData('poise') as number) || 0
        // Poise only bleeds once FOCUS-FIRE lets up: hold it steady for ~600ms after the last hit so a
        // sustained stream actually reaches a break (a slow chipper still lets it recover). Without the
        // hold the bleed (~0.5×maxHP/s) outran every weapon and durable foes never staggered at all.
        if (poise > 0 && this.time.now - (((enemy.getData('lastPoiseAt') as number)) || 0) > 600) { const pm = (enemy.getData('poiseMax') as number) || 6; enemy.setData('poise', Math.max(0, poise - (pm / 1400) * delta)) }
      }

      if (type !== 'turret' && enemy.y > this.levelH + 220) { enemy.destroy(); return }

      const speed = enemy.getData('speed') as number
      const body = enemy.body as Phaser.Physics.Arcade.Body

      if (type === 'walker' || type === 'tank') {
        if (body.blocked.left || body.blocked.right) {
          const d = -(enemy.getData('dir') as number)
          enemy.setData('dir', d); enemy.setVelocityX(d * speed); enemy.setFlipX(d < 0)
        }
      }
      if (type === 'sniper') {   // holds ground and faces the player — a stationary long-range threat
        enemy.setVelocityX(0)
        enemy.setFlipX(this.player.x < enemy.x)
      }
      if (type === 'shielder') {   // advances slowly behind its shield, always facing the player
        const sdx = this.player.x - enemy.x
        enemy.setFlipX(sdx < 0)
        enemy.setVelocityX(Math.sign(sdx) * speed)
      }
      const shield = enemy.getData('shield') as Phaser.GameObjects.Rectangle | undefined   // shield rides the front of its bearer
      if (shield) { const front = enemy.flipX ? -1 : 1; shield.setPosition(enemy.x + front * 24, enemy.y - 4) }
      if (type === 'flyer') {
        const dx = this.player.x - enemy.x, dy = this.player.y - enemy.y - 40
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.55, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.35, -speed * 0.6, speed * 0.6))
        enemy.setFlipX(dx < 0)
      }
      if (type === 'splitter') {   // a soft floating pod — drifts toward the player, bursts into two ground minis on death
        const dx = this.player.x - enemy.x, dy = this.player.y - enemy.y - 30
        enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.4, -speed, speed))
        enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.28, -speed * 0.5, speed * 0.5))
        enemy.setFlipX(dx < 0)
      }
      if (type === 'sapper') {   // creeps in, marks the ground under you, then mortars it — forces constant movement
        const st = (enemy.getData('sstate') as string) || 'creep'
        const stimer = ((enemy.getData('stimer') as number) ?? Phaser.Math.Between(500, 1300)) - delta
        const dx = this.player.x - enemy.x
        if (st === 'mark') {
          enemy.setVelocityX(0)
          if (stimer <= 0) {
            enemy.setData('sstate', 'creep'); enemy.setData('stimer', Phaser.Math.Between(1500, 2500))
            this.restoreTint(enemy)   // clear the mark flash — state is out of 'mark' now, so restoreTint clears instead of re-asserting gold
            const ret = enemy.getData('reticle') as Phaser.GameObjects.Arc | undefined
            if (ret) { ret.destroy(); enemy.setData('reticle', undefined) }
            this.mortarImpact(enemy.getData('markX') as number, enemy.getData('markY') as number, 78)
          } else enemy.setData('stimer', stimer)
        } else {
          enemy.setVelocityX(Math.sign(dx) * speed * 0.7); enemy.setFlipX(dx < 0)
          if (Math.abs(dx) < 540 && stimer <= 0) {
            enemy.setData('sstate', 'mark'); enemy.setData('stimer', 880)
            enemy.setVelocityX(0); enemy.setTintFill(0xffe08a)
            const mx = this.player.x, my = Math.min(this.player.y + 28, this.lastGroundY + 18)
            enemy.setData('markX', mx); enemy.setData('markY', my)
            // Reticle drawn at the TRUE 78px blast radius (was 12px — 6.5x smaller than the kill zone, so
            // players stepped visibly "off" the dot and still got hit); it converges onto the real edge. (round-11 combat#2)
            const ret = this.add.circle(mx, my, 78, 0xf97316, 0.16).setStrokeStyle(3, 0xf97316, 0.95).setDepth(15)
            this.tweens.add({ targets: ret, scale: { from: 1.5, to: 1 }, duration: 860, ease: 'Quad.easeIn' })
            enemy.setData('reticle', ret)
          } else enemy.setData('stimer', stimer)
        }
      }
      if (type === 'turret') enemy.setFlipX(this.player.x < enemy.x)
      if (type === 'boss') this.updateBoss(enemy, delta)
      if (type === 'charger') {
        const st = (enemy.getData('cstate') as string) || 'patrol'
        const ct = ((enemy.getData('ctimer') as number) || 0) - delta
        const dx = this.player.x - enemy.x
        const adx = Math.abs(dx), ady = Math.abs(this.player.y - enemy.y)
        if (st === 'patrol') {
          if (body.blocked.left || body.blocked.right) enemy.setData('dir', -(enemy.getData('dir') as number))
          const d = enemy.getData('dir') as number
          enemy.setVelocityX(speed * d); enemy.setFlipX(d < 0)
          if (adx < 400 && ady < 74 && ct <= 0) {
            // Lock on: face the player, freeze, and wind up (telegraph flash).
            enemy.setData('cstate', 'wind'); enemy.setData('ctimer', 340)
            enemy.setData('dir', dx < 0 ? -1 : 1); enemy.setFlipX(dx < 0)
            enemy.setVelocityX(0); enemy.setTintFill(0xffe08a)
          } else enemy.setData('ctimer', ct)
        } else if (st === 'wind') {
          enemy.setVelocityX(0)
          if (ct <= 0) {
            enemy.setData('cstate', 'dash'); enemy.setData('ctimer', 560)
            this.restoreTint(enemy)
            const d = enemy.getData('dir') as number
            enemy.setVelocityX(360 * d); enemy.setFlipX(d < 0)
            this.sfx?.dash()
          } else enemy.setData('ctimer', ct)
        } else if (st === 'dash') {
          if (ct <= 0 || body.blocked.left || body.blocked.right) {
            enemy.setData('cstate', 'cool'); enemy.setData('ctimer', 950); enemy.setVelocityX(0)
          } else enemy.setData('ctimer', ct)
        } else {
          enemy.setVelocityX(0)
          if (ct <= 0) { enemy.setData('cstate', 'patrol'); enemy.setData('ctimer', 0) } else enemy.setData('ctimer', ct)
        }
      }
      if (type === 'diver') {
        const st = (enemy.getData('dstate') as string) || 'hover'
        const dt = ((enemy.getData('dtimer') as number) || 0) - delta
        const dx = this.player.x - enemy.x
        if (st === 'hover') {
          // Stalk from above: home horizontally, hold a band ~170px over the player.
          const dy = (this.player.y - 170) - enemy.y
          enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.8, -speed * 1.4, speed * 1.4))
          enemy.setVelocityY(Phaser.Math.Clamp(dy * 0.6, -speed * 1.2, speed * 1.2))
          enemy.setFlipX(dx < 0)
          if (Math.abs(dx) < 240 && enemy.y < this.player.y - 80 && dt <= 0) {
            enemy.setData('dstate', 'wind'); enemy.setData('dtimer', 300)
            enemy.setVelocity(0, 0); enemy.setTintFill(0xffe08a)
          } else enemy.setData('dtimer', dt)
        } else if (st === 'wind') {
          enemy.setVelocity(0, -12)
          if (dt <= 0) {
            enemy.setData('dstate', 'dive'); enemy.setData('dtimer', 700)
            this.restoreTint(enemy)
            enemy.setVelocity(Phaser.Math.Clamp(dx, -140, 140), 380); enemy.setFlipX(dx < 0)
            this.sfx?.dash()
          } else enemy.setData('dtimer', dt)
        } else if (st === 'dive') {
          if (dt <= 0 || body.blocked.down || enemy.y > this.levelH - 40) {
            enemy.setData('dstate', 'recover'); enemy.setData('dtimer', 800)
          } else enemy.setData('dtimer', dt)
        } else {
          enemy.setVelocityX(Phaser.Math.Clamp(dx * 0.3, -speed * 0.5, speed * 0.5))
          enemy.setVelocityY(-150)
          if (dt <= 0) { enemy.setData('dstate', 'hover'); enemy.setData('dtimer', 0) } else enemy.setData('dtimer', dt)
        }
      }

      if (type === 'tank' || type === 'flyer' || type === 'turret' || type === 'sniper') {
        let timer = enemy.getData('shootTimer') as number
        timer -= delta
        // Don't let off-screen enemies snipe you — only fire when roughly on-screen. Snipers reach further.
        const range = type === 'sniper' ? 780 : 600
        const near = Math.abs(enemy.x - this.player.x) < range && Math.abs(enemy.y - this.player.y) < (type === 'sniper' ? 420 : 380)
        const alive = (enemy.getData('hp') as number) > 0
        // Telegraph: turrets AND snipers flash before firing so their (fast) shots read as fair.
        const telegraphs = type === 'turret' || type === 'sniper'
        const teleLead = type === 'sniper' ? 420 : 260
        if (alive && near && telegraphs && timer <= teleLead && timer > 60 && !enemy.getData('tele')) {
          enemy.setData('tele', true)
          enemy.setTintFill(0xffe08a)
          this.time.delayedCall(type === 'sniper' ? 260 : 170, () => this.restoreTint(enemy))
          this.sfx?.turretTele(this.panAt(enemy.x))
          this.tipOnce('punish', 'they FLASH before firing — dodge it,\nor shoot the flash to PUNISH (2× dmg)', '#fbbf24')
        }
        if (timer <= 0 && near && alive) {
          enemy.setData('tele', false)
          this.restoreTint(enemy)   // wind over — snap the gold flash off (the tele flag is false now, so restoreTint clears it)
          if (type === 'sniper') {
            this.enemyFire(enemy, 1, 560, 0.85)   // one fast, cold, aimed bolt — dodge on the telegraph
          } else {
            let count = 1
            if (type === 'turret') count = this.level >= 3 ? 2 : 1
            this.enemyFire(enemy, count)
          }
          let base = 900
          if (type === 'tank') base = 1100
          else if (type === 'flyer') base = 1250
          else if (type === 'turret') base = Math.max(650, 1250 - this.level * 90)
          else if (type === 'sniper') base = Math.max(1500, 2100 - this.level * 80)
          enemy.setData('shootTimer', base)
        } else if (!near && telegraphs) {
          // Hold an off-screen turret/sniper ABOVE the telegraph lead so crossing into range always leaves
          // a full wind-up — otherwise a timer sitting in (0, teleLead] would fire a no-tell snap-shot.
          enemy.setData('shootTimer', Math.max(timer, teleLead + 60)); enemy.setData('tele', false); this.restoreTint(enemy)
        } else { enemy.setData('shootTimer', timer <= 0 ? 140 : timer); if (!near) { enemy.setData('tele', false); this.restoreTint(enemy) } }   // re-arm the wind-up if the target left range (clear the flash too)
      }
    })
  }

  // ── Boss AI ─────────────────────────────────────────────────────────────
  // Each boss moves in its own style, holds an altitude, and cycles a signature
  // move set (a harder rotation once enraged at half HP). Telegraph flash + accent
  // shockwave precede every move so attacks stay readable.
  private updateBoss(enemy: Phaser.Physics.Arcade.Sprite, delta: number) {
    const kind = (enemy.getData('bossKind') as string) || 'sentinel'
    const hp = enemy.getData('hp') as number, maxHp = enemy.getData('maxHp') as number
    const speed = enemy.getData('speed') as number
    if (hp / maxHp < 0.5 && this.bossPhase === 1) {
      this.bossPhase = 2
      this.screenToast('⚠ ' + this.nextBossLabel + ' ENRAGED', '#f43f5e', 96)
      this.popup(enemy.x, enemy.y - 70, 'PHASE 2', '#f43f5e')
      this.fxShake(320, 0.03)
      this.zoomPunch(1.10, 380)
      this.slowmo(0.5, 260)
      this.sfx?.enrage()
      this.sfx?.bossLeitmotif(BOSS_LEITMOTIF[kind] || [], true)
      enemy.setData('atkT', 340); enemy.setData('tele2', false); this.restoreTint(enemy)   // drop any live telegraph so the new phase's pool re-telegraphs cleanly (no stale colour/audio)
    }
    if (hp / maxHp < 0.2 && this.bossPhase === 2) {   // LAST STAND — a desperation phase at 20% HP
      this.bossPhase = 3
      this.screenToast('☠ ' + this.nextBossLabel + '  ·  LAST STAND', '#fca5a5', 104)
      this.popup(enemy.x, enemy.y - 70, 'PHASE 3', '#fca5a5')
      this.fxShake(380, 0.036)
      this.zoomPunch(1.14, 440)
      this.slowmo(0.42, 300)
      this.sfx?.enrage()
      this.sfx?.bossLeitmotif(BOSS_LEITMOTIF[kind] || [], true)
      enemy.setData('atkT', 300); enemy.setData('tele2', false); this.restoreTint(enemy)   // drop any live telegraph so the LAST STAND pool re-telegraphs cleanly
    }
    const p2 = this.bossPhase >= 2        // phase-2 behaviours persist into phase 3 (was === 2, which reverted at p3)
    const p3 = this.bossPhase === 3
    const dx = this.player.x - enemy.x
    const dashing = ((enemy.getData('dashUntil') as number) || 0) > this.time.now

    if (!dashing) {
      const homeY = BOSS_HOME_Y[kind] ?? 420
      const xk = kind === 'brute' ? 0.3 : kind === 'reaper' ? 0.55 : 0.42
      const mv = speed * (p3 ? 1.7 : p2 ? 1.4 : 1)
      enemy.setVelocityX(Phaser.Math.Clamp(dx * xk, -mv, mv))
      const bob = Math.sin(this.time.now / (p3 ? 150 : p2 ? 180 : 260)) * (kind === 'brute' ? 22 : p2 ? 78 : 52)
      enemy.setVelocityY((homeY - enemy.y) * 1.6 + bob)   // spring back to home altitude + bob
      enemy.setFlipX(dx < 0)
    }
    // Keep the boss on the arena (no gravity, no world bounds) — dashes/dives can't fly off
    // the edge or sink through the floor.
    enemy.x = Phaser.Math.Clamp(enemy.x, 140, this.levelW - 140)
    enemy.y = Phaser.Math.Clamp(enemy.y, 110, 575)

    // attack cadence + pre-move telegraph. FREEZE the countdown mid-dash: a phase-3 lunge (dashUntil up
    // to ~600ms) outlasts the 300ms telegraph window, so counting down during it would fire the NEXT move
    // with no tell. Freezing means the telegraph always gets its full lead once the lunge resolves.
    let atkT = ((enemy.getData('atkT') as number) ?? 1000) - (dashing ? 0 : delta)
    if (atkT <= 300 && !enemy.getData('tele2') && !dashing) {
      enemy.setData('tele2', true)
      // Telegraph the move about to fire BOTH ways — an audio cue AND a per-move-class tint + shockwave
      // colour — so attacks read on sight (RED aimed · GOLD spread · GREEN curtain-lane · VIOLET summon).
      const pool = (p2 && BOSS_MOVES_P2[kind]) ? BOSS_MOVES_P2[kind] : (BOSS_MOVES[kind] || BOSS_MOVES.sentinel)
      const upcoming = pool[((enemy.getData('atkIdx') as number) || 0) % pool.length]
      const teleCol = BOSS_TELE_COLOR[upcoming] || 0xffe08a
      enemy.setData('teleCol', teleCol)   // restoreTint repaints this if a hit lands mid-wind-up
      // Flash a WHITE-lifted version of the class colour on the sprite: on same-accent bosses (red reaper,
      // gold sentinel) a flat class tint barely differs from the silhouette, so its scariest tells washed
      // out. The shockwave ring below stays full-saturation teleCol, so hue still says WHICH move. (round-11 combat#4)
      enemy.setTintFill(this.teleFlash(teleCol))
      this.time.delayedCall(190, () => this.restoreTint(enemy))
      this.shockwave(enemy.x, enemy.y, teleCol, 42)
      this.sfx?.bossTele(BOSS_MOVE_CLASS[upcoming] || 'charge')
    }
    if (atkT <= 0) {
      enemy.setData('tele2', false)
      this.restoreTint(enemy)   // telegraph over — snap the gold off (tele2 is false now, so restoreTint clears it)
      const idx = (enemy.getData('atkIdx') as number) || 0
      enemy.setData('atkIdx', idx + 1)
      const pool = (p2 && BOSS_MOVES_P2[kind]) ? BOSS_MOVES_P2[kind] : (BOSS_MOVES[kind] || BOSS_MOVES.sentinel)
      this.bossDoMove(enemy, kind, pool[idx % pool.length], p2)
      atkT = (BOSS_CADENCE[kind] || 1400) * (p3 ? 0.42 : p2 ? 0.62 : 1)
    }
    enemy.setData('atkT', atkT)
  }

  // Flexible boss volley: aimed fan, radial ring, or fixed-angle bolt(s), accent-tinted.
  private bossFire(enemy: Phaser.Physics.Arcade.Sprite, o: { count: number; spreadRad?: number; aimed?: boolean; ring?: boolean; baseAngle?: number; speed?: number; scale?: number; tint?: number; gapCenter?: number; gapRad?: number }) {
    if (!enemy.active) return
    const { count, spreadRad = 0, aimed = true, ring = false, baseAngle = 0, speed = 230, scale = 0.78, tint, gapCenter, gapRad = 0 } = o
    const aim = aimed ? Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) : baseAngle
    for (let i = 0; i < count; i++) {
      const ang = ring ? baseAngle + (i * Math.PI * 2) / count
        : aim + (count > 1 ? (i - (count - 1) / 2) * (spreadRad / (count - 1)) : 0)
      // CURTAIN etc. can leave one telegraphed safe lane — skip bolts inside the gap wedge.
      if (gapRad > 0 && gapCenter !== undefined && Math.abs(Phaser.Math.Angle.Wrap(ang - gapCenter)) < gapRad) continue
      const b = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!b) continue
      b.setActive(true).setVisible(true); b.setScale(scale); b.setDepth(19)
      if (tint !== undefined) b.setTint(tint); else b.clearTint()
      b.setData('homingUntil', 0)   // clear any stale SEEKER homing from a prior pooled use
      b.body?.reset(enemy.x, enemy.y)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      b.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed)
      b.setRotation(ang)
      this.time.delayedCall(2600, () => { if (b.active) b.setActive(false).setVisible(false) })
    }
  }

  // Fire a radial ring of bolts from an arbitrary point (used by MINE detonations, which burst
  // where the mine sat, not at the boss).
  private ringFrom(x: number, y: number, count: number, speed: number, tint: number) {
    for (let i = 0; i < count; i++) {
      const b = this.enemyBullets.get(x, y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!b) continue
      b.setActive(true).setVisible(true); b.setScale(0.7); b.setDepth(19); b.setTint(tint)
      b.setData('homingUntil', 0)
      b.body?.reset(x, y)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      const ang = (i * Math.PI * 2) / count
      b.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed)
      this.time.delayedCall(2600, () => { if (b.active) b.setActive(false).setVisible(false) })
    }
  }

  // SEEKER bullets steer toward the player while their homing window is open, then commit straight.
  private updateHomingBullets() {
    const now = this.time.now
    this.enemyBullets.getChildren().forEach((o) => {
      const b = o as Phaser.Physics.Arcade.Image
      if (!b.active) return
      const until = (b.getData('homingUntil') as number) || 0
      if (until <= 0 || now > until) return
      const body = b.body as Phaser.Physics.Arcade.Body
      const cur = Math.atan2(body.velocity.y, body.velocity.x)
      const want = Phaser.Math.Angle.Between(b.x, b.y, this.player.x, this.player.y)
      const na = Phaser.Math.Angle.RotateTo(cur, want, 0.05)     // ease toward the target each frame
      const spd = now > until - 380 ? 300 : 165                   // slow drift, then commit fast near the end
      body.setVelocity(Math.cos(na) * spd, Math.sin(na) * spd)
      b.setRotation(na)
    })
  }

  private bossDoMove(enemy: Phaser.Physics.Arcade.Sprite, kind: string, move: string, p2: boolean) {
    const acc = bossAccent(kind)
    switch (move) {
      case 'burst':   // three quick aimed bolts
        for (let k = 0; k < 3; k++) this.time.delayedCall(k * 110, () => this.bossFire(enemy, { count: 1, speed: 300, tint: acc }))
        break
      case 'fan':
        this.bossFire(enemy, { count: p2 ? 9 : 6, spreadRad: 1.1, speed: 235, tint: acc }); break
      case 'spread':  // wide aimed volley
        this.bossFire(enemy, { count: p2 ? 11 : 8, spreadRad: 2.2, speed: 210, tint: acc }); break
      case 'ring':    // radial bullet ring
        this.bossFire(enemy, { count: p2 ? 18 : 13, ring: true, baseAngle: (this.time.now % 628) / 100, speed: 195, tint: acc }); break
      case 'sweep': { // rotating beam of bolts sweeping across
        const dir = this.player.x < enemy.x ? -1 : 1
        let a = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) - dir * 0.6
        for (let k = 0; k < 10; k++) this.time.delayedCall(k * 55, () => { this.bossFire(enemy, { count: 1, aimed: false, baseAngle: a, speed: 265, tint: acc }); a += dir * 0.12 })
        break }
      case 'lob':     // heavy slow shots
        this.bossFire(enemy, { count: p2 ? 5 : 3, spreadRad: 0.55, speed: 155, scale: 1.15, tint: acc }); break
      case 'dash': {  // lunge across the player, spraying on the way
        const dir = this.player.x < enemy.x ? -1 : 1
        enemy.setData('dashUntil', this.time.now + 480)
        enemy.setVelocity(dir * 540, -20)
        this.sfx?.hurt()
        this.time.delayedCall(130, () => this.bossFire(enemy, { count: 3, spreadRad: 0.9, speed: 220, tint: acc }))
        break }
      case 'pound': { // dive to low altitude → ground shockwave + upward spray
        enemy.setData('dashUntil', this.time.now + 560)
        enemy.setVelocity(Phaser.Math.Clamp((this.player.x - enemy.x) * 1.2, -260, 260), 430)
        this.time.delayedCall(360, () => {
          if (!enemy.active) return
          enemy.setVelocity(0, -300)   // recover
          this.fxShake(300, 0.032)
          this.shockwave(enemy.x, 590, 0xffffff, 74)
          this.shockwave(enemy.x, 590, acc, 54)
          this.bossFire(enemy, { count: p2 ? 12 : 8, spreadRad: 2.8, aimed: false, baseAngle: -Math.PI / 2, speed: 250, tint: acc })
        })
        break }
      case 'dive': {  // swoop at the player then pull up
        enemy.setData('dashUntil', this.time.now + 600)
        const ty = Math.min(this.player.y, 500)
        const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, ty)
        enemy.setVelocity(Math.cos(ang) * 470, Math.sin(ang) * 470)
        this.time.delayedCall(340, () => { if (enemy.active) enemy.setVelocity(0, -280) })
        break }
      case 'summon': {
        if (this.enemies.countActive(true) >= 7) break   // don't let adds pile up
        const n = p2 ? 2 : 1
        for (let k = 0; k < n; k++) this.spawnEnemy('flyer', enemy.x + (k ? 90 : -90), enemy.y - 20, 3, 60)
        this.popup(enemy.x, enemy.y - 74, 'SUMMON', '#' + acc.toString(16).padStart(6, '0'))
        break }
      case 'cross': {  // spinning plus — 4-way rings that rotate each stage, forcing lateral dodges
        const stages = p2 ? 6 : 4
        for (let s = 0; s < stages; s++) this.time.delayedCall(s * 90, () =>
          this.bossFire(enemy, { count: 4, ring: true, baseAngle: s * 0.24, speed: 215, tint: acc }))
        break }
      case 'spiral': {  // rotating twin-arm spiral — a drifting bullet stream to weave through
        const shots = p2 ? 16 : 11
        for (let k = 0; k < shots; k++) this.time.delayedCall(k * 48, () =>
          this.bossFire(enemy, { count: 2, ring: true, baseAngle: k * 0.5, speed: 205, tint: acc }))
        break }
      case 'lance': {  // fast heavy aimed bolt(s) — punishes standing still after the telegraph
        this.bossFire(enemy, { count: p2 ? 3 : 1, spreadRad: 0.28, speed: 540, scale: 1.05, tint: 0xff5555 })
        this.sfx?.hit()
        break }
      case 'nova': {  // offset double ring — a fast wave, then a slower interleaved one
        const n = p2 ? 14 : 10
        this.bossFire(enemy, { count: n, ring: true, baseAngle: 0, speed: 260, tint: acc })
        this.time.delayedCall(170, () => this.bossFire(enemy, { count: n, ring: true, baseAngle: Math.PI / n, speed: 172, tint: acc }))
        break }
      case 'mines': {  // LINGERING space-denial — armed bolts that sit, pulse, then burst into rings
        const n = p2 ? 4 : 3
        for (let k = 0; k < n; k++) {
          const mx = enemy.x + (k - (n - 1) / 2) * 150, my = 470 + Math.random() * 70
          const m = this.enemyBullets.get(mx, my, 'enemyBullet') as Phaser.Physics.Arcade.Image
          if (!m) continue
          m.setActive(true).setVisible(true); m.setScale(1.15); m.setDepth(19); m.setTint(acc); m.setData('homingUntil', 0)
          m.body?.reset(mx, my); (m.body as Phaser.Physics.Arcade.Body).setAllowGravity(false); m.setVelocity(0, 0)
          this.tweens.add({ targets: m, scaleX: 1.7, scaleY: 1.7, duration: 260, yoyo: true, repeat: 1 })   // arm tell
          this.time.delayedCall(1100, () => {
            if (!m.active) return
            this.shockwave(m.x, m.y, acc, 30)
            this.ringFrom(m.x, m.y, p2 ? 10 : 8, 185, acc)
            m.setActive(false).setVisible(false)
          })
        }
        break }
      case 'curtain': {  // a dense bolt wall with ONE telegraphed safe lane on the player's bearing
        const gapCenter = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
        this.bossFire(enemy, { count: p2 ? 30 : 24, ring: true, baseAngle: 0.05, speed: 175, tint: acc, gapCenter, gapRad: p2 ? 0.4 : 0.5 })
        break }
      case 'seeker': {  // slow HOMING bolts that re-aim ~1.5s then commit — punishes camping
        const n = p2 ? 3 : 2
        for (let k = 0; k < n; k++) this.time.delayedCall(k * 150, () => {
          const b = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
          if (!b) return
          b.setActive(true).setVisible(true); b.setScale(0.95); b.setDepth(19); b.setTint(0xf0abfc)
          b.body?.reset(enemy.x, enemy.y); (b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
          const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
          b.setVelocity(Math.cos(ang) * 165, Math.sin(ang) * 165)
          b.setData('homingUntil', this.time.now + 1500)
          this.time.delayedCall(2600, () => { if (b.active) b.setActive(false).setVisible(false) })
        })
        break }
    }
  }

  private enemyFire(enemy: Phaser.Physics.Arcade.Sprite, count: number, fixedSpd?: number, scale = 0.75) {
    this.sfx?.enemyShot(this.panAt(enemy.x))   // panned muzzle blip — hear which side the shot came from
    for (let i = 0; i < count; i++) {
      const b = this.enemyBullets.get(enemy.x, enemy.y, 'enemyBullet') as Phaser.Physics.Arcade.Image
      if (!b) continue
      b.setActive(true).setVisible(true); b.setScale(scale); b.setDepth(19)
      b.setData('homingUntil', 0)   // clear any stale SEEKER homing from a prior pooled use
      if (fixedSpd) b.setTint(0xbfdbfe); else b.clearTint()   // sniper bolts read cold/fast
      b.body?.reset(enemy.x, enemy.y)
      ;(b.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
      const spread = (i - (count - 1) / 2) * 0.16
      const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y) + spread
      const spd = fixedSpd ?? (count > 1 ? 220 : 270)
      b.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd)
      b.setRotation(ang)   // bolt points toward the player
      this.time.delayedCall(2200, () => { if (b.active) b.setActive(false).setVisible(false) })
    }
  }

  // Clear a hit/telegraph flash but keep any persistent base tint (e.g. the charger's).
  // Lift a telegraph class colour toward white so the wind-up flash carries an unmissable brightness
  // delta regardless of the boss's own accent (a flat red tint on the red reaper barely read). Hue is
  // preserved enough to still hint the class; the colour-coded shockwave ring carries the true semantic.
  private teleFlash(col: number): number {
    const f = 0.55
    const r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, b = col & 0xff
    const lift = (c: number) => Math.round(c + (255 - c) * f)
    return (lift(r) << 16) | (lift(g) << 8) | lift(b)
  }

  private restoreTint(e: Phaser.Physics.Arcade.Sprite) {
    if (!e.active) return
    // A STAGGER freeze owns the tint: hold cyan for the whole window so a hit's +60ms restore, a burn
    // tick, or a telegraph's flash-off can't repaint it gold/base mid-freeze. (Thaw clears staggerUntil
    // BEFORE calling this, so thawing still restores correctly.)
    if (((e.getData('staggerUntil') as number) || 0) > this.time.now) { e.setTintFill(0x67e8f9); return }
    // A non-lethal hit must NOT strip an enemy's "about to strike" telegraph flash while the wind-up is
    // still live — the tell is set once on entering the state, so re-assert the gold flash instead of
    // clearing to base whenever the enemy is still winding/marking/telegraphing.
    if (e.getData('tele2') === true) { e.setTintFill(this.teleFlash((e.getData('teleCol') as number) || 0xffe08a)); return }   // boss wind-up keeps its per-move class colour (white-lifted so it never washes out on same-accent bosses)
    if (e.getData('cstate') === 'wind' || e.getData('dstate') === 'wind' || e.getData('sstate') === 'mark'
        || e.getData('tele') === true) { e.setTintFill(0xffe08a); return }
    e.clearTint()
    const bt = e.getData('baseTint') as number | undefined
    if (bt) e.setTint(bt)
  }

  // A PUNISH the enemy SURVIVES doesn't just chip it — it CANCELS the telegraphed attack, so reading a
  // tell becomes the highest-skill OFFENSE, not only a damage bonus. Each archetype's wind-up state is
  // reset to its recovery/idle branch (a vulnerable window). Boss moves are exempt — cancelling them would
  // trivialise the fight. Idempotent: once a wind-up is cleared, a second call this volley is a no-op.
  private interruptEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const type = enemy.getData('type') as string
    let did = false
    if (type === 'charger' && enemy.getData('cstate') === 'wind') {
      enemy.setData('cstate', 'cool'); enemy.setData('ctimer', 950); enemy.setVelocityX(0); did = true
    } else if (type === 'diver' && enemy.getData('dstate') === 'wind') {
      enemy.setData('dstate', 'recover'); enemy.setData('dtimer', 800); did = true
    } else if (type === 'sapper' && enemy.getData('sstate') === 'mark') {
      enemy.setData('sstate', 'creep'); enemy.setData('stimer', Phaser.Math.Between(1200, 2000)); enemy.setVelocityX(0)
      const ret = enemy.getData('reticle') as Phaser.GameObjects.Arc | undefined
      if (ret) { ret.destroy(); enemy.setData('reticle', undefined) }   // cancel the mark → no mortar fires
      did = true
    } else if ((type === 'turret' || type === 'sniper') && enemy.getData('tele') === true) {
      enemy.setData('tele', false); enemy.setData('shootTimer', type === 'sniper' ? 1500 : 850); did = true   // shove the shot back into cooldown
    }
    if (!did) return
    this.restoreTint(enemy)
    this.popup(enemy.x, enemy.y - 44, 'INTERRUPT', '#a5f3fc')
  }

  // STAGGER — sustained damage builds an enemy's poise; a break freezes it for a burst window (with
  // bonus damage), then grants brief immunity so it can't be perma-stunned. Non-boss only: bosses have
  // no poiseMax, so this is a no-op for them. Called from hitEnemy on a surviving hit.
  private buildStagger(enemy: Phaser.Physics.Arcade.Sprite, dmg: number) {
    const max = enemy.getData('poiseMax') as number | undefined
    if (max == null) return
    const now = this.time.now
    if (now < ((enemy.getData('staggerUntil') as number) || 0)) return          // already broken
    if (now < ((enemy.getData('staggerImmuneUntil') as number) || 0)) return    // post-break immunity
    const poise = ((enemy.getData('poise') as number) || 0) + dmg
    enemy.setData('lastPoiseAt', now)   // stamp the hit so poise holds under sustained fire (updateEnemies bleeds only after ~600ms of no hits)
    if (poise < max) { enemy.setData('poise', poise); return }
    // BREAK: freeze, flash cyan, and open the window.
    enemy.setData('poise', 0)
    enemy.setData('staggerUntil', now + 450)
    enemy.setData('staggerImmuneUntil', now + 2600)
    enemy.setVelocity(0, 0)
    enemy.setTintFill(0x67e8f9)
    this.shockwave(enemy.x, enemy.y, 0x67e8f9, 22)
    this.popup(enemy.x, enemy.y - 30, 'STAGGER', '#67e8f9')
    this.hitstop(20)
    this.sfx?.stagger(this.panAt(enemy.x))
    this.tipOnce('stagger', 'FOCUS-FIRE cracks their guard — a STAGGERED\nfoe is frozen and takes extra damage', '#67e8f9')
  }

  private hitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite
    const bx = bullet.x, by = bullet.y                 // impact point, for contact sparks
    // Piercing bullets (laser) pass through up to `pierce` enemies; `hit` stops a single beam from
    // double-tapping one enemy as it overlaps across frames. Non-piercing bullets die on first contact.
    const pierce = (bullet.getData('pierce') as number) || 0
    if (pierce > 0) {
      const hitList = (bullet.getData('hit') as Phaser.GameObjects.GameObject[]) || []
      if (hitList.includes(enemy)) return
      hitList.push(enemy); bullet.setData('hit', hitList)
      if (hitList.length >= pierce) bullet.setActive(false).setVisible(false)   // reached its pierce cap
    } else {
      bullet.setActive(false).setVisible(false)
    }

    // Shielder: a frontal energy shield deflects horizontal shots coming from its facing side.
    // Counter by hitting it from ABOVE (aim down — a vertical bolt) or from BEHIND; those pass.
    if ((enemy.getData('type') as string) === 'shielder') {
      const bb = bullet.body as Phaser.Physics.Arcade.Body | null
      const bvx = bb?.velocity.x ?? 0, bvy = bb?.velocity.y ?? 0
      const front = enemy.flipX ? -1 : 1
      const fromFront = Math.sign(bx - enemy.x) === front
      if (fromFront && Math.abs(bvx) >= Math.abs(bvy)) {
        this.particles.emitParticleAt(bx, by, 4)
        this.shockwave(bx, by, 0x67e8f9, 12)
        this.sfx?.hit()
        // A flat spark read as "my gun broke" — name the block and teach the flank so it reads as design. (round-11 combat#3)
        if (this.time.now - this.lastShieldHintAt > 800) { this.lastShieldHintAt = this.time.now; this.popup(bx, by - 16, 'BLOCKED', '#a5f3fc') }
        this.teachShield()
        return   // deflected — no damage
      }
    }

    let dmg = (this.weapon === 'laser' ? 3 : this.weapon === 'fire' ? 2 : 1) + (this.weaponLvl[this.weapon] || 0)
    // TELEGRAPH PUNISH: shooting an enemy DURING its wind-up flash (the same tell you'd normally
    // dodge) deals double — read the threat and cancel the attack instead of only evading it. Uses
    // the state flags the AI already sets: charger/diver wind, sapper mark, turret/sniper + boss tells.
    const punish = enemy.getData('cstate') === 'wind' || enemy.getData('dstate') === 'wind'
      || enemy.getData('sstate') === 'mark' || enemy.getData('tele') === true || enemy.getData('tele2') === true
    if (punish) dmg = Math.ceil(dmg * 2)
    if (((enemy.getData('staggerUntil') as number) || 0) > this.time.now) dmg = Math.round(dmg * 1.6)   // STAGGER: a broken enemy takes bonus damage during the window
    const hp = (enemy.getData('hp') as number) - dmg
    enemy.setData('hp', hp)
    enemy.setTintFill(punish ? 0xffe08a : 0xffffff)
    this.time.delayedCall(60, () => this.restoreTint(enemy))
    this.particles.emitParticleAt(enemy.x, enemy.y, 5)
    if (punish) {
      // A fat golden spark + a callout so the read reads: you hit the window.
      this.shockwave(bx, by, 0xffe08a, 20)
      this.popup(enemy.x, enemy.y - 30, 'PUNISH', '#fbbf24')
      this.hitstop(14)
      this.sfx?.crit(this.panAt(enemy.x))
      if (hp > 0) this.interruptEnemy(enemy)   // a SURVIVED punish CANCELS the telegraphed attack (boss moves exempt) — reading the tell is now offense
      if (this.relics.has('arclash')) this.arcLash(enemy)   // ARC LASH relic — a read also lashes a nearby foe

      // VANGUARD: a read refunds dash — but ONE read is one refund. hitEnemy runs per bullet→enemy
      // contact, so a multi-pellet spread or a piercing laser would otherwise refund N×260ms in a single
      // volley; the 150ms window collapses a volley (same-frame pellets + a bolt piercing over a few
      // frames) to a single refund while still letting a sustained stream refund periodically.
      if (this.doctrinePassive === 'refund' && this.time.now > this.lastRefundAt + 150) {
        this.dashCdUntil = Math.max(this.time.now, this.dashCdUntil - 260)
        this.lastRefundAt = this.time.now
      }
    }

    // Per-weapon impact signature at the point of contact — each gun should FEEL different, not
    // just do different damage numbers.
    if (this.weapon === 'laser') {
      // LASER sears a scar: a thin bright streak along the beam that flares and fades.
      const bb = bullet.body as Phaser.Physics.Arcade.Body | null
      const ang = bb ? Math.atan2(bb.velocity.y, bb.velocity.x) : 0
      const scar = this.add.rectangle(bx, by, 20, 2.5, 0xf0abfc, 0.95).setDepth(7).setRotation(ang)
      this.tweens.add({ targets: scar, alpha: 0, scaleX: 1.9, scaleY: 0.4, duration: 240, onComplete: () => scar.destroy() })
      this.shockwave(bx, by, 0xe879f9, 9)
    } else if (this.weapon === 'fire' && hp > 0) {
      // FIRE ignites — top up a burning DoT stack (drained by updateBurns) and lick embers.
      const cur = (enemy.getData('burnTicks') as number) || 0
      enemy.setData('burnTicks', Math.min(8, cur + 3))
      if (cur <= 0) enemy.setData('burnNext', this.time.now + 300)
      this.particles.emitParticleAt(bx, by, 3)
    }
    // EMBERS relic — every weapon leaves a small burning stack, turning any gun into a damage-over-time build.
    if (hp > 0 && this.weapon !== 'fire' && this.relics.has('embers')) {
      const cur = (enemy.getData('burnTicks') as number) || 0
      enemy.setData('burnTicks', Math.min(8, cur + 2))
      if (cur <= 0) enemy.setData('burnNext', this.time.now + 300)
    }

    if (hp > 0) {
      this.buildStagger(enemy, dmg)   // STAGGER: sustained damage builds poise (no-op for bosses / already-broken)
      const bsx = enemy.getData('bsx') as number, bsy = enemy.getData('bsy') as number
      if ((enemy.getData('type') as string) === 'boss') {
        // Bosses are the climax — chipping one should land with weight, not feel like plinking a grunt:
        // contact sparks at the impact point, a micro-hitstop, a chip flash on the bar, a beefier thunk.
        this.particles.emitParticleAt(bx, by, 8)
        this.shockwave(bx, by, 0xffffff, 14)
        this.tweens.killTweensOf(enemy)
        this.tweens.add({ targets: enemy, scaleX: bsx * 1.09, scaleY: bsy * 0.91, duration: 45, yoyo: true, onComplete: () => { if (enemy.active) enemy.setScale(bsx, bsy) } })
        this.hitstop(16)                               // isPaused guard prevents rapid-fire hits from stacking freezes
        this.bossBarChip()
        this.sfx?.bossHit()
        return
      }
      // Alive grunt — flinch with a squash punch so non-lethal hits still read. RAPID flinches
      // light + quick (it fires fast, so a full recoil every shot would jitter); LASER/FIRE hit
      // heavier; SPREAD/normal sit in between.
      const rapid = this.weapon === 'rapid'
      const heavy = this.weapon === 'laser' || this.weapon === 'fire'
      const fsx = rapid ? 1.08 : heavy ? 1.22 : 1.18
      const fsy = rapid ? 0.93 : heavy ? 0.80 : 0.84
      const fdur = rapid ? 40 : 55
      this.tweens.killTweensOf(enemy)
      this.tweens.add({ targets: enemy, scaleX: bsx * fsx, scaleY: bsy * fsy, duration: fdur, yoyo: true, onComplete: () => { if (enemy.active) enemy.setScale(bsx, bsy) } })
      this.sfx?.hit()
      return
    }

    this.killEnemy(enemy)
  }

  // Award points, detonate, drop, and remove a killed enemy. Extracted from hitEnemy so the
  // ARC LAUNCHER's area blast kills through the exact same path (score, combo, drops, boss).
  // ARC LASH relic — a PUNISH read also whips a violet arc to the nearest OTHER grunt for a chip of damage,
  // rewarding fighting in packs. Offense-shaped, no score-formula change (a kill still scores its base pts).
  private arcLash(from: Phaser.Physics.Arcade.Sprite) {
    let best: Phaser.Physics.Arcade.Sprite | undefined
    let bestD = 150 * 150
    this.enemies.getChildren().forEach((o) => {
      const e = o as Phaser.Physics.Arcade.Sprite
      if (e === from || !e.active || e.getData('dying') === true || e.getData('type') === 'boss' || ((e.getData('hp') as number) ?? 1) <= 0) return
      const dx = e.x - from.x, dy = e.y - from.y, d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = e }
    })
    if (!best) return
    const target = best
    const line = this.add.rectangle((from.x + target.x) / 2, (from.y + target.y) / 2, Math.sqrt(bestD), 2, 0xe879f9, 0.9)
      .setDepth(8).setRotation(Math.atan2(target.y - from.y, target.x - from.x))
    this.tweens.add({ targets: line, alpha: 0, scaleY: 0.3, duration: 170, onComplete: () => line.destroy() })
    this.shockwave(target.x, target.y, 0xe879f9, 12)
    const hp = ((target.getData('hp') as number) || 0) - 1
    target.setData('hp', hp)
    target.setTintFill(0xe879f9); this.time.delayedCall(60, () => this.restoreTint(target))
    if (hp <= 0) this.killEnemy(target)
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active || enemy.getData('dying') === true) return   // never re-count a boss during its ~1s detonation (defense-in-depth vs any future AoE path)
    const type = enemy.getData('type') as string
    const isElite = enemy.getData('elite') === true
    const dcol = type === 'tank' ? 0xfb923c : type === 'flyer' ? 0xa855f7 : type === 'charger' ? 0xff7a3c : type === 'diver' ? 0xff4d6d : type === 'sniper' ? 0x93c5fd : type === 'shielder' ? 0x94a3b8 : type === 'sapper' ? 0xf97316 : type === 'splitter' ? 0xc084fc : 0xf43f5e
    let pts = type === 'boss' ? 4000 : type === 'tank' ? 500 : type === 'shielder' ? 400 : type === 'turret' ? 350 : type === 'sapper' ? 340 : type === 'sniper' ? 320 : type === 'flyer' ? 250 : type === 'splitter' ? 240 : type === 'charger' ? 200 : type === 'diver' ? 260 : 120
    if (isElite) pts = Math.round(pts * 2.2)
    pts = this.applyCombo(pts)
    this.kills++
    this.score += pts
    this.scoreText.setText('SCORE  ' + this.score)
    this.popup(enemy.x, enemy.y - 20, '+' + pts)
    this.noteRelicKill(enemy.x, enemy.y)

    if (type === 'boss') { this.bossDeath(enemy); return }

    this.deathParticles.setParticleTint(isElite ? 0xfde047 : dcol)
    this.deathParticles.emitParticleAt(enemy.x, enemy.y, isElite ? 30 : 16)
    this.particles.emitParticleAt(enemy.x, enemy.y, isElite ? 44 : 26)
    this.shockwave(enemy.x, enemy.y, isElite ? 0xfde047 : dcol, isElite ? 46 : 26)
    this.hitstop(isElite ? 90 : (type === 'tank' || type === 'turret' ? 70 : 45))
    this.fxShake(isElite ? 180 : (type === 'tank' || type === 'turret' ? 120 : 70), isElite ? 0.02 : 0.014)
    this.sfx?.explode(this.panAt(enemy.x))
    if (isElite) { this.fxFlash(120, 253, 224, 71, false); this.popup(enemy.x, enemy.y - 40, 'ELITE DOWN', '#fde047'); this.zoomPunch(1.08, 300); this.slowmo(0.55, 200) }
    else if (type === 'tank' || type === 'turret') this.fxFlash(90, 200, 120, 255, false)
    // Elites always drop; grunts drop 30% of the time.
    if (isElite || Math.random() < 0.3 * (this.heatRun && this.heatTier > 0 ? heatMods(this.heatTier).pods : 1)) {
      const kinds = ['health', 'spread', 'rapid', 'laser', 'fire', 'arc']
      this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
    }
    // SPLITTER fission: burst into two ground minis (plain walkers, so they can't re-split). Capped
    // so a crowd of splitters can't runaway-spawn.
    if (type === 'splitter' && this.enemies.countActive(true) < 12) {
      const sx = enemy.x, sy = enemy.y, mhp = Math.max(2, Math.ceil((enemy.getData('maxHp') as number) / 2))
      ;[-1, 1].forEach((s) => this.spawnEnemy('soldier', sx + s * 30, sy, mhp, 100, 'walker'))
    }
    // PYRO ignite: a burning kill leaps its fire to the nearest other foe, chaining the DoT through a pack.
    if (this.doctrinePassive === 'ignite' && (((enemy.getData('burnTicks') as number) || 0) > 0)) {
      const ex = enemy.x, ey = enemy.y
      let near: Phaser.Physics.Arcade.Sprite | undefined
      let best = 240
      this.enemies.getChildren().forEach((o) => {
        const e = o as Phaser.Physics.Arcade.Sprite
        if (e === enemy || !e.active || e.getData('dying') === true) return
        const d = Phaser.Math.Distance.Between(ex, ey, e.x, e.y)
        if (d < best) { best = d; near = e }
      })
      if (near) {
        const cur = (near.getData('burnTicks') as number) || 0
        near.setData('burnTicks', Math.min(8, cur + 3))
        if (cur <= 0) near.setData('burnNext', this.time.now + 300)
        this.popup(near.x, near.y - 24, 'SPREAD', '#fb923c')
      }
    }
    enemy.destroy()
    if (this.isBossLevel() && this.enemies.countActive(true) === 0) this.onLevelClear()
  }

  // Multi-stage boss detonation — a run of blasts across the body, then a screen-filling finisher.
  private bossDeath(boss: Phaser.Physics.Arcade.Sprite) {
    if (boss.getData('dying')) return   // idempotent: the death sequence + onLevelClear must run exactly once per boss
    boss.setData('dying', true)
    this.bossesThisRun++                 // once per boss (guarded above) — feeds daily bounties
    boss.setData('hp', 0)
    boss.setVelocity(0, 0)
    ;(boss.body as Phaser.Physics.Arcade.Body).enable = false
    recordBossKill((boss.getData('bossKind') as string) || this.nextBossKind)   // durable badge bit for this boss kind
    this.hitstop(150)
    this.slowmo(0.38, 360)   // freeze → drip: the sim eases back up as the boss detonates
    // Guardian stages: killing the guardian opens the extraction (then walk to the goal).
    if (this.extractionLocked) {
      this.extractionLocked = false
      this.screenToast('GUARDIAN DOWN  ·  EXTRACTION OPEN', '#67e8f9', 112)
    }
    let n = 0
    const ev = this.time.addEvent({
      delay: 135, repeat: 7, callback: () => {
        n++
        const ex = boss.x + Phaser.Math.Between(-72, 72), ey = boss.y + Phaser.Math.Between(-72, 72)
        this.particles.emitParticleAt(ex, ey, 20)
        this.deathParticles.setParticleTint(0xfb923c)
        this.deathParticles.emitParticleAt(ex, ey, 10)
        this.shockwave(ex, ey, 0xfbbf24, 22)
        this.fxShake(120, 0.02)
        this.sfx?.explode(this.panAt(ex))
        if (boss.active) boss.setTintFill(n % 2 ? 0xffffff : 0xff6030)
        if (ev.repeatCount === 0) {
          this.fxFlash(320, 255, 210, 130, false)
          this.zoomPunch(1.16, 460)
          this.shockwave(boss.x, boss.y, 0xffffff, 64)
          this.deathParticles.setParticleTint(0xfbbf24)
          this.deathParticles.emitParticleAt(boss.x, boss.y, 44)
          this.particles.emitParticleAt(boss.x, boss.y, 60)
          this.sfx?.bossDefeat()
          boss.destroy()
          // Only the final boss STAGE clears by kill-all; guardian stages clear by reaching
          // the (now-unlocked) extraction.
          if (this.isBossLevel() && this.enemies.countActive(true) === 0) this.onLevelClear()
        }
      },
    })
  }

  private hitPlayer(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    eObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const enemy = eObj as Phaser.Physics.Arcade.Sprite
    const type = enemy.getData('type') as string
    // PHASE STRIKE: contact DURING a dash guts the enemy instead of hurting you — the dodge becomes
    // the highest-skill offense (line up a row, dash through, execute; kills feed the combo).
    if (this.time.now < this.dashIframeUntil) { this.phaseStrike(enemy); return }   // full i-frame window, not just the 175ms dash core — closes the PHASE DASH tier-1/2 tail where you passed through dealing nothing
    const pb = this.player.body as Phaser.Physics.Arcade.Body
    const eb = enemy.body as Phaser.Physics.Arcade.Body
    // Mario stomp: falling onto a SOFT enemy from above kills it and bounces you.
    const soft = type === 'walker' || type === 'flyer' || type === 'charger' || type === 'diver'
    if (soft && pb.velocity.y > 60 && pb.bottom <= eb.top + 22) {
      this.player.setVelocityY(-360)
      this.isJumping = true
      this.stompEnemy(enemy)
      return
    }
    // Armored / turret / boss punish the stomp — you take the hit.
    this.damagePlayer(type === 'boss' ? 'boss' : 'enemy', type)
  }

  // PHASE STRIKE — a dash-through execute. Deduped per dash so one sustained overlap can't multi-hit
  // across frames. NO hitstop on a non-lethal chip (it would freeze the dash mid-lunge); a lethal hit
  // routes through killEnemy so the kill's combo / drops / splitter-fission / boss finisher all fire.
  private phaseStrike(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active || enemy.getData('dying') === true) return
    if (this.dashHitList.includes(enemy)) return
    this.dashHitList.push(enemy)
    const type = enemy.getData('type') as string
    let dmg = 2 + this.dashLevel
    const shatter = ((enemy.getData('staggerUntil') as number) || 0) > this.time.now   // dash-execute a STAGGERED foe
    if (shatter) dmg = Math.round(dmg * 1.6)
    const hp = ((enemy.getData('hp') as number) || 0) - dmg
    enemy.setData('hp', hp)
    const col = shatter ? 0x67e8f9 : this.dashLevel >= 2 ? 0x67e8f9 : 0x22d3ee
    enemy.setTintFill(0xffffff)
    this.time.delayedCall(60, () => this.restoreTint(enemy))
    this.particles.emitParticleAt(enemy.x, enemy.y, shatter ? 14 : 8)
    this.shockwave(enemy.x, enemy.y, col, shatter ? 26 : 18)
    this.sfx?.crit(this.panAt(enemy.x))
    if (shatter) this.popup(enemy.x, enemy.y - 34, 'SHATTER', '#67e8f9')
    if (hp > 0) {
      if (type === 'boss') this.bossBarChip()
      const bsx = enemy.getData('bsx') as number, bsy = enemy.getData('bsy') as number
      if (bsx) { this.tweens.killTweensOf(enemy); this.tweens.add({ targets: enemy, scaleX: bsx * 1.2, scaleY: bsy * 0.82, duration: 60, yoyo: true, onComplete: () => { if (enemy.active) enemy.setScale(bsx, bsy) } }) }
      return
    }
    this.killEnemy(enemy)   // routes a boss through bossDeath internally
  }

  // SALVAGE + MOMENTUM fire on EVERY kill — routed through one helper so both killEnemy and the independent
  // stompEnemy scoring path feed them (a stomp is still a kill). (round-12 relic audit)
  private noteRelicKill(x: number, y: number) {
    if (this.relics.has('salvage') && ++this.salvageKills % 7 === 0) this.spawnPowerup(x, y - 8, 'health')   // SALVAGE relic — a heart economy off your kills
    if (this.relics.has('momentum')) this.momentumUntil = this.time.now + 1600   // MOMENTUM relic — a fresh kill quickens fire
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const type = enemy.getData('type') as string
    const isElite = enemy.getData('elite') === true
    let pts = type === 'flyer' ? 250 : 120
    if (isElite) pts = Math.round(pts * 2.2)
    pts = this.applyCombo(pts)
    this.kills++
    this.score += pts
    this.scoreText.setText('SCORE  ' + this.score)
    this.noteRelicKill(enemy.x, enemy.y)
    this.popup(enemy.x, enemy.y - 20, (isElite ? 'ELITE STOMP +' : 'STOMP +') + pts, '#fbbf24')
    this.particles.emitParticleAt(enemy.x, enemy.y, isElite ? 30 : 22)
    this.deathParticles.setParticleTint(isElite ? 0xfde047 : type === 'flyer' ? 0xa855f7 : 0xf43f5e)
    this.deathParticles.emitParticleAt(enemy.x, enemy.y, isElite ? 24 : 14)
    this.shockwave(enemy.x, enemy.y, isElite ? 0xfde047 : 0xfbbf24, isElite ? 40 : 24)
    this.hitstop(isElite ? 70 : 28)
    this.fxShake(isElite ? 140 : 60, isElite ? 0.018 : 0.012)
    this.sfx?.stomp(this.panAt(enemy.x))
    if (isElite || Math.random() < 0.3 * (this.heatRun && this.heatTier > 0 ? heatMods(this.heatTier).pods : 1)) {
      const kinds = ['health', 'spread', 'rapid', 'laser', 'fire', 'arc']
      this.spawnPowerup(enemy.x, enemy.y, kinds[Math.floor(Math.random() * kinds.length)])
    }
    enemy.destroy()
    if (this.isBossLevel() && this.enemies.countActive(true) === 0) this.onLevelClear()
  }

  private hitByEnemyBullet(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const b = bulletObj as Phaser.Physics.Arcade.Image
    b.setActive(false).setVisible(false)
    this.damagePlayer('bullet')
  }

  private damagePlayer(cause: DeathCause = 'enemy', killer?: string) {
    if (this.time.now < this.invulnUntil || this.gameOver || this.levelTransition || this.time.now < this.dashIframeUntil) return
    // AEGIS relic — absorb the first hit of each sector: consume the shield, brief i-frames, no health/combo loss.
    if (this.sectorShield && this.relics.has('aegis')) {
      this.sectorShield = false
      this.invulnUntil = this.time.now + 700   // so the same contact overlap can't immediately hit again
      this.popup(this.player.x, this.player.y - 30, 'SHIELD', '#67e8f9')
      this.shockwave(this.player.x, this.player.y, 0x67e8f9, 30)
      this.sfx?.deflect(); this.fxFlash(80, 60, 200, 255, false)
      return
    }
    this.buzz(60)   // firm hit buzz on mobile
    this.health -= 1
    this.runNoHit = false
    this.combo = 0; this.comboText.setText('')
    this.updateHealth()
    this.tipOnce('dodge', 'HIT! Tap DASH to DODGE — its i-frames\nslip you clean through enemy fire', '#22d3ee')   // teach the survival verb the moment it first matters (not minutes later at the guardian)
    this.invulnUntil = this.time.now + 800
    this.player.setTint(0xff0030)
    this.hitstop(70)
    this.fxShake(140, 0.018)
    this.fxFlash(100, 255, 30, 40, false)
    this.sfx?.hurt()
    this.player.setVelocityY(-260)
    this.time.delayedCall(200, () => { if (this.player.active) this.player.clearTint() })   // brief hit flash; i-frames run on the timestamp

    if (this.health <= 0) {
      this.lives -= 1; this.livesText.setText('LIVES  ' + this.lives)
      this.recordDeath(cause, this.player.x, this.player.y, killer)
      if (this.lives <= 0) this.triggerGameOver()
      else {
        this.health = this.maxHealth; this.updateHealth()
        this.player.setPosition(this.safeRespawnX(), this.lastGroundY - 48)
        this.player.setVelocity(0, 0); this.jumpsLeft = this.maxJumps
        this.invulnUntil = this.time.now + 1500   // full respawn i-frames — no stale timer can cut this short now
        this.player.clearTint()
      }
    }
  }

  private collectPowerup(
    _p: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const pow = powObj as Phaser.Physics.Arcade.Sprite
    const kind = pow.getData('kind') as string
    const info = powerupInfo(kind)
    const px = pow.x, py = pow.y
    pow.destroy()
    // Loud, color-matched pickup feedback: ring + burst + a screen flash in the pickup's
    // OWN color + a big named callout (name + what it does) + a HUD pulse on what changed.
    this.particles.emitParticleAt(px, py, 20)
    this.shockwave(px, py, info.color, 30)
    this.fxFlash(90, (info.color >> 16) & 255, (info.color >> 8) & 255, info.color & 255, false)
    this.pickupCallout(px, py, info)
    this.sfx?.pickupMotif(kind)
    if (kind === 'health') { this.health = Math.min(this.maxHealth, this.health + 1); this.updateHealth(); this.pulseHud(this.healthText) }
    else {
      if (kind !== this.weapon) {
        // Two-weapon carry: the new gun becomes active; the previous one drops to the backup slot.
        this.altWeapon = this.weapon; this.weapon = kind as typeof this.weapon
        this.tipOnce('swap', 'TWO GUNS now — swap anytime with Q\n(or the SWAP button)', '#c4b5fd')
      } else {
        // Same gun again — bank mastery instead of wasting the pod.
        const lv = Math.min(2, (this.weaponLvl[kind] || 0) + 1)
        if (lv !== (this.weaponLvl[kind] || 0)) {
          this.weaponLvl[kind] = lv
          this.popup(px, py - 42, 'MASTERY ' + '★'.repeat(lv), info.hex)
          this.fxShake(80, 0.006)
        }
      }
      this.updateWeaponHUD(); this.pulseHud(this.weaponText)
    }
  }

  // A big, unmistakable callout at the pickup point: the powerup's NAME (in its own color)
  // with a one-line effect under it, popping in then rising and fading.
  private pickupCallout(x: number, y: number, info: PowerupInfo) {
    const name = this.add.text(x, y - 4, info.label, {
      fontFamily: 'monospace', fontSize: '22px', color: info.hex, fontStyle: 'bold', stroke: '#0a0612', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(80).setScale(0.5)
    this.tweens.add({ targets: name, scale: 1, duration: 150, ease: 'Back.out' })
    this.tweens.add({ targets: name, y: y - 58, alpha: 0, duration: 1000, delay: 320, onComplete: () => name.destroy() })
    if (info.desc) {
      const desc = this.add.text(x, y + 17, info.desc, {
        fontFamily: 'monospace', fontSize: '10px', color: info.hex, stroke: '#0a0612', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(80).setAlpha(0)
      this.tweens.add({ targets: desc, alpha: 1, duration: 150 })
      this.tweens.add({ targets: desc, y: y - 28, alpha: 0, duration: 1000, delay: 380, onComplete: () => desc.destroy() })
    }
  }

  // Brief scale-pop on a HUD label so the eye is drawn to the stat that just changed.
  private pulseHud(t?: Phaser.GameObjects.Text) {
    if (!t) return
    this.tweens.killTweensOf(t)
    t.setScale(1)
    this.tweens.add({ targets: t, scaleX: 1.35, scaleY: 1.35, duration: 130, yoyo: true, ease: 'Quad.out', onComplete: () => t.setScale(1) })
  }

  private wlabel(w: string) {
    return ({ spread: 'SPREAD', rapid: 'RAPID', laser: 'LASER', fire: 'FIRE', arc: 'ARC' } as Record<string, string>)[w] || 'NORMAL'
  }

  private updateWeaponHUD() {
    // One backup weapon shown dim after the active one; a ▶ marks what's firing. Mastery ★s trail each gun.
    const stars = (w: string) => '★'.repeat(this.weaponLvl[w] || 0)
    if (this.altWeapon === this.weapon) this.weaponText.setText('GUN  ' + this.wlabel(this.weapon) + stars(this.weapon))
    else this.weaponText.setText('GUN ▶' + this.wlabel(this.weapon) + stars(this.weapon) + '  ·' + this.wlabel(this.altWeapon) + stars(this.altWeapon))
  }

  private swapWeapon() {
    if (this.gameOver || !this.started || this.altWeapon === this.weapon) return
    if (this.contractOpen || this.userPaused || this.levelTransition) return   // a frozen player can't swap (round-4 FRAGILITY3)
    const t = this.weapon; this.weapon = this.altWeapon; this.altWeapon = t
    this.updateWeaponHUD()
    this.sfx?.swap()
    this.popup(this.player.x, this.player.y - 44, '▶ ' + this.wlabel(this.weapon), '#22d3ee')
  }

  private updateHealth() {
    const h = '♥'.repeat(Math.max(0, this.health)) + '♡'.repeat(Math.max(0, this.maxHealth - this.health))
    this.healthText.setText('HP  ' + h)
    this.updateDanger()
  }

  private onLevelClear() {
    if (this.rushRun) { this.advanceTrials(); return }   // boss rush drives its own progression (heal + next boss)
    if (this.levelTransition) return
    this.levelTransition = true
    this.sectorClearedMs = Date.now() - this.runStartAt   // freeze the split NOW — before the 900ms delay + contract screen, so it measures the clear, not the deliberation
    this.sfx?.fanfare()
    if (this.level < this.levels().length) {
      // Campaign: offer an Apex Contract between sectors, then advance. Daily stays pure (no boons).
      if (this.dailyRun) this.advanceSector()
      else this.time.delayedCall(900, () => this.offerContract(() => this.advanceSector()))
    } else this.showVictory()
  }

  private advanceSector() {
    const next = this.level + 1
    this.sectorShield = this.relics.has('aegis')   // AEGIS relic refreshes its one-hit shield at each new sector

    const msg = this.add.text(256, 150, `SECTOR ${next}\n${this.levels()[next - 1].name}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#22d3ee', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    // Per-sector SPLIT (campaign only): time to clear THIS sector (the one we're leaving) vs your
    // personal best — a speedrun-style improvement loop layered on the score chase. Daily/Trials/Heat
    // run their own boards, so they don't record splits.
    let splitObj: Phaser.GameObjects.Text | null = null
    if (this.isBaseCampaign()) {
      const cur = this.sectorClearedMs   // the frozen clear instant (set in onLevelClear), not "now" — excludes the contract-screen time
      const r = recordSplit(this.level, cur)
      const txt = r.first ? '⏱ ' + fmtTime(cur) + '  ·  first clear'
        : r.record ? '⏱ ' + fmtTime(cur) + '  ·  ' + fmtDelta(r.delta) + ' — PB!'
          : '⏱ ' + fmtTime(cur) + '  ·  ' + fmtDelta(r.delta)
      splitObj = this.add.text(256, 190, txt, { fontFamily: 'monospace', fontSize: '11px', color: (r.record || r.first) ? '#4ade80' : '#fbbf24' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(200)
    }
    this.time.delayedCall(1300, () => {
      msg.destroy(); splitObj?.destroy()
      this.level = next
      this.levelText.setText('SECTOR  ' + next)
      const d = this.levels()[next - 1]
      this.buildLevel(next)
      this.player.setPosition(d.spawn[0], d.spawn[1])
      this.player.setVelocity(0, 0); this.jumpsLeft = this.maxJumps
      this.lastGroundX = d.spawn[0]; this.lastGroundY = d.spawn[1]
      this.health = this.maxHealth; this.updateHealth()   // fresh full hearts at every new level
      this.levelTransition = false
      this.showBanner('SECTOR ' + next, d.name)
    })
  }

  // Apex Contract screen — 3 random boons, pick one (pointer / 1-2-3 / gamepad) to keep for the run.
  private offerContract(onDone: () => void) {
    this.contractOpen = true
    this.contractOnDone = onDone
    this.contractPadPrev = true                    // ignore the button still held from clearing the sector
    this.contractFocus = 0
    this.contractNavPrev = 0
    this.physics.pause()
    this.setBridge('contract')
    const pool = CONTRACTS.filter((c) => !c.relic || !this.relics.has(c.id))   // owned relics drop out of the draw; stat boons stay repeatable
    this.contractPicks = []
    for (let i = 0; i < 3 && pool.length; i++) this.contractPicks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.contractUI.push(o); return o }
    keep(this.add.rectangle(256, 192, 512, 384, 0x05040a, 0.94).setScrollFactor(0).setDepth(230).setInteractive())
    keep(this.add.text(256, 66, 'APEX CONTRACT', { fontFamily: 'monospace', fontSize: '18px', color: '#fbbf24', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(231))
    keep(this.add.text(256, 90, 'choose one boon — it lasts the rest of the run', { fontFamily: 'monospace', fontSize: '9px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(231))
    this.contractCards = []
    this.contractPicks.forEach((b, i) => {
      const y = 138 + i * 56
      const col = Phaser.Display.Color.HexStringToColor(b.hex).color
      const card = keep(this.add.rectangle(256, y, 306, 48, 0x1e1b4b, 0.6).setScrollFactor(0).setDepth(231).setStrokeStyle(2, col, 0.85).setInteractive({ useHandCursor: true }))
      this.contractCards.push(card)
      keep(this.add.text(256, y - 9, (i + 1) + '.  ' + b.name, { fontFamily: 'monospace', fontSize: '12px', color: b.hex, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(232))
      keep(this.add.text(256, y + 10, b.desc, { fontFamily: 'monospace', fontSize: '9px', color: '#e9d5ff' }).setOrigin(0.5).setScrollFactor(0).setDepth(232))
      if (b.relic) keep(this.add.text(398, y - 20, '◆ RELIC', { fontFamily: 'monospace', fontSize: '7px', color: b.hex, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(232))   // mark the build-defining picks so they read apart from stat boons
      card.on('pointerover', () => { this.contractFocus = i; this.updateContractFocus() })
      card.on('pointerdown', () => this.pickContract(b.id))
    })
    // Focus ring — the keyboard/gamepad cursor. Sits just above the cards; moved by ▲▼.
    this.contractFocusRing = keep(this.add.rectangle(256, 138, 314, 52, 0x000000, 0).setScrollFactor(0).setDepth(233).setStrokeStyle(2.5, 0xfde68a, 1))
    this.updateContractFocus()
    keep(this.add.text(256, 322, '① ② ③ or tap  ·  pad ▲▼ to choose, button confirms', { fontFamily: 'monospace', fontSize: '8px', color: '#52525b' }).setOrigin(0.5).setScrollFactor(0).setDepth(231))
    const kh = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= this.contractPicks.length) { this.pickContract(this.contractPicks[n - 1].id); return }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { this.contractFocus--; this.updateContractFocus() }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { this.contractFocus++; this.updateContractFocus() }
      else if (e.key === 'Enter' || e.key === ' ') { const b = this.contractPicks[this.contractFocus]; if (b) this.pickContract(b.id) }
    }
    this.contractKey = kh
    this.input.keyboard!.on('keydown', kh)
  }

  // Move the focus ring to the cursored card and brighten it (dim the rest) so keyboard/pad
  // players can see — and therefore choose — boon 2 or 3, not just the mouse-hover highlight.
  private updateContractFocus() {
    const n = this.contractPicks.length
    if (n) this.contractFocus = ((this.contractFocus % n) + n) % n
    this.contractCards.forEach((c, i) => c.setFillStyle(i === this.contractFocus ? 0x2e2a5c : 0x1e1b4b, i === this.contractFocus ? 0.85 : 0.6))
    if (this.contractFocusRing) this.contractFocusRing.setPosition(256, 138 + this.contractFocus * 56)
  }

  private pickContract(id: string) {
    if (!this.contractOpen) return
    this.contractOpen = false
    if (this.contractKey) { this.input.keyboard!.off('keydown', this.contractKey); this.contractKey = undefined }
    this.applyContract(id)
    this.sfx?.pickup()
    const chosen = this.contractPicks.find((b) => b.id === id)
    this.contractUI.forEach((o) => o.destroy()); this.contractUI = []
    if (chosen) this.screenToast('▸ ' + chosen.name, chosen.hex, 120)
    this.physics.resume()
    this.setBridge('playing')
    const done = this.contractOnDone; this.contractOnDone = undefined
    if (done) done()
  }

  private applyContract(id: string) {
    switch (id) {
      case 'heal':      this.health = this.maxHealth; this.updateHealth(); break
      case 'vitality':  this.maxHealth++; this.health = this.maxHealth; this.updateHealth(); break
      case 'reserves':  this.lives++; this.livesText.setText('LIVES  ' + this.lives); break
      case 'firepower': this.fireBonus += 14; break
      case 'boots':     this.maxJumps++; break
      case 'mastery':   this.weaponLvl[this.weapon] = Math.min(2, (this.weaponLvl[this.weapon] || 0) + 1); this.updateWeaponHUD(); break
      // RELICS — set a per-run flag that combat reads (see EMBERS/SALVAGE/AEGIS/ARC LASH hooks).
      case 'embers':    this.relics.add('embers'); break
      case 'salvage':   this.relics.add('salvage'); break
      case 'aegis':     this.relics.add('aegis'); this.sectorShield = true; break
      case 'arclash':   this.relics.add('arclash'); break
      case 'gale':      this.relics.add('gale'); break
      case 'momentum':  this.relics.add('momentum'); break
    }
  }

  // Persist the best score across sessions; report whether this run beat it.
  private saveBest(): { best: number; record: boolean; prevBest: number } {
    let best = 0
    try { best = parseInt(localStorage.getItem('apex_best') || '0', 10) || 0 } catch { best = 0 }
    const prevBest = best
    const record = this.score > best
    if (record) { try { localStorage.setItem('apex_best', String(this.score)) } catch { /* ignore */ } best = this.score }
    return { best, record, prevBest }
  }

  // Death-screen retention hooks (shared by MISSION FAILED / SECTOR DOMINATED): a personal-best
  // delta, the player's live GLOBAL RANK (fetched async, graceful when offline), and a one-tap
  // SHARE that copies a result line to the clipboard. All degrade silently with no wallet/board.
  // Settle DAILY BOUNTIES for the just-finished run: bank the shard reward for any newly met and
  // toast it. Runs on every death/clear (campaign, daily, or trials) — bounties track peak run stats.
  private settleBounties() {
    const { newly, reward } = evalBounties(todayKey(), { kills: this.kills, bosses: this.bossesThisRun, maxCombo: this.maxCombo, sector: this.level })
    if (!newly.length) return
    bankShards(reward)
    const label = newly.length === 1 ? newly[0].label : newly.length + ' bounties done'
    this.screenToast('◇ BOUNTY ✓  ' + label + '   +' + reward + '◈', '#fbbf24', 150)
  }

  // Fold this run into the WEEKLY CONTRACTS (cumulative across the week); bank + toast any completed.
  // One predicate for "does this run touch CAMPAIGN records?" — routed through every carve-out so a
  // new mode can't half-wire itself into the campaign best / splits / speedrun the way daily & heat did.
  private isBaseCampaign(): boolean { return !this.dailyRun && !this.rushRun && !this.heatRun }

  private settleContracts(win: boolean) {
    const { completed, reward, capstone } = foldContracts(weekKey(), { kills: this.kills, bosses: this.bossesThisRun, win: win ? 1 : 0, grazes: this.grazeCount })
    if (!reward) return
    bankShards(reward)
    const label = capstone ? 'WEEKLY CONTRACTS COMPLETE' : completed.length === 1 ? completed[0].label : completed.length + ' contracts'
    this.time.delayedCall(600, () => { if (this.gameOver) this.screenToast('◈ CONTRACT ✓  ' + label + '   +' + reward + '◈', '#c084fc', 130) })
  }

  // Weekly TRIALS results line: the post-commit rank + named rival for this run's weekly standing,
  // painted on the death/clear screen. Token-guarded so a slow response can't bleed onto a later run.
  private trialsExtras(submit: Promise<SubmitResult | null> | null, token: number) {
    if (!submit) return
    const line = (s: string) => {
      if (!this.gameOver || this.deathToken !== token) return
      this.add.text(256, 249, s, { fontFamily: 'monospace', fontSize: '9px', color: '#fbbf24' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(201)
    }
    submit.then((r) => {
      if (!r || !r.rank) return
      let s = '◆  WEEKLY RANK  #' + r.rank
      if (r.next) {
        const who = (r.next.handle || 'RIVAL').slice(0, 12)
        const mine = r.best?.score ?? this.score          // rank/rival are computed vs your weekly BEST, so gap must be too
        const gap = Math.max(1, r.next.score - mine).toLocaleString()
        s = '◆  TRIALS #' + r.rank + '   ▲ ' + gap + ' to pass ' + who
      }
      line(s)
    }).catch(() => { /* offline — the local best line already stands in */ })
  }

  // APEX HEAT results line: the post-commit rank + named rival on THIS tier's board. Token-guarded.
  private heatExtras(submit: Promise<SubmitResult | null> | null, token: number) {
    if (!submit) return
    const tier = this.heatTier
    const line = (s: string) => {
      if (!this.gameOver || this.deathToken !== token) return
      this.add.text(256, 249, s, { fontFamily: 'monospace', fontSize: '9px', color: '#f97316' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(201)
    }
    submit.then((r) => {
      if (!r || !r.rank) return
      let s = '◆  HEAT ' + tier + ' RANK  #' + r.rank
      if (r.next) {
        const who = (r.next.handle || 'RIVAL').slice(0, 12)
        const mine = r.best?.score ?? this.score
        const gap = Math.max(1, r.next.score - mine).toLocaleString()
        s = '◆  HEAT ' + tier + ' #' + r.rank + '   ▲ ' + gap + ' to pass ' + who
      }
      line(s)
    }).catch(() => { /* offline — local best line stands in */ })
  }

  // Campaign SPEEDRUN results line (base-campaign clears only): posts the clear time and shows the
  // authoritative global speed rank + the next-faster ghost. Token-guarded; updates one text in place.
  private speedExtras(runMs: number, token: number) {
    if (!this.gameOver || this.deathToken !== token) return
    const txt = this.add.text(256, 285, '⏱  CLEAR ' + fmtTime(runMs), { fontFamily: 'monospace', fontSize: '9px', color: '#67e8f9' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201)
    submitSpeedrun(runMs, this.level).then((r) => {
      if (!txt.active || !this.gameOver || this.deathToken !== token || !r || !r.rank) return
      let s = '⏱  ' + fmtTime(runMs) + '  ·  SPEED #' + r.rank
      if (r.next) {
        const who = (r.next.handle || 'the ghost').slice(0, 12)
        const mine = r.best?.ms ?? runMs
        const gap = ((mine - r.next.ms) / 1000).toFixed(1)
        s = '⏱  ' + fmtTime(runMs) + '  · #' + r.rank + '  ▲ ' + gap + 's to pass ' + who
      }
      txt.setText(s)
    }).catch(() => { /* offline — the clear time already stands */ })
  }

  private deathExtras(sector: number, prevBest: number, record: boolean, submit: Promise<SubmitResult | null> | null, seasonSubmit: Promise<SubmitResult | null> | null, token: number, win: boolean) {
    this.shareRank = null   // the flex card reads this once the POST resolves (below)
    const delta = this.score - prevBest
    const pb = record
      ? (prevBest > 0 ? '+' + delta.toLocaleString() + ' over your best' : 'your first ranked run')
      : delta === 0 ? 'matched your best' : (-delta).toLocaleString() + ' to beat your best'
    this.add.text(256, 246, pb, { fontFamily: 'monospace', fontSize: '9px', color: record ? '#4ade80' : '#71717a' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201)
    // The rank line is painted once, guarded by the run token so a slow response from a
    // previous run can never bleed onto this (or the next) death screen.
    const rankLine = (s: string) => {
      if (!this.gameOver || this.deathToken !== token) return
      this.add.text(256, 257, s, { fontFamily: 'monospace', fontSize: '9px', color: '#67e8f9' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(201)
    }
    // Authoritative standings come back from the POSTs themselves (no POST-then-GET race). We LEAD with
    // the monthly SEASON rank — the catchable target — because most players' all-time rank is out of reach;
    // the all-time rank rides along and still feeds the flex card. A named rival turns it into a concrete
    // next-run goal. Offline / no wallet falls back to a read-only board read.
    Promise.all([submit || Promise.resolve(null), seasonSubmit || Promise.resolve(null)]).then(([r, se]) => {
      if (r && r.rank && this.gameOver && this.deathToken === token) this.shareRank = r.rank   // flex card reads the all-time rank
      // PERSISTENT RIVAL — pin the season rung above you and celebrate a run that passes the rival you've
      // been chasing across sessions, then re-pin the next rung. Turns an anonymous rank into a grudge match.
      if (se && se.best && this.gameOver && this.deathToken === token) {
        const pinned = loadRival()
        if (pinned && se.best.score >= pinned.score) {
          this.screenToast('★ OVERTOOK ' + pinned.handle, '#fde68a', 64); this.sfx?.fanfare()
          if (se.next) saveRival({ handle: (se.next.handle || 'RIVAL').slice(0, 16), score: se.next.score }); else clearRival()   // cleared = you reached the top
        } else if (se.next) {
          saveRival({ handle: (se.next.handle || 'RIVAL').slice(0, 16), score: se.next.score })
        }
      }
      if (se && se.rank) {
        let line = '◆  SEASON #' + se.rank + (r && r.rank ? '  ·  ALL-TIME #' + r.rank : '')
        if (se.next) {
          const who = (se.next.handle || 'RIVAL').slice(0, 10)
          const mine = se.best?.score ?? this.score          // season rank/rival computed vs your monthly BEST
          line = '◆  SEASON #' + se.rank + '  ▲ ' + Math.max(1, se.next.score - mine).toLocaleString() + ' to pass ' + who
        }
        rankLine(line)
        return
      }
      if (r && r.rank) {
        let line = '◆  GLOBAL RANK  #' + r.rank
        if (r.next) {
          const who = (r.next.handle || 'RIVAL').slice(0, 12)
          const mine = r.best?.score ?? this.score          // rank/rival are computed vs your BEST, so gap must be too
          line = '◆  RANK #' + r.rank + '    ▲ ' + Math.max(1, r.next.score - mine).toLocaleString() + ' to pass ' + who
        }
        rankLine(line)
        return
      }
      if (!this.gameOver || this.deathToken !== token) return
      fetchLeaderboard().then((d) => {
        if (d.online && d.top.length) rankLine('◆  TOP  ' + d.top[0].score.toLocaleString() + ' to catch #1')
      }).catch(() => { /* offline — the local Best line already stands in */ })
    }).catch(() => { /* swallow — the local Best line already stands in */ })
    // One-tap share: render a procedural PNG flex card and hand it to the OS share sheet
    // (mobile) or download it + copy the text (desktop). topOnly input keeps this off the
    // tap-to-restart backdrop. Card is built lazily on tap, so a death that's never shared costs nothing.
    const share = this.add.text(256, 300, '⧉  SHARE CARD', { fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd', backgroundColor: '#1e1b4b', padding: { x: 10, y: 5 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true })
    share.on('pointerover', () => share.setColor('#e9d5ff'))
    let sharing = false
    share.on('pointerdown', () => {
      if (sharing) return
      sharing = true
      const rankTxt = this.shareRank ? ' · rank #' + this.shareRank : ''
      const txt = 'APEX STRIKE — ' + this.score.toLocaleString() + ' · Sector ' + sector + rankTxt + ' ▸ play at apexstrike.app'
      const theme = THEMES[this.levels()[this.level - 1]?.theme ?? 'streets']
      const hx = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0')
      const pr = currentRank()
      const summary: FlexSummary = {
        score: this.score, sector, kills: this.kills, maxCombo: this.maxCombo, win,
        rank: this.shareRank, handle: localHandle() || null,
        prestige: pr, prestigeTitle: pr > 0 ? rankTitle(pr) : undefined, prestigeGlyph: prestigeGlyph(pr) || undefined, prestigeHex: pr > 0 ? rankBandColor(pr) : undefined,
        topHex: hx(theme.accent), botHex: hx(theme.bg),
      }
      share.setText('preparing…').setColor('#a5b4fc')
      try {
        const canvas = renderFlexCard(summary)
        shareCard(canvas, txt).then((outcome) => {
          share.setText(outcome === 'shared' ? 'SHARED ✓' : outcome === 'downloaded' ? 'SAVED ✓  — image + text copied' : 'COPIED ✓  — paste anywhere').setColor('#4ade80')
          sharing = false
        }).catch(() => { share.setText('COPIED ✓').setColor('#4ade80'); sharing = false })
      } catch {
        try { (navigator as Navigator).clipboard?.writeText(txt) } catch { /* clipboard blocked */ }
        share.setText('COPIED ✓  — paste anywhere').setColor('#4ade80'); sharing = false
      }
    })
  }

  // Shared results block: score, run stats, and a NEW RECORD flourish.
  private resultsCard(record: boolean) {
    this.add.text(256, 140, 'SCORE  ' + this.score, { fontFamily: 'monospace', fontSize: '15px', color: '#e879f9' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 166, 'Kills ' + this.kills + '     Best Combo x' + this.maxCombo, { fontFamily: 'monospace', fontSize: '10px', color: '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    if (record) {
      const rec = this.add.text(256, 187, '★  NEW RECORD  ★', { fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24' }).setOrigin(0.5).setScrollFactor(0).setDepth(202)
      this.tweens.add({ targets: rec, alpha: 0.35, duration: 420, yoyo: true, repeat: -1 })
    }
  }

  // A death/victory/pause restart. Non-daily runs quick-retry straight back into play (skip the
  // title); a daily death is a one-run board so it — and the explicit [ TITLE ] link — go home.
  private restartRun(toTitle = false) {
    this.scene.restart(toTitle || this.dailyRun || this.rushRun || this.heatRun ? {} : { quickRetry: true })
  }

  // The small secondary "back to the title" link on a death/victory screen (depth 202 so it sits
  // above the full-screen restart backdrop; topOnly input means its click won't also quick-retry).
  private titleLink() {
    const t = this.add.text(256, 330, '[ TITLE ]', { fontFamily: 'monospace', fontSize: '9px', color: '#52525b' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true })
    t.on('pointerover', () => t.setColor('#a5b4fc'))
    t.on('pointerdown', () => this.restartRun(true))
  }

  // Fold this run into the badge set and celebrate anything newly earned (staggered toasts over
  // the results screen). Runs for campaign AND daily runs — kills/combos/wins are real either way.
  private evalBadges(win: boolean) {
    const summary: RunSummary = {
      score: this.score, kills: this.kills, maxCombo: this.maxCombo, sector: this.level,
      win, noHit: this.runNoHit, gunMaxed: Object.values(this.weaponLvl).some((v) => v >= 2),
      dailyStreak: getDailyStreak().streak, shards: this.runShards,
    }
    const newly = evalAchievements(summary)
    newly.forEach((a, i) => this.time.delayedCall(750 + i * 850, () => {
      if (!this.gameOver) return
      this.screenToast(a.glyph + '  BADGE — ' + a.name, a.hex, 150)
      this.sfx?.pickup()
    }))
  }

  // Keep this account's Apex Rank on the server board (covers ranks enlisted while offline), and on a
  // campaign death surface the run's shard payout so the reward isn't invisible on the quick-retry path.
  private rankRunEnd(toast: boolean) {
    const r = currentRank()
    if (hasWallet() && r > 0) submitRank(r)
    const deploy = claimCampaignDaily()   // DAILY DEPLOYMENT: first campaign run finished today banks a flat bonus
    if (deploy > 0) bankShards(deploy)
    if (toast && (this.runShards > 0 || deploy > 0)) {
      const banked = loadMeta().shards
      const bonus = deploy > 0 ? '   ·   ★ +' + deploy + ' daily' : ''
      this.time.delayedCall(950, () => { if (this.gameOver) this.screenToast('◆ +' + this.runShards + ' shards  ·  ' + banked + ' banked' + (r > 0 ? '  ·  RANK ' + r : '') + bonus, '#67e8f9', 250) })
    }
  }

  // RESUPPLY: the first Daily completed each UTC day banks a streak-scaled shard bonus (funds the
  // Armory / Apex Rank), toasted so the payout is visible. Idempotent per day inside claimDailyDividend.
  private payDailyResupply() {
    const div = claimDailyDividend()
    if (div <= 0) return
    bankShards(div)
    this.time.delayedCall(800, () => { if (this.gameOver) this.screenToast('★ RESUPPLY  +' + div + ' ◆   ·   ' + getDailyStreak().streak + '-day streak', '#67e8f9', 250) })
  }

  private triggerGameOver() {
    if (this.gameOver) return   // idempotent — a second death/clear in the same frame must not double-submit or double-eval
    this.gameOver = true
    this.recordRun('gameover')
    this.setBridge('over')
    const token = ++this.deathToken
    let submit: Promise<SubmitResult | null> | null = null
    let trialsSubmit: Promise<SubmitResult | null> | null = null
    let heatSubmit: Promise<SubmitResult | null> | null = null
    let seasonSubmit: Promise<SubmitResult | null> | null = null
    if (this.dailyRun) { submitDaily(this.dailyDay || todayKey(), this.score, this.level); noteDailyPlayed(); this.payDailyResupply() }
    else if (this.rushRun) trialsSubmit = submitTrials(weekKey(), this.score, this.rushIndex)   // post the run to the weekly Trials board
    else if (this.heatRun) heatSubmit = submitAscension(this.heatTier, this.score, this.level)  // post to the per-tier HEAT board
    else { submit = submitScore(this.score, this.level); seasonSubmit = submitSeason(monthKey(), this.score, this.level) }   // campaign posts to the all-time board + the current month's Season board
    this.sfx?.stopMusic()
    this.player.setTint(0x333333); this.player.setVelocity(0, 0)
    const { best, record, prevBest } = this.rushRun ? saveTrialsBest(this.score)
      : !this.isBaseCampaign() ? { best: this.score, record: false, prevBest: this.score }   // daily/heat have their own boards; never touch the campaign best (apex_best)
      : this.saveBest()
    this.evalBadges(false)
    this.settleBounties()
    this.settleContracts(false)
    this.gameOverAt = this.time.now
    // Whole-screen tap-to-restart (the small text alone was too easy to miss on touch),
    // plus any key restarts; gamepad restart is handled in update(). 400ms grace so the
    // input that killed you can't instantly restart.
    this.add.rectangle(256, 192, 512, 384, 0x0a0612, 0.9).setScrollFactor(0).setDepth(200).setInteractive()
      .on('pointerdown', () => { if (this.time.now > this.gameOverAt + 400) this.restartRun() })
    this.input.keyboard!.on('keydown', () => { if (this.gameOver && this.time.now > this.gameOverAt + 400) this.restartRun() })
    this.add.text(256, 96, 'MISSION FAILED', { fontFamily: 'monospace', fontSize: '21px', color: '#f43f5e' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.resultsCard(record)
    // On an extraction stage, frame how far the run got — "63% to extraction" reads as near-miss progress
    // (which pulls a new player into run 2) instead of a flat "Reached Sector 1" that reads as total failure.
    const reachPct = (this.goalX > 0 && !this.isBossLevel() && !this.rushRun)
      ? '  ·  ' + Math.round(Phaser.Math.Clamp((this.player.x - 120) / Math.max(1, this.goalX - 120), 0, 1) * 100) + '% to extraction' : ''
    const midline = this.rushRun ? 'APEX TRIALS  ·  ' + this.rushIndex + '/' + this.rushOrder.length + ' bosses'
      : this.heatRun ? 'APEX HEAT ' + this.heatTier + '  ·  Reached Sector ' + this.level + reachPct
      : 'Reached Sector ' + this.level + reachPct
    this.add.text(256, 212, midline, { fontFamily: 'monospace', fontSize: '10px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 230, 'Best  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    if (this.rushRun) this.trialsExtras(trialsSubmit, token)
    else if (this.heatRun) this.heatExtras(heatSubmit, token)
    else if (!this.dailyRun) this.deathExtras(this.level, prevBest, record, submit, seasonSubmit, token, false)
    const btn = this.add.text(256, 268, (this.dailyRun || this.rushRun || this.heatRun) ? '[ CLICK / TAP TO CONTINUE ]' : '[ RETRY — CLICK / TAP / ANY KEY ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.restartRun())
    if (this.isBaseCampaign()) { this.titleLink(); this.rankRunEnd(true) }
  }

  private showVictory() {
    if (this.gameOver) return   // idempotent — guards against a double clear (e.g. AoE finishing two things at once)
    this.gameOver = true
    this.recordRun('win')
    this.setBridge('over')
    const token = ++this.deathToken
    let submit: Promise<SubmitResult | null> | null = null
    let trialsSubmit: Promise<SubmitResult | null> | null = null
    let heatSubmit: Promise<SubmitResult | null> | null = null
    let seasonSubmit: Promise<SubmitResult | null> | null = null
    if (this.dailyRun) { submitDaily(this.dailyDay || todayKey(), this.score, this.level); noteDailyPlayed(); this.payDailyResupply() }
    else if (this.rushRun) trialsSubmit = submitTrials(weekKey(), this.score, this.rushIndex)   // post the clear to the weekly Trials board
    else if (this.heatRun) heatSubmit = submitAscension(this.heatTier, this.score, this.level)  // post the clear to the per-tier HEAT board
    else { submit = submitScore(this.score, this.level); seasonSubmit = submitSeason(monthKey(), this.score, this.level) }   // campaign posts to the all-time board + the current month's Season board
    // Clearing the campaign — the base run OR a heat tier — unlocks the next Heat tier.
    const heatFirstClear = this.heatRun ? noteHeatClear(this.heatTier) : false   // BEFORE noteCampaignClear (its back-fill reads the pre-raise ceiling); pays every tier's first clear incl. the MAX tier
    const unlock = (!this.dailyRun && !this.rushRun) ? noteCampaignClear(this.heatTier) : null
    this.sfx?.stopMusic()
    this.player.setVelocity(0, 0)
    const { best, record, prevBest } = this.rushRun ? saveTrialsBest(this.score)
      : !this.isBaseCampaign() ? { best: this.score, record: false, prevBest: this.score }   // daily/heat have their own boards; a daily WIN must never clobber the campaign best (apex_best) or paint a false NEW RECORD — matches triggerGameOver (round-11 bug#1)
      : this.saveBest()
    this.evalBadges(!this.rushRun)   // a Trials clear isn't a campaign win (no CHAMPION), but kills/combos/boss-mask still fold in
    this.settleBounties()
    this.settleContracts(true)   // any clear counts as a "win" — consistent with kills/bosses/grazes folding from every mode
    this.gameOverAt = this.time.now
    this.add.rectangle(256, 192, 512, 384, 0x0a0612, 0.9).setScrollFactor(0).setDepth(200).setInteractive()
      .on('pointerdown', () => { if (this.time.now > this.gameOverAt + 400) this.restartRun() })
    this.input.keyboard!.on('keydown', () => { if (this.gameOver && this.time.now > this.gameOverAt + 400) this.restartRun() })
    this.add.text(256, 92, this.rushRun ? 'TRIALS CLEARED' : this.heatRun ? 'HEAT ' + this.heatTier + ' CLEARED' : 'SECTOR DOMINATED', { fontFamily: 'monospace', fontSize: '19px', color: this.heatRun ? '#f97316' : '#22d3ee' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.resultsCard(record)
    const subtitle = this.rushRun ? 'All ' + this.rushOrder.length + ' bosses down — Apex Trials complete.'
      : this.heatRun ? 'APEX HEAT ' + this.heatTier + ' · ' + heatMods(this.heatTier).name + ' conquered.'
      : 'The Huntress claims the Apex.'
    this.add.text(256, 212, subtitle, { fontFamily: 'monospace', fontSize: '10px', color: '#a1a1aa' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    this.add.text(256, 230, 'Best  ' + best, { fontFamily: 'monospace', fontSize: '10px', color: '#71717a' }).setOrigin(0.5).setScrollFactor(0).setDepth(201)
    if (this.rushRun) this.trialsExtras(trialsSubmit, token)
    else if (this.heatRun) this.heatExtras(heatSubmit, token)
    else if (!this.dailyRun) this.deathExtras(this.level, prevBest, record, submit, seasonSubmit, token, true)
    if (this.isBaseCampaign()) this.speedExtras(Date.now() - this.runStartAt, token)   // post + show the campaign clear time
    if (unlock && unlock.raised) this.time.delayedCall(650, () => { if (this.gameOver) this.screenToast('🔥 APEX HEAT ' + unlock.unlocked + ' UNLOCKED', '#f97316', 150) })
    if (heatFirstClear) {
      // First-ever clear of this Heat tier — a one-time shard bounty scaled by tier. Gated on a per-tier
      // stamp (noteHeatClear), not the unlock-ceiling advance, so the MAX tier pays too (v2.47 regression:
      // 'raised' is always false at the ceiling). Farm-proof: a re-clear returns false.
      const heatBonus = 10 + this.heatTier * 6
      bankShards(heatBonus)
      this.time.delayedCall(1100, () => { if (this.gameOver) this.screenToast('◆ HEAT ' + this.heatTier + ' FIRST-CLEAR BOUNTY  +' + heatBonus, '#fbbf24', 186) })
    }
    if (this.isBaseCampaign() && unlock && unlock.raised) {
      // First-EVER campaign clear (the unlock ceiling just rose 0→1) — the funnel's key activation
      // milestone. Beating the game finally banks a one-time bounty of its own, not just the run's pod
      // shards. 'raised' can only fire on the first base clear, so it can't be farmed.
      const campBonus = 40
      bankShards(campBonus)
      this.time.delayedCall(1300, () => { if (this.gameOver) this.screenToast('★ CAMPAIGN CLEARED — FIRST-CLEAR BOUNTY +' + campBonus, '#4ade80', 210) })
    }
    const btn = this.add.text(256, 268, (this.rushRun || this.heatRun) ? '[ CLICK / TAP TO CONTINUE ]' : '[ PLAY AGAIN — CLICK / TAP / ANY KEY ]', { fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => this.restartRun())
    if (this.isBaseCampaign()) { this.titleLink(); this.rankRunEnd(true) }   // un-silence the win payout — a clear banks shards + the daily deploy bonus, now acknowledged like a death does
  }
}
