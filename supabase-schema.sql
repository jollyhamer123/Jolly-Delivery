-- Jolly Delivery private customer data schema.
-- Run all of this in Supabase Dashboard > SQL Editor.
-- These policies restrict customer records to the signed-in owner (auth.uid()).

create table if not exists public.jolly_customer_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cart jsonb not null default '{}'::jsonb,
  wishlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.jolly_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null unique,
  created_at timestamptz not null default now(),
  total numeric(10,2) not null check (total >= 0),
  items jsonb not null default '[]'::jsonb,
  customer jsonb not null default '{}'::jsonb,
  order_kind text not null default 'demo' check (order_kind = 'demo')
);

alter table public.jolly_customer_state enable row level security;
alter table public.jolly_orders enable row level security;

-- Remove old policies before recreating them, so this setup can be rerun.
drop policy if exists "Customers manage their own private state" on public.jolly_customer_state;
drop policy if exists "Customers view only their own orders" on public.jolly_orders;
drop policy if exists "Customers create only their own demo orders" on public.jolly_orders;

create policy "Customers manage their own private state"
on public.jolly_customer_state
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Customers view only their own orders"
on public.jolly_orders
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Customers create only their own demo orders"
on public.jolly_orders
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Least-privilege table grants. RLS policies above still apply to every row.
revoke all on table public.jolly_customer_state from public, anon, authenticated;
revoke all on table public.jolly_orders from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.jolly_customer_state to authenticated;
grant select, insert on table public.jolly_orders to authenticated;

-- No card number, CVV, or expiry is stored by this schema. Payments are not enabled.
