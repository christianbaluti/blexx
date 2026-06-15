-- ============================================================
-- ModernTech Commerce OS — MySQL schema (init)
-- Target: MySQL 8.0+ (InnoDB, utf8mb4)
-- ============================================================

CREATE DATABASE IF NOT EXISTS moderntech
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE moderntech;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------
-- Identity & access
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36) PRIMARY KEY,
  username        VARCHAR(64) NOT NULL UNIQUE,
  email           VARCHAR(160) NOT NULL UNIQUE,
  full_name       VARCHAR(160) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  two_factor_secret VARCHAR(64) NULL,
  status          ENUM('active','suspended','disabled') NOT NULL DEFAULT 'active',
  last_login_at   DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id    CHAR(32) PRIMARY KEY,           -- e.g. 'super_admin'
  label VARCHAR(64) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(32) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id    VARCHAR(64) PRIMARY KEY,        -- e.g. 'pos.refund'
  label VARCHAR(128) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       CHAR(32) NOT NULL,
  permission_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Locations / outlets
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlets (
  id         CHAR(36) PRIMARY KEY,
  code       VARCHAR(16) NOT NULL UNIQUE,
  name       VARCHAR(120) NOT NULL,
  type       ENUM('shop','warehouse','kitchen','office') NOT NULL DEFAULT 'shop',
  address    VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Catalogue
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id        CHAR(36) PRIMARY KEY,
  name      VARCHAR(120) NOT NULL,
  parent_id CHAR(36) NULL,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id           CHAR(36) PRIMARY KEY,
  sku          VARCHAR(40)  NOT NULL UNIQUE,
  barcode      VARCHAR(40)  NULL UNIQUE,
  name         VARCHAR(200) NOT NULL,
  category_id  CHAR(36)     NULL,
  unit         VARCHAR(16)  NOT NULL DEFAULT 'ea',
  is_raw       TINYINT(1)   NOT NULL DEFAULT 0,
  is_sellable  TINYINT(1)   NOT NULL DEFAULT 1,
  cost_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
  sell_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
  reorder_qty  DECIMAL(14,3) NOT NULL DEFAULT 0,
  image_url    VARCHAR(500) NULL,
  status       ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_products_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_variants (
  id         CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  attribute  VARCHAR(40) NOT NULL,
  value      VARCHAR(80) NOT NULL,
  sku_suffix VARCHAR(20) NULL,
  price_diff DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Inventory (stock per outlet + batches)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  outlet_id  CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity   DECIMAL(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (outlet_id, product_id),
  FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_batches (
  id         CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  outlet_id  CHAR(36) NOT NULL,
  batch_no   VARCHAR(60) NOT NULL,
  expiry_date DATE NULL,
  quantity   DECIMAL(14,3) NOT NULL DEFAULT 0,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id)  REFERENCES outlets(id)  ON DELETE CASCADE,
  UNIQUE KEY uq_batch (product_id, outlet_id, batch_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id   CHAR(36) NOT NULL,
  outlet_id    CHAR(36) NOT NULL,
  batch_id     CHAR(36) NULL,
  movement     ENUM('receive','sale','adjust','damage','transfer_in','transfer_out','production_in','production_consume','return_in','return_out') NOT NULL,
  qty          DECIMAL(14,3) NOT NULL,
  unit_cost    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ref_type     VARCHAR(40) NULL,
  ref_id       CHAR(36) NULL,
  note         VARCHAR(255) NULL,
  created_by   CHAR(36) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (outlet_id)  REFERENCES outlets(id),
  FOREIGN KEY (batch_id)   REFERENCES stock_batches(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_mv_product_date (product_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_counts (
  id         CHAR(36) PRIMARY KEY,
  outlet_id  CHAR(36) NOT NULL,
  status     ENUM('open','submitted','closed') NOT NULL DEFAULT 'open',
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at  DATETIME NULL,
  FOREIGN KEY (outlet_id)  REFERENCES outlets(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  count_id      CHAR(36) NOT NULL,
  product_id    CHAR(36) NOT NULL,
  expected_qty  DECIMAL(14,3) NOT NULL,
  counted_qty   DECIMAL(14,3) NOT NULL,
  variance_qty  DECIMAL(14,3) AS (counted_qty - expected_qty) STORED,
  FOREIGN KEY (count_id)   REFERENCES stock_counts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Suppliers & purchases
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id              CHAR(36) PRIMARY KEY,
  name            VARCHAR(160) NOT NULL,
  phone           VARCHAR(40),
  email           VARCHAR(160),
  address         VARCHAR(255),
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           CHAR(36) PRIMARY KEY,
  ref_no       VARCHAR(40) NOT NULL UNIQUE,
  supplier_id  CHAR(36) NOT NULL,
  outlet_id    CHAR(36) NOT NULL,
  order_date   DATE NOT NULL,
  status       ENUM('draft','ordered','received','cancelled') NOT NULL DEFAULT 'draft',
  subtotal     DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax          DECIMAL(14,2) NOT NULL DEFAULT 0,
  total        DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by   CHAR(36) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (outlet_id)   REFERENCES outlets(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  po_id       CHAR(36) NOT NULL,
  product_id  CHAR(36) NOT NULL,
  qty         DECIMAL(14,3) NOT NULL,
  unit_cost   DECIMAL(14,2) NOT NULL,
  line_total  DECIMAL(14,2) AS (qty * unit_cost) STORED,
  FOREIGN KEY (po_id)      REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grn (
  id         CHAR(36) PRIMARY KEY,
  ref_no     VARCHAR(40) NOT NULL UNIQUE,
  po_id      CHAR(36) NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by CHAR(36) NULL,
  FOREIGN KEY (po_id)       REFERENCES purchase_orders(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grn_lines (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  grn_id      CHAR(36) NOT NULL,
  product_id  CHAR(36) NOT NULL,
  qty         DECIMAL(14,3) NOT NULL,
  unit_cost   DECIMAL(14,2) NOT NULL,
  batch_no    VARCHAR(60) NULL,
  expiry_date DATE NULL,
  FOREIGN KEY (grn_id)     REFERENCES grn(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id           CHAR(36) PRIMARY KEY,
  ref_no       VARCHAR(40) NOT NULL UNIQUE,
  supplier_id  CHAR(36) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date     DATE NULL,
  total        DECIMAL(14,2) NOT NULL,
  paid         DECIMAL(14,2) NOT NULL DEFAULT 0,
  status       ENUM('open','partial','paid','void') NOT NULL DEFAULT 'open',
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Customers
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              CHAR(36) PRIMARY KEY,
  name            VARCHAR(160) NOT NULL,
  phone           VARCHAR(40),
  email           VARCHAR(160),
  address         VARCHAR(255),
  loyalty_points  INT NOT NULL DEFAULT 0,
  credit_limit    DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- POS / Sales
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id              CHAR(36) PRIMARY KEY,
  ref_no          VARCHAR(40) NOT NULL UNIQUE,
  outlet_id       CHAR(36) NOT NULL,
  cashier_id      CHAR(36) NOT NULL,
  customer_id     CHAR(36) NULL,
  sold_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax             DECIMAL(14,2) NOT NULL DEFAULT 0,
  total           DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          ENUM('completed','held','returned','void') NOT NULL DEFAULT 'completed',
  notes           VARCHAR(255) NULL,
  FOREIGN KEY (outlet_id)   REFERENCES outlets(id),
  FOREIGN KEY (cashier_id)  REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_sales_date (sold_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_lines (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id    CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  qty        DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  discount   DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) AS (qty * unit_price - discount) STORED,
  FOREIGN KEY (sale_id)    REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_payments (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_id   CHAR(36) NOT NULL,
  method    ENUM('cash','card','mobile','credit','voucher') NOT NULL,
  amount    DECIMAL(14,2) NOT NULL,
  reference VARCHAR(80) NULL,
  paid_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_returns (
  id        CHAR(36) PRIMARY KEY,
  sale_id   CHAR(36) NOT NULL,
  reason    VARCHAR(160),
  total     DECIMAL(14,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Production / BOM
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boms (
  id            CHAR(36) PRIMARY KEY,
  product_id    CHAR(36) NOT NULL,           -- finished good
  name          VARCHAR(160) NOT NULL,
  output_qty    DECIMAL(14,3) NOT NULL DEFAULT 1,
  labor_cost    DECIMAL(14,2) NOT NULL DEFAULT 0,
  overhead_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bom_components (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  bom_id      CHAR(36) NOT NULL,
  material_id CHAR(36) NOT NULL,
  qty         DECIMAL(14,3) NOT NULL,
  FOREIGN KEY (bom_id)      REFERENCES boms(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_batches (
  id           CHAR(36) PRIMARY KEY,
  ref_no       VARCHAR(40) NOT NULL UNIQUE,
  bom_id       CHAR(36) NOT NULL,
  outlet_id    CHAR(36) NOT NULL,
  qty_produced DECIMAL(14,3) NOT NULL,
  qty_waste    DECIMAL(14,3) NOT NULL DEFAULT 0,
  total_cost   DECIMAL(14,2) NOT NULL DEFAULT 0,
  produced_by  CHAR(36) NULL,
  produced_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_id)      REFERENCES boms(id),
  FOREIGN KEY (outlet_id)   REFERENCES outlets(id),
  FOREIGN KEY (produced_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Finance
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gl_accounts (
  id    CHAR(36) PRIMARY KEY,
  code  VARCHAR(16) NOT NULL UNIQUE,
  name  VARCHAR(120) NOT NULL,
  type  ENUM('asset','liability','equity','income','expense') NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gl_entries (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  posted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ref_type   VARCHAR(40),
  ref_id     CHAR(36),
  account_id CHAR(36) NOT NULL,
  debit      DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit     DECIMAL(14,2) NOT NULL DEFAULT 0,
  memo       VARCHAR(255),
  FOREIGN KEY (account_id) REFERENCES gl_accounts(id),
  INDEX idx_gl_ref (ref_type, ref_id),
  INDEX idx_gl_date (posted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expense_categories (
  id   CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  id           CHAR(36) PRIMARY KEY,
  category_id  CHAR(36) NOT NULL,
  expense_date DATE NOT NULL,
  description  VARCHAR(255),
  amount       DECIMAL(14,2) NOT NULL,
  recurring    TINYINT(1) NOT NULL DEFAULT 0,
  outlet_id    CHAR(36) NULL,
  created_by   CHAR(36) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (outlet_id)   REFERENCES outlets(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Notifications & audit
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id        CHAR(36) PRIMARY KEY,
  user_id   CHAR(36) NULL,                  -- NULL = broadcast
  type      ENUM('low_stock','expiry','info','system') NOT NULL,
  title     VARCHAR(160) NOT NULL,
  body      VARCHAR(500),
  is_read   TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36) NULL,
  action     VARCHAR(64) NOT NULL,
  entity     VARCHAR(64) NOT NULL,
  entity_id  VARCHAR(64) NULL,
  detail     VARCHAR(500),
  ip         VARCHAR(45),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_date (created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------
-- Offline sync support
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(64) NOT NULL,
  entity      VARCHAR(64) NOT NULL,
  payload     JSON NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  status      ENUM('pending','applied','conflict','failed') NOT NULL DEFAULT 'pending',
  client_ts   DATETIME NOT NULL,
  applied_at  DATETIME NULL,
  INDEX idx_sync_status (status)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
