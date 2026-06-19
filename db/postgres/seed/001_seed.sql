INSERT INTO roles (id, label) VALUES
  ('super_admin', 'Super Administrator'),
  ('inventory_officer', 'Inventory Officer'),
  ('production_officer', 'Production Officer'),
  ('pos_cashier', 'POS Cashier'),
  ('finance_user', 'Finance User'),
  ('cro', 'Customer Relationship Officer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, username, email, full_name, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@moderntech.mw', 'Tadala Banda', '$2b$10$iGZnokpBk/bulD1EmWCmPOD85boIf7NbHiIPQ3zueU/Lty5ywoUBO'),
  ('00000000-0000-0000-0000-000000000004', 'cashier', 'pos@moderntech.mw', 'Yamikani Mhone', '$2b$10$iGZnokpBk/bulD1EmWCmPOD85boIf7NbHiIPQ3zueU/Lty5ywoUBO')
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash,
  status = 'active';

INSERT INTO user_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'super_admin'),
  ('00000000-0000-0000-0000-000000000004', 'pos_cashier')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (id, label) VALUES
  ('users.manage', 'Manage users and roles'),
  ('inventory.manage', 'Manage stock, batches and transfers'),
  ('production.manage', 'Manage BOMs and production batches'),
  ('pos.sell', 'Process POS sales'),
  ('finance.manage', 'Manage finance, expenses and reports'),
  ('customers.manage', 'Manage customers and loyalty'),
  ('sync.resolve', 'Resolve offline sync conflicts')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'super_admin', id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('inventory_officer', 'inventory.manage'),
  ('production_officer', 'production.manage'),
  ('pos_cashier', 'pos.sell'),
  ('finance_user', 'finance.manage'),
  ('cro', 'customers.manage')
ON CONFLICT DO NOTHING;

INSERT INTO outlets (id, code, name, type, address) VALUES
  ('10000000-0000-0000-0000-000000000001', 'BT01', 'Blantyre Main Shop', 'shop', 'Limbe, Blantyre')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Beverages'),
  ('20000000-0000-0000-0000-000000000002', 'Bakery'),
  ('20000000-0000-0000-0000-000000000003', 'Dairy'),
  ('20000000-0000-0000-0000-000000000004', 'Household'),
  ('20000000-0000-0000-0000-000000000005', 'Raw Materials')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, sku, barcode, name, category_id, unit, is_raw, is_sellable, cost_price, sell_price, reorder_qty) VALUES
  ('30000000-0000-0000-0000-000000000001', 'BEV-001', '6001001000019', 'Maheu 500ml', '20000000-0000-0000-0000-000000000001', 'btl', false, true, 280, 450, 30),
  ('30000000-0000-0000-0000-000000000002', 'BEV-002', '6001001000026', 'Cola 330ml', '20000000-0000-0000-0000-000000000001', 'can', false, true, 320, 550, 24),
  ('30000000-0000-0000-0000-000000000003', 'BAK-001', '6001002000013', 'White Loaf', '20000000-0000-0000-0000-000000000002', 'ea', false, true, 700, 1100, 20),
  ('30000000-0000-0000-0000-000000000004', 'BAK-002', '6001002000020', 'Brown Loaf', '20000000-0000-0000-0000-000000000002', 'ea', false, true, 750, 1200, 20),
  ('30000000-0000-0000-0000-000000000005', 'DAI-001', '6001003000017', 'Milk 1L', '20000000-0000-0000-0000-000000000003', 'ea', false, true, 1100, 1650, 25),
  ('30000000-0000-0000-0000-000000000008', 'RAW-001', '6001005000018', 'Flour 50kg', '20000000-0000-0000-0000-000000000005', 'bag', true, false, 38000, 0, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO stock_levels (outlet_id, product_id, quantity) VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 124),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 18),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 42),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 9),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 60),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 14)
ON CONFLICT (outlet_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO suppliers (id, name, phone, email, address) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Lilongwe Mills Ltd', '+265 999 111 222', 'sales@llmills.mw', 'Area 6, Lilongwe'),
  ('40000000-0000-0000-0000-000000000002', 'Blantyre Beverages', '+265 999 333 444', 'orders@bb.mw', 'Limbe, Blantyre')
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, name, phone, email, loyalty_points, credit_limit) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Walk-in', NULL, NULL, 0, 0),
  ('50000000-0000-0000-0000-000000000002', 'Sana Restaurant', '+265 888 100 200', 'sana@example.mw', 1240, 500000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO expense_categories (id, name) VALUES
  ('60000000-0000-0000-0000-000000000001', 'Rent'),
  ('60000000-0000-0000-0000-000000000002', 'Utilities'),
  ('60000000-0000-0000-0000-000000000003', 'Transport & Logistics'),
  ('60000000-0000-0000-0000-000000000004', 'Salaries & Payroll'),
  ('60000000-0000-0000-0000-000000000005', 'Marketing & Advertising'),
  ('60000000-0000-0000-0000-000000000006', 'Packaging Costs')
ON CONFLICT (id) DO NOTHING;

INSERT INTO expenses (id, category_id, expense_date, due_date, description, amount, recurring, outlet_id, created_by) VALUES
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', current_date, current_date + interval '7 days', 'Main outlet rent', 850000, true, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', current_date, current_date + interval '14 days', 'Electricity and internet', 178000, true, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gl_accounts (id, code, name, type) VALUES
  ('62000000-0000-0000-0000-000000000001', '1000', 'Cash on Hand', 'asset'),
  ('62000000-0000-0000-0000-000000000002', '1100', 'Accounts Receivable', 'asset'),
  ('62000000-0000-0000-0000-000000000003', '2000', 'Accounts Payable', 'liability'),
  ('62000000-0000-0000-0000-000000000004', '3000', 'Owner Equity', 'equity'),
  ('62000000-0000-0000-0000-000000000005', '4000', 'Sales Income', 'income'),
  ('62000000-0000-0000-0000-000000000006', '5000', 'Operating Expenses', 'expense')
ON CONFLICT (id) DO NOTHING;

INSERT INTO boms (id, product_id, name, output_qty, labor_cost, overhead_cost) VALUES
  ('63000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'White Loaf batch', 100, 12000, 6500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom_components (bom_id, material_id, qty)
SELECT '63000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 0.08
WHERE NOT EXISTS (SELECT 1 FROM bom_components WHERE bom_id = '63000000-0000-0000-0000-000000000001');

INSERT INTO stock_batches (id, product_id, outlet_id, batch_no, expiry_date, quantity, cost_price) VALUES
  ('64000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'MILK-001', current_date + interval '5 days', 24, 1100)
ON CONFLICT (id) DO NOTHING;

INSERT INTO notifications (id, type, title, body, is_read) VALUES
  ('70000000-0000-0000-0000-000000000001', 'low_stock', 'Cola 330ml below reorder', 'Stock 18 / reorder 24', false),
  ('70000000-0000-0000-0000-000000000002', 'low_stock', 'Brown Loaf below reorder', 'Stock 9 / reorder 20', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (id, ref_no, supplier_id, outlet_id, order_date, status, subtotal, tax, total, created_by) VALUES
  ('80000000-0000-0000-0000-000000000001', 'PO-1001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', current_date, 'ordered', 380000, 0, 380000, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO grn (id, ref_no, po_id, received_by) VALUES
  ('81000000-0000-0000-0000-000000000001', 'GRN-1001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO grn_lines (grn_id, product_id, qty, unit_cost, batch_no, expiry_date)
SELECT '81000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 10, 38000, 'FLOUR-1001', null
WHERE NOT EXISTS (SELECT 1 FROM grn_lines WHERE grn_id = '81000000-0000-0000-0000-000000000001');

INSERT INTO supplier_invoices (id, ref_no, supplier_id, invoice_date, due_date, total, paid, status) VALUES
  ('82000000-0000-0000-0000-000000000001', 'INV-LLM-1001', '40000000-0000-0000-0000-000000000001', current_date, current_date + interval '30 days', 380000, 0, 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO loyalty_ledger (customer_id, points, ref_type, note)
SELECT '50000000-0000-0000-0000-000000000002', 120, 'sale', 'Opening loyalty points'
WHERE NOT EXISTS (SELECT 1 FROM loyalty_ledger WHERE customer_id = '50000000-0000-0000-0000-000000000002');

INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
SELECT '00000000-0000-0000-0000-000000000001', 'system.seed', 'database', 'seed', 'Seeded SRS demo records'
WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'system.seed');
