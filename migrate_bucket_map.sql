/* Cached map locations for bucket-list items. Resolution is performed by
   the authenticated resolve-bucket-location Edge Function and stored once. */
alter table public.bucket_items
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists canonical_maps_url text,
  add column if not exists location_label text,
  add column if not exists location_status text not null default 'pending',
  add column if not exists location_resolved_at timestamptz;

alter table public.bucket_items
  drop constraint if exists bucket_items_location_status_check;

alter table public.bucket_items
  add constraint bucket_items_location_status_check
  check (location_status in ('pending', 'resolved', 'approximate', 'unresolved'));

alter table public.bucket_items
  drop constraint if exists bucket_items_coordinates_check;

alter table public.bucket_items
  add constraint bucket_items_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

