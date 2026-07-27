// evaluate — the signal engine. Runs after each markets ingest.
//
// For every active asset with a fresh snapshot:
//   1) Zones: use the 'hand' ladder if one exists (NEVER overwritten).
//      Otherwise compute an 'auto' ladder per the v8.0 methodology:
//        T1 = 12–22% below spot (reachable pullback)
//        T2 = 35–50% below, floored near ATL when ATL is close
//        T3 = 55–70% below (capitulation)
//      Auto ladders are recomputed each run and stored under source='auto'.
//   2) Zone state: none / t1 / t2 / t3 / reserve / below_t3 / gap from
//      latest price. below_t3 (fell through the T3 floor) and gap (between
//      two defined zones) are display-honesty states — they gate as NONE,
//      exactly as they did when they rendered as none.
//   3) Sentiment gate (the point of this whole system):
//        DEPLOY      in T2/T3 AND (FNG <= 25 extreme fear
//                    AND funding_rate <= 0 when funding data exists)
//        ARMED       in T2/T3, gate not confirming
//        WATCH       in (or within 2% above) T1
//        DONT_CHASE  FNG >= 75 — greed warning regardless of zone
//        NONE        otherwise
//   4) Screener score 0-100 for ranking the broad universe:
//        drawdown-from-ATH depth (40) + proximity to zone (30) +
//        negative funding bonus (15) + fear bonus (15).
import { sb, ok, err, authorized, pageAll } from "../_shared.ts";

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const now = new Date().toISOString();

    const [{ data: fngRow }, markets, zonesAll, fundingAll] = await Promise.all([
      db.from("sentiment_global").select("fng_value").order("ts", { ascending: false }).limit(1).maybeSingle(),
      pageAll<any>((f, t) => db.from("v_latest_market").select("*").order("asset_id").range(f, t)),
      pageAll<any>((f, t) => db.from("zones").select("*").order("asset_id").range(f, t)),
      pageAll<any>((f, t) => db.from("v_latest_funding").select("asset_id,funding_rate").order("asset_id").range(f, t)),
    ]);

    const fng = fngRow?.fng_value ?? null;
    const zonesBy = new Map<string, any>();
    for (const z of zonesAll) zonesBy.set(`${z.asset_id}:${z.source}`, z);
    const fundBy = new Map(fundingAll.map((f) => [f.asset_id, f.funding_rate]));

    const autoZones: any[] = [];
    const signals: any[] = [];

    for (const m of markets) {
      const p = Number(m.price);
      if (!p || p <= 0) continue;

      let z = zonesBy.get(`${m.asset_id}:hand`);
      if (!z) {
        // auto ladder per methodology; anchor T2 floor at ATL when nearby
        const atl = Number(m.atl) || 0;
        let t2lo = p * 0.50, t2hi = p * 0.65;
        if (atl > 0 && atl > t2lo && atl < p) { t2lo = Math.min(t2lo, atl * 0.95); t2hi = Math.max(t2hi, Math.min(atl * 1.15, p * 0.7)); }
        z = {
          t1_lo: p * 0.78, t1_hi: p * 0.88,
          t2_lo: t2lo, t2_hi: t2hi,
          t3_lo: p * 0.30, t3_hi: p * 0.45,
          source: "auto",
        };
        autoZones.push({ asset_id: m.asset_id, source: "auto", ...{
          t1_lo: z.t1_lo, t1_hi: z.t1_hi, t2_lo: z.t2_lo, t2_hi: z.t2_hi,
          t3_lo: z.t3_lo, t3_hi: z.t3_hi }, method: "auto: pct-of-spot, ATL-anchored T2", updated_at: now });
      }

      const inZ = (lo: number, hi: number) => lo != null && hi != null && p >= lo && p <= hi;
      const nearT1 = z.t1_hi != null && p > z.t1_hi && (p - z.t1_hi) / z.t1_hi < 0.02;
      let zoneState = "none";
      if (z.reserve_below != null && p < z.reserve_below) zoneState = "reserve";
      else if (inZ(z.t3_lo, z.t3_hi)) zoneState = "t3";
      else if (inZ(z.t2_lo, z.t2_hi)) zoneState = "t2";
      else if (inZ(z.t1_lo, z.t1_hi) || nearT1) zoneState = "t1";
      else if (z.t3_lo != null && p < z.t3_lo) zoneState = "below_t3";
      else if ((z.t3_hi != null && z.t2_lo != null && p > z.t3_hi && p < z.t2_lo) ||
               (z.t2_hi != null && z.t1_lo != null && p > z.t2_hi && p < z.t1_lo)) zoneState = "gap";

      const fr = fundBy.get(m.asset_id) ?? null;
      const fearGate = fng != null && fng <= 25;
      const fundingGate = fr == null ? true : fr <= 0; // no data → don't block
      let gate = "NONE";
      if (fng != null && fng >= 75) gate = "DONT_CHASE";
      else if (zoneState === "t2" || zoneState === "t3" || zoneState === "reserve")
        gate = fearGate && fundingGate ? "DEPLOY" : "ARMED";
      else if (zoneState === "t1") gate = "WATCH";

      // screener score
      const dd = Math.max(0, Math.min(1, (-(Number(m.ath_pct) || 0)) / 90));       // 0 at ATH, 1 at -90%
      const zoneProx = zoneState === "t3" ? 1 : zoneState === "t2" ? 0.85 : zoneState === "t1" ? 0.6
        : z.t1_lo ? Math.max(0, 1 - Math.max(0, (p - z.t1_hi) / z.t1_hi) / 0.5) * 0.5 : 0;
      const fundB = fr != null && fr < 0 ? Math.min(1, -fr / 0.0005) : 0;
      const fearB = fng != null ? Math.max(0, (50 - fng) / 50) : 0;
      const score = Math.round(dd * 40 + zoneProx * 30 + fundB * 15 + fearB * 15);

      signals.push({
        asset_id: m.asset_id, ts: now, zone_state: zoneState, gate_state: gate, score,
        components: { fng, funding_rate: fr, zone_src: z.source ?? "hand", ath_pct: m.ath_pct, price: p },
      });
    }

    for (let i = 0; i < autoZones.length; i += 500) {
      const { error } = await db.from("zones").upsert(autoZones.slice(i, i + 500), { onConflict: "asset_id,source" });
      if (error) throw error;
    }
    for (let i = 0; i < signals.length; i += 500) {
      const { error } = await db.from("signals").upsert(signals.slice(i, i + 500));
      if (error) throw error;
    }

    const deploys = signals.filter((s) => s.gate_state === "DEPLOY").length;
    const armed = signals.filter((s) => s.gate_state === "ARMED").length;
    return ok({ evaluated: signals.length, markets_seen: markets.length, zones_seen: zonesAll.length, deploy: deploys, armed, fng });
  } catch (e) { return err(e); }
});
