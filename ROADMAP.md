# SWARMGEDDON — Roadmap to Shipped & Monetized

Status date: 2026-07-02 · v1 live on web (Cloudflare Pages, auto-deploys `main`) ·
Post-v1 arc audited (49-agent adversarial review), perf-hardened, and expanded to
3 pilots × 3 arenas with earn-unlock metadata.

**The bar:** quality first — monetization is designed-in (unlock metadata ships on
every item today) but turns on only after the fun is proven with real players.

Owner = Adelson (account/device steps). Agent = Claude (all code). Effort is
wall-clock-ish; agent items include verification.

---

## Sprint 1 — Hardening (agent, ~1 day) → then flip the leaderboard ON

Close the audit's confirmed MEDIUMs so the first public impression is clean.

### 1a. Gameplay/UX fixes (agent)
| # | Fix | Why | Effort |
|---|-----|-----|--------|
| 1 | Boss/elite spawns silently skipped at the 700-enemy cap (timer consumed before the attempt) | **Late-game breaks**: from ~min 6 the queen and elite packs never appear again — pacing, XP, and weapon economy flatten | 45m |
| 2 | Gamepad ignores AUTO-FIRE OFF (`g.fire` bakes `aimActive`) | Setting is a silent no-op on controllers | 15m |
| 3 | `hasPointer` never clears → hybrid laptops/iPads aim & fire at a stale cursor when both thumbs lift; also suppresses the touch hint | Touch play broken on touchscreen laptops | 30m |
| 4 | Same-half palm graze steals the stick, then releases it while the real thumb is still down | Mid-fight control loss on phones | 45m |
| 5 | Android back button exits the app from Settings / orphans the name prompt | Store-review red flag on Android | 30m |
| 6 | SFX queued while the AudioContext is suspended all detonate at once on resume (iOS call/Siri interruption) | Ear-blast + hitch after any interruption | 20m |
| 7 | PWA update toast can appear mid-run; one mistap reloads and destroys the run | Run loss + dead touch zone; defer toast to menu/game-over | 20m |
| 8 | Settings panel hardening: swallow clicks behind it, gate menu-Enter while open | Mistaps start runs / burn the daily attempt | 20m |
| 9 | Small batch: HUD bar state resets on retry · posthumous perk-draft on same-tick death+level · pointercancel leaves mouse firing · stale-rank race · pointer-id-reuse ghost stick | Polish LOWs from the audit | 60m |

### 1b. Leaderboard server batch (agent — before first deploy, schema still free to change)
| # | Fix | Why | Effort |
|---|-----|-----|--------|
| 10 | `?seed=` override works in prod and applies to Daily; server never validates the daily seed | Cheat door into the daily board — DEV-gate the override + server-side seed check | 30m |
| 11 | Daily rank query missing the `day` filter | Wrong "GLOBAL RANK #N" on every daily from day 2 | 10m |
| 12 | Rate-limit COUNT→INSERT race + unbounded table growth | Board flooding; add batch/transaction + retention prune | 45m |
| 13 | Name sanitizer passes bidi/zero-width/combining-mark spam | Board defacement (Zalgo/invisible/spoofed rows) | 30m |
| 14 | Per-player dedupe (best score per identity per board) | One grinder fills all 12 visible rows | 30m |
| 15 | Small batch: 500s leak error detail · integer-second score mismatch (±9 pts vs client) · silent submit failure gets a visible "not submitted" note | Trust/polish | 45m |

### 1c. Flip it on (owner, ~10 min, steps in `server/README.md`)
`cd server && npm i && npx wrangler login && npx wrangler d1 create swarmgeddon`
(paste id into `wrangler.toml`) `&& npm run db:migrate && npm run deploy`, then set
`VITE_LEADERBOARD_URL` in Cloudflare Pages env and redeploy. LEADERS buttons and
score submits appear automatically.

---

## Sprint 2 — On-device proof (owner-led, agent on call)

| # | Item | Owner | Effort |
|---|------|-------|--------|
| 1 | iOS device install: `npx cap open ios` → Signing (free Apple ID, bundle id `com.adelson.swarmgeddon`) → Run on iPhone → trust cert. Project already compiles end-to-end; pods committed | Owner | 15m |
| 2 | Real-device perf validation: play with the dev overlay (`p95 · max · long`) on the laptop + iPhone; if devices hitch where the M1 didn't, agent escalates (BitmapText damage numbers → culling → resolution tier) — instrumentation is already in place | Owner plays, agent fixes | 30m + as needed |
| 3 | Balance pass from real play: pilot fairness (NOVA/EMBER/VESPER), earn-condition difficulty, health-drop feel, late-game density | Owner feedback → agent tunes | 1–2h agent |
| 4 | Android build env (SDK + JDK 17) → device test. Not ship-blocking for web/iOS | Owner install, agent drives | 1h |

---

## Sprint 3 — Public beta loop (ongoing, cheap)

Share the link; watch the leaderboard fill; tune from evidence. The deterministic
sim + stored seeds mean suspicious runs can be replay-audited later if cheating
ever matters. Iterate balance weekly. **Exit criteria: friends keep coming back
without being asked — that's the "fun is proven" gate for monetization.**

---

## Sprint 4 — The v1.1 look: illustrated art (agent + owner taste)

The single biggest visual jump available. Architecture is ready: sprites bake
through `TextureRegistry` — a real atlas is a change in one class.
1. **Art bible** (agent drafts, owner picks): silhouette language, palette per
   brood, rim-light/bioluminescence rules. Key constraint: masters stay
   **near-grayscale with controlled saturation** so the existing per-brood hue
   rotation and tint pipeline keep working on ONE atlas (no ×3 art cost).
2. Generate/commission the set (Scenario.gg route or an artist): 15 enemies +
   3 pilots + weapons/pickups/fx (~30 sprites).
3. Hot-swap behind a flag, A/B against placeholders, ship.
Agent effort ~1–2 days integration; art itself is the owner's budget call.

---

## Sprint 5 — Stores (owner accounts, agent everything else)

| # | Item | Notes | Owner effort |
|---|------|-------|--------------|
| 1 | Apple Developer Program ($99/yr) | Required for TestFlight + App Store (free ID only side-loads for 7 days) | 30m + fee |
| 2 | TestFlight beta | Agent preps build/archive checklist; owner uploads via Xcode | 1h |
| 3 | App Store submission | `STORE.md` checklist exists: icons/screenshots (reuse the 9-combo gallery!), privacy "no data collected", age rating | 2h |
| 4 | Google Play ($25 once) | After Android device test | 1–2h |

---

## Sprint 6 — Monetization: cosmetic IAP (agent, after Sprint 3's fun gate)

The Phase-2 unlock metadata makes this additive:
1. Premium cosmetic SKUs — new pilot **skins**, arena **palettes**, weapon looks
   (never stats; earnables stay earnable → dual unlock, no pay-to-win).
2. Capacitor IAP plugin: products, purchase → `grant(id)`, **restore purchases**
   (App Store requirement), receipt sanity-check.
3. Web stays earn-only (no web payments hassle at this scale).
4. Store metadata + review compliance pass.
Effort: ~2 days agent + store product setup (owner, ~1h).

---

## Post-launch backlog (ordered by value)

1. **Spanish localization** — the audience already plays in Spanish; small string
   table, big reach.
2. Accessibility: reduce-motion toggle (shake/hit-stop/emerge already have
   levers), colorblind-safe brood palettes audit.
3. Lightweight telemetry (run length, pilot pick rate, death causes) → balance
   from data; privacy-clean (no PII), feeds the store "no data collected" story.
4. Brood-tint the remaining green-tinted FX (enemy projectiles, acid pools) for
   full arena cohesion.
5. Seed-replay validation for the leaderboard (the deterministic sim supports
   it) — only if cheating becomes real.
6. More content waves: 4th arena/brood, boss variants, weekly mutators.

---

## Sequence at a glance

**1 Hardening → leaderboard live** (agent day + owner 10m)
→ **2 iPhone + balance** (owner hour)
→ **3 beta loop** (fun gate ✋)
→ **4 art** (the v1.1 look)
→ **5 stores** → **6 IAP** → post-launch.

Every sprint ends with the standing discipline: tsc + build clean, dev handles
tree-shaken, determinism verified at two resolutions when the sim is touched,
live screenshots as proof, push to `main`, STOP for owner review.
