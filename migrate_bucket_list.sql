/* ============================================================
   BUCKET LIST — user-added checklist, shared shell across every
   trip. Lives alongside (not instead of) Dex / Stamps / Food —
   see js/screens/bucket-list.js. Run in Supabase SQL Editor
   after schema.sql + migrate.sql.
   ============================================================ */

create table if not exists public.bucket_items (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid references public.trips(id) on delete cascade,
  title         text not null,
  location      text,
  category      text,
  url           text,
  done          boolean default false,
  photo_storage_path text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);

alter table public.bucket_items enable row level security;

create policy "Trip members can read bucket items"
  on public.bucket_items for select using (public.is_trip_member(trip_id));

create policy "Trip members can manage bucket items"
  on public.bucket_items for all using (public.is_trip_member(trip_id));

create index if not exists idx_bucket_items_trip on public.bucket_items(trip_id);


/* ── Storage bucket for bucket-list photos ────────────────────
   One photo per item (see photo_storage_path above), not a
   separate photos table — Dex/Stamps/Food allow multiple photos
   per catch, but a bucket-list item only ever needs one. */

insert into storage.buckets (id, name, public)
values ('bucket-photos', 'bucket-photos', false)
on conflict (id) do nothing;

create policy "Auth users can upload bucket photos"
  on storage.objects for insert
  with check (bucket_id = 'bucket-photos' and auth.uid() is not null);

create policy "Auth users can read bucket photos"
  on storage.objects for select
  using (bucket_id = 'bucket-photos' and auth.uid() is not null);

create policy "Photo owners can delete bucket photos"
  on storage.objects for delete
  using (bucket_id = 'bucket-photos' and auth.uid()::text = (storage.foldername(name))[1]);
