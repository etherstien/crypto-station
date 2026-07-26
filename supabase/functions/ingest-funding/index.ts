// ingest-funding — Coinalyze current funding + open interest for every
// focus asset with a coinalyze_sym mapping. Free API, 40 calls/min.
// Get a free key at coinalyze.net → API. Symbols use the form
// BTCUSDT_PERP.A (Binance agg) — verify per asset in the assets table.
import { sb, ok, err, authorized } from "../_shared.ts";

const CA = "https://api.coinalyze.net/v1";

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const key = Deno.env.get("COINALYZE_API_KEY");
    if (!key) return err("COINALYZE_API_KEY not set", 400);

    const { data: assets } = await db.from("assets")
      .select("id,coinalyze_sym").eq("active", true).not("coinalyze_sym", "is", null);
    if (!assets?.length) return ok({ skipped: "no coinalyze_sym mappings" });

    const syms = assets.map((a) => a.coinalyze_sym).join(",");
    const hdr = { api_key: key };
    const [frRes, oiRes] = await Promise.all([
      fetch(`${CA}/predicted-funding-rate?symbols=${syms}`, { headers: hdr }),
      fetch(`${CA}/open-interest?symbols=${syms}&convert_to_usd=true`, { headers: hdr }),
    ]);
    if (!frRes.ok) throw new Error(`coinalyze fr ${frRes.status}`);
    const fr = await frRes.json();
    const oi = oiRes.ok ? await oiRes.json() : [];
    const oiMap = new Map(oi.map((o: any) => [o.symbol, o.value]));
    const bySym = new Map(assets.map((a) => [a.coinalyze_sym, a.id]));
    const now = new Date().toISOString();

    const rows = fr.map((f: any) => ({
      asset_id: bySym.get(f.symbol),
      ts: now,
      funding_rate: f.value,           // decimal; 0.0001 = 0.01%
      oi_usd: oiMap.get(f.symbol) ?? null,
    })).filter((r: any) => r.asset_id);

    const { error } = await db.from("funding").upsert(rows);
    if (error) throw error;
    return ok({ rows: rows.length });
  } catch (e) { return err(e); }
});
