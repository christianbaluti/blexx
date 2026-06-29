alter table backup_records
  add column if not exists format text not null default 'blex-json-backup-v1',
  add column if not exists payload_json jsonb,
  add column if not exists error text;
