create or replace function public.duplicate_trip(
  p_source_trip_id uuid,
  p_copy_name text default null
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_source public.trips%rowtype;
  v_copy public.trips%rowtype;
  v_row record;
  v_copy_trip_id uuid := pg_catalog.gen_random_uuid();
  v_old_id uuid;
  v_new_id uuid;
  v_day_map jsonb := '{}'::jsonb;
  v_stop_map jsonb := '{}'::jsonb;
  v_dex_catch_map jsonb := '{}'::jsonb;
  v_food_catch_map jsonb := '{}'::jsonb;
  v_stamp_catch_map jsonb := '{}'::jsonb;
  v_journal_entry_map jsonb := '{}'::jsonb;
begin
  select *
    into v_source
    from public.trips
   where id = p_source_trip_id
   for share;

  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  -- Only the owner can reproduce the full collaborator list and other users'
  -- trip records. The copied memberships then give the same collaborators access.
  if (select auth.uid()) is null or v_source.owner_id <> (select auth.uid()) then
    raise exception 'ONLY_TRIP_OWNER_CAN_DUPLICATE';
  end if;

  insert into public.trips
  select (pg_catalog.jsonb_populate_record(
    null::public.trips,
    pg_catalog.to_jsonb(v_source) || pg_catalog.jsonb_build_object(
      'id', v_copy_trip_id,
      'name', pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_copy_name), ''), v_source.name || ' — Copy'), 160),
      'created_at', pg_catalog.clock_timestamp(),
      'updated_at', pg_catalog.clock_timestamp()
    )
  )).* returning * into v_copy;

  for v_row in select * from public.trip_members where trip_id = p_source_trip_id loop
    insert into public.trip_members
    select (pg_catalog.jsonb_populate_record(
      null::public.trip_members,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(), 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.itinerary_days where trip_id = p_source_trip_id order by day_index loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_day_map := v_day_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.itinerary_days
    select (pg_catalog.jsonb_populate_record(
      null::public.itinerary_days,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id, 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.stops where trip_id = p_source_trip_id order by day_id, sort_order loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_stop_map := v_stop_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.stops
    select (pg_catalog.jsonb_populate_record(
      null::public.stops,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id,
        'trip_id', v_copy_trip_id,
        'day_id', case when v_row.day_id is null then null else v_day_map ->> v_row.day_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.overnights where trip_id = p_source_trip_id loop
    insert into public.overnights
    select (pg_catalog.jsonb_populate_record(
      null::public.overnights,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'day_id', case when v_row.day_id is null then null else v_day_map ->> v_row.day_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.expenses where trip_id = p_source_trip_id loop
    insert into public.expenses
    select (pg_catalog.jsonb_populate_record(
      null::public.expenses,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'day_id', case when v_row.day_id is null then null else v_day_map ->> v_row.day_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.packing_items where trip_id = p_source_trip_id loop
    insert into public.packing_items
    select (pg_catalog.jsonb_populate_record(
      null::public.packing_items,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(), 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.bucket_items where trip_id = p_source_trip_id loop
    insert into public.bucket_items
    select (pg_catalog.jsonb_populate_record(
      null::public.bucket_items,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(), 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.custom_links where trip_id = p_source_trip_id loop
    insert into public.custom_links
    select (pg_catalog.jsonb_populate_record(
      null::public.custom_links,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'day_id', case when v_row.day_id is null then null else v_day_map ->> v_row.day_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.glossary_terms where trip_id = p_source_trip_id loop
    insert into public.glossary_terms
    select (pg_catalog.jsonb_populate_record(
      null::public.glossary_terms,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(), 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.dex_catches where trip_id = p_source_trip_id loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_dex_catch_map := v_dex_catch_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.dex_catches
    select (pg_catalog.jsonb_populate_record(
      null::public.dex_catches,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id, 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.dex_photos where trip_id = p_source_trip_id loop
    insert into public.dex_photos
    select (pg_catalog.jsonb_populate_record(
      null::public.dex_photos,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'catch_id', case when v_row.catch_id is null then null else v_dex_catch_map ->> v_row.catch_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.food_catches where trip_id = p_source_trip_id loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_food_catch_map := v_food_catch_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.food_catches
    select (pg_catalog.jsonb_populate_record(
      null::public.food_catches,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id, 'trip_id', v_copy_trip_id
      )
    )).*;
  end loop;

  for v_row in select * from public.food_photos where trip_id = p_source_trip_id loop
    insert into public.food_photos
    select (pg_catalog.jsonb_populate_record(
      null::public.food_photos,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'catch_id', case when v_row.catch_id is null then null else v_food_catch_map ->> v_row.catch_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.stamp_catches where trip_id = p_source_trip_id loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_stamp_catch_map := v_stamp_catch_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.stamp_catches
    select (pg_catalog.jsonb_populate_record(
      null::public.stamp_catches,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id,
        'trip_id', v_copy_trip_id,
        'stop_id', case when v_row.stop_id is null then null else v_stop_map ->> v_row.stop_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.stamp_photos where trip_id = p_source_trip_id loop
    insert into public.stamp_photos
    select (pg_catalog.jsonb_populate_record(
      null::public.stamp_photos,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'catch_id', case when v_row.catch_id is null then null else v_stamp_catch_map ->> v_row.catch_id::text end,
        'stop_id', case when v_row.stop_id is null then null else v_stop_map ->> v_row.stop_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.journal_entries where trip_id = p_source_trip_id order by created_at loop
    v_old_id := v_row.id;
    v_new_id := pg_catalog.gen_random_uuid();
    v_journal_entry_map := v_journal_entry_map || pg_catalog.jsonb_build_object(v_old_id::text, v_new_id::text);
    insert into public.journal_entries
    select (pg_catalog.jsonb_populate_record(
      null::public.journal_entries,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', v_new_id,
        'trip_id', v_copy_trip_id,
        'day_id', case when v_row.day_id is null then null else v_day_map ->> v_row.day_id::text end
      )
    )).*;
  end loop;

  for v_row in select * from public.journal_photos where trip_id = p_source_trip_id loop
    insert into public.journal_photos
    select (pg_catalog.jsonb_populate_record(
      null::public.journal_photos,
      pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'trip_id', v_copy_trip_id,
        'entry_id', case when v_row.entry_id is null then null else v_journal_entry_map ->> v_row.entry_id::text end
      )
    )).*;
  end loop;

  return pg_catalog.jsonb_build_object(
    'trip', pg_catalog.to_jsonb(v_copy),
    'day_id_map', v_day_map,
    'copied_counts', pg_catalog.jsonb_build_object(
      'itinerary_days', (select pg_catalog.count(*) from public.itinerary_days where trip_id = v_copy_trip_id),
      'stops', (select pg_catalog.count(*) from public.stops where trip_id = v_copy_trip_id),
      'overnights', (select pg_catalog.count(*) from public.overnights where trip_id = v_copy_trip_id),
      'expenses', (select pg_catalog.count(*) from public.expenses where trip_id = v_copy_trip_id),
      'packing_items', (select pg_catalog.count(*) from public.packing_items where trip_id = v_copy_trip_id),
      'bucket_items', (select pg_catalog.count(*) from public.bucket_items where trip_id = v_copy_trip_id),
      'journal_entries', (select pg_catalog.count(*) from public.journal_entries where trip_id = v_copy_trip_id)
    )
  );
end;
$$;

revoke execute on function public.duplicate_trip(uuid, text) from public;
revoke execute on function public.duplicate_trip(uuid, text) from anon;
grant execute on function public.duplicate_trip(uuid, text) to authenticated;

comment on function public.duplicate_trip(uuid, text) is
  'Creates an independent relational copy of an owned trip, preserving collaborator access and remapping all internal IDs.';
