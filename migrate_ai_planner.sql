-- AI planner quota accounting. Run once in the Supabase SQL editor.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;

create policy "Users can read their own AI usage"
  on public.ai_daily_usage for select
  using (auth.uid() = user_id);

create or replace function public.claim_ai_planner_request(p_daily_limit integer default 5)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then return false; end if;

  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (auth.uid(), (timezone('utc', now()))::date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = ai_daily_usage.request_count + 1,
        updated_at = now()
    where ai_daily_usage.request_count < p_daily_limit
  returning request_count into v_count;

  return v_count is not null and v_count <= p_daily_limit;
end;
$$;

create or replace function public.record_ai_planner_tokens(p_input_tokens bigint, p_output_tokens bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_daily_usage
     set input_tokens = input_tokens + greatest(p_input_tokens, 0),
         output_tokens = output_tokens + greatest(p_output_tokens, 0),
         updated_at = now()
   where user_id = auth.uid()
     and usage_date = (timezone('utc', now()))::date;
$$;

revoke all on function public.claim_ai_planner_request(integer) from public;
revoke all on function public.record_ai_planner_tokens(bigint, bigint) from public;
revoke all on function public.claim_ai_planner_request(integer) from anon;
revoke all on function public.record_ai_planner_tokens(bigint, bigint) from anon;
grant execute on function public.claim_ai_planner_request(integer) to authenticated;
grant execute on function public.record_ai_planner_tokens(bigint, bigint) to authenticated;
