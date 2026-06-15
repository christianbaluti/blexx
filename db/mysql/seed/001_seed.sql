-- Seed: roles, permissions, demo users, outlet, categories, products, suppliers, customers
USE moderntech;

INSERT INTO roles (id, label) VALUES
  ('super_admin','Super Administrator'),
  ('inventory_officer','Inventory Officer'),
  ('production_officer','Production Officer'),
  ('pos_cashier','POS Cashier'),
  ('finance_user','Finance User'),
  ('cro','Customer Relationship Officer')
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO permissions (id, label) VALUES
  ('pos.use','Use POS'),
  ('pos.refund','Issue refunds'),
  ('pos.discount','Apply discounts'),
  ('inventory.read','View inventory'),
  ('inventory.write','Modify inventory'),
  ('finance.read','View finance'),
  ('finance.write','Modify finance'),
  ('admin.users','Manage users')
ON DUPLICATE KEY UPDATE label=VALUES(label);

-- Demo users (passwords are bcrypt('demo' or 'admin') placeholders — replace in production)
INSERT INTO users (id, username, email, full_name, password_hash) VALUES
  ('u1','admin','admin@moderntech.mw','Tadala Banda','$2y$10$placeholderhashforadminPW'),
  ('u2','inventory','inv@moderntech.mw','Chimwemwe Phiri','$2y$10$placeholderhashfordemoPW'),
  ('u3','production','prod@moderntech.mw','Mphatso Nkhata','$2y$10$placeholderhashfordemoPW'),
  ('u4','cashier','pos@moderntech.mw','Yamikani Mhone','$2y$10$placeholderhashfordemoPW'),
  ('u5','finance','fin@moderntech.mw','Limbani Gondwe','$2y$10$placeholderhashfordemoPW'),
  ('u6','cro','cro@moderntech.mw','Tamanda Kaunda','$2y$10$placeholderhashfordemoPW')
ON DUPLICATE KEY UPDATE email=VALUES(email);

INSERT INTO user_roles VALUES
  ('u1','super_admin'),('u2','inventory_officer'),('u3','production_officer'),
  ('u4','pos_cashier'),('u5','finance_user'),('u6','cro')
ON DUPLICATE KEY UPDATE role_id=role_id;

INSERT INTO outlets (id, code, name, type, address) VALUES
  ('o1','LL01','Lilongwe Main','shop','Area 47, Lilongwe'),
  ('o2','WH01','Central Warehouse','warehouse','Kanengo, Lilongwe')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO categories (id, name) VALUES
  ('c1','Beverages'),('c2','Bakery'),('c3','Dairy'),('c4','Household'),('c5','Raw Materials')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO products (id, sku, barcode, name, category_id, unit, is_raw, is_sellable, cost_price, sell_price, reorder_qty) VALUES
  ('p1','BEV-001','6001001000019','Maheu 500ml',     'c1','btl',0,1,  280,  450, 30),
  ('p2','BEV-002','6001001000026','Cola 330ml',      'c1','can',0,1,  320,  550, 24),
  ('p3','BAK-001','6001002000013','White Loaf',      'c2','ea', 0,1,  700, 1100, 20),
  ('p4','BAK-002','6001002000020','Brown Loaf',      'c2','ea', 0,1,  750, 1200, 20),
  ('p5','DAI-001','6001003000017','Milk 1L',         'c3','ea', 0,1, 1100, 1650, 25),
  ('p6','DAI-002','6001003000024','Yoghurt 250g',    'c3','ea', 0,1,  480,  800, 30),
  ('p7','HSE-001','6001004000011','Dish Soap 500ml', 'c4','ea', 0,1,  950, 1500, 15),
  ('p8','RAW-001','6001005000018','Flour 50kg',      'c5','bag',1,0,38000,    0,  5),
  ('p9','RAW-002','6001005000025','Sugar 50kg',      'c5','bag',1,0,42000,    0,  5)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO stock_levels (outlet_id, product_id, quantity) VALUES
  ('o1','p1',124),('o1','p2',18),('o1','p3',42),('o1','p4',9),
  ('o1','p5',60),('o1','p6',88),('o1','p7',53),('o2','p8',14),('o2','p9',8)
ON DUPLICATE KEY UPDATE quantity=VALUES(quantity);

INSERT INTO suppliers (id, name, phone, email, address) VALUES
  ('s1','Lilongwe Mills Ltd','+265 999 111 222','sales@llmills.mw','Area 6, Lilongwe'),
  ('s2','Blantyre Beverages','+265 999 333 444','orders@bb.mw','Limbe, Blantyre'),
  ('s3','Mzuzu Dairy Co-op','+265 999 555 666','hello@mzdairy.mw','Mzuzu')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO customers (id, name, phone, email, loyalty_points, credit_limit, opening_balance) VALUES
  ('cu1','Walk-in','','',0,0,0),
  ('cu2','Sana Restaurant','+265 888 100 200','sana@example.mw',1240,500000,125000),
  ('cu3','Lakeview Lodge','+265 888 300 400','ops@lakeview.mw',540,300000,0),
  ('cu4','Daniel Mhango','+265 999 700 800','dm@example.mw',80,0,0)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO expense_categories (id, name) VALUES
  ('ec1','Rent'),('ec2','Transport'),('ec3','Salaries'),
  ('ec4','Marketing'),('ec5','Packaging'),('ec6','Utilities')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO expenses (id, category_id, expense_date, description, amount, recurring, outlet_id, created_by) VALUES
  ('e1','ec1', CURDATE() - INTERVAL 1 DAY,'Outlet rent — Sept',     850000, 1,'o1','u5'),
  ('e2','ec3', CURDATE() - INTERVAL 2 DAY,'Payroll — Sept (part)', 2400000, 1,'o1','u5'),
  ('e3','ec6', CURDATE() - INTERVAL 3 DAY,'ESCOM electricity',      178000, 1,'o1','u5'),
  ('e4','ec2', CURDATE() - INTERVAL 4 DAY,'Delivery fuel',           92500, 0,'o1','u5'),
  ('e5','ec4', CURDATE() - INTERVAL 6 DAY,'Radio spot — Capital FM',320000, 0,'o1','u5'),
  ('e6','ec5', CURDATE() - INTERVAL 7 DAY,'Bread bags 5000ct',      145000, 0,'o1','u5')
ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Minimal chart of accounts (extend as needed)
INSERT INTO gl_accounts (id, code, name, type) VALUES
  ('ga1','1000','Cash on hand','asset'),
  ('ga2','1100','Bank — main account','asset'),
  ('ga3','1200','Accounts receivable','asset'),
  ('ga4','1300','Inventory','asset'),
  ('ga5','2000','Accounts payable','liability'),
  ('ga6','2100','VAT payable','liability'),
  ('ga7','3000','Owner equity','equity'),
  ('ga8','4000','Sales revenue','income'),
  ('ga9','5000','Cost of goods sold','expense'),
  ('ga10','6000','Operating expenses','expense')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO boms (id, product_id, name, output_qty, labor_cost, overhead_cost) VALUES
  ('b1','p3','White Loaf — batch of 100',100,12000,6500)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO bom_components (bom_id, material_id, qty) VALUES
  ('b1','p8',8),('b1','p9',1);
