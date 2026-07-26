-- ============================================================
-- NOTIFIER — run once in the SQL Editor after deploying the
-- notify function. Creates the dedupe-state table, moves
-- evaluate to a 30-min cadence (funding updates every 30 min and
-- the gate depends on it), and schedules notify 2 min after each
-- evaluation. REPLACE <JOB-SECRET> below (1 occurrence) if your
-- call_job() was created with a different secret — otherwise
-- call_job already carries it and nothing here needs editing.
-- ============================================================
create table if not exists notify_state (
  key        text primary key,          -- 'asset:<id>' or 'fng'
  state      text not null,
  updated_at timestamptz not null default now()
);
alter table notify_state enable row level security;

-- evaluate: hourly -> every 30 min at :08 and :38
select cron.unschedule('evaluate-hourly');
select cron.schedule('evaluate-30min', '8,38 * * * *', $$select call_job('evaluate')$$);

-- notify: 2 minutes after each evaluation
select cron.schedule('notify-30min', '10,40 * * * *', $$select call_job('notify')$$);

-- verify:
-- select jobname, schedule from cron.job order by jobname;
