-- ============================================================
-- CRYPTO STATION — seed.sql  v1.0 2026-07-26
-- Run AFTER schema.sql. Seeds the FOCUS layer with your watchlist
-- and the hand-tuned tranche ladders from Core v8.1 + Spec v8.2.
--
-- coingecko_id values marked '-- VERIFY' are best-effort matches.
-- The resolver function will surface candidates for any that fail;
-- per the collision rule, promote them MANUALLY via id_candidates.
-- Screener-layer assets are auto-populated by ingest-markets and
-- do not need seeding.
-- ============================================================

-- ── FOCUS ASSETS ────────────────────────────────────────────
insert into assets (symbol,name,layer,tier,coingecko_id,defillama_slug,coinalyze_sym,notes) values
-- Bedrock / Core
('BTC','Bitcoin','focus','S','bitcoin',null,'BTCUSDT_PERP.A',null),
('ETH','Ethereum','focus','S','ethereum',null,'ETHUSDT_PERP.A',null),
('SOL','Solana','focus','S','solana',null,'SOLUSDT_PERP.A',null),
('BNB','BNB','focus','S','binancecoin',null,'BNBUSDT_PERP.A',null),
('AVAX','Avalanche','focus','A','avalanche-2',null,'AVAXUSDT_PERP.A',null),
('ADA','Cardano','focus','A','cardano',null,'ADAUSDT_PERP.A',null),
('AAVE','Aave','focus','A','aave','aave','AAVEUSDT_PERP.A',null),
('UNI','Uniswap','focus','A','uniswap','uniswap','UNIUSDT_PERP.A',null),
('MORPHO','Morpho','focus','A','morpho','morpho','MORPHOUSDT_PERP.A',null),
('HYPE','Hyperliquid','focus','A','hyperliquid','hyperliquid',null,null),
('ENA','Ethena','focus','B','ethena','ethena','ENAUSDT_PERP.A',null),
('SUI','Sui','focus','B','sui',null,'SUIUSDT_PERP.A',null),
('AERO','Aerodrome','focus','B','aerodrome-finance','aerodrome-slipstream',null,null),
('JUP','Jupiter','focus','B','jupiter-exchange-solana','jupiter-aggregator','JUPUSDT_PERP.A',null),
('PENDLE','Pendle','focus','B','pendle','pendle','PENDLEUSDT_PERP.A',null),
('JTO','Jito','focus','B','jito-governance-token','jito',null,null),
('RAY','Raydium','focus','B','raydium','raydium',null,null),
('KMNO','Kamino','focus','B','kamino','kamino-lend',null,null),
('TIA','Celestia','focus','B','celestia',null,'TIAUSDT_PERP.A',null),
-- AI section (Spec v8.2 ranks)
('TAO','Bittensor','focus','AI-1','bittensor',null,'TAOUSDT_PERP.A',null),
('GRASS','Grass','focus','AI-2','grass',null,null,null),
('RENDER','Render','focus','AI-3','render-token',null,null,null),
('AKT','Akash','focus','AI-4','akash-network','akash',null,null),
('NEAR','NEAR','focus','AI-5','near',null,'NEARUSDT_PERP.A',null),
('ATH','Aethir','focus','AI-6','aethir','aethir',null,'sanity: price ~$0.004; collision-prone ticker'),
('IO','io.net','focus','AI-7','io','io-net',null,null),
('VIRTUAL','Virtuals Protocol','focus','AI-8','virtual-protocol','virtuals-protocol',null,null),
('NOS','Nosana','focus','AI-9','nosana',null,null,null),
('VVV','Venice','focus','AI-10','venice-token',null,null,'position closed Jul 25 2026 +30.4%; monitor for re-entry'),
('PHA','Phala','focus','AI-trig','pha',null,null,null),                                   -- VERIFY (may be phala-network)
('DATA','DATA Foundation','focus','AI-trig','story-2',null,null,'ex-Story IP; feed still IP on venues; NOT Streamr'),  -- VERIFY
('OLAS','Olas','focus','AI-trig','autonolas',null,null,'thin liquidity'),
('KAITO','Kaito','focus','AI-trig','kaito',null,null,null),
-- DeFi Revenue (Spec v8.2)
('SYRUP','Maple Finance','focus','DR-1','syrup','maple','SYRUPUSDT_PERP.A','Tier A; promote to core after MIP-021 buybacks execute 2 months'),
('SKY','Sky','focus','DR-2','sky','sky-lending',null,'rate-sensitive: Fed cuts compress ~60% of revenue'),
('FLUID','Fluid','focus','DR-3','instadapp','fluid',null,'feed pollution: legacy INST ~$24 is WRONG asset'),  -- VERIFY cg id may now be fluid-2
('PYTH','Pyth Network','focus','DR-trig','pyth-network',null,'PYTHUSDT_PERP.A','trigger-watch: no accumulation pre ARR>=10M'),
-- Mid-cap / High-risk (Spec v8.2)
('WLD','Worldcoin','focus','B','worldcoin-wld',null,'WLDUSDT_PERP.A','hold 10,069.93 @ 0.35645'),
('LIT','Lighter','focus','B',null,null,null,'NOT Litecoin/Litentry — resolver must confirm; OKX:LITUSDT feed'),  -- VERIFY: cg id unknown
('CC','Canton','focus','B',null,null,null,'hold 12,889.846 @ 0.13'),                        -- VERIFY
('DRV','Derive','focus','B','derive',null,null,'hold 21,297.268 @ 0.09372'),                -- VERIFY
('ASTER','Aster','focus','B','aster-2',null,null,null),                                     -- VERIFY
('DEXE','DeXe','focus','B','dexe',null,null,'reclassified: DAO/governance, NOT AI; mean-reversion risk'),
('ZEC','Zcash','focus','C','zcash',null,'ZECUSDT_PERP.A',null),
('SPX','SPX6900','focus','C','spx6900',null,null,null),
('PUMP','Pump.fun','focus','C','pump-fun',null,null,'hold 666,886 @ 0.001502; insider probe'),
('USELESS','Useless Coin','focus','C','useless-coin',null,null,'hold 22,174 @ 0.0673'),     -- VERIFY
('PENGU','Pudgy Penguins','focus','C','pudgy-penguins',null,'PENGUUSDT_PERP.A',null),
('MON','Monad','focus','C','monad',null,null,null),                                          -- VERIFY
('PEPE','Pepe','focus','C','pepe',null,'PEPEUSDT_PERP.A',null),
('BONK','Bonk','focus','C','bonk',null,'BONKUSDT_PERP.A','hold 813M @ 0.0000034870; BonkDAO exploit Jul26'),
('DOGE','Dogecoin','focus','C','dogecoin',null,'DOGEUSDT_PERP.A',null),
('2Z','DoubleZero','focus','C',null,null,null,'verify token/feed'),                          -- VERIFY
('ANSEM','ANSEM (Black Bull)','focus','C',null,null,null,'hold 10,673.97 @ 0.17649; casino'), -- VERIFY
('ONDO','Ondo','focus','A','ondo-finance','ondo-finance','ONDOUSDT_PERP.A',null),
('LINK','Chainlink','focus','S','chainlink','chainlink','LINKUSDT_PERP.A',null),
('XRP','XRP','focus','A','ripple',null,'XRPUSDT_PERP.A',null);

-- ── HAND-TUNED ZONE LADDERS (Core v8.1 + Spec v8.2, Jul 2026) ──
-- helper: upsert by symbol lookup (symbols unique within seed set)
create or replace function seed_zone(p_sym text, a numeric,b numeric,c numeric,d numeric,e numeric,f numeric, res numeric, m text)
returns void language plpgsql as $$
declare aid bigint;
begin
  select id into aid from assets where symbol = p_sym limit 1;
  if aid is not null then
    insert into zones(asset_id,source,t1_lo,t1_hi,t2_lo,t2_hi,t3_lo,t3_hi,reserve_below,method)
    values (aid,'hand',a,b,c,d,e,f,nullif(res,0),m)
    on conflict (asset_id,source) do update
      set t1_lo=excluded.t1_lo,t1_hi=excluded.t1_hi,t2_lo=excluded.t2_lo,t2_hi=excluded.t2_hi,
          t3_lo=excluded.t3_lo,t3_hi=excluded.t3_hi,reserve_below=excluded.reserve_below,
          method=excluded.method,updated_at=now();
  end if;
end $$;

select seed_zone('BTC',55000,58800,40000,48000,27000,35000,40000,'Core v8.1');
select seed_zone('ETH',1550,1650,1150,1300,800,1050,1050,'Core v8.1');
select seed_zone('SOL',60,67,46,55,30,40,0,'Core v8.1');
select seed_zone('BNB',470,520,345,420,240,310,0,'Core v8.1');
select seed_zone('AVAX',5.50,5.95,4.20,4.90,2.80,3.60,0,'Core v8.1');
select seed_zone('ADA',0.140,0.150,0.105,0.125,0.070,0.090,0,'Core v8.1');
select seed_zone('AAVE',72,80,55,65,36,48,0,'Core v8.1');
select seed_zone('UNI',2.90,3.20,2.20,2.60,1.40,1.90,0,'Core v8.1');
select seed_zone('MORPHO',1.60,1.77,1.15,1.40,0.75,1.00,0,'Core v8.1');
select seed_zone('HYPE',47,53,36,44,22,30,0,'Core v8.1');
select seed_zone('ENA',0.070,0.076,0.052,0.063,0.033,0.045,0,'Core v8.1');
select seed_zone('SUI',0.62,0.68,0.46,0.56,0.30,0.40,0,'Core v8.1');
select seed_zone('AERO',0.38,0.42,0.28,0.34,0.18,0.24,0,'Core v8.1');
select seed_zone('JUP',0.158,0.175,0.125,0.145,0.080,0.105,0,'Core v8.1');
select seed_zone('PENDLE',1.30,1.42,0.95,1.15,0.60,0.82,0,'Core v8.1');
select seed_zone('JTO',0.44,0.49,0.31,0.38,0.19,0.26,0,'Core v8.1');
select seed_zone('RAY',0.55,0.61,0.42,0.50,0.26,0.36,0,'Core v8.1');
select seed_zone('KMNO',0.0150,0.0165,0.0115,0.0135,0.0072,0.0098,0,'Core v8.1');
select seed_zone('TIA',0.30,0.33,0.22,0.27,0.13,0.19,0,'Core v8.1');
select seed_zone('TAO',160,175,118,140,78,105,0,'Spec v8.2 AI');
select seed_zone('GRASS',0.27,0.30,0.19,0.23,0.115,0.155,0,'Spec v8.2 AI; T3 timed to late-Oct VC-cliff flush');
select seed_zone('RENDER',1.18,1.30,0.85,1.05,0.55,0.75,0,'Spec v8.2 AI');
select seed_zone('AKT',0.44,0.48,0.32,0.37,0.20,0.26,0,'Spec v8.2 AI');
select seed_zone('NEAR',1.55,1.72,1.10,1.35,0.75,0.95,0,'Spec v8.2 AI');
select seed_zone('ATH',0.0036,0.0039,0.0026,0.0032,0.0016,0.0022,0,'Spec v8.2 AI; T1 = ATL retest');
select seed_zone('IO',0.135,0.150,0.095,0.115,0.055,0.080,0,'Spec v8.2 AI');
select seed_zone('VIRTUAL',0.48,0.53,0.34,0.42,0.20,0.29,0,'Spec v8.2 AI');
select seed_zone('NOS',0.20,0.23,0.14,0.18,0.085,0.12,0,'Spec v8.2 AI; spot estimate — verify');
select seed_zone('VVV',9.20,10.30,6.00,7.60,3.50,5.30,0,'Spec v8.2 AI; re-entry ladder below Jul-25 exit');
select seed_zone('PHA',0.033,0.037,0.024,0.029,0.015,0.021,0,'Spec v8.2 AI trig');
select seed_zone('DATA',0.27,0.30,0.19,0.24,0.11,0.16,0,'Spec v8.2 AI trig');
select seed_zone('OLAS',0.026,0.030,0.018,0.023,0.010,0.015,0,'Spec v8.2 AI trig; spot estimate');
select seed_zone('KAITO',0.50,0.56,0.36,0.44,0.22,0.30,0,'Spec v8.2 AI trig');
select seed_zone('SYRUP',0.135,0.150,0.100,0.110,0.075,0.085,0,'Spec v8.2 DR; T3 at/below ATL 0.0852');
select seed_zone('SKY',0.046,0.051,0.035,0.038,0.025,0.030,0,'Spec v8.2 DR; rate-cut risk');
select seed_zone('FLUID',0.82,0.89,0.55,0.65,0.37,0.45,0,'Spec v8.2 DR');
select seed_zone('PYTH',0.033,0.036,0.029,0.030,0.020,0.025,0,'Spec v8.2 DR trig; T2 = Jun ATL 0.02958');
select seed_zone('WLD',0.32,0.34,0.24,0.26,0.15,0.19,0,'Spec v8.2 MC');
select seed_zone('LIT',1.85,2.00,1.35,1.55,0.85,1.05,0,'Spec v8.2 MC');
select seed_zone('ANSEM',0.140,0.155,0.100,0.120,0.060,0.085,0,'Spec v8.2 MC; casino');
select seed_zone('DRV',0.100,0.110,0.070,0.085,0.045,0.060,0,'Spec v8.2 MC');
select seed_zone('CC',0.105,0.115,0.078,0.090,0.055,0.065,0,'Spec v8.2 MC');
select seed_zone('ASTER',0.50,0.55,0.36,0.42,0.22,0.30,0,'Spec v8.2 MC');
select seed_zone('DEXE',28,31,19,24,12,17,0,'Spec v8.2 MC; do not chase');
select seed_zone('ZEC',440,480,310,360,195,250,0,'Spec v8.2 HR');
select seed_zone('SPX',0.275,0.305,0.21,0.23,0.12,0.155,0,'Spec v8.2 HR');
select seed_zone('PUMP',0.00132,0.00145,0.00085,0.00105,0.00050,0.00072,0,'Spec v8.2 HR; all zones new-ATL');
select seed_zone('USELESS',0.047,0.052,0.032,0.038,0.018,0.026,0,'Spec v8.2 HR');
select seed_zone('PENGU',0.0048,0.0053,0.0034,0.0039,0.0019,0.0027,0,'Spec v8.2 HR');
select seed_zone('MON',0.0170,0.0190,0.0125,0.0148,0.0065,0.0095,0,'Spec v8.2 HR');
select seed_zone('PEPE',0.00000215,0.00000240,0.00000140,0.00000175,0.00000085,0.00000120,0,'Spec v8.2 HR');
select seed_zone('BONK',0.00000235,0.00000262,0.00000150,0.00000195,0.00000090,0.00000135,0,'Spec v8.2 HR');
select seed_zone('DOGE',0.0605,0.0635,0.050,0.055,0.038,0.047,0,'Spec v8.2 HR; shallow by design');
select seed_zone('2Z',0.051,0.057,0.033,0.042,0.020,0.029,0,'Spec v8.2 HR');

drop function seed_zone(text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text);
