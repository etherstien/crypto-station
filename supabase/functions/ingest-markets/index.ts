// ingest-markets — CoinGecko /coins/markets
// · Pulls top 1000 by market cap (4 pages x 250) → screener layer
// · Ensures every focus asset gets a snapshot even if outside top 1000
// · Auto-registers new screener assets keyed on coingecko_id (NEVER symbol)
// Budget: 4-6 calls/run. Hourly = ~3.6k calls/mo (CoinGecko Demo = 10k/mo,
// Basic = 100k credits). Adjust cron cadence in cron.sql if upgrading.
import { sb, ok, err, authorized, pageAll } from "../_shared.ts";

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

    // 1) known assets keyed by coingecko_id — PAGINATED past the 1000-row cap
    const assets = await pageAll<any>((f, t) => db.from("assets")
      .select("id,coingecko_id,layer").eq("active", true).not("coingecko_id", "is", null)
      .order("id").range(f, t));
    const byCg = new Map(assets.map((a) => [a.coingecko_id, a]));

    // 2) top-1000 sweep — DEDUPED: rankings shift between page fetches, so
    // the same coin can appear on two pages; duplicate keys in one upsert
    // batch make Postgres reject the whole statement.
    const rowMap = new Map<string, any>();
    for (let page = 1; page <= 4; page++) {
      const batch = await cg(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=24h,1y`);
      for (const r of batch) if (r?.id && !rowMap.has(r.id)) rowMap.set(r.id, r);
    }

    // 3) focus assets not in the sweep → fetch by id in one call
    const missing = assets
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
      // refresh map for any dupes skipped by ignoreDuplicates — PAGINATED
      const all = await pageAll<any>((f, t) => db.from("assets")
        .select("id,coingecko_id").not("coingecko_id", "is", null).order("id").range(f, t));
      for (const a of all) if (!byCg.has(a.coingecko_id)) byCg.set(a.coingecko_id, a);
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
    const unmapped = rows.length - snaps.length;

    // 5) 52-week high/low — FOCUS LAYER ONLY (screener-wide would cost
    //    ~1000 market_chart calls/day, blowing the Demo budget). Rows
    //    refresh when >20h stale, max 20 per run, 2.2s spacing to respect
    //    the 30 calls/min Demo limit (57 focus = full refresh in 3 runs).
    //    try/catch so a missing table or one bad asset never fails ingest.
    let w52_refreshed = 0; let w52_note: string | null = null;
    try {
      const { data: w52rows, error: w52err } = await db.from("market_52w").select("asset_id,ts");
      if (w52err) throw new Error(w52err.message);
      const freshTs = new Map((w52rows ?? []).map((r: any) => [r.asset_id, r.ts]));
      const cutoff = Date.now() - 20 * 3600 * 1000;
      const stale = assets.filter((a) => a.layer === "focus" &&
        (!freshTs.has(a.id) || new Date(freshTs.get(a.id)).getTime() < cutoff)).slice(0, 20);
      for (const a of stale) {
        try {
          const ch = await cg(`/coins/${a.coingecko_id}/market_chart?vs_currency=usd&days=365`);
          const ps = (ch?.prices ?? []).map((p: any) => Number(p[1])).filter((v: number) => v > 0);
          if (ps.length) {
            const { error } = await db.from("market_52w").upsert(
              { asset_id: a.id, high_52w: Math.max(...ps), low_52w: Math.min(...ps), ts: now });
            if (error) throw new Error(error.message);
            w52_refreshed++;
          }
        } catch (e) { w52_note = `w52 ${a.coingecko_id}: ${e instanceof Error ? e.message : e}`; }
        await new Promise((r) => setTimeout(r, 2200));
      }
    } catch (e) { w52_note = `w52 skipped: ${e instanceof Error ? e.message : e}`; }

    return ok({ snapshots: snaps.length, new_assets: newAssets.length,
      assets_seen: byCg.size, cg_rows: rows.length, unmapped, w52_refreshed, w52_note });
  } catch (e) { return err(e); }
});
