alter table notifications
  add column if not exists source_key text;

create unique index if not exists notifications_source_key_idx
  on notifications(source_key);
