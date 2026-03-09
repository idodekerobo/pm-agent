create table if not exists public.user_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  description  text not null,
  environment  text not null default 'unknown',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- keep updated_at current
create or replace function set_user_feedback_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_user_feedback_updated_at
  before update on public.user_feedback
  for each row execute function set_user_feedback_updated_at();

-- RLS: users can only read their own submissions
alter table public.user_feedback enable row level security;

create policy "Users can read own feedback"
  on public.user_feedback for select
  using (auth.uid() = user_id);
