// ingest-onchain — BGeometrics BTC cycle metrics (free).
// v1.1: BGeometrics slugs drift, so each metric tries a CANDIDATE LIST of
// known variants and reports which one answered. If all fail, the response
// lists what was tried so the fix is a one-line addition here.
import { sb, ok, err, authorized } from "../_shared.ts";

const BG = "https://api.bgeometrics.com";

const CANDIDATES: Record<string, string[]> = {
  sth_rp: [
    "/bitcoin/sth-realized-price", "/bitcoin/sth_realized_price",
    "/sth-realized-price", "/bitcoin/short-term-holder-realized-price",
    "/bitcoin/sthrealizedprice",
  ],
  lth_rp: [
    "/bitcoin/lth-realized-price", "/bitcoin/lth_realized_price",
    "/lth-realized-price", "/bitcoin/long-term-holder-realized-price",
    "/bitcoin/lthrealizedprice",
  ],
  realized_price: [
    "/bitcoin/realized-price", "/bitcoin/realized_price",
    "/realized-price", "/bitcoin/realizedprice",
  ],
  nupl: [
    "/bitcoin/nupl", "/nupl", "/bitcoin/net-unrealized-profit-loss",
  ],
};

function extractLast(j: unknown): number | null {
  const arr = Array.isArray(j) ? j : (j as any)?.data;
  if (!Array.isArray(arr) || !arr.length) {
    // single-object responses: {value: x} or {nupl: x}
    if (j && typeof j === "object") {
      const vals = Object.values(j as object).filter((v) => typeof v === "number");
      return vals.length ? Number(vals[vals.length - 1]) : null;
    }
    return null;
  }
  const row = arr[arr.length - 1];
  if (Array.isArray(row)) return Number(row[row.length - 1]);
  if (row && typeof row === "object") {
    const vals = Object.values(row).filter((v) => typeof v === "number" && isFinite(v as number));
    return vals.length ? Number(vals[vals.length - 1]) : null;
  }
  return typeof row === "number" ? row : null;
}

async function tryCandidates(paths: string[]): Promise<{ value: number | null; slug: string | null }> {
  for (const p of paths) {
    try {
      const r = await fetch(`${BG}${p}`, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const v = extractLast(await r.json());
      if (v != null && isFinite(v)) return { value: v, slug: p };
    } catch { /* next candidate */ }
  }
  return { value: null, slug: null };
}

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const [sth, lth, rp, nupl] = await Promise.all([
      tryCandidates(CANDIDATES.sth_rp),
      tryCandidates(CANDIDATES.lth_rp),
      tryCandidates(CANDIDATES.realized_price),
      tryCandidates(CANDIDATES.nupl),
    ]);
    const { error } = await db.from("onchain_btc").insert({
      sth_rp: sth.value, lth_rp: lth.value, realized_price: rp.value, nupl: nupl.value,
    });
    if (error) throw new Error(`db insert: ${error.message}`);
    return ok({
      sth_rp: sth.value, lth_rp: lth.value, realized_price: rp.value, nupl: nupl.value,
      slugs_used: { sth: sth.slug, lth: lth.slug, rp: rp.slug, nupl: nupl.slug },
      note: (sth.value == null || nupl.value == null)
        ? "some metrics failed all candidates — run btc_onchain_fetch_v2.py --debug and add the working slug to CANDIDATES"
        : "ok",
    });
  } catch (e) { return err(e); }
});
