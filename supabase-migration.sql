
-- Finance operations table and access policy
create table if not exists public.transactions (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null,
 date date not null default current_date,
 category text not null default 'Другое',
 type text not null check (type in ('income','expense')),
 amount numeric(14,2) not null check (amount > 0),
 created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
drop policy if exists "company members manage transactions" on public.transactions;
create policy "company members manage transactions" on public.transactions
for all to authenticated
using (
 exists (
  select 1 from public.company_members m
  where m.company_id = transactions.company_id
    and m.user_id = auth.uid()
 )
)
with check (
 exists (
  select 1 from public.company_members m
  where m.company_id = transactions.company_id
    and m.user_id = auth.uid()
 )
);

-- Profit Radar: cloud modules and row-level security
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, sku text default '', category text default 'Другое',
 quantity numeric(14,2) not null default 0 check(quantity>=0),
 price numeric(14,2) not null default 0 check(price>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, company_name text default '', email text default '', phone text default '',
 created_at timestamptz not null default now()
);
create table if not exists public.business_documents (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, kind text default 'Другое', notes text default '',
 created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.business_documents enable row level security;
do $$
declare t text;
begin
 foreach t in array array['products','customers','business_documents'] loop
  execute format('drop policy if exists "company members manage %I" on public.%I',t,t);
  execute format(
   'create policy "company members manage %I" on public.%I for all to authenticated using (exists (select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid())) with check (exists (select 1 from public.company_members m where m.company_id=%I.company_id and m.user_id=auth.uid()))',
   t,t,t,t
  );
 end loop;
end $$;
-- A newly registered owner must be allowed to create their own membership row.
drop policy if exists "users add own company membership" on public.company_members;
create policy "users add own company membership" on public.company_members
for insert to authenticated
with check (
 user_id=auth.uid()
 and exists(select 1 from public.companies c where c.id=company_id and c.created_by=auth.uid())
);
