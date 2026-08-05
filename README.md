# Apex Strike

NFT-gated Contra-style run-and-gun for **Apex Huntress** holders on Cronos.

**Live:** https://apexstrike.app · (Railway origin: https://apex-strike-production.up.railway.app)

## Current Version — v1.7 (Depth)

### Systems (v1.7)
- **Pause & mute** — P / Esc / gamepad-Start to pause (resume + restart), M to mute; touch buttons on mobile
- **Boss fight** — a live **APEX SENTINEL health bar** + attack **telegraphs** (wind-up flash before every volley)
- **Apex Shards** — collectible shards hidden on ledges each stage; grab them all for a bonus

### Feel & juice (v1.5–v1.6)
- **Hitstop** on kills / stomps / taking damage — impacts land with weight
- Enemy **hit reactions** (flash + squash flinch), weapon-colored **muzzle flash**
- **Shockwave rings** + gravity debris on kills; multi-stage **boss detonation**
- Landing dust, off-screen enemies no longer snipe you, **persistent high score** + results card
- **Responsive shell:** immersive full-screen landscape on mobile (rotate-to-play gate),
  framed premium layout on desktop, one-tap **fullscreen**, first-class **gamepad** support

## Contra Rebuild (v1.0 foundation)

### Gameplay
- 5 side-scrolling stages + final boss, each hand-built as a real Contra-style level
- Hand-authored terrain: elevation, **pits** (fall = damage), floating ledges, climbable structures
- Layered **parallax** skylines with a distinct palette/mood per stage
- True **8-way aim** (straight up, up-diagonal, horizontal, down-diagonal, straight down) + **crouch** + **double-jump**
- Weapons: Normal, Spread, Rapid, Laser, Fire (hold-to-fire)
- Enemy types: Walker, Flyer, Tank, **Turret** (emplacement), Boss (2 phases)
- Reach the **extraction gate** to clear a stage; kill the boss to win
- Lives + health, power-up drops, combo / score popups, screen-shake juice
- Keyboard, Gamepad, Mobile touch

### Levels
1. Neon Streets
2. Industrial Rise
3. Sky Rail
4. Core Access
5. Apex Throne (Boss)

### Dev Mode
Yellow **Skip Gate** button bypasses NFT check for testing.

### Stack
Vite + React + TypeScript + Phaser 3 + wagmi/viem (Cronos)

### Contract
`0x7e9c0ed6433f1425b218f7cc721ba60d6be9e9b9`

## Deployment

Every push to `main` deploys to Railway via **GitHub Actions** (`.github/workflows/deploy.yml`) —
Railway's native GitHub auto-deploy stopped triggering builds, so CI now drives it explicitly
with the Railway CLI (visible logs in the Actions tab, every time).

**One-time setup (in the GitHub repo → Settings → Secrets and variables → Actions):**
1. Add a repository **secret** `RAILWAY_TOKEN` — create it in Railway → your project →
   Settings → Tokens (a **project token**, scoped to this project + environment).
2. *(Optional)* add a repository **variable** `RAILWAY_SERVICE` with the exact service name
   if the project has more than one service.

Then every merge to `main` ships. To deploy on demand: Actions tab → **Deploy to Railway** → *Run workflow*.

Build: `npm run build` (Vite → `dist/`, chunked so the build stays under memory limits).
Serve: `npx serve dist -s -l $PORT` (SPA fallback). Both are pinned in `railway.json`.

## Custom domain — apexstrike.app

1. **Railway** → service → **Settings → Networking → Custom Domain** → add `apexstrike.app`
   (and `www.apexstrike.app`). Railway shows the CNAME target to use.
2. **DNS** at your registrar:
   - `www` → **CNAME** → the target Railway shows (e.g. `apex-strike-production.up.railway.app`).
   - Root `@` `apexstrike.app` → your registrar's **ALIAS/ANAME/flattened-CNAME** to the same target
     (or a redirect from root → `www` if only plain A/CNAME records are supported).
3. Railway provisions TLS automatically once DNS resolves (a few minutes to propagate).

The app is host-agnostic (SPA served with history fallback), so it works at any domain with no code change.
