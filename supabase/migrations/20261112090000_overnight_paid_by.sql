alter table public.overnights
  add column if not exists paid_by text;
