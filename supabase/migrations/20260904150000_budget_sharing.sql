alter table public.overnights
  add column if not exists split_between text[] not null default '{}'::text[];
