-- Row Level Security policies for MIROSHOP
-- Phase 1: Client-side auth only (no Supabase Auth). Keep functionality working with anon key.
-- NOTE: These policies are permissive by design to avoid breaking the app.
--       They enable RLS while allowing full CRUD via anon key.
--       See Phase 2 below for stricter policies with Supabase Auth.

-- Enable RLS on all relevant tables
alter table if exists public.products enable row level security;
alter table if exists public.clients enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;
alter table if exists public.settings enable row level security;

-- Drop existing policies to make this script idempotent
-- products
drop policy if exists products_read_all on public.products;
drop policy if exists products_insert_all on public.products;
drop policy if exists products_update_all on public.products;
drop policy if exists products_delete_all on public.products;
-- clients
drop policy if exists clients_read_all on public.clients;
drop policy if exists clients_insert_all on public.clients;
drop policy if exists clients_update_all on public.clients;
drop policy if exists clients_delete_all on public.clients;
-- orders
drop policy if exists orders_read_all on public.orders;
drop policy if exists orders_insert_all on public.orders;
drop policy if exists orders_update_all on public.orders;
drop policy if exists orders_delete_all on public.orders;
-- order_items
drop policy if exists order_items_read_all on public.order_items;
drop policy if exists order_items_insert_all on public.order_items;
drop policy if exists order_items_update_all on public.order_items;
drop policy if exists order_items_delete_all on public.order_items;
-- settings
drop policy if exists settings_read_all on public.settings;
drop policy if exists settings_write_all on public.settings;

-- Public read/write policies (anon key allowed)
-- PRODUCTS
create policy products_read_all on public.products
  for select using (true);
create policy products_insert_all on public.products
  for insert with check (true);
create policy products_update_all on public.products
  for update using (true) with check (true);
create policy products_delete_all on public.products
  for delete using (true);

-- CLIENTS
create policy clients_read_all on public.clients
  for select using (true);
create policy clients_insert_all on public.clients
  for insert with check (true);
create policy clients_update_all on public.clients
  for update using (true) with check (true);
create policy clients_delete_all on public.clients
  for delete using (true);

-- ORDERS
create policy orders_read_all on public.orders
  for select using (true);
create policy orders_insert_all on public.orders
  for insert with check (true);
create policy orders_update_all on public.orders
  for update using (true) with check (true);
create policy orders_delete_all on public.orders
  for delete using (true);

-- ORDER ITEMS
create policy order_items_read_all on public.order_items
  for select using (true);
create policy order_items_insert_all on public.order_items
  for insert with check (true);
create policy order_items_update_all on public.order_items
  for update using (true) with check (true);
create policy order_items_delete_all on public.order_items
  for delete using (true);

-- SETTINGS (KV)
create policy settings_read_all on public.settings
  for select using (true);
create policy settings_write_all on public.settings
  for all using (true) with check (true);

-- PHASE 2 (optional): Stricter policies with Supabase Auth
-- If/when you enable Supabase Auth and add a custom JWT claim app_role ('admin'|'operator'),
-- you can tighten policies as follows (example shown for products; replicate for other tables):
--
-- -- Example: allow everyone authenticated to read, only admins to write/delete
-- drop policy if exists products_insert_all on public.products;
-- drop policy if exists products_update_all on public.products;
-- drop policy if exists products_delete_all on public.products;
-- create policy products_insert_admin on public.products
--   for insert to authenticated using ((auth.jwt() ->> 'app_role') = 'admin') with check ((auth.jwt() ->> 'app_role') = 'admin');
-- create policy products_update_admin on public.products
--   for update to authenticated using ((auth.jwt() ->> 'app_role') = 'admin') with check ((auth.jwt() ->> 'app_role') = 'admin');
-- create policy products_delete_admin on public.products
--   for delete to authenticated using ((auth.jwt() ->> 'app_role') = 'admin');
--
-- -- Reports-only for admin would be enforced at the app level or via views with admin-only policies.
-- -- For service tasks (migrations, maintenance), the service_role bypasses RLS.
