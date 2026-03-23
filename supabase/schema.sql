-- ══════════════════════════════════════════════════════════════
-- SOLARYN FIT PLATFORM — SUPABASE SCHEMA
-- Run this in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- ── EXTENSIONS ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── ORGANIZATIONS (for white-label) ──────────────────────────
create table organizations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text unique not null,          -- e.g. "fitbyjose"
  brand_color   text default '#C9A84C',
  logo_url      text,
  owner_id      uuid references auth.users(id),
  plan          text default 'coached',        -- 'coached' | 'whitelabel'
  stripe_customer_id text,
  stripe_subscription_id text,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- ── PROFILES ──────────────────────────────────────────────────
create table profiles (
  id              uuid primary key references auth.users(id),
  org_id          uuid references organizations(id),   -- null = Solaryn-native
  role            text default 'client',               -- 'client' | 'coach' | 'admin'
  full_name       text,
  email           text,
  avatar_url      text,
  -- fitness profile
  date_of_birth   date,
  timezone        text default 'America/Los_Angeles',
  language        text default 'en',                  -- 'en' | 'es'
  goals           text[],
  injuries        text[],
  equipment       text[],                             -- 'kettlebell' | 'barbell' | etc
  activity_level  text default 'intermediate',
  -- schedule (0=Sun ... 6=Sat)
  schedule        jsonb default '{
    "0": {"type":"recovery"},
    "1": {"type":"soccer"},
    "2": {"type":"pilates"},
    "3": {"type":"kettlebell"},
    "4": {"type":"soccer"},
    "5": {"type":"run"},
    "6": {"type":"recovery"}
  }',
  -- diet
  diet_proteins   text[] default array['chicken','beef'],
  diet_notes      text,
  supplements     text[],
  -- subscription
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_tier text default 'free',             -- 'free'|'app'|'coached'|'elite'
  subscription_status text default 'active',
  coach_id        uuid references profiles(id),       -- assigned coach
  -- meta
  onboarded       boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── WORKOUT TEMPLATES ─────────────────────────────────────────
create table workout_templates (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid references organizations(id),      -- null = global
  created_by  uuid references profiles(id),
  name        text not null,
  type        text not null,  -- 'strength'|'cardio'|'mobility'|'sport'|'recovery'
  tags        text[],
  language    text default 'en',
  exercises   jsonb not null,  -- [{name, sets, reps, notes, rest_seconds}]
  is_public   boolean default false,
  created_at  timestamptz default now()
);

-- ── ASSIGNED PROGRAMS ─────────────────────────────────────────
create table programs (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid references profiles(id) not null,
  coach_id      uuid references profiles(id),
  name          text not null,
  description   text,
  start_date    date,
  end_date      date,
  schedule      jsonb,  -- {dayOfWeek: workout_template_id}
  status        text default 'active',  -- 'active'|'completed'|'paused'
  created_at    timestamptz default now()
);

-- ── WORKOUT LOGS ──────────────────────────────────────────────
create table workout_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id) not null,
  template_id     uuid references workout_templates(id),
  logged_at       date not null default current_date,
  duration_mins   int,
  notes           text,
  hrv             numeric,
  energy_level    int check (energy_level between 1 and 5),
  completed       boolean default false,
  exercises       jsonb,  -- [{name, sets:[{weight,reps,notes}]}]
  created_at      timestamptz default now()
);

-- ── BODY STATS ────────────────────────────────────────────────
create table body_stats (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) not null,
  logged_at   date not null default current_date,
  weight_lbs  numeric,
  body_fat_pct numeric,
  hrv_ms      numeric,
  sleep_hrs   numeric,
  notes       text,
  created_at  timestamptz default now()
);

-- ── MESSAGES (coach ↔ client) ─────────────────────────────────
create table messages (
  id          uuid primary key default uuid_generate_v4(),
  sender_id   uuid references profiles(id) not null,
  receiver_id uuid references profiles(id) not null,
  content     text not null,
  read        boolean default false,
  created_at  timestamptz default now()
);

-- ── AI COACH THREADS ──────────────────────────────────────────
create table ai_threads (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) not null,
  messages    jsonb default '[]',  -- [{role,content,ts}]
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── MEAL LOGS ─────────────────────────────────────────────────
create table meal_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references profiles(id) not null,
  logged_at   date not null default current_date,
  meal_type   text,  -- 'breakfast'|'lunch'|'dinner'|'snack'|'preworkout'|'postworkout'
  description text,
  calories    int,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  created_at  timestamptz default now()
);

-- ── STRIPE EVENTS (webhook log) ───────────────────────────────
create table stripe_events (
  id          uuid primary key default uuid_generate_v4(),
  stripe_id   text unique,
  type        text,
  data        jsonb,
  processed   boolean default false,
  created_at  timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

alter table profiles          enable row level security;
alter table workout_logs      enable row level security;
alter table body_stats        enable row level security;
alter table messages          enable row level security;
alter table ai_threads        enable row level security;
alter table meal_logs         enable row level security;
alter table programs          enable row level security;

-- Users see only their own data
create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own logs"    on workout_logs for all using (auth.uid() = user_id);
create policy "own stats"   on body_stats   for all using (auth.uid() = user_id);
create policy "own meals"   on meal_logs    for all using (auth.uid() = user_id);
create policy "own ai"      on ai_threads   for all using (auth.uid() = user_id);

-- Coaches see their assigned clients' data
create policy "coach sees clients" on workout_logs for select
  using (
    exists (
      select 1 from profiles p
      where p.id = workout_logs.user_id
      and p.coach_id = auth.uid()
    )
  );
create policy "coach sees client stats" on body_stats for select
  using (
    exists (
      select 1 from profiles p
      where p.id = body_stats.user_id
      and p.coach_id = auth.uid()
    )
  );

-- Messages: sender and receiver both see
create policy "messages" on messages for all
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Programs: client sees theirs, coach sees all they created
create policy "client sees program" on programs for select
  using (auth.uid() = client_id);
create policy "coach manages programs" on programs for all
  using (auth.uid() = coach_id);

-- ══════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();
