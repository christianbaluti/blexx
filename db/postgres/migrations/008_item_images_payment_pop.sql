alter table items
  add column if not exists image_data text,
  add column if not exists image_mime text;

alter table payments
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_data text;
