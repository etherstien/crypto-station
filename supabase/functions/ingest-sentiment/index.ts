// ingest-sentiment — Alternative.me Fear & Greed (free, keyless)
// + optional Polymarket odds snapshots for markets you care about.
// Set POLYMARKET_SLUGS env as comma-separated market slugs to track.
import { sb, ok, err, authorized } from "../_shared.ts";

Deno.serve(async (req) => {
  if (!authorized(req)) return err("unauthorized", 401);
  try {
    const db = sb();
    const fng = await (await fetch("https://api.alternative.me/fng/?limit=1")).json();
    const d = fng?.data?.[0];

    let polymarket: unknown = null;
    const slugs = (Deno.env.get("POLYMARKET_SLUGS") ?? "").split(",").filter(Boolean);
    if (slugs.length) {
      const out: Record<string, unknown> = {};
      for (const slug of slugs.slice(0, 10)) {
        try {
          const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug.trim()}`);
          if (r.ok) {
            const [m] = await r.json();
            if (m) out[slug.trim()] = { question: m.question, outcomes: m.outcomes, prices: m.outcomePrices };
          }
        } catch (_) { /* per-slug failures are non-fatal */ }
      }
      polymarket = out;
    }

    const { error } = await db.from("sentiment_global").insert({
      fng_value: d ? Number(d.value) : null,
      fng_class: d?.value_classification ?? null,
      polymarket,
    });
    if (error) throw error;
    return ok({ fng: d?.value, cls: d?.value_classification, polymarket_markets: slugs.length });
  } catch (e) { return err(e); }
});
