// ingest-defillama — TVL + 24h fees/revenue for focus assets with a
// defillama_slug. Free API. 6-hourly cadence is plenty.
import { sb, ok, err, authorized } from "../_shared.ts";

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const { data: assets } = await db.from("assets")
      .select("id,defillama_slug").eq("active", true).not("defillama_slug", "is", null);
    if (!assets?.length) return ok({ skipped: "no defillama_slug mappings" });

    const now = new Date().toISOString();
    const rows: any[] = [];
    for (const a of assets) {
      try {
        const [tvlR, feeR] = await Promise.all([
          fetch(`https://api.llama.fi/tvl/${a.defillama_slug}`),
          fetch(`https://api.llama.fi/summary/fees/${a.defillama_slug}?dataType=dailyFees`),
        ]);
        const tvl = tvlR.ok ? Number(await tvlR.text()) : null;
        let fees = null, revenue = null;
        if (feeR.ok) {
          const f = await feeR.json();
          fees = f?.total24h ?? null;
          revenue = f?.totalRevenue24h ?? f?.dailyRevenue ?? null;
        }
        rows.push({ asset_id: a.id, ts: now, tvl, fees_24h: fees, revenue_24h: revenue });
        await new Promise((r) => setTimeout(r, 250)); // be polite, ~4 rps
      } catch (_) { /* per-asset failures non-fatal */ }
    }
    if (rows.length) {
      const { error } = await db.from("protocol_metrics").upsert(rows);
      if (error) throw error;
    }
    return ok({ rows: rows.length });
  } catch (e) { return err(e); }
});
