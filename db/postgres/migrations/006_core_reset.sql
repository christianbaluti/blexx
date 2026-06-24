drop schema public cascade;
create schema public;
create extension if not exists pgcrypto;

create type user_status as enum ('active', 'suspended', 'disabled');
create type location_type as enum ('warehouse', 'shop');
create type document_status as enum ('draft', 'ordered', 'received', 'cancelled', 'open', 'partial', 'paid', 'void', 'completed');
create type payment_method as enum ('cash', 'card', 'mobile', 'bank', 'credit');
create type finance_type as enum ('supplier_invoice', 'supplier_payment', 'purchase_expense', 'production_cost', 'sale_revenue', 'discount', 'customer_payment', 'cogs', 'stock_value');

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  full_name text not null,
  password_hash text not null,
  role text not null default 'super_admin',
  status user_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id text,
  user_agent text,
  ip text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table stock_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type location_type not null,
  address text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  note text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  unit text not null default 'ea',
  reorder_level numeric(14,3) not null default 0,
  average_cost numeric(14,4) not null default 0,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text,
  name text not null,
  unit text not null default 'ea',
  selling_price numeric(14,2) not null default 0,
  average_cost numeric(14,4) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  image_data text,
  image_mime text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  order_date date not null default current_date,
  expected_date date,
  status document_status not null default 'draft',
  note text,
  subtotal numeric(14,2) not null default 0,
  landed_cost numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null
);

create table grns (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  purchase_order_id uuid references purchase_orders(id),
  supplier_id uuid not null references suppliers(id),
  location_id uuid not null references stock_locations(id),
  received_at timestamptz not null default now(),
  received_by uuid references users(id),
  note text,
  total numeric(14,2) not null default 0
);

create table grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references grns(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  landed_unit_cost numeric(14,4) not null default 0,
  line_total numeric(14,2) not null
);

create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  purchase_order_id uuid references purchase_orders(id),
  grn_id uuid references grns(id),
  invoice_date date not null default current_date,
  due_date date,
  total numeric(14,2) not null check (total >= 0),
  paid numeric(14,2) not null default 0,
  status document_status not null default 'open',
  attachment_name text,
  attachment_mime text,
  attachment_data text,
  note text,
  created_at timestamptz not null default now()
);

create table product_blueprints (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  name text not null,
  output_qty numeric(14,3) not null default 1,
  labor_cost numeric(14,2) not null default 0,
  overhead_cost numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_blueprint_items (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references product_blueprints(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric(14,3) not null check (quantity > 0)
);

create table production_batches (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  blueprint_id uuid not null references product_blueprints(id),
  warehouse_location_id uuid not null references stock_locations(id),
  quantity_to_produce numeric(14,3) not null,
  quantity_produced numeric(14,3) not null,
  quantity_wasted numeric(14,3) not null default 0,
  extra_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null,
  unit_cost numeric(14,4) not null,
  selling_price numeric(14,2),
  produced_by uuid references users(id),
  produced_at timestamptz not null default now()
);

create table production_batch_items (
  id uuid primary key default gen_random_uuid(),
  production_batch_id uuid not null references production_batches(id) on delete cascade,
  item_id uuid not null references items(id),
  required_qty numeric(14,3) not null,
  consumed_qty numeric(14,3) not null,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) not null
);

create table warehouse_stock (
  item_id uuid references items(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  check ((item_id is not null and product_id is null) or (item_id is null and product_id is not null)),
  unique (item_id),
  unique (product_id)
);

create table shop_stock (
  product_id uuid primary key references products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now()
);

create table stock_movements (
  id bigserial primary key,
  location_id uuid not null references stock_locations(id),
  item_id uuid references items(id),
  product_id uuid references products(id),
  direction text not null check (direction in ('in', 'out')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0,
  ref_type text not null,
  ref_id uuid,
  note text,
  user_id uuid references users(id),
  created_at timestamptz not null default now(),
  check ((item_id is not null and product_id is null) or (item_id is null and product_id is not null))
);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  from_location_id uuid not null references stock_locations(id),
  to_location_id uuid not null references stock_locations(id),
  product_id uuid not null references products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  transferred_by uuid references users(id),
  transferred_at timestamptz not null default now(),
  note text
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  customer_id uuid references customers(id),
  cashier_id uuid references users(id),
  sale_date timestamptz not null default now(),
  subtotal numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  payment_method payment_method not null,
  status document_status not null default 'completed'
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  line_total numeric(14,2) not null
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references sales(id) on delete cascade,
  receipt_no text not null unique,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('supplier', 'customer')),
  supplier_id uuid references suppliers(id),
  customer_id uuid references customers(id),
  supplier_invoice_id uuid references supplier_invoices(id),
  sale_id uuid references sales(id),
  method payment_method not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference text,
  attachment_name text,
  attachment_mime text,
  attachment_data text,
  note text
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid references supplier_invoices(id),
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  status document_status not null default 'open',
  created_at timestamptz not null default now()
);

create table finance_transactions (
  id bigserial primary key,
  type finance_type not null,
  ref_type text not null,
  ref_id uuid,
  amount numeric(14,2) not null,
  note text,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into users (username, email, full_name, password_hash, role)
values ('christianbaluti', 'crisnickchristian@gmail.com', 'Christian Baluti', '$2b$10$iL93oYqyqa7rGRZCRns1T.M3U1xQaSLL9DZn8NWB6nEZCZ1vQlj7u', 'super_admin');

insert into stock_locations (code, name, type, is_default)
values
  ('WH-01', 'Main Warehouse', 'warehouse', true),
  ('SHOP-01', 'Main Shop', 'shop', true);

insert into app_settings (key, value)
values ('settings', '{"company":{"tradingName":"POS & Inventory +","currency":"MWK","vatRate":0,"address":""},"downloads":{"androidUrl":"","iosUrl":""}}'::jsonb);
