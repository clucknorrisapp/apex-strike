// Apex Strike — self-owned app server. Serves the built game (static SPA) AND our
// own leaderboard API from a single Railway service. Scores live in our own Postgres
// (DATABASE_URL). If no database is configured/reachable the game still serves
// perfectly and the leaderboard simply reports itself "offline" — the server never
// crashes on a DB problem, so a bad DB can never take the site down.

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 3000

// ---- Postgres (optional) -------------------------------------------------
const DB_URL = process.env.DATABASE_URL || ''
const isLocalDb = /localhost|127\.0\.0\.1|::1|\.railway\.internal/i.test(DB_URL)
let pool = null
let dbReady = false

if (DB_URL) {
  pool = new pg.Pool({
    connectionString: DB_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  })
  pool.on('error', (e) => { console.error('[db] pool error:', e.message) })
  migrate()
} else {
  console.log('[db] DATABASE_URL not set — leaderboard OFFLINE (game still served)')
}

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        wallet     TEXT PRIMARY KEY,
        handle     TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS scores (
        wallet     TEXT PRIMARY KEY,
        score      INTEGER NOT NULL,
        sector     INTEGER NOT NULL,
        runs       INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, updated_at ASC);
      CREATE TABLE IF NOT EXISTS daily_scores (
        day        TEXT NOT NULL,
        wallet     TEXT NOT NULL,
        score      INTEGER NOT NULL,
        sector     INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (day, wallet)
      );
      CREATE INDEX IF NOT EXISTS daily_rank_idx ON daily_scores (day, score DESC, updated_at ASC);
      CREATE TABLE IF NOT EXISTS trials_scores (
        week       TEXT NOT NULL,
        wallet     TEXT NOT NULL,
        score      INTEGER NOT NULL,
        sector     INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (week, wallet)
      );
      CREATE INDEX IF NOT EXISTS trials_rank_idx ON trials_scores (week, score DESC, updated_at ASC);
      CREATE TABLE IF NOT EXISTS ascension_scores (
        heat       INTEGER NOT NULL,
        wallet     TEXT NOT NULL,
        score      INTEGER NOT NULL,
        sector     INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (heat, wallet)
      );
      CREATE INDEX IF NOT EXISTS ascension_rank_idx ON ascension_scores (heat, score DESC, updated_at ASC);
      CREATE TABLE IF NOT EXISTS speedruns (
        wallet     TEXT PRIMARY KEY,
        ms         INTEGER NOT NULL,
        sector     INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS speedruns_rank_idx ON speedruns (ms ASC, updated_at ASC);
      ALTER TABLE players ADD COLUMN IF NOT EXISTS rank INT NOT NULL DEFAULT 0;   -- APEX RANK: account prestige ladder (enlisted shards), cosmetic only
      CREATE INDEX IF NOT EXISTS players_rank_idx ON players (rank DESC, updated_at ASC);
    `)
    dbReady = true
    console.log('[db] connected + migrated — leaderboard ONLINE')
  } catch (e) {
    dbReady = false
    console.error('[db] migrate failed — leaderboard OFFLINE:', e.message)
    // Retry once after a short delay (covers a DB that boots a moment after us).
    setTimeout(() => { migrate().catch(() => {}) }, 10_000)
  }
}

// ---- validation + light anti-spam ---------------------------------------
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/
const MAX_SCORE = 5_000_000          // sanity cap; anything above is rejected
const MAX_SECTOR = 12
const sanitizeHandle = (h) => {
  if (typeof h !== 'string') return null
  const clean = h.replace(/[^A-Za-z0-9 _\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16)
  return clean.length ? clean : null
}
// Per-wallet submit throttle (in-memory sliding window).
const hits = new Map()
function throttled(key, limit = 30, windowMs = 60_000) {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
  arr.push(now)
  hits.set(key, arr)
  if (hits.size > 5000) { for (const k of hits.keys()) { if (hits.size <= 4000) break; hits.delete(k) } }
  return arr.length > limit
}

// ---- rank + rival helpers -------------------------------------------------
// The next player strictly above `score` (the rank one rung up) — a named, beatable target.
async function rivalAbove(score) {
  try {
    const { rows } = await pool.query(
      `SELECT s.score, p.handle FROM scores s LEFT JOIN players p ON p.wallet = s.wallet
        WHERE s.score > $1 ORDER BY s.score ASC, s.updated_at DESC LIMIT 1`, [score])
    return rows[0] || null
  } catch { return null }
}
// Authoritative global rank for a score = count of strictly-higher scores + 1.
async function globalRank(score) {
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS rank FROM scores WHERE score > $1`, [score])
    return rows[0] ? Number(rows[0].rank) : null
  } catch { return null }
}
// Daily-scoped equivalents.
async function dailyRivalAbove(day, score) {
  try {
    const { rows } = await pool.query(
      `SELECT d.score, p.handle FROM daily_scores d LEFT JOIN players p ON p.wallet = d.wallet
        WHERE d.day = $1 AND d.score > $2 ORDER BY d.score ASC, d.updated_at DESC LIMIT 1`, [day, score])
    return rows[0] || null
  } catch { return null }
}
async function dailyRank(day, score) {
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS rank FROM daily_scores WHERE day = $1 AND score > $2`, [day, score])
    return rows[0] ? Number(rows[0].rank) : null
  } catch { return null }
}
// Weekly APEX TRIALS equivalents (scoped by ISO week key).
async function trialsRivalAbove(week, score) {
  try {
    const { rows } = await pool.query(
      `SELECT t.score, p.handle FROM trials_scores t LEFT JOIN players p ON p.wallet = t.wallet
        WHERE t.week = $1 AND t.score > $2 ORDER BY t.score ASC, t.updated_at DESC LIMIT 1`, [week, score])
    return rows[0] || null
  } catch { return null }
}
async function trialsRank(week, score) {
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS rank FROM trials_scores WHERE week = $1 AND score > $2`, [week, score])
    return rows[0] ? Number(rows[0].rank) : null
  } catch { return null }
}
// APEX HEAT ascension equivalents (scoped by heat tier).
async function ascensionRivalAbove(heat, score) {
  try {
    const { rows } = await pool.query(
      `SELECT a.score, p.handle FROM ascension_scores a LEFT JOIN players p ON p.wallet = a.wallet
        WHERE a.heat = $1 AND a.score > $2 ORDER BY a.score ASC, a.updated_at DESC LIMIT 1`, [heat, score])
    return rows[0] || null
  } catch { return null }
}
async function ascensionRank(heat, score) {
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS rank FROM ascension_scores WHERE heat = $1 AND score > $2`, [heat, score])
    return rows[0] ? Number(rows[0].rank) : null
  } catch { return null }
}
// Campaign SPEEDRUN ladder — ranked ASCENDING by clear time (fewer ms = better).
async function speedRivalAbove(ms) {   // the next-FASTER ghost — a beatable target one rung up
  try {
    const { rows } = await pool.query(
      `SELECT s.ms, p.handle FROM speedruns s LEFT JOIN players p ON p.wallet = s.wallet
        WHERE s.ms < $1 ORDER BY s.ms DESC, s.updated_at ASC LIMIT 1`, [ms])
    return rows[0] || null
  } catch { return null }
}
async function speedRank(ms) {
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS rank FROM speedruns WHERE ms < $1`, [ms])
    return rows[0] ? Number(rows[0].rank) : null
  } catch { return null }
}
// ---- APEX RANK ladder helpers (players.rank, ranked DESC) ----
async function rankRivalAbove(rank) {   // the next player one rung UP the ladder — a beatable target to pass
  try {
    const { rows } = await pool.query(
      `SELECT rank, handle, wallet FROM players
        WHERE rank > $1 ORDER BY rank ASC, updated_at ASC LIMIT 1`, [rank])
    return rows[0] || null
  } catch { return null }
}
async function rankPosition(rank) {     // your standing on the Rank board (ties share a position)
  try {
    const { rows } = await pool.query(`SELECT count(*) + 1 AS pos FROM players WHERE rank > $1`, [rank])
    return rows[0] ? Number(rows[0].pos) : null
  } catch { return null }
}

// ---- API -----------------------------------------------------------------
const app = express()
app.disable('x-powered-by')
app.use('/api', express.json({ limit: '4kb' }))

app.get('/api/leaderboard', async (req, res) => {
  if (!dbReady) return res.json({ online: false, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT s.wallet, p.handle, s.score, s.sector
         FROM scores s LEFT JOIN players p ON p.wallet = s.wallet
        ORDER BY s.score DESC, s.updated_at ASC
        LIMIT 10`
    )
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT s.score, s.sector, p.handle,
                (SELECT count(*) + 1 FROM scores x WHERE x.score > s.score)::int AS rank
           FROM scores s LEFT JOIN players p ON p.wallet = s.wallet
          WHERE s.wallet = $1`, [wallet])
      you = rows[0] || null
      if (you) next = await rivalAbove(you.score)   // the named rank one rung up — a beatable target
    }
    res.json({ online: true, top, you, next })
  } catch (e) {
    console.error('[api] leaderboard:', e.message)
    res.json({ online: false, top: [], you: null })
  }
})

app.post('/api/scores', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const wallet = String(b.wallet || '').toLowerCase()
  const score = Number(b.score)
  const sector = Number(b.sector)
  const handle = sanitizeHandle(b.handle)
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ ok: false, error: 'bad score' })
  if (!Number.isInteger(sector) || sector < 1 || sector > MAX_SECTOR) return res.status(400).json({ ok: false, error: 'bad sector' })
  if (throttled('s:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    if (handle) {
      await pool.query(
        `INSERT INTO players (wallet, handle) VALUES ($1, $2)
           ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    }
    const { rows } = await pool.query(
      `INSERT INTO scores (wallet, score, sector, runs) VALUES ($1, $2, $3, 1)
         ON CONFLICT (wallet) DO UPDATE SET
           sector = CASE WHEN EXCLUDED.score >= scores.score THEN EXCLUDED.sector ELSE scores.sector END,
           score  = GREATEST(scores.score, EXCLUDED.score),
           runs   = scores.runs + 1,
           updated_at = now()
       RETURNING score, sector`, [wallet, score, sector])
    const best = rows[0] || null
    // Rank + rival are computed AFTER the upsert commits in this same request, so the
    // death screen reads them from this response — no POST-then-GET race, no stale standing.
    const rank = best ? await globalRank(best.score) : null
    const next = best ? await rivalAbove(best.score) : null
    res.json({ ok: true, best, rank, next })
  } catch (e) {
    console.error('[api] scores:', e.message)
    res.status(500).json({ ok: false, error: 'server' })
  }
})

app.post('/api/handle', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const wallet = String((req.body || {}).wallet || '').toLowerCase()
  const handle = sanitizeHandle((req.body || {}).handle)
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!handle) return res.status(400).json({ ok: false, error: 'bad handle' })
  if (throttled('h:' + wallet, 10)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    await pool.query(
      `INSERT INTO players (wallet, handle) VALUES ($1, $2)
         ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    res.json({ ok: true, handle })
  } catch (e) {
    console.error('[api] handle:', e.message)
    res.status(500).json({ ok: false, error: 'server' })
  }
})

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const WEEK_RE = /^\d{4}-W\d{2}$/       // ISO week key, e.g. 2026-W33 (matches rush.ts weekKey)
const MAX_BOSSES = 7                    // TRIALS is a 7-boss gauntlet; the "sector" column holds bosses cleared (0..7)
const MAX_HEAT = 8                      // APEX HEAT ascension tiers 1..8 (matches heat.ts MAX_HEAT)
const MAX_MS = 24 * 60 * 60 * 1000     // sanity cap on a clear time (24h); anything longer is rejected
const MIN_MS = 30 * 1000               // plausibility floor: a full 6-sector / 6-boss clear can't happen under 30s.
                                       // The board ranks ascending, so without a floor a fabricated ms:1 would own
                                       // rank #1 permanently and unbeatably — this rejects that whole class of fakes.
const MAX_RANK = 999                   // APEX RANK cap — rank 999 needs ~12.5M enlisted shards (~180k clears), so it's
                                       // an unreachable ceiling that still bounds a fabricated client-reported rank.

app.get('/api/daily', async (req, res) => {
  const day = String(req.query.day || '')
  if (!DAY_RE.test(day)) return res.status(400).json({ online: false, top: [], you: null })
  if (!dbReady) return res.json({ online: false, day, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT d.wallet, p.handle, d.score, d.sector
         FROM daily_scores d LEFT JOIN players p ON p.wallet = d.wallet
        WHERE d.day = $1
        ORDER BY d.score DESC, d.updated_at ASC
        LIMIT 10`, [day])
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT d.score, d.sector, p.handle,
                (SELECT count(*) + 1 FROM daily_scores x WHERE x.day = d.day AND x.score > d.score)::int AS rank
           FROM daily_scores d LEFT JOIN players p ON p.wallet = d.wallet
          WHERE d.day = $1 AND d.wallet = $2`, [day, wallet])
      you = rows[0] || null
      if (you) next = await dailyRivalAbove(day, you.score)
    }
    res.json({ online: true, day, top, you, next })
  } catch (e) { console.error('[api] daily:', e.message); res.json({ online: false, day, top: [], you: null }) }
})

app.post('/api/daily/scores', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const day = String(b.day || '')
  const wallet = String(b.wallet || '').toLowerCase()
  const score = Number(b.score)
  const sector = Number(b.sector)
  const handle = sanitizeHandle(b.handle)
  if (!DAY_RE.test(day)) return res.status(400).json({ ok: false, error: 'bad day' })
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ ok: false, error: 'bad score' })
  if (!Number.isInteger(sector) || sector < 1 || sector > MAX_SECTOR) return res.status(400).json({ ok: false, error: 'bad sector' })
  if (throttled('d:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    if (handle) {
      await pool.query(`INSERT INTO players (wallet, handle) VALUES ($1,$2) ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    }
    const { rows } = await pool.query(
      `INSERT INTO daily_scores (day, wallet, score, sector) VALUES ($1,$2,$3,$4)
         ON CONFLICT (day, wallet) DO UPDATE SET
           sector = CASE WHEN EXCLUDED.score >= daily_scores.score THEN EXCLUDED.sector ELSE daily_scores.sector END,
           score  = GREATEST(daily_scores.score, EXCLUDED.score),
           updated_at = now()
       RETURNING score, sector`, [day, wallet, score, sector])
    const best = rows[0] || null
    const rank = best ? await dailyRank(day, best.score) : null
    const next = best ? await dailyRivalAbove(day, best.score) : null
    res.json({ ok: true, best, rank, next })
  } catch (e) { console.error('[api] daily/scores:', e.message); res.status(500).json({ ok: false, error: 'server' }) }
})

// ---- Weekly APEX TRIALS board (scoped by ISO week; sector column = bosses cleared 0..7) ----
app.get('/api/trials', async (req, res) => {
  const week = String(req.query.week || '')
  if (!WEEK_RE.test(week)) return res.status(400).json({ online: false, top: [], you: null })
  if (!dbReady) return res.json({ online: false, week, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT t.wallet, p.handle, t.score, t.sector
         FROM trials_scores t LEFT JOIN players p ON p.wallet = t.wallet
        WHERE t.week = $1
        ORDER BY t.score DESC, t.updated_at ASC
        LIMIT 10`, [week])
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT t.score, t.sector, p.handle,
                (SELECT count(*) + 1 FROM trials_scores x WHERE x.week = t.week AND x.score > t.score)::int AS rank
           FROM trials_scores t LEFT JOIN players p ON p.wallet = t.wallet
          WHERE t.week = $1 AND t.wallet = $2`, [week, wallet])
      you = rows[0] || null
      if (you) next = await trialsRivalAbove(week, you.score)
    }
    res.json({ online: true, week, top, you, next })
  } catch (e) { console.error('[api] trials:', e.message); res.json({ online: false, week, top: [], you: null }) }
})

app.post('/api/trials/scores', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const week = String(b.week || '')
  const wallet = String(b.wallet || '').toLowerCase()
  const score = Number(b.score)
  const sector = Number(b.sector)   // bosses cleared this run (0..7)
  const handle = sanitizeHandle(b.handle)
  if (!WEEK_RE.test(week)) return res.status(400).json({ ok: false, error: 'bad week' })
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ ok: false, error: 'bad score' })
  if (!Number.isInteger(sector) || sector < 0 || sector > MAX_BOSSES) return res.status(400).json({ ok: false, error: 'bad sector' })
  if (throttled('t:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    if (handle) {
      await pool.query(`INSERT INTO players (wallet, handle) VALUES ($1,$2) ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    }
    const { rows } = await pool.query(
      `INSERT INTO trials_scores (week, wallet, score, sector) VALUES ($1,$2,$3,$4)
         ON CONFLICT (week, wallet) DO UPDATE SET
           sector = CASE WHEN EXCLUDED.score >= trials_scores.score THEN EXCLUDED.sector ELSE trials_scores.sector END,
           score  = GREATEST(trials_scores.score, EXCLUDED.score),
           updated_at = now()
       RETURNING score, sector`, [week, wallet, score, sector])
    const best = rows[0] || null
    const rank = best ? await trialsRank(week, best.score) : null
    const next = best ? await trialsRivalAbove(week, best.score) : null
    res.json({ ok: true, best, rank, next })
  } catch (e) { console.error('[api] trials/scores:', e.message); res.status(500).json({ ok: false, error: 'server' }) }
})

// ---- APEX HEAT ascension board (scoped by heat tier; sector column = sector reached) ----
app.get('/api/ascension', async (req, res) => {
  const heat = Number(req.query.heat)
  if (!Number.isInteger(heat) || heat < 1 || heat > MAX_HEAT) return res.status(400).json({ online: false, top: [], you: null })
  if (!dbReady) return res.json({ online: false, heat, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT a.wallet, p.handle, a.score, a.sector
         FROM ascension_scores a LEFT JOIN players p ON p.wallet = a.wallet
        WHERE a.heat = $1
        ORDER BY a.score DESC, a.updated_at ASC
        LIMIT 10`, [heat])
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT a.score, a.sector, p.handle,
                (SELECT count(*) + 1 FROM ascension_scores x WHERE x.heat = a.heat AND x.score > a.score)::int AS rank
           FROM ascension_scores a LEFT JOIN players p ON p.wallet = a.wallet
          WHERE a.heat = $1 AND a.wallet = $2`, [heat, wallet])
      you = rows[0] || null
      if (you) next = await ascensionRivalAbove(heat, you.score)
    }
    res.json({ online: true, heat, top, you, next })
  } catch (e) { console.error('[api] ascension:', e.message); res.json({ online: false, heat, top: [], you: null }) }
})

app.post('/api/ascension/scores', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const heat = Number(b.heat)
  const wallet = String(b.wallet || '').toLowerCase()
  const score = Number(b.score)
  const sector = Number(b.sector)
  const handle = sanitizeHandle(b.handle)
  if (!Number.isInteger(heat) || heat < 1 || heat > MAX_HEAT) return res.status(400).json({ ok: false, error: 'bad heat' })
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ ok: false, error: 'bad score' })
  if (!Number.isInteger(sector) || sector < 1 || sector > MAX_SECTOR) return res.status(400).json({ ok: false, error: 'bad sector' })
  if (throttled('a:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    if (handle) {
      await pool.query(`INSERT INTO players (wallet, handle) VALUES ($1,$2) ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    }
    const { rows } = await pool.query(
      `INSERT INTO ascension_scores (heat, wallet, score, sector) VALUES ($1,$2,$3,$4)
         ON CONFLICT (heat, wallet) DO UPDATE SET
           sector = CASE WHEN EXCLUDED.score >= ascension_scores.score THEN EXCLUDED.sector ELSE ascension_scores.sector END,
           score  = GREATEST(ascension_scores.score, EXCLUDED.score),
           updated_at = now()
       RETURNING score, sector`, [heat, wallet, score, sector])
    const best = rows[0] || null
    const rank = best ? await ascensionRank(heat, best.score) : null
    const next = best ? await ascensionRivalAbove(heat, best.score) : null
    res.json({ ok: true, best, rank, next })
  } catch (e) { console.error('[api] ascension/scores:', e.message); res.status(500).json({ ok: false, error: 'server' }) }
})

// ---- Campaign SPEEDRUN board (fastest full-campaign clear; ranked ascending by ms) ----
app.get('/api/speedruns', async (req, res) => {
  if (!dbReady) return res.json({ online: false, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT s.wallet, p.handle, s.ms, s.sector
         FROM speedruns s LEFT JOIN players p ON p.wallet = s.wallet
        ORDER BY s.ms ASC, s.updated_at ASC
        LIMIT 10`)
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT s.ms, s.sector, p.handle,
                (SELECT count(*) + 1 FROM speedruns x WHERE x.ms < s.ms)::int AS rank
           FROM speedruns s LEFT JOIN players p ON p.wallet = s.wallet
          WHERE s.wallet = $1`, [wallet])
      you = rows[0] || null
      if (you) next = await speedRivalAbove(you.ms)   // the next-faster ghost
    }
    res.json({ online: true, top, you, next })
  } catch (e) { console.error('[api] speedruns:', e.message); res.json({ online: false, top: [], you: null }) }
})

app.post('/api/speedruns/scores', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const wallet = String(b.wallet || '').toLowerCase()
  const ms = Number(b.ms)
  const sector = Number(b.sector)
  const handle = sanitizeHandle(b.handle)
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(ms) || ms < MIN_MS || ms > MAX_MS) return res.status(400).json({ ok: false, error: 'bad time' })
  if (!Number.isInteger(sector) || sector < 1 || sector > MAX_SECTOR) return res.status(400).json({ ok: false, error: 'bad sector' })
  if (throttled('r:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    if (handle) {
      await pool.query(`INSERT INTO players (wallet, handle) VALUES ($1,$2) ON CONFLICT (wallet) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()`, [wallet, handle])
    }
    const { rows } = await pool.query(
      `INSERT INTO speedruns (wallet, ms, sector) VALUES ($1,$2,$3)
         ON CONFLICT (wallet) DO UPDATE SET
           sector = CASE WHEN EXCLUDED.ms <= speedruns.ms THEN EXCLUDED.sector ELSE speedruns.sector END,
           ms     = LEAST(speedruns.ms, EXCLUDED.ms),
           updated_at = now()
       RETURNING ms, sector`, [wallet, ms, sector])
    const best = rows[0] || null
    const rank = best ? await speedRank(best.ms) : null
    const next = best ? await speedRivalAbove(best.ms) : null
    res.json({ ok: true, best, rank, next })
  } catch (e) { console.error('[api] speedruns/scores:', e.message); res.status(500).json({ ok: false, error: 'server' }) }
})

// ---- APEX RANK board (account prestige ladder; enlisted shards -> rank; ranked DESC) ----
app.get('/api/ranks', async (req, res) => {
  if (!dbReady) return res.json({ online: false, top: [], you: null })
  try {
    const { rows: top } = await pool.query(
      `SELECT wallet, handle, rank
         FROM players WHERE rank > 0
        ORDER BY rank DESC, updated_at ASC
        LIMIT 10`)
    let you = null, next = null
    const wallet = String(req.query.wallet || '').toLowerCase()
    if (WALLET_RE.test(wallet)) {
      const { rows } = await pool.query(
        `SELECT p.rank, p.handle,
                (SELECT count(*) + 1 FROM players x WHERE x.rank > p.rank)::int AS pos
           FROM players p WHERE p.wallet = $1 AND p.rank > 0`, [wallet])
      you = rows[0] || null
      if (you) next = await rankRivalAbove(you.rank)   // the next-higher-ranked player to chase
    }
    res.json({ online: true, top, you, next })
  } catch (e) { console.error('[api] ranks:', e.message); res.json({ online: false, top: [], you: null }) }
})

app.post('/api/rank', async (req, res) => {
  if (!dbReady) return res.status(503).json({ ok: false, offline: true })
  const b = req.body || {}
  const wallet = String(b.wallet || '').toLowerCase()
  const rank = Number(b.rank)
  const handle = sanitizeHandle(b.handle)
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' })
  if (!Number.isInteger(rank) || rank < 0 || rank > MAX_RANK) return res.status(400).json({ ok: false, error: 'bad rank' })
  if (throttled('rk:' + wallet)) return res.status(429).json({ ok: false, error: 'slow down' })
  try {
    // rank only ever climbs (GREATEST), so a stale/again-submitted lower value can't demote you.
    const { rows } = await pool.query(
      `INSERT INTO players (wallet, handle, rank) VALUES ($1,$2,$3)
         ON CONFLICT (wallet) DO UPDATE SET
           handle = COALESCE(EXCLUDED.handle, players.handle),
           rank   = GREATEST(players.rank, EXCLUDED.rank),
           updated_at = now()
       RETURNING rank`, [wallet, handle || null, rank])
    const best = rows[0] ? Number(rows[0].rank) : rank
    const pos = await rankPosition(best)
    const next = await rankRivalAbove(best)
    res.json({ ok: true, rank: best, pos, next })
  } catch (e) { console.error('[api] rank:', e.message); res.status(500).json({ ok: false, error: 'server' }) }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, db: dbReady }))

// Bad JSON etc. — never 500 with a stack; keep it quiet.
app.use('/api', (err, _req, res, _next) => {
  res.status(400).json({ ok: false, error: 'bad request' })
})

// ---- static game (SPA) ---------------------------------------------------
app.use(express.static(DIST, { maxAge: '1h', index: 'index.html', fallthrough: true }))
// Catch-all: unknown /api → 404 JSON; any other GET → the SPA entry (client routing).
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not found' })
  if (req.method !== 'GET') return res.status(404).send('not found')
  res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, () => console.log(`[apex] serving on :${PORT}  (db ${DB_URL ? 'configured' : 'offline'})`))
