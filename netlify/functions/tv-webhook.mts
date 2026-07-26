// /tv-webhook — receives TradingView alert webhooks (your Pine in-zone
// alerts can push here). Configure the alert's webhook URL as:
//   https://<your-site>.netlify.app/tv-webhook?secret=<TV_WEBHOOK_SECRET>
// Alert message must be valid JSON, e.g.
//   {"symbol":"GRASS","event":"T3_ENTER","price":{{close}}}
import { createClient } from "@supabase/supabase-js";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== process.env.TV_WEBHOOK_SECRET)
    return new Response("unauthorized", { status: 401 });
  let payload: unknown;
  try { payload = await req.json(); }
  catch { payload = { raw: await req.text() }; }
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.from("tv_events").insert({ payload });
  if (error) return new Response(error.message, { status: 500 });
  return new Response("ok");
};

export const config = { path: "/tv-webhook" };
