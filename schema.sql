/* ============================================================
   SAFARI APP — Supabase Database Schema v3
   
   IMPORTANT: Run each section ONE AT A TIME.
   Copy from one "-- RUN X" comment to the next, run it,
   confirm success, then run the next section.
   ============================================================ */


/* ══════════════════════════════════════════════════════════
   RUN 1 — Extensions + Helper function stubs
   ══════════════════════════════════════════════════════════ */

create extension if not exists "uuid-ossp";


/* ══════════════════════════════════════════════════════════
   RUN 2 — PROFILES table
   ══════════════════════════════════════════════════════════ */

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text default 'traveler',
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);


/* ══════════════════════════════════════════════════════════
   RUN 3 — TRIPS table (no member policies yet)
   ══════════════════════════════════════════════════════════ */

create table if not exists public.trips (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  description   text,
  start_date    date,
  end_date      date,
  countries     text[],
  cover_emoji   text default '🌍',
  status        text default 'upcoming',
  owner_id      uuid references auth.users(id),
  features      jsonb default '{}',
  settings      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.trips enable row level security;

-- Simple owner-only policies for now (member policies added in RUN 5)
create policy "Owners can read own trips"
  on public.trips for select
  using (auth.uid() = owner_id);

create policy "Owners can create trips"
  on public.trips for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update trips"
  on public.trips for update
  using (auth.uid() = owner_id);

create policy "Owners can delete trips"
  on public.trips for delete
  using (auth.uid() = owner_id);


/* ══════════════════════════════════════════════════════════
   RUN 4 — TRIP_MEMBERS table
   ══════════════════════════════════════════════════════════ */

create table if not exists public.trip_members (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid references public.trips(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  role          text default 'viewer',
  invited_email text,
  status        text default 'active',
  joined_at     timestamptz default now(),
  unique(trip_id, user_id)
);

alter table public.trip_members enable row level security;

create policy "Members can see their own memberships"
  on public.trip_members for select
  using (auth.uid() = user_id);

create policy "Trip owners can manage members"
  on public.trip_members for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = trip_members.trip_id
      and trips.owner_id = auth.uid()
    )
  );

create index if not exists idx_trip_members_user on public.trip_members(user_id);
create index if not exists idx_trip_members_trip on public.trip_members(trip_id);


/* ══════════════════════════════════════════════════════════
   RUN 5 — Helper functions + upgrade trips policy
   (both trips and trip_members now exist)
   ══════════════════════════════════════════════════════════ */

-- Helper: is current user a member of this trip?
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer stable as $$
  select
    exists (select 1 from public.trips where id = p_trip_id and owner_id = auth.uid())
    or
    exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and status = 'active');
$$;

-- Helper: is current user an owner or editor?
create or replace function public.is_trip_editor(p_trip_id uuid)
returns boolean language sql security definer stable as $$
  select
    exists (select 1 from public.trips where id = p_trip_id and owner_id = auth.uid())
    or
    exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and role in ('owner','editor') and status = 'active');
$$;

-- Now add member-read policy to trips (trip_members exists now)
create policy "Members can read their trips"
  on public.trips for select
  using (public.is_trip_member(id));


/* ══════════════════════════════════════════════════════════
   RUN 6 — ITINERARY_DAYS + STOPS + OVERNIGHTS
   ══════════════════════════════════════════════════════════ */

create table if not exists public.itinerary_days (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  day_index   integer not null,
  day_label   text,
  date        date,
  title       text,
  locality    text,
  segment     text,
  story_title text,
  story_body  jsonb,
  created_at  timestamptz default now()
);

alter table public.itinerary_days enable row level security;

create policy "Trip members can read days"
  on public.itinerary_days for select
  using (public.is_trip_member(trip_id));

create policy "Trip editors can manage days"
  on public.itinerary_days for all
  using (public.is_trip_editor(trip_id));

create index if not exists idx_itinerary_days_trip on public.itinerary_days(trip_id);

-- STOPS
create table if not exists public.stops (
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
  included        boolean,
  flight_detail   jsonb,
  lat             double precision,
  lng             double precision,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.stops enable row level security;

create policy "Trip members can read stops"
  on public.stops for select using (public.is_trip_member(trip_id));

create policy "Trip editors can manage stops"
  on public.stops for all using (public.is_trip_editor(trip_id));

create index if not exists idx_stops_trip on public.stops(trip_id);
create index if not exists idx_stops_day  on public.stops(day_id);

-- OVERNIGHTS
create table if not exists public.overnights (
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
  ref         text,
  notes       text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now()
);

alter table public.overnights enable row level security;

create policy "Trip members can read overnights"
  on public.overnights for select using (public.is_trip_member(trip_id));

create policy "Trip editors can manage overnights"
  on public.overnights for all using (public.is_trip_editor(trip_id));


/* ══════════════════════════════════════════════════════════
   RUN 7 — EXPENSES + PACKING
   ══════════════════════════════════════════════════════════ */

create table if not exists public.expenses (
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
  on public.expenses for select using (public.is_trip_member(trip_id));

create policy "Trip members can add expenses"
  on public.expenses for insert with check (public.is_trip_member(trip_id));

create policy "Expense creator or owner can delete"
  on public.expenses for delete
  using (
    auth.uid() = created_by or
    exists (select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );

create index if not exists idx_expenses_trip on public.expenses(trip_id);

-- PACKING
create table if not exists public.packing_items (
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
  on public.packing_items for select using (public.is_trip_member(trip_id));

create policy "Trip members can manage packing"
  on public.packing_items for all using (public.is_trip_member(trip_id));

create index if not exists idx_packing_trip on public.packing_items(trip_id);


/* ══════════════════════════════════════════════════════════
   RUN 8 — DEX CATCHES + PHOTOS
   ══════════════════════════════════════════════════════════ */

create table if not exists public.dex_catches (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  user_id     uuid references auth.users(id),
  animal_id   text not null,
  note        text,
  day_label   text,
  caught_at   timestamptz default now()
);

alter table public.dex_catches enable row level security;

create policy "Trip members can read catches"
  on public.dex_catches for select using (public.is_trip_member(trip_id));

create policy "Trip members can manage catches"
  on public.dex_catches for all using (public.is_trip_member(trip_id));

create index if not exists idx_dex_catches_trip on public.dex_catches(trip_id);

-- DEX PHOTOS
create table if not exists public.dex_photos (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid references public.trips(id) on delete cascade,
  catch_id      uuid references public.dex_catches(id) on delete cascade,
  animal_id     text not null,
  storage_path  text,
  url           text,
  created_at    timestamptz default now()
);

alter table public.dex_photos enable row level security;

create policy "Trip members can read dex photos"
  on public.dex_photos for select using (public.is_trip_member(trip_id));

create policy "Trip members can manage dex photos"
  on public.dex_photos for all using (public.is_trip_member(trip_id));

create index if not exists idx_dex_photos_trip  on public.dex_photos(trip_id);
create index if not exists idx_dex_photos_catch on public.dex_photos(catch_id);


/* ══════════════════════════════════════════════════════════
   RUN 9 — GLOSSARY + CUSTOM LINKS
   ══════════════════════════════════════════════════════════ */

create table if not exists public.glossary_terms (
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
  on public.glossary_terms for select using (public.is_trip_member(trip_id));

create policy "Trip editors can manage glossary"
  on public.glossary_terms for all using (public.is_trip_editor(trip_id));

-- CUSTOM LINKS
create table if not exists public.custom_links (
  id          uuid primary key default uuid_generate_v4(),
  trip_id     uuid references public.trips(id) on delete cascade,
  title       text not null,
  url         text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

alter table public.custom_links enable row level security;

create policy "Trip members can read links"
  on public.custom_links for select using (public.is_trip_member(trip_id));

create policy "Trip members can manage links"
  on public.custom_links for all using (public.is_trip_member(trip_id));


/* ══════════════════════════════════════════════════════════
   RUN 10 — STORAGE BUCKET + TRIGGERS
   ══════════════════════════════════════════════════════════ */

insert into storage.buckets (id, name, public)
values ('dex-photos', 'dex-photos', false)
on conflict (id) do nothing;

create policy "Auth users can upload dex photos"
  on storage.objects for insert
  with check (bucket_id = 'dex-photos' and auth.uid() is not null);

create policy "Auth users can read dex photos"
  on storage.objects for select
  using (bucket_id = 'dex-photos' and auth.uid() is not null);

create policy "Photo owners can delete"
  on storage.objects for delete
  using (bucket_id = 'dex-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_trips_updated_at
  before update on public.trips
  for each row execute procedure public.set_updated_at();

create trigger set_stops_updated_at
  before update on public.stops
  for each row execute procedure public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
