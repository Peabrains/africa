create or replace function public.move_stops_to_day(
  p_stop_ids uuid[],
  p_target_day_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_target public.itinerary_days%rowtype;
  v_source_day_id uuid;
  v_source_trip_id uuid;
  v_requested_count integer;
  v_selected_count integer;
  v_source_day_count integer;
  v_target_max_order integer;
begin
  select count(*)
    into v_requested_count
    from (select distinct unnest(p_stop_ids) as id) requested;

  if coalesce(v_requested_count, 0) = 0 then
    raise exception 'NO_STOPS_SELECTED';
  end if;

  select *
    into v_target
    from public.itinerary_days
   where id = p_target_day_id
   for update;

  if not found then
    raise exception 'TARGET_DAY_NOT_FOUND';
  end if;

  if not public.is_trip_editor(v_target.trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Lock the selected records and both affected timelines before deriving
  -- their order. This keeps the move all-or-nothing across collaborators.
  perform 1
    from public.stops
   where id = any(p_stop_ids)
      or (trip_id = v_target.trip_id and day_id = p_target_day_id)
   order by trip_id, day_id, sort_order, id
   for update;

  select count(*),
         count(distinct day_id),
         min(day_id::text)::uuid,
         min(trip_id::text)::uuid
    into v_selected_count, v_source_day_count, v_source_day_id, v_source_trip_id
    from public.stops
   where id = any(p_stop_ids);

  if v_selected_count <> v_requested_count then
    raise exception 'STOP_NOT_FOUND';
  end if;

  if v_source_day_count <> 1 then
    raise exception 'MULTIPLE_SOURCE_DAYS';
  end if;

  if v_source_trip_id <> v_target.trip_id then
    raise exception 'TARGET_DAY_WRONG_TRIP';
  end if;

  if v_source_day_id = p_target_day_id then
    raise exception 'TARGET_IS_SOURCE_DAY';
  end if;

  select coalesce(max(sort_order), -1)
    into v_target_max_order
    from public.stops
   where trip_id = v_target.trip_id
     and day_id = p_target_day_id;

  with selected as (
    select id,
           row_number() over (order by sort_order, id) - 1 as move_offset
      from public.stops
     where id = any(p_stop_ids)
  )
  update public.stops as stop
     set day_id = p_target_day_id,
         sort_order = v_target_max_order + 1 + selected.move_offset
    from selected
   where stop.id = selected.id;

  -- Close source gaps and guarantee deterministic target ordering.
  with ranked as (
    select id,
           row_number() over (partition by day_id order by sort_order, id) - 1 as new_order
      from public.stops
     where trip_id = v_target.trip_id
       and day_id in (v_source_day_id, p_target_day_id)
  )
  update public.stops as stop
     set sort_order = ranked.new_order
    from ranked
   where stop.id = ranked.id;

  return jsonb_build_object(
    'moved_count', v_selected_count,
    'source_day_id', v_source_day_id,
    'target_day_id', p_target_day_id
  );
end;
$$;

revoke execute on function public.move_stops_to_day(uuid[], uuid) from public;
revoke execute on function public.move_stops_to_day(uuid[], uuid) from anon;
grant execute on function public.move_stops_to_day(uuid[], uuid) to authenticated;

comment on function public.move_stops_to_day(uuid[], uuid) is
  'Atomically moves stops from one source day to another, appending them in their existing order.';
