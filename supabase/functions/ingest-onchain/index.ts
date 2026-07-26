// ingest-onchain — BTC cycle metrics from BGeometrics.
// v1.2: replicates btc_onchain_fetch_v2.py's approach — runtime OpenAPI
// spec discovery — across BOTH hosts BGeometrics publishes under, then
// falls back to hardcoded candidates. Response reports host + paths used.
import { sb, ok, err, authorized } from "../_shared.ts";

const HOSTS = ["https://bitcoin-data.com", "https://api.bgeometrics.com"];
const SPEC_PATHS = ["/v3/api-docs", "/v2/api-docs", "/openapi.json", "/v1/openapi.json", "/api/openapi.json", "/swagger.json", "/api-docs"];
const WANT: Record<string, RegExp> = {
  sth_rp: /sth.*realized.*price|short.term.holder.*realized/i,
  lth_rp: /lth.*realized.*price|long.term.holder.*realized/i,
  realized_price: /^(?!.*(sth|lth|short|long)).*realized.*price/i,
  nupl: /nupl|net.unrealized/i,
};
const FALLBACK: Record<string, string[]> = {
  sth_rp: ["/v1/sth-realized-price", "/bitcoin/sth-realized-price", "/sth-realized-price"],
  lth_rp: ["/v1/lth-realized-price", "/bitcoin/lth-realized-price", "/lth-realized-price"],
  realized_price: ["/v1/realized-price", "/bitcoin/realized-price", "/realized-price"],
  nupl: ["/v1/nupl", "/bitcoin/nupl", "/nupl"],
};

function extractLast(j: unknown): number | null {
  const arr = Array.isArray(j) ? j : (j as any)?.data;
  if (Array.isArray(arr) && arr.length) {
    const row = arr[arr.length - 1];
    if (Array.isArray(row)) return Number(row[row.length - 1]);
    if (row && typeof row === "object") {
      const vals = Object.values(row).filter((v) => typeof v === "number" && isFinite(v as number))
        .concat(Object.values(row).filter((v) => typeof v === "string" && v !== "" && isFinite(Number(v))).map(Number));
      return vals.length ? Number(vals[vals.length - 1]) : null;
    }
    return typeof row === "number" ? row : null;
  }
  if (j && typeof j === "object") {
    const vals = Object.values(j as object).filter((v) => typeof v === "number" && isFinite(v as number));
    return vals.length ? Number(vals[vals.length - 1]) : null;
  }
  return null;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const results: Record<string, number | null> = { sth_rp: null, lth_rp: null, realized_price: null, nupl: null };
    const used: Record<string, string | null> = { sth_rp: null, lth_rp: null, realized_price: null, nupl: null };
    let specHost: string | null = null;

    // 1) OpenAPI discovery
    outer:
    for (const host of HOSTS) {
      for (const sp of SPEC_PATHS) {
        const spec = await getJson(`${host}${sp}`) as any;
        const paths = spec?.paths ? Object.keys(spec.paths) : null;
        if (paths?.length) {
          specHost = `${host}${sp}`;
          for (const metric of Object.keys(WANT)) {
            const match = paths.find((p) => WANT[metric].test(p));
            if (match) {
              const v = extractLast(await getJson(`${host}${match}`));
              if (v != null) { results[metric] = v; used[metric] = `${host}${match}`; }
            }
          }
          break outer;
        }
      }
    }

    // 2) fallback candidates for anything still null
    for (const metric of Object.keys(FALLBACK)) {
      if (results[metric] != null) continue;
      for (const host of HOSTS) {
        for (const p of FALLBACK[metric]) {
          const v = extractLast(await getJson(`${host}${p}`));
          if (v != null) { results[metric] = v; used[metric] = `${host}${p}`; break; }
        }
        if (results[metric] != null) break;
      }
    }

    const { error } = await db.from("onchain_btc").insert(results);
    if (error) throw new Error(`db: ${error.message}`);
    const allNull = Object.values(results).every((v) => v == null);
    return ok({ ...results, spec_found_at: specHost, endpoints_used: used,
      note: allNull ? "all discovery failed — both hosts unreachable or schema changed; compare against btc_onchain_fetch_v2.py --debug output" : "ok" });
  } catch (e) { return err(e); }
});
