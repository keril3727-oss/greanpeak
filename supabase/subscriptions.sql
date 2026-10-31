-- Profit Radar: recurring subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  period text not null check (period in ('monthly','yearly')),
  next_payment_date date not null,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_company_members" on public.subscriptions;
create policy "subscriptions_select_company_members"
on public.subscriptions for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = subscriptions.company_id and cm.user_id = auth.uid()
));

drop policy if exists "subscriptions_insert_company_members" on public.subscriptions;
create policy "subscriptions_insert_company_members"
on public.subscriptions for insert to authenticated
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = subscriptions.company_id and cm.user_id = auth.uid()
));

drop policy if exists "subscriptions_update_company_members" on public.subscriptions;
create policy "subscriptions_update_company_members"
on public.subscriptions for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = subscriptions.company_id and cm.user_id = auth.uid()
))
with check (exists (
  select 1 from public.company_members cm
  where cm.company_id = subscriptions.company_id and cm.user_id = auth.uid()
));

drop policy if exists "subscriptions_delete_company_members" on public.subscriptions;
create policy "subscriptions_delete_company_members"
on public.subscriptions for delete to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = subscriptions.company_id and cm.user_id = auth.uid()
));

-- Idempotent bookkeeping for subscription charges in the existing transactions table.
alter table public.transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists billing_date date;

create unique index if not exists transactions_subscription_billing_date_uidx
on public.transactions(subscription_id,billing_date);

grant select,insert,update,delete on public.subscriptions to authenticated;
