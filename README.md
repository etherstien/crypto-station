# STATION — private crypto tranche & sentiment-gate system (Stage 1)

Monitors the broad crypto universe (top ~1,000 by market cap) and your
curated focus list, evaluates every asset against tranche entry ladders,
and gates deployment signals on retail sentiment: **DEPLOY fires only when
price is in a deep zone (T2/T3, below T3, or reserve) AND the Fear & Greed
index shows extreme fear AND funding is non-positive.** Sentiment confirms —
it never originates.

Stack (all Stage 1 / ~$85/mo at production settings):
Supabase (Postgres + pg_cron + Edge Functions) · Netlify (static dashboard
+ read API + TradingView webhook receiver) · CoinGecko (markets) ·
Coinalyze (funding/OI, free) · Alternative.me F&G (free) · BGeometrics
(BTC on-chain, free) · DefiLlama (protocol fundamentals, free) ·
Polymarket (odds, free).

---

## Setup — about 45 minutes

### 1. Supabase project
1. supabase.com → New project (free tier is fine for the build; upgrade to
   Pro $25/mo before daily use — free projects pause after 7 idle days,
   which silently kills the cron jobs).
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Then paste and run `supabase/seed.sql` (your focus assets + hand ladders
   from Core v8.1 / Spec v8.2).

### 2. API keys (all free)
- CoinGecko Demo key: coingecko.com/api → free Demo plan.
- Coinalyze key: coinalyze.net → account → API.
- Generate two long random strings yourself: `JOB_SECRET` and
  `TV_WEBHOOK_SECRET` (e.g. `openssl rand -hex 24`).

### 3. Deploy Edge Functions
Install the Supabase CLI (`npm i -g supabase`), then from the repo root:
```bash
supabase login
supabase link --project-ref <PROJECT-REF>        # ref is in your dashboard URL
supabase secrets set JOB_SECRET=<yours> COINGECKO_API_KEY=<yours> COINALYZE_API_KEY=<yours>
# optional: supabase secrets set POLYMARKET_SLUGS=<slug1>,<slug2>
supabase functions deploy ingest-markets ingest-sentiment ingest-funding ingest-onchain ingest-defillama evaluate --no-verify-jwt
```
`--no-verify-jwt` is safe here: every function checks the `x-job-secret`
header itself and rejects anything without it.

### 4. Schedule the jobs
Open `supabase/cron.sql`, replace `<PROJECT-REF>` and `<JOB-SECRET>`,
run it in the SQL Editor. Verify with `select * from cron.job;`.

### 5. Netlify site
1. Push this repo to GitHub, then Netlify → Add new site → Import from Git.
   Build settings are read from `netlify.toml` (publish dir `web`).
2. Site settings → Environment variables:
   - `SUPABASE_URL` — from Supabase Settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` — same page (server-side only; never ships
     to the browser)
   - `TV_WEBHOOK_SECRET` — your random string
3. Deploy. The dashboard is at your site root; API at `/api/dashboard`.

### 6. First run (don't wait for cron)
Trigger each job once, in this order:
```bash
REF=<PROJECT-REF>; S=<JOB-SECRET>
for f in ingest-markets ingest-sentiment ingest-funding ingest-onchain ingest-defillama evaluate; do
  curl -s -X POST "https://$REF.functions.supabase.co/$f" -H "x-job-secret: $S"; echo;
done
```
Then open the site — the gate annunciator, focus table, and screener
should populate.

### 7. TradingView webhooks (optional, you have Premium)
In any Pine alert, set the webhook URL to
`https://<your-site>.netlify.app/tv-webhook?secret=<TV_WEBHOOK_SECRET>`
and make the alert message valid JSON, e.g.
`{"symbol":"GRASS","event":"T3_ENTER","price":{{close}}}`.
Events land in the `tv_events` table for the dashboard's next iteration.

---

## Post-launch checklist (the collision rule, as ops)
- `seed.sql` marks several coingecko_ids `-- VERIFY` (LIT/Lighter, CC/Canton,
  DATA, FLUID, MON, 2Z, ANSEM, USELESS, PHA, DRV, ASTER). After the first
  markets run, check those rows got snapshots at sane prices. For any that
  are null or wrong-priced: find the true id via
  `https://api.coingecko.com/api/v3/search?query=<name>`, then
  `update assets set coingecko_id='<true-id>' where symbol='<SYM>';`
  Never trust a symbol match — price sanity is the test (ATH ≈ $0.0044,
  FLUID ≈ $1, DATA ≈ $0.35).
- Coinalyze symbols (`coinalyze_sym`) follow `<SYM>USDT_PERP.A` for Binance
  aggregates; the `/future-markets` endpoint lists valid symbols if any row
  never gets funding data.
- Upgrade CoinGecko Demo → Basic ($35) if you tighten the markets cadence
  below hourly or expand past 4 pages.

## Cost at production settings
Supabase Pro $25 + CoinGecko Basic $35 + Netlify free + everything else
free ≈ **$60/mo** (add TradingView you already pay for). Demo-key +
Supabase-free during the build = $0.

## What Stage 2 adds (when gate logic is validated)
LunarCrush Builder API (~$240) + Santiment Pro (~$49) for per-asset social
scores feeding a `sentiment_asset` table; CoinGlass Standard ($299) only if
this ever goes public; Dune + Tokenomist for unlock calendars.
