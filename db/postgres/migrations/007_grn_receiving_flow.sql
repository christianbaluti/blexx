alter table grn_items
  add column if not exists purchase_order_item_id uuid references purchase_order_items(id),
  add column if not exists batch_no text,
  add column if not exists expiry_date date;

create index if not exists grn_items_purchase_order_item_idx on grn_items(purchase_order_item_id);
