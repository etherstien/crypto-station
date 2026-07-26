// ingest-markets — CoinGecko /coins/markets
// · Pulls top 1000 by market cap (4 pages x 250) → screener layer
// · Ensures every focus asset gets a snapshot even if outside top 1000
// · Auto-registers new screener assets keyed on coingecko_id (NEVER symbol)
// Budget: 4-6 calls/run. Hourly = ~3.6k calls/mo (CoinGecko Demo = 10k/mo,
// Basic = 100k credits). Adjust cron cadence in cron.sql if upgrading.
import { sb, ok, err, authorized } from "../_shared.ts";

const CG = "https://api.coingecko.com/api/v3";

async function cg(path: string) {
  const key = Deno.env.get("COINGECKO_API_KEY") ?? "";
  const url = `${CG}${path}${path.includes("?") ? "&" : "?"}x_cg_demo_api_key=${key}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const now = new Date().toISOString();

    // 1) known assets keyed by coingecko_id
    const { data: assets } = await db.from("assets")
      .select("id,coingecko_id,layer").eq("active", true).not("coingecko_id", "is", null);
    const byCg = new Map((assets ?? []).map((a) => [a.coingecko_id, a]));

    // 2) top-1000 sweep — DEDUPED: rankings shift between page fetches, so
    // the same coin can appear on two pages; duplicate keys in one upsert
    // batch make Postgres reject the whole statement.
    const rowMap = new Map<string, any>();
    for (let page = 1; page <= 4; page++) {
      const batch = await cg(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=24h,1y`);
      for (const r of batch) if (r?.id && !rowMap.has(r.id)) rowMap.set(r.id, r);
    }

    // 3) focus assets not in the sweep → fetch by id in one call
    const missing = (assets ?? [])
      .filter((a) => a.layer === "focus" && !rowMap.has(a.coingecko_id))
      .map((a) => a.coingecko_id);
    if (missing.length) {
      const extra = await cg(`/coins/markets?vs_currency=usd&ids=${missing.join(",")}&price_change_percentage=24h,1y`);
      for (const r of extra) if (r?.id && !rowMap.has(r.id)) rowMap.set(r.id, r);
    }
    const rows = [...rowMap.values()];

    // 4) upsert: register unknown screener assets, then snapshot everything
    const newAssets = rows.filter((r) => !byCg.has(r.id)).map((r) => ({
      symbol: (r.symbol ?? "").toUpperCase(),
      name: r.name ?? r.id,
      layer: "screener",
      coingecko_id: r.id,
    }));
    if (newAssets.length) {
      const { data: inserted } = await db.from("assets")
        .upsert(newAssets, { onConflict: "coingecko_id", ignoreDuplicates: true })
        .select("id,coingecko_id");
      for (const a of inserted ?? []) byCg.set(a.coingecko_id, a);
      // refresh map for any dupes skipped by ignoreDuplicates
      const { data: all } = await db.from("assets").select("id,coingecko_id").not("coingecko_id", "is", null);
      for (const a of all ?? []) if (!byCg.has(a.coingecko_id)) byCg.set(a.coingecko_id, a);
    }

    const snaps = rows.map((r) => ({
      asset_id: byCg.get(r.id)?.id,
      ts: now,
      price: r.current_price,
      mcap: r.market_cap,
      mcap_rank: r.market_cap_rank,
      vol24: r.total_volume,
      ath: r.ath,
      ath_pct: r.ath_change_percentage,
      atl: r.atl,
      atl_pct: r.atl_change_percentage,
      chg_24h_pct: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h,
      chg_1y_pct: r.price_change_percentage_1y_in_currency ?? null,
    })).filter((s) => s.asset_id);

    for (let i = 0; i < snaps.length; i += 500) {
      const { error } = await db.from("market_snapshots").upsert(snaps.slice(i, i + 500));
      if (error) throw error;
    }
    return ok({ snapshots: snaps.length, new_assets: newAssets.length });
  } catch (e) { return err(e); }
});
