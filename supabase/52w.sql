-- 52-week high/low per focus asset — refreshed by ingest-markets from
-- CoinGecko /coins/{id}/market_chart (days=365 → daily granularity).
-- Focus layer only: screener-wide would cost ~1000 market_chart calls/day,
-- blowing the CoinGecko Demo budget. Run once after schema.sql (same
-- pattern as notify.sql). New tables inherit service_role grants via the
-- default privileges set up after Bug History #2.
create table if not exists market_52w (
  asset_id  bigint primary key references assets(id),
  high_52w  numeric,
  low_52w   numeric,
  ts        timestamptz not null default now()
);
alter table market_52w enable row level security;

-- v_dashboard with 52w columns appended (create or replace view can only
-- append columns, never drop or reorder — keep new fields at the end).
create or replace view v_dashboard as
  select a.id, a.symbol, a.name, a.layer, a.tier,
         m.price, m.mcap_rank, m.chg_24h_pct, m.ath_pct, m.atl_pct, m.ts as price_ts,
         z.t1_lo, z.t1_hi, z.t2_lo, z.t2_hi, z.t3_lo, z.t3_hi, z.source as zone_src,
         s.zone_state, s.gate_state, s.score, s.ts as signal_ts,
         f.funding_rate,
         w.high_52w, w.low_52w
    from assets a
    left join v_latest_market  m on m.asset_id = a.id
    left join lateral (
      select * from zones z2 where z2.asset_id = a.id
      order by case z2.source when 'hand' then 0 else 1 end limit 1
    ) z on true
    left join v_latest_signal  s on s.asset_id = a.id
    left join v_latest_funding f on f.asset_id = a.id
    left join market_52w       w on w.asset_id = a.id
   where a.active;
