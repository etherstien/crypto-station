// ingest-onchain — BGeometrics BTC cycle metrics (free).
// Mirrors btc_onchain_fetch_v2.py: discovers endpoints defensively since
// BGeometrics slugs have shifted before. Daily cadence is enough.
import { sb, ok, err, authorized } from "../_shared.ts";

const BG = "https://api.bgeometrics.com";

async function last(path: string): Promise<number | null> {
  try {
    const r = await fetch(`${BG}${path}`);
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j) ? j : j?.data;
    if (!Array.isArray(arr) || !arr.length) return null;
    const row = arr[arr.length - 1];
    // rows arrive as [ts, value] or {d, v} or {date, value} — take last numeric
    if (Array.isArray(row)) return Number(row[row.length - 1]);
    const vals = Object.values(row).filter((v) => typeof v === "number");
    return vals.length ? Number(vals[vals.length - 1]) : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const [sth, lth, rp, nupl] = await Promise.all([
      last("/bitcoin/sth-realized-price"),
      last("/bitcoin/lth-realized-price"),
      last("/bitcoin/realized-price"),
      last("/bitcoin/nupl"),
    ]);
    const { error } = await db.from("onchain_btc").insert({
      sth_rp: sth, lth_rp: lth, realized_price: rp, nupl,
    });
    if (error) throw error;
    return ok({ sth_rp: sth, lth_rp: lth, realized_price: rp, nupl,
      note: "null values mean the endpoint slug changed — check btc_onchain_fetch_v2.py --debug for current slugs" });
  } catch (e) { return err(e); }
});
