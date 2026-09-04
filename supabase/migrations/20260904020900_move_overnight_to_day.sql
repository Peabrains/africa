create or replace function public.move_overnight_to_day(
  p_source_day_id uuid,
  p_target_day_id uuid
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_source_day public.itinerary_days%rowtype;
  v_target_day public.itinerary_days%rowtype;
  v_overnight_id uuid;
  v_source_count integer;
  v_target_count integer;
begin
  if p_source_day_id = p_target_day_id then
    raise exception 'TARGET_IS_SOURCE_DAY';
  end if;

  -- A consistent lock order prevents two collaborators moving stays between
  -- the same days from racing or deadlocking each other.
  perform 1
    from public.itinerary_days
   where id in (p_source_day_id, p_target_day_id)
   order by id
   for update;

  select * into v_source_day
    from public.itinerary_days
   where id = p_source_day_id;
  if not found then raise exception 'SOURCE_DAY_NOT_FOUND'; end if;

  select * into v_target_day
    from public.itinerary_days
   where id = p_target_day_id;
  if not found then raise exception 'TARGET_DAY_NOT_FOUND'; end if;

  if v_source_day.trip_id <> v_target_day.trip_id then
    raise exception 'TARGET_DAY_WRONG_TRIP';
  end if;

  if not public.is_trip_editor(v_source_day.trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  perform 1
    from public.overnights
   where day_id in (p_source_day_id, p_target_day_id)
   order by day_id, id
   for update;

  select count(*), min(id)
    into v_source_count, v_overnight_id
    from public.overnights
   where trip_id = v_source_day.trip_id
     and day_id = p_source_day_id;

  if v_source_count = 0 then raise exception 'SOURCE_ACCOMMODATION_NOT_FOUND'; end if;
  if v_source_count > 1 then raise exception 'SOURCE_HAS_MULTIPLE_ACCOMMODATIONS'; end if;

  select count(*)
    into v_target_count
    from public.overnights
   where trip_id = v_source_day.trip_id
     and day_id = p_target_day_id;

  if v_target_count > 0 then
    raise exception 'TARGET_HAS_ACCOMMODATION';
  end if;

  update public.overnights
     set day_id = p_target_day_id
   where id = v_overnight_id;

  return jsonb_build_object(
    'overnight_id', v_overnight_id,
    'source_day_id', p_source_day_id,
    'target_day_id', p_target_day_id
  );
end;
$$;

revoke execute on function public.move_overnight_to_day(uuid, uuid) from public;
revoke execute on function public.move_overnight_to_day(uuid, uuid) from anon;
grant execute on function public.move_overnight_to_day(uuid, uuid) to authenticated;

comment on function public.move_overnight_to_day(uuid, uuid) is
  'Atomically moves one complete accommodation record to an empty day in the same trip.';
