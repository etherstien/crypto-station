// /api/* — read-only proxy to Supabase. The browser never holds keys;
// this function uses the service-role key from Netlify env vars.
// Routes:
//   /api/dashboard            focus table + gate summary + macro strip
//   /api/screener?limit=25    top screener names by score
//   /api/asset?id=123         one asset, full detail
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });

export default async (req: Request) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/^\.netlify\/functions\/api\/?/, "");
  const s = db();
  try {
    if (route === "dashboard" || route === "") {
      const [{ data: focus }, { data: sent }, { data: chain }, { data: deploys }] = await Promise.all([
        s.from("v_dashboard").select("*").eq("layer", "focus").order("tier"),
        s.from("sentiment_global").select("*").order("ts", { ascending: false }).limit(1).maybeSingle(),
        s.from("onchain_btc").select("*").order("ts", { ascending: false }).limit(1).maybeSingle(),
        s.from("v_dashboard").select("symbol,name,gate_state,zone_state,price,score").in("gate_state", ["DEPLOY", "ARMED"]).order("score", { ascending: false }).limit(50),
      ]);
      return json({ focus, sentiment: sent, onchain: chain, alerts: deploys });
    }
    if (route === "screener") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
      const { data } = await s.from("v_dashboard").select("*").eq("layer", "screener").order("score", { ascending: false }).limit(limit);
      return json({ screener: data });
    }
    if (route === "asset") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "id required" }, 400);
      const [{ data: asset }, { data: hist }, { data: sigs }, { data: proto }] = await Promise.all([
        s.from("v_dashboard").select("*").eq("id", id).maybeSingle(),
        s.from("market_snapshots").select("ts,price").eq("asset_id", id).order("ts", { ascending: false }).limit(720),
        s.from("signals").select("ts,zone_state,gate_state,score").eq("asset_id", id).order("ts", { ascending: false }).limit(100),
        s.from("protocol_metrics").select("ts,tvl,fees_24h,revenue_24h").eq("asset_id", id).order("ts", { ascending: false }).limit(30),
      ]);
      return json({ asset, history: hist, signals: sigs, protocol: proto });
    }
    return json({ error: "unknown route", routes: ["dashboard", "screener", "asset?id="] }, 404);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};

export const config = { path: "/api/*" };
