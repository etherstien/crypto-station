// notify — gate-transition push notifications.
// Runs after evaluate. Compares each FOCUS asset's latest gate_state to the
// last state we notified (notify_state table), pushes on transitions, and
// alerts on market-wide FNG threshold crossings (<=25 fear gate open,
// >=75 don't-chase). Never double-sends: state advances only after a
// successful send.
//
// Channels (set either or both via supabase secrets):
//   NTFY_TOPIC           — pushes to https://ntfy.sh/<topic>
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — Telegram bot message
import { sb, ok, err, authorized, pageAll } from "../_shared.ts";

const RANK: Record<string, number> = { NONE: 0, WATCH: 1, DONT_CHASE: 1, ARMED: 2, DEPLOY: 3 };

function fmtPrice(p: number | null): string {
  if (p == null) return "—";
  if (p >= 1000) return "$" + Math.round(p).toLocaleString();
  if (p >= 1) return "$" + p.toFixed(3);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + p.toFixed(8);
}

async function send(title: string, body: string, priority: "max" | "high" | "default") {
  const results: string[] = [];
  const topic = Deno.env.get("NTFY_TOPIC");
  if (topic) {
    // ntfy JSON publish API: unicode-safe (emoji in HTTP headers is not a
    // valid ByteString and crashes fetch — the v1.0 bug)
    const r = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic,
        title,
        message: body,
        priority: priority === "max" ? 5 : priority === "high" ? 4 : 3,
        tags: priority === "max" ? ["rotating_light"] : ["bell"],
      }),
    });
    results.push(`ntfy:${r.status}`);
  }
  const tg = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chat = Deno.env.get("TELEGRAM_CHAT_ID");
  if (tg && chat) {
    const r = await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `${title}\n${body}` }),
    });
    results.push(`telegram:${r.status}`);
  }
  if (!results.length) throw new Error("no notification channel configured (set NTFY_TOPIC or TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID)");
  const failed = results.filter((s) => !/:(2\d\d)$/.test(s));
  if (failed.length === results.length) throw new Error(`all sends failed: ${results.join(",")}`);
  return results.join(",");
}

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const sent: string[] = [];

    // ── load latest signals for focus assets + notify state ──
    const focus = await pageAll<any>((f, t) => db.from("v_dashboard")
      .select("id,symbol,price,zone_state,gate_state,funding_rate")
      .eq("layer", "focus").order("id").range(f, t));
    const { data: stateRows } = await db.from("notify_state").select("*");
    const state = new Map((stateRows ?? []).map((r) => [r.key, r.state]));

    // ── per-asset gate transitions ──
    for (const a of focus) {
      const cur = a.gate_state ?? "NONE";
      const key = `asset:${a.id}`;
      const prev = state.get(key) ?? "NONE";
      if (cur === prev) continue;

      const up = (RANK[cur] ?? 0) > (RANK[prev] ?? 0);
      // notify on any entry into WATCH/ARMED/DEPLOY/DONT_CHASE, and on
      // de-escalation FROM DEPLOY (so you know the window closed)
      const notable = (cur !== "NONE") || prev === "DEPLOY";
      if (!notable) { // NONE<-WATCH etc: silently advance state
        await db.from("notify_state").upsert({ key, state: cur, updated_at: new Date().toISOString() });
        continue;
      }

      const pr = cur === "DEPLOY" ? "max" : cur === "ARMED" ? "high" : "default";
      const emoji = cur === "DEPLOY" ? "🟢" : cur === "ARMED" ? "🟠" : cur === "WATCH" ? "🔵" : cur === "DONT_CHASE" ? "🔴" : "⚪";
      const fund = a.funding_rate != null ? ` · fund ${(a.funding_rate * 100).toFixed(3)}%` : "";
      const title = `${emoji} ${a.symbol}: ${prev} → ${cur}`;
      const body = `${a.symbol} ${fmtPrice(a.price)} · zone ${String(a.zone_state ?? "none").toUpperCase().replace(/_/g, "-")}${fund}` +
        (cur === "DEPLOY" ? " · IN DEEP ZONE + FEAR CONFIRMED — check ladder before acting" : "");
      const res = await send(title, body, pr as any);
      await db.from("notify_state").upsert({ key, state: cur, updated_at: new Date().toISOString() });
      sent.push(`${a.symbol}:${prev}->${cur} (${res})`);
    }

    // ── market-wide FNG threshold crossings ──
    const { data: fngRow } = await db.from("sentiment_global")
      .select("fng_value").order("ts", { ascending: false }).limit(1).maybeSingle();
    const fng = fngRow?.fng_value;
    if (fng != null) {
      const band = fng <= 25 ? "FEAR_GATE_OPEN" : fng >= 75 ? "GREED" : "NEUTRAL";
      const prevBand = state.get("fng") ?? "NEUTRAL";
      if (band !== prevBand) {
        if (band === "FEAR_GATE_OPEN") {
          const res = await send(`🟢 FEAR GATE OPEN — FNG ${fng}`,
            `Extreme fear threshold crossed (≤25). Any focus asset in T2/T3 now clears the sentiment gate. Check the focus table.`, "high");
          sent.push(`fng:${prevBand}->${band} (${res})`);
        } else if (band === "GREED") {
          const res = await send(`🔴 GREED — FNG ${fng}`,
            `Don't-chase threshold crossed (≥75). Framework says: no entries into strength.`, "default");
          sent.push(`fng:${prevBand}->${band} (${res})`);
        }
        await db.from("notify_state").upsert({ key: "fng", state: band, updated_at: new Date().toISOString() });
      }
    }

    return ok({ transitions: sent.length, sent, fng });
  } catch (e) { return err(e); }
});
