-- Additive migration: existing cinema tables are not changed.
create table if not exists public.radar_shop_promotions (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,
  domain text not null,
  target_url text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint radar_shop_promotions_valid_period check (ends_at > starts_at)
);

create index if not exists radar_shop_promotions_domain_active_idx
  on public.radar_shop_promotions (domain, is_active, starts_at, ends_at);

alter table public.radar_shop_promotions enable row level security;
revoke all on public.radar_shop_promotions from anon, authenticated;
grant all on public.radar_shop_promotions to service_role;
