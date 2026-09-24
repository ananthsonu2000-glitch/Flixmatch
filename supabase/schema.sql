-- Movie/TV Matchmaker schema.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists pairs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id),
  status text not null default 'waiting_for_b'
    check (status in (
      'waiting_for_b', 'both_submitted', 'generating_brief',
      'swiping', 'matched', 'final_choice', 'expired'
    )),
  round int not null default 1,
  "partnerA_claimed" boolean not null default true,
  "partnerA_token" uuid not null default gen_random_uuid(),
  "partnerB_claimed" boolean not null default false,
  "partnerB_token" uuid,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  error_message text
);

alter table sessions add column if not exists error_message text;

create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  partner text not null check (partner in ('A', 'B')),
  mood text[] not null default '{}',
  mood_freetext text not null default '',
  languages text[] not null default '{}',
  content_type text not null,
  min_rating int not null,
  eras text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  unique (session_id, partner)
);

create table if not exists title_pools (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round int not null,
  tmdb_id int not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  year int,
  poster_path text,
  imdb_rating numeric,
  runtime int,
  synopsis text not null default '',
  ott_platforms jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (session_id, round, tmdb_id)
);

create table if not exists swipes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round int not null,
  partner text not null check (partner in ('A', 'B')),
  tmdb_id int not null,
  direction text not null check (direction in ('like', 'pass')),
  created_at timestamptz not null default now(),
  unique (session_id, round, partner, tmdb_id)
);

create index if not exists swipes_match_lookup on swipes (session_id, round, tmdb_id);

create table if not exists round_completions (
  session_id uuid not null references sessions(id) on delete cascade,
  round int not null,
  partner text not null check (partner in ('A', 'B')),
  completed_at timestamptz not null default now(),
  primary key (session_id, round, partner)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  round int not null,
  tmdb_id int not null,
  matched_at timestamptz not null default now()
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  tmdb_id int not null,
  partner text not null check (partner in ('A', 'B')),
  rating int not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  unique (session_id, tmdb_id, partner)
);

create table if not exists title_cache (
  tmdb_id int not null,
  region text not null default 'in',
  imdb_rating numeric,
  runtime int,
  ott_platforms jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  primary key (tmdb_id, region)
);

alter table title_cache add column if not exists runtime int;

-- ---------------------------------------------------------------------------
-- Atomic RPCs
-- ---------------------------------------------------------------------------

-- Claims the "B" role on a session. Only the first caller wins.
create or replace function claim_partner_b(p_session_id uuid)
returns table (token uuid) as $$
begin
  return query
    update sessions
    set "partnerB_claimed" = true,
        "partnerB_token" = gen_random_uuid()
    where id = p_session_id
      and "partnerB_claimed" = false
      and expires_at > now()
    returning "partnerB_token";
end;
$$ language plpgsql;

-- Upserts one partner's preferences and, iff both partners have now
-- submitted, atomically flips session status so exactly one caller triggers
-- brief/pool generation.
create or replace function submit_preferences(
  p_session_id uuid,
  p_partner text,
  p_mood text[],
  p_mood_freetext text,
  p_languages text[],
  p_content_type text,
  p_min_rating int,
  p_eras text[]
)
returns table (triggered boolean) as $$
declare
  v_id uuid;
  v_both boolean;
begin
  insert into preferences (
    session_id, partner, mood, mood_freetext, languages, content_type, min_rating, eras
  ) values (
    p_session_id, p_partner, p_mood, p_mood_freetext, p_languages, p_content_type, p_min_rating, p_eras
  )
  on conflict (session_id, partner) do update set
    mood = excluded.mood,
    mood_freetext = excluded.mood_freetext,
    languages = excluded.languages,
    content_type = excluded.content_type,
    min_rating = excluded.min_rating,
    eras = excluded.eras,
    submitted_at = now();

  select
    exists(select 1 from preferences where session_id = p_session_id and partner = 'A')
    and exists(select 1 from preferences where session_id = p_session_id and partner = 'B')
  into v_both;

  if v_both then
    update sessions
    set status = 'both_submitted'
    where id = p_session_id and status = 'waiting_for_b'
    returning id into v_id;
  end if;

  return query select (v_id is not null);
end;
$$ language plpgsql;

-- Atomically records a swipe and checks for a mutual like. Idempotent on
-- (session_id, round, partner, tmdb_id) so a retried request can't double-count.
create or replace function record_swipe(
  p_session_id uuid,
  p_round int,
  p_partner text,
  p_tmdb_id int,
  p_direction text
)
returns table (matched boolean) as $$
declare
  v_other text := case when p_partner = 'A' then 'B' else 'A' end;
  v_other_liked boolean;
  v_match_id uuid;
begin
  insert into swipes (session_id, round, partner, tmdb_id, direction)
  values (p_session_id, p_round, p_partner, p_tmdb_id, p_direction)
  on conflict (session_id, round, partner, tmdb_id) do nothing;

  if p_direction = 'like' then
    select exists(
      select 1 from swipes
      where session_id = p_session_id and round = p_round
        and partner = v_other and tmdb_id = p_tmdb_id and direction = 'like'
    ) into v_other_liked;

    if v_other_liked then
      insert into matches (session_id, round, tmdb_id)
      values (p_session_id, p_round, p_tmdb_id)
      on conflict (session_id) do nothing
      returning id into v_match_id;

      if v_match_id is not null then
        update sessions set status = 'matched' where id = p_session_id;
      end if;
    end if;
  end if;

  return query select exists(select 1 from matches where session_id = p_session_id and tmdb_id = p_tmdb_id);
end;
$$ language plpgsql;

-- Marks a partner done swiping a round. When both are done with no match,
-- atomically advances the session (round 1 -> generate round 2, round 2 ->
-- final_choice). Returns which transition (if any) this call triggered.
create or replace function complete_round(
  p_session_id uuid,
  p_round int,
  p_partner text
)
returns table (triggered_next text) as $$
declare
  v_both boolean;
  v_already_matched boolean;
  v_id uuid;
  v_result text := null;
begin
  insert into round_completions (session_id, round, partner)
  values (p_session_id, p_round, p_partner)
  on conflict do nothing;

  select exists(select 1 from matches where session_id = p_session_id) into v_already_matched;
  if v_already_matched then
    return query select null::text;
    return;
  end if;

  select
    exists(select 1 from round_completions where session_id = p_session_id and round = p_round and partner = 'A')
    and exists(select 1 from round_completions where session_id = p_session_id and round = p_round and partner = 'B')
  into v_both;

  if v_both then
    if p_round = 1 then
      update sessions set status = 'generating_brief', round = 2
      where id = p_session_id and status = 'swiping' and round = 1
      returning id into v_id;
      if v_id is not null then v_result := 'round2'; end if;
    else
      update sessions set status = 'final_choice'
      where id = p_session_id and status = 'swiping' and round = 2
      returning id into v_id;
      if v_id is not null then v_result := 'final_choice'; end if;
    end if;
  end if;

  return query select v_result;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- All writes go through the Next.js API routes using the service-role key,
-- which bypasses RLS. The anon key (used by browser Realtime subscriptions)
-- gets read-only access to the two tables clients watch live.

alter table sessions enable row level security;
alter table matches enable row level security;
alter table preferences enable row level security;
alter table title_pools enable row level security;
alter table swipes enable row level security;
alter table round_completions enable row level security;
alter table ratings enable row level security;
alter table title_cache enable row level security;
alter table pairs enable row level security;

drop policy if exists "anon can read sessions" on sessions;
create policy "anon can read sessions" on sessions for select using (true);

drop policy if exists "anon can read matches" on matches;
create policy "anon can read matches" on matches for select using (true);

-- No policies created for insert/update/delete on any table, and no select
-- policies on the remaining tables -> anon key has zero access to them.
-- Server routes use the service-role key, which bypasses RLS entirely.

-- Enable Realtime on the tables the client subscribes to (safe to re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table matches;
  end if;
end $$;
