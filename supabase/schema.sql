-- Run this in Supabase SQL editor before switching the app to cloud-only mode

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default now()
);

create table if not exists public.products (
  id uuid primary key,
  name text not null,
  color text not null,
  stock integer not null default 0,
  cost numeric not null default 0,
  sale_price numeric not null default 0,
  image jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.clients (
  id uuid primary key,
  name text not null,
  document_id text not null,
  phone text,
  address text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.orders (
  id uuid primary key,
  kind text not null check (kind in ('sale','sales-order')),
  total numeric not null default 0,
  payment_method text,
  performed_by_username text,
  performed_by_role text check (performed_by_role in ('admin','operator')),
  -- Client snapshot + logistics
  client_id uuid references public.clients(id),
  client_name text,
  client_document_id text,
  client_phone text,
  delivery_address text,
  -- Amounts breakdown
  subtotal numeric default 0,
  discount numeric default 0,
  notes text,
  -- Sequential number for tickets (auto-increment)
  sequence bigserial,
  created_at timestamp with time zone default now()
);

create table if not exists public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  -- Snapshots to preserve product details at time of order
  product_name text,
  color text,
  qty integer not null check (qty >= 0),
  unit_price numeric not null default 0,
  subtotal numeric not null default 0
);

-- Optional indexes
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_products_name on public.products(name);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- RLS policy note (for production security):
-- Enable RLS and create policies to allow authenticated access as required.
-- For quick demos you may leave RLS disabled (default), which allows anon key access.
-- alter table public.products enable row level security;
-- alter table public.clients enable row level security;
-- alter table public.orders enable row level security;
-- alter table public.order_items enable row level security;
-- alter table public.settings enable row level security;
