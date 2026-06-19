DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('draft', 'sent', 'received', 'cancelled');
  CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'sms', 'push');
  CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS device_id varchar(80);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS due_date date;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id varchar(80),
  user_agent varchar(255),
  ip varchar(45),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS biometric_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id varchar(80) NOT NULL,
  device_name varchar(120),
  public_key text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  status varchar(20) NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id bigserial PRIMARY KEY,
  count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  expected_qty numeric(14,3) NOT NULL DEFAULT 0,
  counted_qty numeric(14,3) NOT NULL DEFAULT 0,
  variance_qty numeric(14,3) GENERATED ALWAYS AS (counted_qty - expected_qty) STORED
);

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_outlet_id uuid NOT NULL REFERENCES outlets(id),
  to_outlet_id uuid NOT NULL REFERENCES outlets(id),
  status transfer_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz
);

CREATE TABLE IF NOT EXISTS transfer_lines (
  id bigserial PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  qty numeric(14,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS grn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no varchar(40) NOT NULL UNIQUE,
  po_id uuid REFERENCES purchase_orders(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS grn_lines (
  id bigserial PRIMARY KEY,
  grn_id uuid NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  qty numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  batch_no varchar(60),
  expiry_date date
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no varchar(40) NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  invoice_date date NOT NULL,
  due_date date,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  ref_no varchar(40) NOT NULL UNIQUE,
  total numeric(14,2) NOT NULL DEFAULT 0,
  reason varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  reason varchar(160),
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no varchar(40) NOT NULL UNIQUE,
  bom_id uuid NOT NULL REFERENCES boms(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  qty_produced numeric(14,3) NOT NULL,
  qty_waste numeric(14,3) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  produced_by uuid REFERENCES users(id),
  produced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id bigserial PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  points integer NOT NULL,
  ref_type varchar(40),
  ref_id uuid,
  note varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  recipient varchar(180),
  status delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id varchar(120),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity varchar(64) NOT NULL,
  entity_id varchar(80) NOT NULL,
  local_payload jsonb NOT NULL,
  remote_payload jsonb NOT NULL,
  reason varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  file_path varchar(500),
  size_bytes bigint NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);
