insert into suppliers (name, phone, email, address, note)
values ('Demo Supplier', '+265 000 000 000', 'supplier@example.com', 'Main supply market', 'Starter supplier for testing')
on conflict do nothing;

insert into customers (name, phone, email, address)
values ('Walk-in Customer', null, null, null)
on conflict do nothing;

insert into items (sku, name, unit, reorder_level, average_cost)
values
  ('RAW-GLY', 'Glycerine', 'L', 20, 0),
  ('RAW-BOT-1L', '1L Bottle', 'ea', 50, 0),
  ('RAW-LBL-1L', '1L Label', 'ea', 50, 0)
on conflict (sku) do nothing;

insert into products (sku, name, unit, selling_price, reorder_level)
values ('PROD-LOT-1L', '1L Lotion', 'ea', 0, 10)
on conflict (sku) do nothing;
