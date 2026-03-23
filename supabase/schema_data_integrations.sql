-- ══════════════════════════════════════════════════════════════
-- SOLARYN FIT — DATA INTEGRATION SCHEMA ADDENDUM
-- Add this to your existing schema.sql
-- ══════════════════════════════════════════════════════════════

-- ── DATA CONNECTIONS ──────────────────────────────────────────
-- Tracks which data sources each user has connected
create table data_connections (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references profiles(id) not null,
  source_id     text not null,      -- 'apple_health' | 'oura' | 'whoop' | '23andme' | etc
  status        text default 'connected',
  data          jsonb,              -- parsed metrics snapshot
  file_path     text,               -- Supabase Storage path for uploaded files
  connected_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, source_id)
);

alter table data_connections enable row level security;
create policy "own data connections" on data_connections for all using (auth.uid() = user_id);

-- Coach can view client connections (to see data richness)
create policy "coach sees client connections" on data_connections for select
  using (
    exists (
      select 1 from profiles p
      where p.id = data_connections.user_id
      and p.coach_id = auth.uid()
    )
  );

-- ── GENOMIC INSIGHTS ──────────────────────────────────────────
-- Derived from raw genomic file — store insights, not raw data
create table genomic_insights (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) not null,
  provider    text,                 -- '23andme' | 'ancestry'
  findings    jsonb,                -- rsID → {gene, trait, genotype, interpretation}
  insights    jsonb,                -- [{type, text}] training insights
  snps_found  int,
  parsed_at   timestamptz default now(),
  unique(user_id)
);

alter table genomic_insights enable row level security;
create policy "own genomic" on genomic_insights for all using (auth.uid() = user_id);
create policy "coach sees genomic" on genomic_insights for select
  using (
    exists (
      select 1 from profiles p
      where p.id = genomic_insights.user_id
      and p.coach_id = auth.uid()
    )
  );

-- ── HEALTH SYNC LOG ───────────────────────────────────────────
-- Daily Apple Health sync records
create table health_syncs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) not null,
  synced_date date not null default current_date,
  hrv_ms      numeric,
  resting_hr  int,
  sleep_hrs   numeric,
  sleep_deep_hrs numeric,
  sleep_rem_hrs numeric,
  steps       int,
  active_cals int,
  vo2max      numeric,
  weight_lbs  numeric,
  workouts    jsonb,          -- [{type, duration_mins, calories}]
  raw_data    jsonb,          -- full metrics blob
  synced_at   timestamptz default now(),
  unique(user_id, synced_date)
);

alter table health_syncs enable row level security;
create policy "own syncs" on health_syncs for all using (auth.uid() = user_id);
create policy "coach sees syncs" on health_syncs for select
  using (
    exists (
      select 1 from profiles p
      where p.id = health_syncs.user_id
      and p.coach_id = auth.uid()
    )
  );

-- ── SUPABASE STORAGE BUCKET ───────────────────────────────────
-- Run in Supabase dashboard: Storage → New Bucket → 'client-data' (private)
-- OR run this SQL:
insert into storage.buckets (id, name, public) values ('client-data', 'client-data', false)
on conflict do nothing;

-- Storage policies
create policy "own uploads" on storage.objects for all
  using (bucket_id = 'client-data' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "coach reads client data" on storage.objects for select
  using (
    bucket_id = 'client-data' and
    exists (
      select 1 from profiles p
      where p.id::text = (storage.foldername(name))[1]
      and p.coach_id = auth.uid()
    )
  );

-- ── UPDATED PROFILES TABLE ────────────────────────────────────
-- Add data integration tracking columns to profiles
alter table profiles add column if not exists healthkit_enabled boolean default false;
alter table profiles add column if not exists data_sources_connected text[] default '{}';
alter table profiles add column if not exists genomic_provider text;  -- '23andme' | 'ancestry' | null
alter table profiles add column if not exists has_genomic_data boolean default false;
alter table profiles add column if not exists last_health_sync timestamptz;

-- ── FUNCTION: Build AI context from all data sources ──────────
-- Called server-side before AI coach responses
create or replace function get_user_ai_context(p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_profile profiles;
  v_sync health_syncs;
  v_genomic genomic_insights;
  v_context jsonb;
begin
  select * into v_profile from profiles where id = p_user_id;
  select * into v_sync from health_syncs where user_id = p_user_id and synced_date = current_date;
  select * into v_genomic from genomic_insights where user_id = p_user_id;

  v_context := jsonb_build_object(
    'profile', jsonb_build_object(
      'name', v_profile.full_name,
      'age', date_part('year', age(v_profile.date_of_birth)),
      'goals', v_profile.goals,
      'equipment', v_profile.equipment,
      'activity_level', v_profile.activity_level,
      'schedule', v_profile.schedule,
      'diet_proteins', v_profile.diet_proteins,
      'supplements', v_profile.supplements,
      'language', v_profile.language
    ),
    'today_health', case when v_sync.id is not null then jsonb_build_object(
      'hrv_ms', v_sync.hrv_ms,
      'resting_hr', v_sync.resting_hr,
      'sleep_hrs', v_sync.sleep_hrs,
      'sleep_deep_hrs', v_sync.sleep_deep_hrs,
      'sleep_rem_hrs', v_sync.sleep_rem_hrs,
      'steps', v_sync.steps,
      'active_cals', v_sync.active_cals,
      'vo2max', v_sync.vo2max,
      'weight_lbs', v_sync.weight_lbs
    ) else null end,
    'genomic_insights', case when v_genomic.id is not null then v_genomic.insights else null end
  );

  return v_context;
end;
$$;
