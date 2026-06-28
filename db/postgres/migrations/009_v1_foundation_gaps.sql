create extension if not exists pgcrypto;

do $$ begin
  create type transfer_status as enum ('draft', 'sent', 'received', 'cancelled');
exception
  when duplicate_object then null;
end $$;

alter type document_status add value if not exists 'returned';
alter type document_status add value if not exists 'sent';

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  parent_id uuid references categories(id) on delete set null,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products
  add column if not exists category_id uuid references categories(id) on delete set null;

create unique index if not exists products_barcode_unique_idx on products(barcode) where barcode is not null;

alter table customers
  add column if not exists credit_limit numeric(14,2) not null default 0,
  add column if not exists loyalty_points integer not null default 0;

create table if not exists audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  detail jsonb,
  device_id text,
  ip text
);

create index if not exists audit_log_entity_idx on audit_log(entity, entity_id);
create index if not exists audit_log_ts_idx on audit_log(ts desc);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null,
  severity text not null default 'info',
  title text not null,
  body text,
  entity text,
  entity_id text,
  read_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists backup_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'ready',
  path text,
  size_bytes bigint not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references stock_locations(id),
  status text not null default 'open' check (status in ('open', 'submitted', 'closed', 'cancelled')),
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  note text
);

create table if not exists stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_counts(id) on delete cascade,
  item_id uuid references items(id),
  product_id uuid references products(id),
  expected_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3),
  variance_qty numeric(14,3) generated always as (coalesce(counted_qty, expected_qty) - expected_qty) stored,
  check ((item_id is not null and product_id is null) or (item_id is null and product_id is not null))
);

create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  sale_id uuid not null references sales(id),
  customer_id uuid references customers(id),
  cashier_id uuid references users(id),
  reason text not null,
  refund_method payment_method not null default 'cash',
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status document_status not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  sale_item_id uuid not null references sale_items(id),
  product_id uuid not null references products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  unit_cost numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table if not exists sync_mutations (
  id uuid primary key,
  device_id text not null,
  entity text not null,
  operation text not null,
  payload jsonb not null,
  status text not null default 'accepted',
  error text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table if not exists sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  entity text not null,
  entity_id text,
  local_payload jsonb,
  remote_payload jsonb,
  reason text not null,
  status text not null default 'open',
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table stock_transfers
  add column if not exists status transfer_status not null default 'received',
  add column if not exists sent_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists cancelled_at timestamptz;
