-- ══════════════════════════════════════════════════════════════
-- SOLARYN FIT — MIGRATION 002: Language + Date Context Fixes
-- Fixes:
--   1. handle_new_user() now reads language from raw_user_meta_data
--   2. get_user_ai_context() now returns current date, weekday, and timezone
--      so the AI coach knows what day it actually is
-- Run this in Supabase SQL Editor after 001_rls_hardening.sql
-- Idempotent — safe to re-run
-- ══════════════════════════════════════════════════════════════

-- ── 1. FIX handle_new_user() — pick up language from signup metadata ──
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, avatar_url, language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'language', 'en')  -- defaults to 'en' if not provided
  );
  return new;
end;
$$;

-- The trigger itself doesn't need to be recreated; it already calls handle_new_user().

-- ── 2. FIX get_user_ai_context() — include current date info ──
-- The AI coach was confusing days of the week because the context payload
-- had no date. Now we include user's local date, weekday, and timezone.
create or replace function get_user_ai_context(p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_profile profiles;
  v_sync health_syncs;
  v_genomic genomic_insights;
  v_context jsonb;
  v_tz text;
  v_local_ts timestamptz;
  v_local_date date;
  v_weekday text;
begin
  select * into v_profile from profiles where id = p_user_id;
  select * into v_sync from health_syncs where user_id = p_user_id and synced_date = current_date;
  select * into v_genomic from genomic_insights where user_id = p_user_id;

  -- Resolve timezone (default to America/Los_Angeles if profile has nothing)
  v_tz := coalesce(v_profile.timezone, 'America/Los_Angeles');
  v_local_ts := now() at time zone v_tz;
  v_local_date := v_local_ts::date;
  v_weekday := to_char(v_local_ts, 'FMDay');  -- "Monday", "Tuesday", etc.

  v_context := jsonb_build_object(
    -- NEW: today's date context so the AI doesn't guess the day
    'today', jsonb_build_object(
      'date', v_local_date,
      'weekday', v_weekday,
      'timezone', v_tz,
      'iso_datetime', v_local_ts
    ),
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

-- ══════════════════════════════════════════════════════════════
-- Verification:
-- select get_user_ai_context('5b87d558-6cef-4a48-9534-6703d4854857'::uuid);
-- Should return a jsonb object with a 'today' key containing date/weekday/timezone.
-- ══════════════════════════════════════════════════════════════
