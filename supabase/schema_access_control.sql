-- ══════════════════════════════════════════════════════════════
-- SOLARYN FIT — ACCESS CONTROL SCHEMA
-- Free access for yourself + select beta users
-- ══════════════════════════════════════════════════════════════

-- ── ADMIN / OVERRIDE TABLE ────────────────────────────────────
-- Users in this table bypass Stripe entirely.
-- Their tier is set manually by you.
create table access_overrides (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id),
  email           text unique,          -- match on email before user exists
  tier            text not null,        -- 'elite' | 'coached' | 'app' | 'free'
  reason          text,                 -- 'owner' | 'beta' | 'friend' | 'influencer'
  expires_at      timestamptz,          -- null = never expires
  granted_by      text default 'esteban',
  created_at      timestamptz default now()
);

-- No RLS — only service key can touch this (server-side only)
-- Your email is the source of truth for owner access

-- ── INVITE CODES ──────────────────────────────────────────────
create table invite_codes (
  id              uuid primary key default uuid_generate_v4(),
  code            text unique not null,       -- e.g. 'SOLARYN-BETA'
  tier            text not null default 'app', -- tier they get
  max_uses        int default 1,              -- 1 for personal, 10+ for group
  uses            int default 0,
  expires_at      timestamptz,               -- null = never
  note            text,                      -- who you made it for
  created_at      timestamptz default now()
);

-- ── INSERT YOUR OWN OVERRIDE (run this once) ──────────────────
-- Replace with your actual email
insert into access_overrides (email, tier, reason)
values ('esteban.frias@gmail.com', 'elite', 'owner')
on conflict (email) do update set tier = 'elite';

-- ── CREATE SOME STARTER INVITE CODES ─────────────────────────
insert into invite_codes (code, tier, max_uses, note) values
  ('SOLARYN-BETA',    'app',     10,  'General beta testers'),
  ('COACHED-BETA',    'coached',  5,  'Beta coached clients'),
  ('CISCO-FRIENDS',   'app',     20,  'Cisco network'),
  ('CDMX-BETA',       'app',     10,  'Mexico City beta'),
  ('ELITE-FRIEND',    'elite',    3,  'Close friends - full access')
on conflict (code) do nothing;

-- ── FUNCTION: Check access override ──────────────────────────
-- Called on every auth to see if user gets free tier override
create or replace function get_access_override(p_user_id uuid, p_email text)
returns table(tier text, reason text) language plpgsql security definer as $$
begin
  return query
    select ao.tier, ao.reason
    from access_overrides ao
    where (ao.user_id = p_user_id or ao.email = p_email)
      and (ao.expires_at is null or ao.expires_at > now())
    limit 1;
end;
$$;

-- ── FUNCTION: Redeem invite code ──────────────────────────────
create or replace function redeem_invite_code(p_code text, p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_code invite_codes;
begin
  select * into v_code
  from invite_codes
  where code = upper(trim(p_code))
    and uses < max_uses
    and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired code');
  end if;

  -- Increment usage
  update invite_codes set uses = uses + 1 where id = v_code.id;

  -- Add override for this user
  insert into access_overrides (user_id, tier, reason)
  values (p_user_id, v_code.tier, 'invite_code:' || p_code)
  on conflict do nothing;

  -- Update their profile tier
  update profiles
  set subscription_tier = v_code.tier,
      subscription_status = 'active'
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'tier', v_code.tier,
    'message', 'Access granted — welcome to Solaryn Fit'
  );
end;
$$;
