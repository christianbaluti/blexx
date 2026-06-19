CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended', 'disabled');
  CREATE TYPE outlet_type AS ENUM ('shop', 'warehouse', 'kitchen', 'office');
  CREATE TYPE product_status AS ENUM ('active', 'archived');
  CREATE TYPE movement_type AS ENUM ('receive', 'sale', 'adjust', 'damage', 'transfer_in', 'transfer_out', 'production_in', 'production_consume', 'return_in', 'return_out');
  CREATE TYPE purchase_status AS ENUM ('draft', 'ordered', 'received', 'cancelled');
  CREATE TYPE sale_status AS ENUM ('completed', 'held', 'returned', 'void');
  CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mobile', 'credit', 'voucher');
  CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
  CREATE TYPE notification_type AS ENUM ('low_stock', 'expiry', 'info', 'system');
  CREATE TYPE sync_status AS ENUM ('pending', 'applied', 'conflict', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(64) NOT NULL UNIQUE,
  email varchar(160) NOT NULL UNIQUE,
  full_name varchar(160) NOT NULL,
  password_hash varchar(255) NOT NULL,
  two_factor_secret varchar(64),
  status user_status NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id varchar(32) PRIMARY KEY,
  label varchar(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id varchar(32) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id varchar(64) PRIMARY KEY,
  label varchar(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id varchar(32) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id varchar(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(16) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  type outlet_type NOT NULL DEFAULT 'shop',
  address varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(40) NOT NULL UNIQUE,
  barcode varchar(40) UNIQUE,
  name varchar(200) NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit varchar(16) NOT NULL DEFAULT 'ea',
  is_raw boolean NOT NULL DEFAULT false,
  is_sellable boolean NOT NULL DEFAULT true,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  sell_price numeric(14,2) NOT NULL DEFAULT 0,
  reorder_qty numeric(14,3) NOT NULL DEFAULT 0,
  image_url varchar(500),
  status product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin (to_tsvector('english', name));

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute varchar(40) NOT NULL,
  value varchar(80) NOT NULL,
  sku_suffix varchar(20),
  price_diff numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_levels (
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (outlet_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  batch_no varchar(60) NOT NULL,
  expiry_date date,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, outlet_id, batch_no)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id bigserial PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  batch_id uuid REFERENCES stock_batches(id),
  movement movement_type NOT NULL,
  qty numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  ref_type varchar(40),
  ref_id uuid,
  note varchar(255),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mv_product_date ON stock_movements (product_id, created_at);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  phone varchar(40),
  email varchar(160),
  address varchar(255),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  status product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no varchar(40) NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  order_date date NOT NULL,
  status purchase_status NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id bigserial PRIMARY KEY,
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  qty numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  line_total numeric(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  phone varchar(40),
  email varchar(160),
  address varchar(255),
  loyalty_points integer NOT NULL DEFAULT 0,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  status product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no varchar(40) NOT NULL UNIQUE,
  outlet_id uuid NOT NULL REFERENCES outlets(id),
  cashier_id uuid NOT NULL REFERENCES users(id),
  customer_id uuid REFERENCES customers(id),
  sold_at timestamptz NOT NULL DEFAULT now(),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status sale_status NOT NULL DEFAULT 'completed',
  notes varchar(255)
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sold_at);

CREATE TABLE IF NOT EXISTS sale_lines (
  id bigserial PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  qty numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) GENERATED ALWAYS AS (qty * unit_price - discount) STORED
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id bigserial PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount numeric(14,2) NOT NULL,
  reference varchar(80),
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  name varchar(160) NOT NULL,
  output_qty numeric(14,3) NOT NULL DEFAULT 1,
  labor_cost numeric(14,2) NOT NULL DEFAULT 0,
  overhead_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bom_components (
  id bigserial PRIMARY KEY,
  bom_id uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES products(id),
  qty numeric(14,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(16) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  type account_type NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES expense_categories(id),
  expense_date date NOT NULL,
  description varchar(255),
  amount numeric(14,2) NOT NULL,
  recurring boolean NOT NULL DEFAULT false,
  outlet_id uuid REFERENCES outlets(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title varchar(160) NOT NULL,
  body varchar(500),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  action varchar(64) NOT NULL,
  entity varchar(64) NOT NULL,
  entity_id varchar(64),
  detail varchar(500),
  ip varchar(45),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS sync_queue (
  id bigserial PRIMARY KEY,
  device_id varchar(64) NOT NULL,
  entity varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  status sync_status NOT NULL DEFAULT 'pending',
  client_ts timestamptz NOT NULL,
  applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue (status);
