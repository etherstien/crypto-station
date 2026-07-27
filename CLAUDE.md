# CLAUDE.md — STATION (crypto-station)

Private crypto tranche & sentiment-gate monitoring system for Damian (user:
etherstien). Built Jul 26, 2026 in a Claude chat session; this file is the
handoff so any Claude Code session inherits full context. Read this before
touching anything.

## What this system is

Monitors the top ~1,000 crypto assets (screener layer) plus a curated ~57-name
focus watchlist (hand-tuned tranche ladders), evaluates every asset against
T1/T2/T3 entry zones, and gates deployment signals on retail sentiment:

**DEPLOY fires only when: price in T2/T3 zone AND Fear & Greed ≤ 25 AND
funding rate ≤ 0 (where futures exist).** Sentiment CONFIRMS tranche
deployment — it never originates entries. Other gate states: WATCH (in T1),
ARMED (in T2/T3, gate not confirming), DONT_CHASE (FNG ≥ 75), NONE.
Zone states (signals.zone_state, lowercase): none / t1 / t2 / t3 / reserve /
below_t3 (fell through the T3 floor) / gap (between two defined zones).
below_t3 and gap are display-honesty states added Jul 27 — they gate as
NONE, same as when they rendered as none. Whether below_t3 should instead
arm the gate (like reserve does) is an open product question for the user.

The user's investment framework (important for any product decision):
- Tranche discipline: T1 ~12-22% below spot / T2 ~35-50% (ATL-anchored) /
  T3 ~55-70% capitulation. Never chase strength. Dry powder is strategic.
- Thesis: Q4 2026 BTC cycle low (Oct-Nov window, flagged as overfit-risk).
- Hand ladders mirror his TradingView Pine dashboards (Core v8.1 +
  Speculative v8.2) — the Pine scripts remain the source of truth for
  ladder VALUES; this system is the automation/sentiment layer Pine can't do.
- GRASS late-Oct VC-cliff unlock is a key planned Q4 entry (T3 timed to it).

## Stack & where everything lives

- **GitHub**: github.com/etherstien/crypto-station (private, main branch).
  Netlify auto-deploys on push.
- **Supabase**: project ref `henascrdmsypexkeyuhl` (free tier as of Jul 26 —
  UPGRADE TO PRO before relying on it daily: free projects pause after 7
  idle days, which kills pg_cron silently).
  - Postgres: schema in `supabase/schema.sql`, seed in `supabase/seed.sql`,
    notifier tables in `supabase/notify.sql`.
  - 7 Edge Functions in `supabase/functions/`: ingest-markets,
    ingest-sentiment, ingest-funding, ingest-onchain, ingest-defillama,
    evaluate, notify. Shared helpers in `_shared.ts` (incl. `pageAll` —
    see Bug History #4).
  - pg_cron schedule (all UTC): markets :05 hourly · evaluate :08,:38 ·
    notify :10,:40 · funding */30 · sentiment :02 hourly · onchain 06:10
    daily · defillama :15 every 6h. Inspect: `select * from cron.job;`
- **Netlify**: site `cryptoclauderesearch` → https://cryptoclauderesearch.netlify.app
  - `web/index.html` — single-file dashboard (gate annunciator, focus table,
    screener). Pine-matched palette (#0d1117; T1 #388bfd, T2 #a371f7,
    T3 #ff7b72).
  - `netlify/functions/api.mts` — read API (/api/dashboard, /api/screener,
    /api/asset). 60s cache header.
  - `netlify/functions/tv-webhook.mts` — TradingView alert receiver
    (?secret= auth) → tv_events table. User has TradingView Premium.
- **Data sources (all Stage-1/free)**: CoinGecko (Demo key), Coinalyze
  (free key), alternative.me F&G (keyless), BGeometrics BTC on-chain
  (keyless — spec discovered at api.bgeometrics.com/v3/api-docs, live
  endpoints /v1/sth-realized-price etc.), DefiLlama (keyless), Polymarket
  (optional slugs). Production cost target ~$60/mo (Supabase Pro 25 +
  CoinGecko Basic 35).
- **Notifications**: ntfy.sh via JSON publish API (topic in NTFY_TOPIC
  secret). Telegram supported (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) but
  not configured. notify_state table dedupes; state advances only after a
  successful send.

## Secrets (names only — values live in Supabase/Netlify, NEVER in the repo)

Supabase Edge Function secrets (`supabase secrets set`): JOB_SECRET (also
embedded in the SQL `call_job()` function — rotating means updating BOTH;
note: the current value leaked into a chat and rotation is on the backlog),
COINGECKO_API_KEY, COINALYZE_API_KEY, NTFY_TOPIC, optional POLYMARKET_SLUGS.
Netlify env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (legacy JWT key —
enabled in dashboard), TV_WEBHOOK_SECRET.
Every ingest/evaluate/notify function requires header `x-job-secret`.

Manual trigger pattern (PowerShell, user is on Windows):
```powershell
curl.exe -s -X POST "https://henascrdmsypexkeyuhl.functions.supabase.co/<fn>" -H "x-job-secret: $S"
```

Deploy ritual: `git pull` → `supabase functions deploy <names> --no-verify-jwt`
(--no-verify-jwt is safe: functions self-auth via x-job-secret). Netlify
redeploys automatically on git push.

## Hard-won conventions (do not violate)

1. **The collision rule**: NEVER join or identify assets by ticker symbol.
   `assets.id` is the permanent key; provider IDs (coingecko_id,
   defillama_slug, coinalyze_sym) are explicit mapped columns. Ticker
   collisions already encountered: LIT = Lighter NOT Litecoin/Litentry;
   DATA = DATA Foundation (ex-Story $IP) NOT Streamr; USELESS = useless-3
   NOT useless-coin (fixed Jul 26); FLUID feeds polluted by legacy INST.
   Price sanity is the test for any new ID mapping.
2. **Zones**: source='hand' rows are the user's curated ladders — NEVER
   overwritten by code. source='auto' rows are recomputed each evaluate run
   for screener assets. A ladder may have null T1 deliberately (see DEXE).
3. **Provenance**: every metric row carries source + fetched_at. Self-
   reported vs independently-verified distinction matters to this user.
4. **Console paste limit**: anything >5 lines of code goes through git,
   never PowerShell paste (CRLF/console corruption burned us twice).
5. **RLS locked**: browser never talks to Supabase directly; all access via
   Netlify functions with service-role key. No anon policies exist.
6. **User's live Pine symbol overrides are sacred** — when regenerating any
   Pine file, preserve his feed strings exactly (OKX:GRASSUSD, KRAKEN:IPUSD,
   KRAKEN:CCUSD, COINBASE:USELESSUSD, CRYPTO:SPX6USD, OKX:LITUSDT, etc.).

## Bug history (why the code looks the way it does)

1. CoinGecko 401 → PowerShell ate unquoted `<key>` args; secrets must be
   quoted on Windows.
2. All DB calls failed silently → "Automatically expose new tables" was
   unchecked at project creation, so service_role had NO grants on the
   schema's tables. Fixed with explicit `grant all ... to service_role` +
   `alter default privileges`. New tables inherit grants now.
3. Coinalyze persistent 429 with 2 calls → unrecognized key = anonymous
   traffic from Supabase's SHARED egress IPs (collectively throttled). Fix:
   key sent as api_key header + api-key header + query param. Same
   shared-IP issue applies to ntfy free tier (429s clear on their clock).
4. **The 1000-row cap**: PostgREST caps selects at 1000 rows; once assets
   passed 1000, unpaginated selects silently dropped rows (snapshots stuck
   at 998-1002, random assets starved). Fix: `pageAll()` helper in
   _shared.ts — USE IT for any select that can exceed 1000 rows.
5. ntfy 400 → emoji in HTTP Title header is not a valid ByteString.
   Fix: ntfy JSON publish API (POST https://ntfy.sh with JSON body).
   Never put non-ASCII in HTTP headers.
6. BGeometrics all-null → hardcoded slugs wrong; fixed with runtime OpenAPI
   discovery (/v3/api-docs — it's a Spring Boot service) + fallback
   candidates, mirroring the user's btc_onchain_fetch_v2.py approach.

## Current state (as of Jul 26, 2026 evening)

All 7 functions green. ~1,057 assets (57 focus + ~1,000 screener).
Market context: FNG 26 (one point above the fear gate), BTC ~5% BELOW
STH-RP, NUPL 0.185, gate NONE, six focus names in T1/WATCH (AKT, IO, OLAS,
AERO, WLD, BNB). Dry-powder posture confirmed by the system's own read.

Recent asset events encoded in data:
- VVV: position closed Jul 25 @ 13.199 (+30.4% net); ladder kept for
  re-entry, tag [W].
- DEXE: Jul 21-22 team-linked selling (~$6.2M to Binance) + liquidation
  cascade, ATH 48.91 → low 1.57, now ~3.6. NOT an exploit (early reports
  wrong, corrected). Ladder rebuilt deep-zones-only: T1 null BY DESIGN
  (recovery leg = chasing), T2 1.70-2.10 (retest), T3 1.30-1.55 (undercut).
  Re-peg after 2-3 weeks of base-building.
- Damage-handling taxonomy the user settled on: re-ladder (normal drawdown)
  / deep-zones-only, null T1 (integrity damage) / deactivate (broken
  denominator, e.g. infinite-mint).

## Backlog (rough priority order)

1. ✔ DONE Jul 27: display honesty states below_t3 + gap added to evaluate,
   dashboard (dashed chips + legend), and notify body text. Gate/score
   behavior unchanged by design.
2. Screener liquidity floor (min volume/mcap) — null-price funds and dust
   currently pollute top ranks (nulls sort first on score desc).
3. Coinalyze mappings: 25/27 resolve; find the 2 failing coinalyze_sym
   values via their /future-markets endpoint.
4. Remaining ID verifications: LIT, CC, 2Z, ANSEM (likely not on CoinGecko
   — acceptable to leave null), PHA ladder re-anchor (spot ~$0.02 vs ladder
   built off $0.045 estimate).
5. Verify funding-rate units/scale against Coinalyze docs (suspicious
   1.0000% prints). Gate only uses SIGN so logic is safe regardless.
6. JOB_SECRET rotation (leaked to chat; low blast radius but rotate:
   supabase secrets set + edit call_job() in SQL).
7. Netlify env upgrade: consider new sb_secret keys when Supabase legacy
   JWT keys are eventually retired.
8. Supabase Pro upgrade before daily reliance (free tier pauses!).
9. Phase 2 intelligence: DefiLlama unlock calendar (GRASS Oct cliff →
   zone annotations), revenue-trend deltas vs promotion/demotion triggers
   (SYRUP MIP-021 buybacks Aug 2026, FLUID demote-on-third-incident),
   gate-history analytics once data accumulates.
10. Phase 3 (paid, only after a month of validated use): LunarCrush
    Builder ~$240 + Santiment Pro ~$49 per-asset social sentiment.
11. Phase 4: scheduled Claude API "morning analyst brief" function.

## Related but out-of-repo context

The user also maintains: Pine Portfolio Tracker v1.8.1 (all platforms,
cost-basis audit trail), Core Holdings v8.1 + Speculative v8.2 tranche
dashboards (Pine v6, 40-request cap is why this system exists), BTC Cycle
Tracker v2.0, btc_onchain_fetch_v2.py. Research reports (DeFi revenue
verification: SYRUP/SKY/FLUID/PYTH; AI-crypto top-10; vendor/pricing
research behind this build) live in his Claude project. TDR Pro (analyst
Nadeau) is his external signal source; [P]/[W] tags in ladders = TDR
position/watchlist.
