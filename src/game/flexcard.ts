// Rendered Flex Card — a procedural PNG the player can share. Text in a clipboard rarely gets
// posted; a good-looking image card is the actual viral unit and the missing half of the share.
// Every pixel is canvas 2d (no art assets, no fonts beyond the system stack), sized 1080x1350 —
// the 4:5 portrait that fills a social feed. Fully within the code-only constraint.

export interface FlexSummary {
  score: number
  sector: number
  kills: number
  maxCombo: number
  win: boolean
  rank?: number | null
  handle?: string | null
  prestige?: number        // Apex Rank (prestige ladder); 0/undefined = unranked
  prestigeTitle?: string   // title band, e.g. 'MYTHIC'
  prestigeGlyph?: string   // Insignia band glyph, e.g. '✹'
  prestigeHex?: string     // Insignia band colour
  relics?: string[]        // APEX RELICS drafted this run — the build behind the score
  topHex: string     // sector accent — the gradient glow / highlight colour
  botHex: string     // sector background — the gradient base
}

const W = 1080, H = 1350

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const withAlpha = (hex: string, a: number) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})` }
const darken = (hex: string, f: number) => { const [r, g, b] = hexToRgb(hex); return `rgb(${Math.round(r * (1 - f))},${Math.round(g * (1 - f))},${Math.round(b * (1 - f))})` }
const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Draw the share card to an offscreen canvas and return it (caller decides share vs download).
export function renderFlexCard(s: FlexSummary): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const font = (spec: string) => { ctx.font = spec + ' system-ui, "Segoe UI", Roboto, sans-serif' }

  // Base gradient: a hint of the sector accent up top, deepening to near-black at the base.
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, mix(s.botHex, s.topHex, 0.30))
  g.addColorStop(0.5, s.botHex)
  g.addColorStop(1, darken(s.botHex, 0.45))
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

  // Faint blueprint grid for texture.
  ctx.strokeStyle = withAlpha(s.topHex, 0.06); ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  // Top glow.
  const glow = ctx.createRadialGradient(W / 2, 150, 30, W / 2, 150, 560)
  glow.addColorStop(0, withAlpha(s.topHex, 0.35)); glow.addColorStop(1, withAlpha(s.topHex, 0))
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 460)

  ctx.textAlign = 'center'

  // Wordmark + result tag.
  ctx.fillStyle = s.topHex; font('900 88px')
  ctx.fillText('APEX STRIKE', W / 2, 190)
  ctx.fillStyle = s.win ? '#4ade80' : '#f43f5e'; font('700 42px')
  ctx.fillText(s.win ? '✦  SECTOR DOMINATED  ✦' : 'MISSION FAILED', W / 2, 258)

  // The hero: the score.
  ctx.fillStyle = '#ffffff'; font('900 228px')
  ctx.fillText(s.score.toLocaleString(), W / 2, 560)
  ctx.fillStyle = withAlpha('#ffffff', 0.6); font('600 44px')
  ctx.fillText('SCORE', W / 2, 626)

  // Divider.
  ctx.strokeStyle = withAlpha(s.topHex, 0.4); ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(140, 700); ctx.lineTo(W - 140, 700); ctx.stroke()

  // Stat trio.
  const stats: [string, string][] = [['SECTOR', String(s.sector)], ['KILLS', String(s.kills)], ['BEST COMBO', '×' + s.maxCombo]]
  const cw = W / 3
  stats.forEach((st, i) => {
    const cx = cw * i + cw / 2
    ctx.fillStyle = s.topHex; font('800 78px'); ctx.fillText(st[1], cx, 830)
    ctx.fillStyle = withAlpha('#ffffff', 0.5); font('600 34px'); ctx.fillText(st[0], cx, 884)
  })

  // Run BUILD — the APEX RELICS drafted this run, so a share reads "I ran an ignite build," not just a number.
  if (s.relics && s.relics.length) {
    const shown = s.relics.slice(0, 4)
    const extra = s.relics.length - shown.length
    const label = '◆ RELICS   ' + shown.join('   ·   ') + (extra > 0 ? '   +' + extra : '')
    ctx.fillStyle = withAlpha('#c4b5fd', 0.92); font('700 30px')
    ctx.fillText(label, W / 2, 936)
  }

  // Rank pill (only when we have a wallet-tied rank).
  if (s.rank && s.rank > 0) {
    const label = 'GLOBAL RANK  #' + s.rank + (s.handle ? '   ·   ' + s.handle : '')
    font('700 50px')
    const w = Math.min(W - 120, ctx.measureText(label).width + 90)
    const px = W / 2 - w / 2, py = 980
    roundRect(ctx, px, py, w, 100, 22)
    ctx.fillStyle = withAlpha(s.topHex, 0.16); ctx.fill()
    ctx.strokeStyle = withAlpha(s.topHex, 0.6); ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = '#fde68a'; ctx.fillText(label, W / 2, py + 66)
  }

  // Apex Rank INSIGNIA pill — the prestige the Rank grind earns, drawn in its earned band colour so the
  // share image finally carries the flex (the Insignia glyph + title band from the in-game boards).
  if (s.prestige && s.prestige > 0) {
    const label = (s.prestigeGlyph || '◆') + '  APEX RANK ' + s.prestige + (s.prestigeTitle ? '  ·  ' + s.prestigeTitle : '')
    const hex = s.prestigeHex || s.topHex
    font('700 46px')
    const w = Math.min(W - 120, ctx.measureText(label).width + 90)
    const px = W / 2 - w / 2, py = 1104
    roundRect(ctx, px, py, w, 92, 20)
    ctx.fillStyle = withAlpha(hex, 0.16); ctx.fill()
    ctx.strokeStyle = withAlpha(hex, 0.7); ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = hex; ctx.fillText(label, W / 2, py + 60)
  }

  // Footer — the call to action.
  ctx.fillStyle = s.topHex; font('800 58px')
  ctx.fillText('▶  play at apexstrike.app', W / 2, H - 128)
  ctx.fillStyle = withAlpha('#ffffff', 0.35); font('500 32px')
  ctx.fillText('NFT-gated run & gun · Apex Huntress on Cronos', W / 2, H - 66)

  return c
}

export type ShareOutcome = 'shared' | 'downloaded' | 'copied'

// Share the card as a real PNG file where the platform supports it (mobile Web Share), else
// download the image and copy the text. Always resolves — degrades to a clipboard copy.
export async function shareCard(canvas: HTMLCanvasElement, text: string): Promise<ShareOutcome> {
  const blob: Blob | null = await new Promise((res) => { try { canvas.toBlob((b) => res(b), 'image/png') } catch { res(null) } })
  if (blob) {
    const file = new File([blob], 'apex-strike.png', { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> }
    try {
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text })
        return 'shared'
      }
    } catch { /* user cancelled or share unavailable — fall through to download */ }
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'apex-strike.png'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      try { await (navigator as Navigator).clipboard?.writeText(text) } catch { /* clipboard blocked */ }
      return 'downloaded'
    } catch { /* fall through to text copy */ }
  }
  try { await (navigator as Navigator).clipboard?.writeText(text) } catch { /* clipboard blocked */ }
  return 'copied'
}
