create table if not exists chart_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  system_key text unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  ref_type text not null,
  ref_id uuid,
  memo text,
  posted_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create table if not exists journal_lines (
  id bigserial primary key,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references chart_accounts(id),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  memo text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists journal_entries_ref_idx on journal_entries(ref_type, ref_id);
create index if not exists journal_lines_account_idx on journal_lines(account_id);

insert into chart_accounts (code, name, type, normal_balance, system_key) values
  ('1000', 'Cash on hand', 'asset', 'debit', 'cash'),
  ('1010', 'Bank and mobile money clearing', 'asset', 'debit', 'bank'),
  ('1100', 'Accounts receivable', 'asset', 'debit', 'accounts_receivable'),
  ('1200', 'Raw material inventory', 'asset', 'debit', 'inventory_raw'),
  ('1210', 'Finished goods inventory', 'asset', 'debit', 'inventory_finished'),
  ('2000', 'Accounts payable', 'liability', 'credit', 'accounts_payable'),
  ('3000', 'Owner equity', 'equity', 'credit', 'equity'),
  ('4000', 'Sales revenue', 'income', 'credit', 'sales_revenue'),
  ('4010', 'Discounts and sales returns', 'income', 'debit', 'discounts'),
  ('5000', 'Cost of goods sold', 'expense', 'debit', 'cogs'),
  ('5100', 'Purchase and landed expenses', 'expense', 'debit', 'purchase_expense'),
  ('5200', 'Production variance and waste', 'expense', 'debit', 'production_variance')
on conflict (system_key) do update
set code = excluded.code,
    name = excluded.name,
    type = excluded.type,
    normal_balance = excluded.normal_balance,
    status = 'active';

alter table product_blueprints
  add column if not exists version integer not null default 1,
  add column if not exists parent_blueprint_id uuid references product_blueprints(id),
  add column if not exists archived_at timestamptz;

alter table product_blueprints
  add column if not exists is_active boolean;

update product_blueprints
set is_active = active
where is_active is null;

alter table product_blueprints
  alter column is_active set default true,
  alter column is_active set not null;

update product_blueprints
set parent_blueprint_id = id
where parent_blueprint_id is null;

create index if not exists product_blueprints_product_active_idx on product_blueprints(product_id, is_active);

alter table production_batches
  add column if not exists blueprint_version integer not null default 1,
  add column if not exists status text not null default 'completed' check (status in ('planned', 'started', 'completed', 'cancelled')),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists planned_by uuid references users(id),
  add column if not exists waste_reason text;

update production_batches
set completed_at = coalesce(completed_at, produced_at),
    started_at = coalesce(started_at, produced_at),
    blueprint_version = coalesce(blueprint_version, 1),
    status = coalesce(status, 'completed');
