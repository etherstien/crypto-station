-- ============================================================
-- CRYPTO STATION — Supabase schema (Stage 1 MVP)  v1.0 2026-07-26
-- Run this in the Supabase SQL editor FIRST, before seed.sql.
--
-- Design principles (from the framework):
--  · NEVER join on ticker symbols. assets.id is the permanent key;
--    every provider ID is an explicit mapped column. (LIT/Lighter,
--    DATA/Streamr, GOLD/Barrick collision rule, as schema.)
--  · Every metric row carries provenance: source + fetched_at.
--  · Zones: source='hand' rows are the curated Pine ladders and are
--    NEVER overwritten by the evaluator; source='auto' rows are
--    recomputed algorithmically for screener-layer assets.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Assets: the permanent ID table ──────────────────────────
create table if not exists assets (
  id              bigint generated always as identity primary key,
  symbol          text not null,             -- display only, NEVER a join key
  name            text not null,
  layer           text not null default 'screener' check (layer in ('focus','screener')),
  tier            text,                      -- S/A/B/C/AI/DR etc (focus layer)
  coingecko_id    text unique,               -- canonical CoinGecko id
  defillama_slug  text,
  coinalyze_sym   text,                      -- e.g. BTCUSDT_PERP.A
  contract        text,
  chain           text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_assets_layer on assets(layer) where active;

-- Unresolved provider-ID candidates awaiting MANUAL confirmation.
-- The resolver writes here; a human promotes to assets.*_id columns.
create table if not exists id_candidates (
  id           bigint generated always as identity primary key,
  asset_id     bigint references assets(id),
  provider     text not null,
  candidate_id text not null,
  candidate_nm text,
  score        numeric,
  status       text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_at   timestamptz not null default now()
);

-- ── Market snapshots (CoinGecko /coins/markets) ─────────────
create table if not exists market_snapshots (
  asset_id     bigint not null references assets(id),
  ts           timestamptz not null default now(),
  price        numeric,
  mcap         numeric,
  mcap_rank    int,
  vol24        numeric,
  ath          numeric,
  ath_pct      numeric,      -- % from ATH (negative)
  atl          numeric,
  atl_pct      numeric,      -- % above ATL
  chg_24h_pct  numeric,
  chg_1y_pct   numeric,
  source       text not null default 'coingecko',
  fetched_at   timestamptz not null default now(),
  primary key (asset_id, ts)
);
create index if not exists idx_ms_latest on market_snapshots(asset_id, ts desc);

-- ── Tranche zones ───────────────────────────────────────────
create table if not exists zones (
  asset_id   bigint not null references assets(id),
  source     text not null check (source in ('hand','auto')),
  t1_lo numeric, t1_hi numeric,
  t2_lo numeric, t2_hi numeric,
  t3_lo numeric, t3_hi numeric,
  reserve_below numeric,
  method     text,             -- e.g. 'Core v8.1', 'Spec v8.2', 'auto: pct-of-spot + ATL anchor'
  updated_at timestamptz not null default now(),
  primary key (asset_id, source)
);

-- ── Derivatives positioning (Coinalyze) ─────────────────────
create table if not exists funding (
  asset_id     bigint not null references assets(id),
  ts           timestamptz not null default now(),
  funding_rate numeric,        -- current predicted/last funding, decimal (0.0001 = 0.01%)
  oi_usd       numeric,
  source       text not null default 'coinalyze',
  fetched_at   timestamptz not null default now(),
  primary key (asset_id, ts)
);

-- ── Global sentiment (Fear & Greed + prediction markets) ────
create table if not exists sentiment_global (
  ts          timestamptz primary key default now(),
  fng_value   int,
  fng_class   text,
  polymarket  jsonb,           -- selected market odds snapshots
  source      text not null default 'alternative.me',
  fetched_at  timestamptz not null default now()
);

-- ── BTC on-chain cycle metrics (BGeometrics) ────────────────
create table if not exists onchain_btc (
  ts             timestamptz primary key default now(),
  sth_rp         numeric,
  lth_rp         numeric,
  realized_price numeric,
  nupl           numeric,
  source         text not null default 'bgeometrics',
  fetched_at     timestamptz not null default now()
);

-- ── Protocol fundamentals (DefiLlama, focus layer) ──────────
create table if not exists protocol_metrics (
  asset_id    bigint not null references assets(id),
  ts          timestamptz not null default now(),
  tvl         numeric,
  fees_24h    numeric,
  revenue_24h numeric,
  source      text not null default 'defillama',
  fetched_at  timestamptz not null default now(),
  primary key (asset_id, ts)
);

-- ── Signals: evaluator output ───────────────────────────────
-- gate_state values:
--   NONE        price above all zones (or in a gap between zones)
--   WATCH       in/near T1
--   ARMED       in deep zone (T2/T3/below_t3/reserve), gate NOT confirming
--   DEPLOY      in deep zone AND gate confirms (extreme fear ± neg funding)
--   DONT_CHASE  FNG >= 75 (greed) — chase-warning regardless of zone
create table if not exists signals (
  asset_id   bigint not null references assets(id),
  ts         timestamptz not null default now(),
  zone_state text not null,     -- none/t1/t2/t3/reserve/below_t3/gap
  gate_state text not null,
  score      numeric,           -- screener composite 0-100
  components jsonb,             -- {fng, funding_rate, zone_src, dd_ath, ...}
  primary key (asset_id, ts)
);
create index if not exists idx_sig_latest on signals(asset_id, ts desc);

-- ── TradingView webhook events (raw) ────────────────────────
create table if not exists tv_events (
  id         bigint generated always as identity primary key,
  received   timestamptz not null default now(),
  payload    jsonb not null
);

-- ── Convenience views for the read API ──────────────────────
create or replace view v_latest_market as
  select distinct on (asset_id) * from market_snapshots order by asset_id, ts desc;

create or replace view v_latest_signal as
  select distinct on (asset_id) * from signals order by asset_id, ts desc;

create or replace view v_latest_funding as
  select distinct on (asset_id) * from funding order by asset_id, ts desc;

create or replace view v_dashboard as
  select a.id, a.symbol, a.name, a.layer, a.tier,
         m.price, m.mcap_rank, m.chg_24h_pct, m.ath_pct, m.atl_pct, m.ts as price_ts,
         z.t1_lo, z.t1_hi, z.t2_lo, z.t2_hi, z.t3_lo, z.t3_hi, z.source as zone_src,
         s.zone_state, s.gate_state, s.score, s.ts as signal_ts,
         f.funding_rate
    from assets a
    left join v_latest_market  m on m.asset_id = a.id
    left join lateral (
      select * from zones z2 where z2.asset_id = a.id
      order by case z2.source when 'hand' then 0 else 1 end limit 1
    ) z on true
    left join v_latest_signal  s on s.asset_id = a.id
    left join v_latest_funding f on f.asset_id = a.id
   where a.active;

-- ── RLS: lock everything down; access is via service key only ──
alter table assets            enable row level security;
alter table id_candidates     enable row level security;
alter table market_snapshots  enable row level security;
alter table zones             enable row level security;
alter table funding           enable row level security;
alter table sentiment_global  enable row level security;
alter table onchain_btc       enable row level security;
alter table protocol_metrics  enable row level security;
alter table signals           enable row level security;
alter table tv_events         enable row level security;
-- No anon policies created: the browser never talks to Supabase directly.
-- Netlify Functions use the service-role key server-side.
