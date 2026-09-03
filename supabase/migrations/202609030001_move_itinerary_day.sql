create or replace function public.move_itinerary_day(
  p_day_id uuid,
  p_target_date date,
  p_override boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_source public.itinerary_days%rowtype;
  v_target_id uuid;
  v_blank_day_id uuid;
begin
  if p_target_date is null then
    raise exception 'TARGET_DATE_REQUIRED';
  end if;

  select *
    into v_source
    from public.itinerary_days
   where id = p_day_id
   for update;

  if not found then
    raise exception 'DAY_NOT_FOUND';
  end if;

  if not public.is_trip_editor(v_source.trip_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_source.date is null then
    raise exception 'SOURCE_DATE_REQUIRED';
  end if;

  if v_source.date = p_target_date then
    return jsonb_build_object(
      'moved_day_id', v_source.id,
      'blank_day_id', null,
      'overridden_day_id', null
    );
  end if;

  -- Serialize date moves within this trip so two clients cannot replace
  -- the same date at the same time.
  perform 1
    from public.itinerary_days
   where trip_id = v_source.trip_id
   for update;

  select id
    into v_target_id
    from public.itinerary_days
   where trip_id = v_source.trip_id
     and date = p_target_date
     and id <> v_source.id
   order by created_at, id
   limit 1;

  if v_target_id is not null and not p_override then
    raise exception 'DATE_ALREADY_EXISTS';
  end if;

  if v_target_id is not null then
    delete from public.itinerary_days
     where id = v_target_id;
  end if;

  -- Keep the original day record (and therefore all of its linked stops,
  -- accommodation and other child records) intact while changing its date.
  update public.itinerary_days
     set date = p_target_date
   where id = v_source.id;

  -- The original calendar date remains present as an intentionally blank day.
  -- Locality/country/weather context is retained; plan and story content is not.
  insert into public.itinerary_days (
    trip_id,
    day_index,
    day_label,
    date,
    title,
    locality,
    segment,
    story_title,
    story_body,
    weather_points
  ) values (
    v_source.trip_id,
    0,
    'D0',
    v_source.date,
    null,
    v_source.locality,
    v_source.segment,
    null,
    null,
    v_source.weather_points
  )
  returning id into v_blank_day_id;

  with ranked as (
    select id,
           (row_number() over (order by date asc nulls last, created_at asc, id asc) - 1)::integer as new_index
      from public.itinerary_days
     where trip_id = v_source.trip_id
  )
  update public.itinerary_days as d
     set day_index = ranked.new_index,
         day_label = 'D' || ranked.new_index::text
    from ranked
   where d.id = ranked.id;

  update public.expenses as e
     set day_label = d.day_label
    from public.itinerary_days as d
   where e.day_id = d.id
     and d.trip_id = v_source.trip_id;

  update public.trips
     set start_date = (select min(date) from public.itinerary_days where trip_id = v_source.trip_id),
         end_date = (select max(date) from public.itinerary_days where trip_id = v_source.trip_id)
   where id = v_source.trip_id;

  return jsonb_build_object(
    'moved_day_id', v_source.id,
    'blank_day_id', v_blank_day_id,
    'overridden_day_id', v_target_id
  );
end;
$$;

revoke execute on function public.move_itinerary_day(uuid, date, boolean) from public;
revoke execute on function public.move_itinerary_day(uuid, date, boolean) from anon;
grant execute on function public.move_itinerary_day(uuid, date, boolean) to authenticated;

comment on function public.move_itinerary_day(uuid, date, boolean) is
  'Moves a complete itinerary day to another date and leaves a contextual blank day behind.';
