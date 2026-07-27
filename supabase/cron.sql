-- ============================================================
-- CRYPTO STATION — cron.sql   Run AFTER deploying edge functions.
-- REPLACE the two placeholders before running — INCLUDING the angle
-- brackets themselves (leaving them in breaks every job with
-- "Bad hostname"; see CLAUDE.md Bug History #7):
--   <PROJECT-REF>  your Supabase project ref (dashboard URL)
--   <JOB-SECRET>   the same value you set: supabase secrets set JOB_SECRET=...
-- Schedules (UTC):
--   markets    hourly at :05          (~3.6k CoinGecko calls/mo)
--   evaluate   hourly at :08          (after markets lands)
--   funding    every 30 min           (Coinalyze free, well within 40/min)
--   sentiment  hourly at :02          (F&G updates daily; cheap anyway)
--   onchain    daily 06:10            (BGeometrics daily series)
--   defillama  every 6h at :15
-- ============================================================
create or replace function call_job(fn text) returns void language plpgsql as $$
begin
  perform net.http_post(
    url    := 'https://<PROJECT-REF>.functions.supabase.co/' || fn,
    headers:= jsonb_build_object('x-job-secret', '<JOB-SECRET>', 'content-type','application/json'),
    body   := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

select cron.schedule('markets-hourly',   '5 * * * *',    $$select call_job('ingest-markets')$$);
select cron.schedule('evaluate-hourly',  '8 * * * *',    $$select call_job('evaluate')$$);
select cron.schedule('funding-30min',    '*/30 * * * *', $$select call_job('ingest-funding')$$);
select cron.schedule('sentiment-hourly', '2 * * * *',    $$select call_job('ingest-sentiment')$$);
select cron.schedule('onchain-daily',    '10 6 * * *',   $$select call_job('ingest-onchain')$$);
select cron.schedule('defillama-6h',     '15 */6 * * *', $$select call_job('ingest-defillama')$$);

-- Inspect:  select * from cron.job;
-- History:  select * from cron.job_run_details order by start_time desc limit 20;
-- Remove:   select cron.unschedule('markets-hourly');
