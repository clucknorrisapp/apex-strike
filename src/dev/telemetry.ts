// Lightweight playtest telemetry: records where players get taken out and what got
// them, so the dev dashboard can surface difficulty hot-spots.
//
// STORAGE — local-first + pluggable:
//   • Always mirrors events to localStorage (works with zero setup, per-device).
//   • If a shared store is configured via env, it ALSO ships each event there and the
//     dashboard reads from it — that's what makes it aggregate across *all* testers.
//
// To turn on cross-tester aggregation (Supabase, ~2 min):
//   1. Create a free project at supabase.com.
//   2. SQL editor →  create table apex_events (
//          id bigint generated always as identity primary key,
//          created_at timestamptz default now(),
//          data jsonb );
//      alter table apex_events enable row level security;
//      create policy "anon insert" on apex_events for insert to anon with check (true);
//      create policy "anon read"   on apex_events for select to anon using (true);
//   3. Set build env vars: VITE_SUPABASE_URL, VITE_SUPABASE_KEY (the anon key).
// (Any other backend works too: set VITE_TELEMETRY_URL to an endpoint that accepts
//  POST {data:event} and returns GET → [{data:event}, ...].)

export type DeathCause = 'pit' | 'enemy' | 'bullet' | 'hazard' | 'boss'

export interface DeathEvent {
  t: 'death'
  sid: string          // per-device id (groups a tester's runs)
  rid: string          // per-run id
  ts: number
  lvl: number
  lvlName: string
  x: number
  y: number
  cause: DeathCause
  killer?: string      // enemy kind for cause 'enemy'
  weapon: string
  score: number
  livesLeft: number
  elapsed: number      // ms into the run
}

export interface RunEvent {
  t: 'run'
  sid: string
  rid: string
  ts: number
  outcome: 'gameover' | 'win'
  levelReached: number
  score: number
  durationMs: number
  deaths: number
}

export type TelemetryEvent = DeathEvent | RunEvent

const LS_KEY = 'apex_telemetry_v1'
const CAP = 4000

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {}
const SUPA_URL = env.VITE_SUPABASE_URL
const SUPA_KEY = env.VITE_SUPABASE_KEY
const GENERIC_URL = env.VITE_TELEMETRY_URL
export const REMOTE_ON = !!((SUPA_URL && SUPA_KEY) || GENERIC_URL)

function readLocal(): TelemetryEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function writeLocal(evts: TelemetryEvent[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(evts.slice(-CAP))) } catch { /* quota — ignore */ }
}

// Stable per-device id + per-run id.
function deviceId(): string {
  try {
    let id = localStorage.getItem('apex_sid')
    if (!id) { id = 's_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('apex_sid', id) }
    return id
  } catch { return 's_anon' }
}
let runId = 'r_' + Math.random().toString(36).slice(2, 10)
export function newRun(): string { runId = 'r_' + Math.random().toString(36).slice(2, 10); return runId }
export function currentIds() { return { sid: deviceId(), rid: runId } }

function shipRemote(evt: TelemetryEvent) {
  try {
    if (SUPA_URL && SUPA_KEY) {
      void fetch(`${SUPA_URL}/rest/v1/apex_events`, {
        method: 'POST',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: evt }),
        keepalive: true,
      }).catch(() => {})
    } else if (GENERIC_URL) {
      void fetch(GENERIC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: evt }), keepalive: true }).catch(() => {})
    }
  } catch { /* ignore */ }
}

export function record(evt: TelemetryEvent) {
  const all = readLocal()
  all.push(evt)
  writeLocal(all)
  if (REMOTE_ON) shipRemote(evt)
}

// Read everything for the dashboard. Prefers the shared store when configured; falls
// back to (and merges) local so you always see your own device too.
export async function fetchAll(): Promise<TelemetryEvent[]> {
  const local = readLocal()
  if (!REMOTE_ON) return local
  try {
    let rows: TelemetryEvent[] = []
    if (SUPA_URL && SUPA_KEY) {
      const res = await fetch(`${SUPA_URL}/rest/v1/apex_events?select=data&order=id.desc&limit=10000`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      })
      const json = (await res.json()) as { data: TelemetryEvent }[]
      rows = json.map((r) => r.data)
    } else if (GENERIC_URL) {
      const res = await fetch(GENERIC_URL)
      const json = (await res.json()) as ({ data: TelemetryEvent } | TelemetryEvent)[]
      rows = json.map((r) => ('data' in r ? r.data : r) as TelemetryEvent)
    }
    // merge remote + local, de-dupe by (ts + sid + x/y)
    const seen = new Set<string>()
    const merged: TelemetryEvent[] = []
    for (const e of [...rows, ...local]) {
      const k = `${e.t}:${e.ts}:${e.sid}:${e.rid}:${'x' in e ? e.x : ''}`
      if (seen.has(k)) continue
      seen.add(k); merged.push(e)
    }
    return merged
  } catch {
    return local
  }
}

export function clearLocal() { writeLocal([]) }
export function exportJson(): string { return JSON.stringify(readLocal(), null, 2) }
