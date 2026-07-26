// ingest-funding — Coinalyze current funding + open interest.
// v1.1: sends the API key in BOTH known header spellings AND as a query
// param. Diagnosis: a fresh key can't hit rate limits with 2 calls, but an
// UNRECOGNIZED key makes requests anonymous — and anonymous traffic from
// Supabase's shared egress IPs is collectively throttled → persistent 429.
// Errors now include the response body for diagnosis.
import { sb, ok, err, authorized } from "../_shared.ts";

const CA = "https://api.coinalyze.net/v1";

async function caFetch(path: string, key: string) {
  const url = `${CA}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { "api_key": key, "api-key": key, accept: "application/json" } });
  if (!r.ok) throw new Error(`coinalyze ${r.status} on ${path.split("?")[0]}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

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
    const fr = await caFetch(`/predicted-funding-rate?symbols=${syms}`, key);
    let oi: any[] = [];
    try { oi = await caFetch(`/open-interest?symbols=${syms}&convert_to_usd=true`, key); } catch (_) { /* OI optional */ }

    const oiMap = new Map(oi.map((o: any) => [o.symbol, o.value]));
    const bySym = new Map(assets.map((a) => [a.coinalyze_sym, a.id]));
    const now = new Date().toISOString();

    const rows = fr.map((f: any) => ({
      asset_id: bySym.get(f.symbol),
      ts: now,
      funding_rate: f.value,
      oi_usd: oiMap.get(f.symbol) ?? null,
    })).filter((r: any) => r.asset_id);

    const { error } = await db.from("funding").upsert(rows);
    if (error) throw new Error(`db: ${error.message}`);
    return ok({ rows: rows.length, requested_symbols: assets.length });
  } catch (e) { return err(e); }
});
