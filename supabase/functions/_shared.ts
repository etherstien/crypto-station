// supabase/functions/_shared.ts — imported by every edge function
// Deno runtime. Uses service-role key from env (set via `supabase secrets set`).
import { createClient } from "npm:@supabase/supabase-js@2";

export function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

export function err(e: unknown, status = 500) {
  console.error(e);
  return new Response(JSON.stringify({ error: String(e) }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Guard: every ingest function requires this header so random internet
// traffic can't trigger fetch jobs. cron.sql sends it; so can you via curl.
export function authorized(req: Request): boolean {
  const secret = Deno.env.get("JOB_SECRET") ?? "";
  return secret !== "" && req.headers.get("x-job-secret") === secret;
}
