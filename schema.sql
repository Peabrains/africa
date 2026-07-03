/* ============================================================
   SAFARI APP — Supabase Database Schema
   Run this entire file in Supabase SQL Editor
   ============================================================ */

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── USERS (extends Supabase auth.users) ─────────────────────
-- We store extra profile info here, linked to auth.users
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text default 'traveler',   -- 'admin' | 'operator' | 'traveler'
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── TRIPS ───────────────────────────────────────────────────
create table public.trips (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,                    -- "Africa Safari 2026"
  description   text,
  start_date    date,
  end_date      date,
  countries     text[],                           -- ['Tanzania','Kenya','Uganda']
  cover_emoji   text default '🌍',
  status        text default 'upcoming',          -- 'upcoming' | 'active' | 'completed'
  owner_id      uuid references auth.users(id),
  features      jsonb default '{}',               -- feature flags per trip
  settings      jsonb default '{}',               -- timezone, currency, etc.
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.trips enable row level security;

create policy "Trip members can read trips"
  on public.trips for select
  using (
    auth.uid() = owner_id or
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
    )
  );

create policy "Trip owners can update trips"
  on public.trips for update
  using (auth.uid() = owner_id);

create policy "Authenticated users can create trips"
  on public.trips for insert
  with check (auth.uid() = owner_id);

create policy "Trip owners can delete trips"
  on public.trips for delete
  using (auth.uid() = owner_id);


-- ── TRIP MEMBERS ────────────────────────────────────────────
create table public.trip_members (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text default 'viewer',    -- 'owner' | 'editor' | 'viewer'
  invited_email text,                   -- for pending invites before signup
  status      text default 'active',    -- 'active' | 'invited' | 'removed'
  joined_at   timestamptz default now(),
  unique(trip_id, user_id)
);

alter table public.trip_members enable row level security;

create policy "Members can read trip membership"
  on public.trip_members for select
  using (
    auth.uid() = user_id or
    exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id
      and trips.owner_id = auth.uid()
    )
  );

create policy "Trip owners can manage members"
  on public.trip_members for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id
      and trips.owner_id = auth.uid()
    )
  );


-- ── ITINERARY DAYS ──────────────────────────────────────────
create table public.itinerary_days (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  day_index   integer not null,          -- 0-based (d0, d1, d2...)
  day_label   text,                      -- "D1", "D2"
  date        date,
  title       text,                      -- "Kilimanjaro → Ngorongoro"
  locality    text,                      -- for weather lookup
  segment     text,                      -- 'transit'|'tanzania'|'kenya'|'uganda'
  story_title text,
  story_body  jsonb,                     -- array of paragraph strings
  created_at  timestamptz default now()
);

alter table public.itinerary_days enable row level security;

create policy "Trip members can read itinerary days"
  on public.itinerary_days for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = itinerary_days.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip owners/editors can manage itinerary days"
  on public.itinerary_days for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = itinerary_days.trip_id
      and (
        trips.owner_id = auth.uid() or
        (trip_members.user_id = auth.uid() and trip_members.role in ('owner','editor'))
      )
    )
  );


-- ── STOPS ───────────────────────────────────────────────────
create table public.stops (
  id              uuid primary key default uuid_generate_v4(),
  trip_id         uuid references public.trips(id) on delete cascade,
  day_id          uuid references public.itinerary_days(id) on delete cascade,
  sort_order      integer default 0,
  name            text not null,
  activity        text,
  time            text,
  timezone        text default 'EAT',
  transport       text,
  transport_type  text default 'walk',
  notes           text,
  needs_booking   boolean default false,
  is_booked       boolean default false,
  category        text,
  included        boolean,               -- in package or not
  flight_detail   jsonb,                 -- airline, route, depart, arrive, ref
  lat             double precision,
  lng             double precision,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.stops enable row level security;

create policy "Trip members can read stops"
  on public.stops for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = stops.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip owners/editors can manage stops"
  on public.stops for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = stops.trip_id
      and (
        trips.owner_id = auth.uid() or
        (trip_members.user_id = auth.uid() and trip_members.role in ('owner','editor'))
      )
    )
  );


-- ── OVERNIGHT / ACCOMMODATION ────────────────────────────────
create table public.overnights (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  day_id      uuid references public.itinerary_days(id) on delete cascade,
  name        text,
  area        text,
  address     text,
  phone       text,
  check_in    text,
  check_out   text,
  cost        numeric,
  ref         text,                      -- booking reference
  notes       text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now()
);

alter table public.overnights enable row level security;

create policy "Trip members can read overnights"
  on public.overnights for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = overnights.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip owners/editors can manage overnights"
  on public.overnights for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = overnights.trip_id
      and (
        trips.owner_id = auth.uid() or
        (trip_members.user_id = auth.uid() and trip_members.role in ('owner','editor'))
      )
    )
  );


-- ── EXPENSES ────────────────────────────────────────────────
create table public.expenses (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid references public.trips(id) on delete cascade,
  description   text not null,
  amount_usd    numeric not null default 0,
  category      text,
  paid_by       text,
  split_between text[],
  day_label     text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);

alter table public.expenses enable row level security;

create policy "Trip members can read expenses"
  on public.expenses for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = expenses.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip members can add expenses"
  on public.expenses for insert
  with check (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = expenses.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Expense creators and trip owners can delete"
  on public.expenses for delete
  using (
    auth.uid() = created_by or
    exists (
      select 1 from public.trips
      where trips.id = expenses.trip_id
      and trips.owner_id = auth.uid()
    )
  );


-- ── PACKING LIST ─────────────────────────────────────────────
create table public.packing_items (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  category    text not null,
  item        text not null,
  essential   boolean default false,
  checked     boolean default false,
  checked_by  uuid references auth.users(id),
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

alter table public.packing_items enable row level security;

create policy "Trip members can read packing"
  on public.packing_items for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = packing_items.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip members can manage packing"
  on public.packing_items for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = packing_items.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );


-- ── DEX CATCHES ──────────────────────────────────────────────
create table public.dex_catches (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  user_id     uuid references auth.users(id),
  animal_id   text not null,             -- 'lion', 'elephant', etc.
  note        text,
  day_label   text,
  caught_at   timestamptz default now()
);

alter table public.dex_catches enable row level security;

create policy "Trip members can read dex catches"
  on public.dex_catches for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = dex_catches.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip members can manage dex catches"
  on public.dex_catches for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = dex_catches.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );


-- ── DEX PHOTOS ───────────────────────────────────────────────
create table public.dex_photos (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  catch_id    uuid references public.dex_catches(id) on delete cascade,
  animal_id   text not null,
  storage_path text,                     -- Supabase storage path
  url         text,                      -- public URL once uploaded
  created_at  timestamptz default now()
);

alter table public.dex_photos enable row level security;

create policy "Trip members can read dex photos"
  on public.dex_photos for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = dex_photos.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip members can manage dex photos"
  on public.dex_photos for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = dex_photos.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );


-- ── GLOSSARY ─────────────────────────────────────────────────
create table public.glossary_terms (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  term        text not null,
  title       text not null,
  body        text not null,
  created_at  timestamptz default now(),
  unique(trip_id, term)
);

alter table public.glossary_terms enable row level security;

create policy "Trip members can read glossary"
  on public.glossary_terms for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = glossary_terms.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip owners/editors can manage glossary"
  on public.glossary_terms for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = glossary_terms.trip_id
      and (
        trips.owner_id = auth.uid() or
        (trip_members.user_id = auth.uid() and trip_members.role in ('owner','editor'))
      )
    )
  );


-- ── CUSTOM LINKS ─────────────────────────────────────────────
create table public.custom_links (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  title       text not null,
  url         text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

alter table public.custom_links enable row level security;

create policy "Trip members can read custom links"
  on public.custom_links for select
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = custom_links.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );

create policy "Trip members can manage custom links"
  on public.custom_links for all
  using (
    exists (
      select 1 from public.trips
      left join public.trip_members on trip_members.trip_id = trips.id
      where trips.id = custom_links.trip_id
      and (trips.owner_id = auth.uid() or trip_members.user_id = auth.uid())
    )
  );


-- ── STORAGE BUCKET FOR DEX PHOTOS ────────────────────────────
insert into storage.buckets (id, name, public)
values ('dex-photos', 'dex-photos', false)
on conflict (id) do nothing;

create policy "Trip members can upload dex photos"
  on storage.objects for insert
  with check (bucket_id = 'dex-photos' and auth.uid() is not null);

create policy "Trip members can read dex photos"
  on storage.objects for select
  using (bucket_id = 'dex-photos' and auth.uid() is not null);

create policy "Photo owners can delete"
  on storage.objects for delete
  using (bucket_id = 'dex-photos' and auth.uid()::text = (storage.foldername(name))[1]);


-- ── INDEXES for performance ──────────────────────────────────
create index on public.trip_members(user_id);
create index on public.trip_members(trip_id);
create index on public.itinerary_days(trip_id);
create index on public.stops(trip_id);
create index on public.stops(day_id);
create index on public.expenses(trip_id);
create index on public.packing_items(trip_id);
create index on public.dex_catches(trip_id);
create index on public.dex_photos(trip_id);
create index on public.dex_photos(catch_id);


-- ── UPDATED_AT auto-update ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_trips_updated_at
  before update on public.trips
  for each row execute procedure public.set_updated_at();

create trigger set_stops_updated_at
  before update on public.stops
  for each row execute procedure public.set_updated_at();
