begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 200),
  contact_name text not null default '' check (length(contact_name) <= 200),
  email text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 320),
  phone text not null default '' check (length(phone) <= 80),
  package text not null default 'One-page refresh' check (package in ('One-page refresh', 'Redesign')),
  quoted_total_cents integer not null default 50000 check (quoted_total_cents between 0 and 100000000),
  target_launch_date date,
  notes text not null default '' check (length(notes) <= 20000),
  current_url text not null default '',
  preview_url text not null default '',
  live_url text not null default '',
  repo_url text not null default '',
  status text not null default 'New Inquiry' check (status in (
    'New Inquiry', 'Quote Sent', 'Awaiting Deposit', 'Booked', 'In Progress',
    'Waiting on Client', 'Ready to Launch', 'Completed', 'Cancelled'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint orders_urls check (
    length(current_url) <= 2048 and length(preview_url) <= 2048 and length(live_url) <= 2048 and length(repo_url) <= 2048 and
    (current_url = '' or current_url ~* '^https?://[^[:space:]/?#@:]+(:[0-9]+)?([/?#][^[:space:]]*)?$') and
    (preview_url = '' or preview_url ~* '^https?://[^[:space:]/?#@:]+(:[0-9]+)?([/?#][^[:space:]]*)?$') and
    (live_url = '' or live_url ~* '^https?://[^[:space:]/?#@:]+(:[0-9]+)?([/?#][^[:space:]]*)?$') and
    (repo_url = '' or repo_url ~* '^https?://[^[:space:]/?#@:]+(:[0-9]+)?([/?#][^[:space:]]*)?$')
  ),
  constraint completed_order_has_live_url check (
    (status = 'Completed' and live_url <> '' and completed_at is not null) or
    (status <> 'Completed' and completed_at is null)
  )
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  received_date date not null,
  method text not null check (method in ('Cash', 'Check', 'Venmo Business')),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  due_date date,
  completed boolean not null default false,
  starter_key text check (starter_key in ('content', 'preview', 'approval', 'testing', 'handoff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, starter_key)
);

create index orders_status_completion on public.orders(status, completed_at desc);
create index order_payments_order on public.order_payments(order_id);
create index order_tasks_order on public.order_tasks(order_id);
create index order_tasks_due on public.order_tasks(due_date) where not completed;

create function public.admin_record_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := now();
  else
    NEW.created_at := OLD.created_at;
  end if;
  NEW.updated_at := now();
  if TG_TABLE_NAME = 'orders' then
    if NEW.status = 'Completed' then
      if TG_OP = 'UPDATE' then
        if OLD.status = 'Completed' then
          NEW.completed_at := OLD.completed_at;
        else
          NEW.completed_at := now();
        end if;
      else
        NEW.completed_at := now();
      end if;
    else
      NEW.completed_at := null;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger orders_timestamps before insert or update on public.orders
for each row execute function public.admin_record_timestamps();
create trigger order_payments_timestamps before insert or update on public.order_payments
for each row execute function public.admin_record_timestamps();
create trigger order_tasks_timestamps before insert or update on public.order_tasks
for each row execute function public.admin_record_timestamps();

alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_tasks enable row level security;

revoke all on public.admin_users, public.orders, public.order_payments, public.order_tasks from public, anon, authenticated;
revoke all on function public.admin_record_timestamps() from public, anon, authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update on public.orders, public.order_payments, public.order_tasks to authenticated;

create policy admin_own_membership on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create policy admin_orders_read on public.orders for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_orders_insert on public.orders for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_orders_update on public.orders for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy admin_payments_read on public.order_payments for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_payments_insert on public.order_payments for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_payments_update on public.order_payments for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy admin_tasks_read on public.order_tasks for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_tasks_insert on public.order_tasks for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy admin_tasks_update on public.order_tasks for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

commit;
