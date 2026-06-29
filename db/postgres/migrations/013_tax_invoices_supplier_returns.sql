alter table sales
  add column if not exists tax numeric(14,2) not null default 0,
  add column if not exists tax_rate numeric(8,4) not null default 0;

alter table returns
  add column if not exists tax numeric(14,2) not null default 0,
  add column if not exists tax_rate numeric(8,4) not null default 0;

insert into chart_accounts (code, name, type, normal_balance, system_key) values
  ('2100', 'VAT and tax payable', 'liability', 'credit', 'tax_payable')
on conflict (system_key) do update
set code = excluded.code,
    name = excluded.name,
    type = excluded.type,
    normal_balance = excluded.normal_balance,
    status = 'active';

create table if not exists customer_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  sale_id uuid not null unique references sales(id) on delete cascade,
  customer_id uuid references customers(id),
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  status document_status not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists supplier_returns (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  supplier_id uuid not null references suppliers(id),
  grn_id uuid references grns(id),
  supplier_invoice_id uuid references supplier_invoices(id),
  reason text not null,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status document_status not null default 'completed',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

alter table supplier_returns
  add column if not exists grn_id uuid references grns(id),
  add column if not exists supplier_invoice_id uuid references supplier_invoices(id),
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists tax numeric(14,2) not null default 0,
  add column if not exists status document_status not null default 'completed',
  add column if not exists created_by uuid references users(id);

create table if not exists supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  supplier_return_id uuid not null references supplier_returns(id) on delete cascade,
  item_id uuid references items(id),
  product_id uuid references products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0,
  check ((item_id is not null and product_id is null) or (item_id is null and product_id is not null))
);
